/**
 * Validade da conexão do Instagram, para o cartão de Instâncias e APIs
 * (fatia 4/5, renovação).
 *
 * O servidor tem a cópia dele da regra "o estado de renovação vale para o
 * token atual" em `supabase/functions/instagram-token-renewal/logic.ts` (o
 * Deno não importa de `src/`), e o SQL tem a terceira em
 * `instagram_connection_alert_sweep`. `src/lib/instagramTokenRenewal.test.ts`
 * confere que a tela e a edge function concordam; a suíte
 * `docs/teste_renovacao_instagram.sql` cobre o SQL.
 */

/** Marco do aviso "vai vencer" (o mesmo do sino). */
export const INSTAGRAM_EXPIRING_SOON_DAYS = 7;

const DAY_MS = 86_400_000;

export type InstagramConnectionState =
  | 'valid'           // vale, e a renovação automática cuida
  | 'expiring'        // faltam 7 dias ou menos
  | 'needs_reconnect' // o Instagram recusou renovar este acesso
  | 'expired'         // venceu
  | 'unknown';        // sem data de validade legível

export interface InstagramConnectionView {
  state: InstagramConnectionState;
  validUntil: Date | null;
  /** Dias inteiros até vencer, arredondando para cima. null sem validade. */
  daysLeft: number | null;
  /** A última tentativa de renovar este acesso falhou e vai ser repetida. */
  retrying: boolean;
  /** Frase gravada pela renovação sobre a última falha, se houver. */
  lastErrorMessage: string | null;
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;

/**
 * `connection_config.renewal`, só se ele se refere ao token ATUAL
 * (`forTokenIssuedAt === tokenIssuedAt`). Um estado de um token que já foi
 * trocado não vale mais nada.
 */
export function currentRenewalStatus(
  connectionConfig: unknown,
): { status: 'ok' | 'retrying' | 'needs_reconnect'; message: string | null } | null {
  const cfg = asObj(connectionConfig);
  const r = asObj(cfg?.renewal);
  if (!cfg || !r) return null;
  const status = r.status;
  if (status !== 'ok' && status !== 'retrying' && status !== 'needs_reconnect') return null;
  const forToken = r.forTokenIssuedAt;
  const issued = cfg.tokenIssuedAt;
  if (typeof forToken !== 'string' || typeof issued !== 'string' || forToken.length === 0 || forToken !== issued) {
    return null;
  }
  return { status, message: typeof r.message === 'string' && r.message.length > 0 ? r.message : null };
}

export function instagramConnectionView(connectionConfig: unknown, now: Date): InstagramConnectionView {
  const cfg = asObj(connectionConfig) ?? {};
  const raw = cfg.tokenExpiresAt;
  const t = typeof raw === 'string' && raw.length > 0 ? Date.parse(raw) : NaN;
  const renewal = currentRenewalStatus(cfg);
  const retrying = renewal?.status === 'retrying';
  const lastErrorMessage = renewal && renewal.status !== 'ok' ? renewal.message : null;

  if (Number.isNaN(t)) {
    return { state: 'unknown', validUntil: null, daysLeft: null, retrying, lastErrorMessage };
  }
  const validUntil = new Date(t);
  const msLeft = t - now.getTime();
  const daysLeft = Math.ceil(msLeft / DAY_MS);

  let state: InstagramConnectionState = 'valid';
  if (msLeft <= 0) state = 'expired';
  else if (renewal?.status === 'needs_reconnect') state = 'needs_reconnect';
  else if (msLeft <= INSTAGRAM_EXPIRING_SOON_DAYS * DAY_MS) state = 'expiring';

  return { state, validUntil, daysLeft: msLeft <= 0 ? 0 : daysLeft, retrying, lastErrorMessage };
}

/** A conexão ainda atende (para o contador "Conectados" da tela). */
export function instagramConnectionIsUsable(view: InstagramConnectionView): boolean {
  return view.state === 'valid' || view.state === 'expiring' || view.state === 'unknown';
}

const dateFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
});

/** "22/11/2026 às 21:16", no horário de Brasília (o mesmo do aviso do sino). */
export function formatInstagramValidity(d: Date): string {
  return `${dateFmt.format(d)} às ${timeFmt.format(d)}`;
}

/**
 * Contato para reconectar onde o botão Reconectar não aparece — Loja sem a
 * chave da fatia 4b (o superadmin libera por Loja) ou quem não tem a
 * capability whatsapp.configure.
 */
export const INSTAGRAM_RECONNECT_CONTACT = 'contato@convoflow.com.br';

export interface InstagramConnectionTextOptions {
  /** O botão Reconectar aparece neste cartão (fatia 4b). */
  canReconnectHere?: boolean;
}

/** Textos do cartão — um lugar só, para a tela e os testes. */
export function instagramConnectionTexts(
  view: InstagramConnectionView,
  opts: InstagramConnectionTextOptions = {},
): { badge: string; detail: string } {
  const when = view.validUntil ? formatInstagramValidity(view.validUntil) : null;
  const reconnect = opts.canReconnectHere
    ? 'Para reconectar, clique em Reconectar neste cartão.'
    : `Para reconectar, escreva para ${INSTAGRAM_RECONNECT_CONTACT}.`;
  const persist = opts.canReconnectHere
    ? 'Se este aviso continuar, clique em Reconectar neste cartão.'
    : `Se este aviso continuar, escreva para ${INSTAGRAM_RECONNECT_CONTACT}.`;
  const dias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`);

  switch (view.state) {
    case 'expired':
      return {
        badge: 'Vencida',
        detail: `Venceu em ${when}. As respostas pelo Instagram estão paradas. ${reconnect}`,
      };
    case 'needs_reconnect':
      return {
        badge: 'Reconectar',
        detail: `Válida até ${when}, mas o Instagram não aceita mais renovar este acesso${
          view.lastErrorMessage ? ` (${view.lastErrorMessage.replace(/\.$/, '')})` : ''
        }. ${reconnect}`,
      };
    case 'expiring':
      return {
        badge: `Vence em ${dias(view.daysLeft ?? 0)}`,
        detail: `Válida até ${when}. A renovação automática ainda não conseguiu renovar. ${persist}`,
      };
    case 'unknown':
      return { badge: 'Conectado', detail: 'Validade da conexão desconhecida.' };
    default:
      return {
        badge: 'Conectado',
        detail: view.retrying
          ? `Válida até ${when}. A última renovação automática falhou; o ConvoFlow tenta de novo amanhã.`
          : `Válida até ${when}. Renova sozinha antes de vencer.`,
      };
  }
}
