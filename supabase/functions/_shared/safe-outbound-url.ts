// =============================================================================
// safe-outbound-url.ts — o servidor só chama endereço PÚBLICO informado por
// cliente
// =============================================================================
// O WAHA é um servidor do cliente: o endereço vem de quem cadastra o número.
// Sem esta checagem, o ConvoFlow (que roda dentro da infraestrutura do
// Supabase) viraria uma porta para a rede interna: alguém cadastra
// http://169.254.169.254/ ou http://localhost:5432 e faz o NOSSO servidor
// chamar lá.
//
// Regra, antes de TODA chamada a endereço de cliente:
//   1. só http/https, sem usuário:senha no endereço;
//   2. nome que é claramente interno é recusado sem consultar nada
//      (localhost, .local, .internal, metadata..., nome sem ponto);
//   3. o nome é resolvido (A e AAAA) e TODOS os endereços precisam ser
//      públicos; nenhum endereço também é recusa (falha fechada);
//   4. a chamada não segue redirecionamento (um 302 para a rede interna
//      furaria a checagem).
//
// Risco que sobra, documentado: entre a resolução daqui e a do fetch o nome
// pode mudar (DNS rebinding). O Deno do Supabase não deixa fixar o IP no
// fetch; a resolução é refeita a cada chamada, o que encurta a janela.
//
// Sem imports de Deno no topo: o Vitest importa este arquivo (o resolvedor do
// Deno só é tocado dentro de defaultResolver).
// =============================================================================

export type OutboundBlockReason =
  | 'invalid_url'
  | 'protocol'
  | 'credentials_in_url'
  | 'internal_hostname'
  | 'private_address'
  | 'unresolved'
  | 'redirect';

export class OutboundUrlError extends Error {
  readonly reason: OutboundBlockReason;
  constructor(reason: OutboundBlockReason, message: string) {
    super(message);
    this.name = 'OutboundUrlError';
    this.reason = reason;
  }
}

/** Mensagens que podem ir para a tela (não dizem qual IP o nome resolveu). */
export const OUTBOUND_BLOCK_MESSAGES: Record<OutboundBlockReason, string> = {
  invalid_url: 'O endereço do servidor não é válido.',
  protocol: 'O endereço do servidor precisa começar com http:// ou https://.',
  credentials_in_url: 'Tire usuário e senha do endereço do servidor. A chave vai no campo próprio.',
  internal_hostname: 'Esse endereço é de rede interna. Informe o endereço público do seu servidor.',
  private_address: 'Esse endereço aponta para uma rede interna ou reservada. Informe o endereço público do seu servidor.',
  unresolved: 'Não foi possível encontrar esse endereço na internet. Confira se ele está escrito certo.',
  redirect: 'O servidor respondeu com um redirecionamento. Informe o endereço final, sem redirecionar.',
};

// ------------------------------------------------------------------ IPv4

type Ipv4 = [number, number, number, number];

function parseIpv4(ip: string): Ipv4 | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  if (nums.some((n) => Number.isNaN(n) || n > 255)) return null;
  return nums as Ipv4;
}

function ipv4Blocked([a, b, c]: Ipv4): boolean {
  if (a === 0) return true; // 0.0.0.0/8 "esta rede"
  if (a === 10) return true; // privada
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64/10 CGNAT
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link local, metadados de nuvem
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // 192.0.0/24, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay
  if (a === 192 && b === 168) return true; // privada
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18/15 benchmark
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast, reservada, broadcast
  return false;
}

// ------------------------------------------------------------------ IPv6

/** Expande um IPv6 em 8 grupos de 16 bits; aceita IPv4 embutido no fim. */
function parseIpv6(raw: string): number[] | null {
  let ip = raw.toLowerCase();
  if (ip.startsWith('[') && ip.endsWith(']')) ip = ip.slice(1, -1);
  const zone = ip.indexOf('%');
  if (zone >= 0) ip = ip.slice(0, zone);
  if (!ip.includes(':')) return null;

  let tail: [number, number] | null = null;
  const lastColon = ip.lastIndexOf(':');
  const lastPart = ip.slice(lastColon + 1);
  if (lastPart.includes('.')) {
    const v4 = parseIpv4(lastPart);
    if (!v4) return null;
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    ip = ip.slice(0, lastColon + 1) + '0:0';
  }

  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const toGroups = (s: string) => (s === '' ? [] : s.split(':'));
  const head = toGroups(halves[0] ?? '');
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 && head.length !== 8) return null;
  if (missing < 0) return null;
  const groups = [...head, ...Array(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  if (nums.some((n) => Number.isNaN(n))) return null;
  if (tail) {
    nums[6] = tail[0];
    nums[7] = tail[1];
  }
  return nums;
}

function ipv6Blocked(g: number[]): boolean {
  const [g0 = 0, g1 = 0, g2 = 0, g3 = 0, , g5 = 0, g6 = 0, g7 = 0] = g;
  const allZeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (allZeroUntil(8)) return true; // ::
  if (allZeroUntil(7) && g7 === 1) return true; // ::1
  // IPv4 mapeado (::ffff:a.b.c.d) e o antigo compatível (::a.b.c.d): vale o IPv4.
  if (allZeroUntil(5) && (g5 === 0xffff || g5 === 0)) {
    return ipv4Blocked([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]);
  }
  if (g0 === 0x64 && g1 === 0xff9b) return true; // NAT64: pode embutir IPv4 interno
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 descarte
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentação
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo
  if (g0 === 0x2002) return true; // 6to4: embute IPv4
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 privada
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link local
  if ((g0 & 0xffc0) === 0xfec0) return true; // fec0::/10 site local (antiga)
  if ((g0 & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** true quando o texto é um IP (v4 ou v6) de rede interna, reservada ou especial. */
export function isBlockedIp(ip: string): boolean {
  const v4 = parseIpv4(ip);
  if (v4) return ipv4Blocked(v4);
  const v6 = parseIpv6(ip);
  if (v6) return ipv6Blocked(v6);
  // Não é IP reconhecível: trata como bloqueado (quem chama só passa IP aqui).
  return true;
}

export function isIpLiteral(host: string): boolean {
  return parseIpv4(host) !== null || parseIpv6(host) !== null;
}

const INTERNAL_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.localdomain', '.svc', '.cluster.local'];
const INTERNAL_NAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data', 'kubernetes', 'kubernetes.default']);

/** Nome que é interno pela forma, sem precisar consultar o DNS. */
export function hostnameLooksInternal(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, '');
  if (!h) return true;
  if (INTERNAL_NAMES.has(h)) return true;
  if (INTERNAL_SUFFIXES.some((s) => h.endsWith(s))) return true;
  // Nome sem ponto (ex.: "waha", "db") só resolve dentro de uma rede.
  if (!h.includes('.') && !isIpLiteral(h)) return true;
  return false;
}

// ------------------------------------------------------------- resolução

export type Resolver = (hostname: string) => Promise<string[]>;

async function resolveViaDoh(hostname: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA'] as const) {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(hostname)}&type=${type}`,
      { headers: { accept: 'application/dns-json' }, signal: AbortSignal.timeout(5000) },
    );
    if (!res.ok) throw new Error(`DoH ${res.status}`);
    const body = (await res.json()) as { Answer?: Array<{ type: number; data: string }> };
    for (const a of body.Answer ?? []) {
      if (a.type === 1 || a.type === 28) out.push(a.data);
    }
  }
  return out;
}

/**
 * Resolve A e AAAA com o DNS do Deno; se o ambiente não oferecer
 * `Deno.resolveDns`, pergunta por HTTPS a um resolvedor público. Erro nos dois
 * vira lista vazia, e lista vazia é recusa.
 */
export const defaultResolver: Resolver = async (hostname) => {
  const deno = (globalThis as { Deno?: { resolveDns?: (h: string, t: 'A' | 'AAAA') => Promise<string[]> } }).Deno;
  if (deno?.resolveDns) {
    const found: string[] = [];
    let anyOk = false;
    for (const t of ['A', 'AAAA'] as const) {
      try {
        found.push(...(await deno.resolveDns(hostname, t)));
        anyOk = true;
      } catch {
        // NXDOMAIN de um tipo só (ex.: sem AAAA) é normal.
      }
    }
    if (anyOk) return found;
  }
  try {
    return await resolveViaDoh(hostname);
  } catch {
    return [];
  }
};

/**
 * Confere o endereço e devolve a URL já normalizada. Lança OutboundUrlError
 * com a razão quando ele não pode ser chamado.
 */
export async function assertPublicUrl(raw: string, resolver: Resolver = defaultResolver): Promise<URL> {
  let url: URL;
  try {
    url = new URL(String(raw ?? '').trim());
  } catch {
    throw new OutboundUrlError('invalid_url', OUTBOUND_BLOCK_MESSAGES.invalid_url);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new OutboundUrlError('protocol', OUTBOUND_BLOCK_MESSAGES.protocol);
  }
  if (url.username || url.password) {
    throw new OutboundUrlError('credentials_in_url', OUTBOUND_BLOCK_MESSAGES.credentials_in_url);
  }
  // O parser do WHATWG já converte "2130706433" e "0x7f.1" em 127.0.0.1.
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(host)) {
    if (isBlockedIp(host)) throw new OutboundUrlError('private_address', OUTBOUND_BLOCK_MESSAGES.private_address);
    return url;
  }
  if (hostnameLooksInternal(host)) {
    throw new OutboundUrlError('internal_hostname', OUTBOUND_BLOCK_MESSAGES.internal_hostname);
  }
  const ips = await resolver(host);
  if (!ips.length) throw new OutboundUrlError('unresolved', OUTBOUND_BLOCK_MESSAGES.unresolved);
  if (ips.some((ip) => isBlockedIp(ip))) {
    throw new OutboundUrlError('private_address', OUTBOUND_BLOCK_MESSAGES.private_address);
  }
  return url;
}

export interface SafeFetchOptions {
  resolver?: Resolver;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * fetch para endereço de cliente: confere antes, não segue redirecionamento e
 * tem prazo. Um 3xx vira OutboundUrlError('redirect').
 */
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  opts: SafeFetchOptions = {},
): Promise<Response> {
  const url = await assertPublicUrl(rawUrl, opts.resolver ?? defaultResolver);
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(url.toString(), {
    ...init,
    redirect: 'manual',
    signal: init.signal ?? AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  if (res.status >= 300 && res.status < 400) {
    throw new OutboundUrlError('redirect', OUTBOUND_BLOCK_MESSAGES.redirect);
  }
  return res;
}
