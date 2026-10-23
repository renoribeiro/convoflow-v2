// =============================================================================
// api/nucleo — o coração da API pública (REST v1 e MCP), sem nada de Deno
// =============================================================================
// Quem usa: supabase/functions/api-v1 (REST) e supabase/functions/api-mcp
// (agentes de IA). Os testes do app importam este arquivo
// (src/lib/api/nucleo.test.ts); a parte que fala com o banco está em
// ./banco.ts e entra aqui por parâmetro.
//
// A cada pedido, nesta ordem:
//   1. a chave vem do cabeçalho (Authorization: Bearer cf_live_… ou
//      X-API-Key) e vira SHA-256; a chave em si não sai daqui;
//   2. como servidor, api_chave_usar(hash, ip) confere a chave, o dono, o
//      complemento e o limite de uso (banco: 20261024000002);
//   3. a chave liga a API do servidor: secret API_ADDON_ENABLED, ou a Conta
//      está na lista de teste;
//   4. COMO O DONO DA CHAVE: confere que o papel é authenticated com o sub
//      dele (senão nada é lido), confere o bloqueio da Conta
//      (tenant_access_state) e chama UMA api_v1_*. O RLS decide o resto;
//   5. a resposta leva só os campos da lista aprovada (os "mapear*");
//   6. uma linha em api_registro. Se ela não grava, a resposta é 503 e nada
//      é entregue: todo pedido atendido fica registrado.
//
// Qualquer dúvida no caminho (banco fora, contador que não respondeu) recusa.
// =============================================================================

import { caminhoBateComAMensagem, whatsappMediaPath, type LinhaDaMensagem } from '../media-links.ts';

// -----------------------------------------------------------------------------
// Constantes
// -----------------------------------------------------------------------------

export const ESCOPOS = ['contatos', 'conversas', 'mensagens', 'funil', 'equipe', 'metricas', 'midia'] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const PREFIXO_CHAVE = 'cf_live_';
export const CHAVE_RE = /^cf_live_[A-Za-z0-9]{32}$/;
const CHAVE_EM_TEXTO = /cf_live_[A-Za-z0-9]{6,}/g;

export const LIMITE_PADRAO = 50;
export const LIMITE_MAXIMO = 100;
/** Link de mídia pela API: 15 minutos (decisão do dono). */
export const MIDIA_TTL_S = 15 * 60;
/** Métricas sem período: os últimos 30 dias. */
export const METRICAS_DIAS_PADRAO = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// -----------------------------------------------------------------------------
// Erros
// -----------------------------------------------------------------------------

export const ERROS = {
  chave_ausente: { status: 401, mensagem: 'Mande a chave no cabeçalho Authorization: Bearer cf_live_…' },
  chave_invalida: { status: 401, mensagem: 'Chave inválida.' },
  chave_revogada: { status: 401, mensagem: 'Esta chave foi revogada.' },
  chave_expirada: { status: 401, mensagem: 'Esta chave venceu. Crie outra em Configurações › Chaves de API.' },
  dono_inativo: { status: 403, mensagem: 'A pessoa dona desta chave não é mais Gerente ativa da Conta.' },
  api_desligada: { status: 403, mensagem: 'A API desta Conta está desligada.' },
  conta_bloqueada: { status: 402, mensagem: 'A Conta está bloqueada por falta de pagamento.' },
  sem_permissao: { status: 403, mensagem: 'Esta chave não tem permissão para isso.' },
  loja_fora_da_chave: { status: 403, mensagem: 'Esta chave não alcança essa Loja.' },
  parametro_invalido: { status: 400, mensagem: 'Parâmetro inválido.' },
  nao_encontrado: { status: 404, mensagem: 'Endereço não encontrado.' },
  metodo_nao_permitido: { status: 405, mensagem: 'Só leitura: use GET.' },
  origem_recusada: { status: 403, mensagem: 'A API não atende pedidos de navegador.' },
  limite_minuto: { status: 429, mensagem: 'Limite de 60 pedidos por minuto desta chave. Espere um minuto.' },
  limite_dia: { status: 429, mensagem: 'Limite de 5.000 pedidos por dia da Conta. Volta amanhã (UTC).' },
  indisponivel: { status: 503, mensagem: 'A API não está disponível agora. Tente de novo em instantes.' },
  erro_interno: { status: 500, mensagem: 'Erro interno. Tente de novo.' },
} as const;
export type CodigoErro = keyof typeof ERROS;

export class ErroApi extends Error {
  readonly codigo: CodigoErro;
  readonly status: number;
  constructor(codigo: CodigoErro, detalhe?: string) {
    super(detalhe ?? ERROS[codigo].mensagem);
    this.codigo = codigo;
    this.status = ERROS[codigo].status;
  }
}

export function corpoDoErro(e: ErroApi) {
  return { erro: { codigo: e.codigo, mensagem: e.message } };
}

/** O resultado de api_chave_usar → o erro da resposta (null = passou). */
export function erroDoUso(resultado: string | null | undefined): CodigoErro | null {
  switch (resultado) {
    case 'ok':
      return null;
    case 'chave_revogada':
    case 'chave_expirada':
    case 'dono_inativo':
    case 'api_desligada':
    case 'limite_minuto':
    case 'limite_dia':
      return resultado;
    case 'chave_invalida':
      return 'chave_invalida';
    default:
      // Resposta que não conhecemos: na dúvida, recusa.
      return 'indisponivel';
  }
}

// -----------------------------------------------------------------------------
// A chave
// -----------------------------------------------------------------------------

export interface CabecalhosLike {
  get(nome: string): string | null;
}

/** A chave do pedido, crua (ainda não conferida), ou null. */
export function lerChaveDoPedido(cabecalhos: CabecalhosLike): string | null {
  const auth = cabecalhos.get('authorization');
  if (auth) {
    const m = /^\s*Bearer\s+(\S+)\s*$/i.exec(auth);
    if (m?.[1]) return m[1];
  }
  const x = cabecalhos.get('x-api-key');
  if (x && x.trim()) return x.trim();
  return null;
}

export function chaveBemFormada(chave: string): boolean {
  return CHAVE_RE.test(chave);
}

/** SHA-256 em hex (o mesmo da coluna api_chaves.hash). */
export async function hashDaChave(chave: string): Promise<string> {
  const bytes = new TextEncoder().encode(chave);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Esconde qualquer coisa com cara de chave num texto que vai para log. */
export function ocultarChave(texto: string): string {
  return texto.replace(CHAVE_EM_TEXTO, 'cf_live_***');
}

/** IP de quem pede: primeiro do x-forwarded-for, senão x-real-ip. */
export function ipDoPedido(cabecalhos: CabecalhosLike): string | null {
  const xff = cabecalhos.get('x-forwarded-for');
  const primeiro = xff?.split(',')[0]?.trim();
  if (primeiro) return primeiro.slice(0, 64);
  const real = cabecalhos.get('x-real-ip')?.trim();
  return real ? real.slice(0, 64) : null;
}

// -----------------------------------------------------------------------------
// A chave de liberação do servidor
// -----------------------------------------------------------------------------

/**
 * A API atende esta Conta? Secret API_ADDON_ENABLED = "true" abre para todo
 * mundo; desligado, só as Contas da lista API_ADDON_TEST_CONTAS (ids
 * separados por vírgula) — é o que deixa testar com a chave desligada.
 */
export function apiLiberada(
  habilitada: string | null | undefined,
  contasDeTeste: string | null | undefined,
  contaId: string | null | undefined,
): boolean {
  if ((habilitada ?? '').trim() === 'true') return true;
  if (!contaId) return false;
  const lista = (contasDeTeste ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => UUID_RE.test(s));
  return lista.includes(contaId.toLowerCase());
}

// -----------------------------------------------------------------------------
// Contexto de um pedido autenticado
// -----------------------------------------------------------------------------

export interface UsoDaChave {
  resultado: string | null;
  detalhe?: string | null;
  chave_id?: string | null;
  conta_id?: string | null;
  dono_user_id?: string | null;
  escopos?: string[] | null;
  lojas?: string[] | null;
  restante_minuto?: number | null;
  restante_dia?: number | null;
}

export interface Contexto {
  chaveId: string;
  contaId: string;
  donoUserId: string;
  escopos: Escopo[];
  /** Lojas (e a própria Conta) que a chave alcança hoje. */
  lojas: string[];
  restanteMinuto: number | null;
  restanteDia: number | null;
}

// -----------------------------------------------------------------------------
// O que ler
// -----------------------------------------------------------------------------

export type Leitura =
  | { recurso: 'lojas' }
  | {
      recurso: 'contatos';
      lojaId: string | null;
      etapaId: string | null;
      etiquetaId: string | null;
      atualizadoDesde: string | null;
      busca: string | null;
      limite: number;
      cursor: Cursor | null;
    }
  | {
      recurso: 'conversas';
      lojaId: string | null;
      atendenteId: string | null;
      arquivada: boolean | null;
      desde: string | null;
      ate: string | null;
      limite: number;
      cursor: Cursor | null;
    }
  | {
      recurso: 'mensagens';
      conversaId: string;
      desde: string | null;
      ate: string | null;
      limite: number;
      cursor: Cursor | null;
      midia: boolean;
    }
  | { recurso: 'funil'; lojaId: string | null }
  | { recurso: 'equipe'; lojaId: string | null }
  | { recurso: 'metricas'; lojaId: string | null; desde: string | null; ate: string | null };

export type Recurso = Leitura['recurso'];

/** O escopo que cada leitura exige (lojas: qualquer chave). */
export const ESCOPO_DO_RECURSO: Record<Recurso, Escopo | null> = {
  lojas: null,
  contatos: 'contatos',
  conversas: 'conversas',
  mensagens: 'mensagens',
  funil: 'funil',
  equipe: 'equipe',
  metricas: 'metricas',
};

export interface Cursor {
  ts: string;
  id: string;
}

export function codificarCursor(c: Cursor): string {
  const json = JSON.stringify({ t: c.ts, i: c.id });
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodificarCursor(texto: string): Cursor {
  try {
    const b64 = texto.replace(/-/g, '+').replace(/_/g, '/');
    const o = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))) as { t?: unknown; i?: unknown };
    if (typeof o.t === 'string' && typeof o.i === 'string' && UUID_RE.test(o.i) && !Number.isNaN(Date.parse(o.t))) {
      return { ts: new Date(o.t).toISOString(), id: o.i.toLowerCase() };
    }
  } catch {
    // cai no erro abaixo
  }
  throw new ErroApi('parametro_invalido', 'cursor inválido: use o valor de "proximo" da página anterior.');
}

// --- leitura dos parâmetros ---------------------------------------------------

export type Parametros = Record<string, unknown>;

function texto(p: Parametros, nome: string): string | null {
  const v = p[nome];
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function uuid(p: Parametros, nome: string): string | null {
  const s = texto(p, nome);
  if (s === null) return null;
  if (!UUID_RE.test(s)) throw new ErroApi('parametro_invalido', `${nome}: use um id (uuid).`);
  return s.toLowerCase();
}

function data(p: Parametros, nome: string): string | null {
  const s = texto(p, nome);
  if (s === null) return null;
  const t = Date.parse(s);
  if (!/^\d{4}-\d{2}-\d{2}/.test(s) || Number.isNaN(t)) {
    throw new ErroApi('parametro_invalido', `${nome}: use data ISO 8601 (ex.: 2026-10-01 ou 2026-10-01T12:00:00Z).`);
  }
  return new Date(t).toISOString();
}

function booleano(p: Parametros, nome: string): boolean | null {
  const v = p[nome];
  if (v === undefined || v === null || v === '') return null;
  if (v === true || v === 'true' || v === '1') return true;
  if (v === false || v === 'false' || v === '0') return false;
  throw new ErroApi('parametro_invalido', `${nome}: use true ou false.`);
}

function limite(p: Parametros): number {
  const v = p.limite;
  if (v === undefined || v === null || v === '') return LIMITE_PADRAO;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < 1 || n > LIMITE_MAXIMO) {
    throw new ErroApi('parametro_invalido', `limite: de 1 a ${LIMITE_MAXIMO}.`);
  }
  return n;
}

function cursor(p: Parametros): Cursor | null {
  const s = texto(p, 'cursor');
  return s === null ? null : decodificarCursor(s);
}

const PARAMETROS_ACEITOS: Record<Recurso, readonly string[]> = {
  lojas: [],
  contatos: ['loja_id', 'etapa_id', 'etiqueta_id', 'atualizado_desde', 'busca', 'limite', 'cursor'],
  conversas: ['loja_id', 'atendente_id', 'arquivada', 'desde', 'ate', 'limite', 'cursor'],
  mensagens: ['desde', 'ate', 'limite', 'cursor', 'midia'],
  funil: ['loja_id'],
  equipe: ['loja_id'],
  metricas: ['loja_id', 'desde', 'ate'],
};

/** Parâmetro que não existe é erro: errar o nome de um filtro não pode virar "tudo". */
function conferirNomes(recurso: Recurso, p: Parametros, extras: readonly string[] = []) {
  const aceitos = new Set([...PARAMETROS_ACEITOS[recurso], ...extras]);
  for (const nome of Object.keys(p)) {
    if (!aceitos.has(nome)) {
      throw new ErroApi('parametro_invalido', `parâmetro desconhecido: ${nome}.`);
    }
  }
}

/** Monta a leitura de um recurso a partir dos parâmetros (REST ou MCP). */
export function montarLeitura(recurso: Recurso, p: Parametros, conversaId?: string): Leitura {
  conferirNomes(recurso, p, recurso === 'mensagens' ? ['conversa_id'] : []);
  switch (recurso) {
    case 'lojas':
      return { recurso };
    case 'contatos': {
      const busca = texto(p, 'busca');
      if (busca && busca.length > 100) throw new ErroApi('parametro_invalido', 'busca: até 100 letras.');
      return {
        recurso,
        lojaId: uuid(p, 'loja_id'),
        etapaId: uuid(p, 'etapa_id'),
        etiquetaId: uuid(p, 'etiqueta_id'),
        atualizadoDesde: data(p, 'atualizado_desde'),
        busca,
        limite: limite(p),
        cursor: cursor(p),
      };
    }
    case 'conversas':
      return {
        recurso,
        lojaId: uuid(p, 'loja_id'),
        atendenteId: uuid(p, 'atendente_id'),
        arquivada: booleano(p, 'arquivada'),
        desde: data(p, 'desde'),
        ate: data(p, 'ate'),
        limite: limite(p),
        cursor: cursor(p),
      };
    case 'mensagens': {
      const id = conversaId ?? uuid(p, 'conversa_id');
      if (!id || !UUID_RE.test(id)) throw new ErroApi('parametro_invalido', 'conversa_id: use o id da conversa.');
      return {
        recurso,
        conversaId: id.toLowerCase(),
        desde: data(p, 'desde'),
        ate: data(p, 'ate'),
        limite: limite(p),
        cursor: cursor(p),
        midia: booleano(p, 'midia') === true,
      };
    }
    case 'funil':
    case 'equipe':
      return { recurso, lojaId: uuid(p, 'loja_id') };
    case 'metricas':
      return { recurso, lojaId: uuid(p, 'loja_id'), desde: data(p, 'desde'), ate: data(p, 'ate') };
  }
}

// -----------------------------------------------------------------------------
// REST: endereço → leitura
// -----------------------------------------------------------------------------

/** As rotas da v1. A documentação (src/lib/api/openapi.ts) segue esta lista. */
export const ROTAS_REST = [
  { caminho: '/v1/lojas', recurso: 'lojas' },
  { caminho: '/v1/contatos', recurso: 'contatos' },
  { caminho: '/v1/conversas', recurso: 'conversas' },
  { caminho: '/v1/conversas/{id}/mensagens', recurso: 'mensagens' },
  { caminho: '/v1/funil', recurso: 'funil' },
  { caminho: '/v1/equipe', recurso: 'equipe' },
  { caminho: '/v1/metricas', recurso: 'metricas' },
] as const satisfies ReadonlyArray<{ caminho: string; recurso: Recurso }>;

/** Tira o nome da função do começo (o Supabase entrega /api-v1/v1/...). */
export function caminhoDaApi(pathname: string): string {
  let c = pathname.replace(/\/+$/, '') || '/';
  c = c.replace(/^\/(?:functions\/v1\/)?api-v1(?=\/|$)/, '') || '/';
  return c;
}

export function rotaRest(caminho: string): { rota: string; recurso: Recurso; conversaId?: string } | null {
  const msgs = /^\/v1\/conversas\/([0-9a-fA-F-]{36})\/mensagens$/.exec(caminho);
  const id = msgs?.[1];
  if (msgs) {
    if (!id || !UUID_RE.test(id)) return null;
    return { rota: '/v1/conversas/{id}/mensagens', recurso: 'mensagens', conversaId: id.toLowerCase() };
  }
  const r = ROTAS_REST.find((x) => x.caminho === caminho);
  return r ? { rota: r.caminho, recurso: r.recurso } : null;
}

export function parametrosDaQuery(busca: URLSearchParams): Parametros {
  const p: Parametros = {};
  for (const [k, v] of busca.entries()) {
    if (k in p) throw new ErroApi('parametro_invalido', `parâmetro repetido: ${k}.`);
    p[k] = v;
  }
  return p;
}

// -----------------------------------------------------------------------------
// A leitura no banco (como o dono)
// -----------------------------------------------------------------------------

export type Linha = Record<string, unknown>;

/** Uma chamada a uma api_v1_*: nome fixo, tipos fixos, argumentos. */
export interface Chamada {
  funcao: (typeof FUNCOES_V1)[number];
  tipos: string[];
  args: unknown[];
}

export const FUNCOES_V1 = [
  'api_v1_lojas',
  'api_v1_contatos',
  'api_v1_conversas',
  'api_v1_mensagens',
  'api_v1_midia',
  'api_v1_funil',
  'api_v1_equipe',
  'api_v1_metricas',
] as const;

/** Monta "SELECT * FROM public.f($1::t1, ...)" — nome e tipos só da lista fixa. */
export function sqlDaChamada(c: Chamada): string {
  if (!(FUNCOES_V1 as readonly string[]).includes(c.funcao)) {
    throw new Error(`função fora da lista: ${c.funcao}`);
  }
  for (const t of c.tipos) {
    if (!/^(uuid|text|timestamptz|boolean|integer)(\[\])?$/.test(t)) throw new Error(`tipo fora da lista: ${t}`);
  }
  if (c.tipos.length !== c.args.length) throw new Error('tipos e argumentos não batem');
  const ps = c.tipos.map((t, i) => `$${i + 1}::${t}`).join(', ');
  return `SELECT * FROM public.${c.funcao}(${ps})`;
}

/** Lista de uuids como literal de array do Postgres ('{a,b}'). Só uuids validados. */
export function arrayDeUuids(ids: readonly string[]): string {
  for (const id of ids) if (!UUID_RE.test(id)) throw new Error('uuid inválido na lista');
  return `{${ids.join(',')}}`;
}

/** O que o servidor consegue fazer como o dono da chave, dentro de UMA transação. */
export interface ComoDono {
  /** current_user e auth.uid() da transação, para a trava. */
  quemSou(): Promise<{ papel: string | null; uid: string | null }>;
  /** tenant_access_state(conta).unlocked */
  contaLiberada(contaId: string): Promise<boolean>;
  chamar(c: Chamada): Promise<Linha[]>;
}

export interface DependenciasApi {
  /** api_chave_usar(hash, ip), como servidor. Deve LANÇAR se não conseguir. */
  usarChave(hash: string, ip: string | null): Promise<UsoDaChave | null>;
  /** Abre a transação como o dono (SET LOCAL ROLE authenticated + sub). */
  comoDono<T>(donoUserId: string, fn: (q: ComoDono) => Promise<T>): Promise<T>;
  /** Assina links do bucket whatsapp-media (chave do servidor). */
  assinar(caminhos: string[], validadeS: number): Promise<Array<{ path: string; signedUrl: string | null }>>;
  /** Grava a linha de api_registro. Deve LANÇAR se não conseguir. */
  registrar(linha: LinhaDeRegistro): Promise<void>;
  /** Secret API_ADDON_ENABLED e API_ADDON_TEST_CONTAS. */
  liberacao: { habilitada: string | null | undefined; contasDeTeste: string | null | undefined };
  origemDoProjeto?: string;
  agora(): Date;
  log?: (nivel: 'info' | 'warn' | 'error', msg: string, ctx?: Record<string, unknown>) => void;
}

export interface LinhaDeRegistro {
  chave_id: string | null;
  conta_id: string | null;
  canal: 'rest' | 'mcp';
  metodo: string;
  rota: string;
  filtros: Record<string, unknown>;
  linhas: number | null;
  status: number;
  resultado: string;
  ip: string | null;
  midia_ids: string[] | null;
  duracao_ms: number;
}

/** Os filtros que vão para o registro: só nomes conhecidos, valores curtos. Nunca a chave. */
export function filtrosParaRegistro(p: Parametros): Record<string, unknown> {
  const todos = new Set(Object.values(PARAMETROS_ACEITOS).flat().concat(['conversa_id']));
  const r: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (!todos.has(k)) continue;
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    r[k] = ocultarChave(String(s ?? '')).slice(0, 120);
  }
  return r;
}

// --- autenticação --------------------------------------------------------------

export type Autenticacao =
  | { ok: true; contexto: Contexto }
  | { ok: false; erro: ErroApi; chaveId: string | null; contaId: string | null; restanteMinuto?: number | null };

export async function autenticar(
  cabecalhos: CabecalhosLike,
  ip: string | null,
  deps: DependenciasApi,
): Promise<Autenticacao> {
  const crua = lerChaveDoPedido(cabecalhos);
  if (!crua) return { ok: false, erro: new ErroApi('chave_ausente'), chaveId: null, contaId: null };
  if (!chaveBemFormada(crua)) return { ok: false, erro: new ErroApi('chave_invalida'), chaveId: null, contaId: null };

  let uso: UsoDaChave | null;
  try {
    uso = await deps.usarChave(await hashDaChave(crua), ip);
  } catch (e) {
    deps.log?.('error', 'api: api_chave_usar falhou', { erro: ocultarChave(String((e as Error)?.message ?? e)) });
    return { ok: false, erro: new ErroApi('indisponivel'), chaveId: null, contaId: null };
  }
  const chaveId = uso?.chave_id ?? null;
  const contaId = uso?.conta_id ?? null;

  const codigo = erroDoUso(uso?.resultado);
  if (codigo) {
    return { ok: false, erro: new ErroApi(codigo), chaveId, contaId, restanteMinuto: uso?.restante_minuto ?? null };
  }
  if (!apiLiberada(deps.liberacao.habilitada, deps.liberacao.contasDeTeste, contaId)) {
    return { ok: false, erro: new ErroApi('indisponivel'), chaveId, contaId };
  }
  const escopos = (uso?.escopos ?? []).filter((e): e is Escopo => (ESCOPOS as readonly string[]).includes(e));
  const lojas = (uso?.lojas ?? []).filter((l) => UUID_RE.test(l));
  if (!chaveId || !contaId || !uso?.dono_user_id || !UUID_RE.test(uso.dono_user_id)) {
    return { ok: false, erro: new ErroApi('indisponivel'), chaveId, contaId };
  }
  return {
    ok: true,
    contexto: {
      chaveId,
      contaId,
      donoUserId: uso.dono_user_id.toLowerCase(),
      escopos,
      lojas,
      restanteMinuto: uso.restante_minuto ?? null,
      restanteDia: uso.restante_dia ?? null,
    },
  };
}

// --- mapeadores: SÓ os campos aprovados -----------------------------------------

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
const bool = (v: unknown): boolean => v === true || v === 't' || v === 'true';

export function mapearLoja(l: Linha) {
  return { id: str(l.id), nome: str(l.nome), tipo: str(l.tipo) };
}

export function mapearContato(l: Linha) {
  return {
    id: str(l.id),
    loja_id: str(l.loja_id),
    nome: str(l.nome),
    telefone: str(l.telefone),
    email: str(l.email),
    canal: str(l.canal),
    usuario: str(l.usuario),
    etapa: l.etapa_id ? { id: str(l.etapa_id), nome: str(l.etapa_nome) } : null,
    etiquetas: Array.isArray(l.etiquetas) ? l.etiquetas.map((x) => String(x)) : [],
    ultima_interacao_em: iso(l.ultima_interacao_em),
    criado_em: iso(l.criado_em),
    atualizado_em: iso(l.atualizado_em),
  };
}

export function mapearConversa(l: Linha) {
  return {
    id: str(l.id),
    loja_id: str(l.loja_id),
    contato: { id: str(l.contato_id), nome: str(l.contato_nome) },
    canal: str(l.canal),
    atendente: l.atendente_id ? { id: str(l.atendente_id), nome: str(l.atendente_nome) } : null,
    arquivada: bool(l.arquivada),
    nao_lidas: num(l.nao_lidas) ?? 0,
    ultima_mensagem: {
      em: iso(l.ultima_mensagem_em),
      direcao: str(l.ultima_mensagem_direcao),
      tipo: str(l.ultima_mensagem_tipo),
      texto: str(l.ultima_mensagem_texto),
    },
    criada_em: iso(l.criada_em),
  };
}

export function mapearMensagem(l: Linha, midia?: { url: string; expira_em: string } | null) {
  const m = {
    id: str(l.id),
    conversa_id: str(l.conversa_id),
    loja_id: str(l.loja_id),
    direcao: str(l.direcao),
    tipo: str(l.tipo),
    texto: str(l.texto),
    status: str(l.status),
    enviada_por_bot: bool(l.enviada_por_bot),
    autor_id: str(l.autor_id),
    tem_midia: bool(l.tem_midia),
    criada_em: iso(l.criada_em),
  };
  return midia ? { ...m, midia } : m;
}

export function mapearEtapa(l: Linha) {
  return {
    id: str(l.etapa_id),
    loja_id: str(l.loja_id),
    nome: str(l.nome),
    ordem: num(l.ordem),
    final: bool(l.final),
    contatos: num(l.contatos) ?? 0,
  };
}

export function mapearPessoa(l: Linha) {
  return { id: str(l.id), nome: str(l.nome), cargo: str(l.cargo), loja_id: str(l.loja_id), ativo: bool(l.ativo) };
}

export function mapearMetricas(l: Linha) {
  return {
    loja_id: str(l.loja_id),
    conversas: num(l.conversas) ?? 0,
    conversas_com_bot: num(l.conversas_com_bot) ?? 0,
    sem_resposta_humana: num(l.sem_resposta_humana) ?? 0,
    aguardando_humano: num(l.aguardando_humano) ?? 0,
    primeira_resposta_humana_mediana_min: num(l.primeira_resposta_humana_mediana_min),
    primeira_resposta_bot_mediana_min: num(l.primeira_resposta_bot_mediana_min),
    mensagens_mediana: num(l.mensagens_mediana),
    duracao_mediana_min: num(l.duracao_mediana_min),
  };
}

/** Os campos que cada recurso entrega — a lista aprovada (os testes conferem). */
export const CAMPOS_APROVADOS: Record<Recurso, readonly string[]> = {
  lojas: ['id', 'nome', 'tipo'],
  contatos: ['id', 'loja_id', 'nome', 'telefone', 'email', 'canal', 'usuario', 'etapa', 'etiquetas', 'ultima_interacao_em', 'criado_em', 'atualizado_em'],
  conversas: ['id', 'loja_id', 'contato', 'canal', 'atendente', 'arquivada', 'nao_lidas', 'ultima_mensagem', 'criada_em'],
  mensagens: ['id', 'conversa_id', 'loja_id', 'direcao', 'tipo', 'texto', 'status', 'enviada_por_bot', 'autor_id', 'tem_midia', 'criada_em', 'midia'],
  funil: ['id', 'loja_id', 'nome', 'ordem', 'final', 'contatos'],
  equipe: ['id', 'nome', 'cargo', 'loja_id', 'ativo'],
  metricas: ['loja_id', 'conversas', 'conversas_com_bot', 'sem_resposta_humana', 'aguardando_humano', 'primeira_resposta_humana_mediana_min', 'primeira_resposta_bot_mediana_min', 'mensagens_mediana', 'duracao_mediana_min'],
};

// --- executar ----------------------------------------------------------------

export interface ResultadoLeitura {
  dados: unknown[];
  proximo: string | null;
  linhas: number;
  midiaIds: string[];
}

function exigirEscopo(ctx: Contexto, escopo: Escopo | null) {
  if (escopo && !ctx.escopos.includes(escopo)) {
    throw new ErroApi('sem_permissao', `Esta chave não pode ler "${escopo}". Crie uma chave com essa permissão.`);
  }
}

function lojasDaLeitura(ctx: Contexto, lojaId: string | null): string[] {
  if (lojaId === null) return ctx.lojas;
  if (!ctx.lojas.includes(lojaId)) throw new ErroApi('loja_fora_da_chave');
  return [lojaId];
}

function proximoCursor(linhas: Linha[], limiteUsado: number, campoTs: string): string | null {
  if (linhas.length < limiteUsado) return null;
  const ultima = linhas[linhas.length - 1];
  if (!ultima) return null;
  const ts = iso(ultima[campoTs]);
  const id = str(ultima.id);
  if (!ts || !id) return null;
  return codificarCursor({ ts, id });
}

/**
 * Lê um recurso como o dono da chave. `opcoes.semMidia` (MCP): nunca assina
 * link, mesmo que peçam.
 */
export async function executarLeitura(
  ctx: Contexto,
  leitura: Leitura,
  deps: DependenciasApi,
  opcoes: { semMidia?: boolean } = {},
): Promise<ResultadoLeitura> {
  exigirEscopo(ctx, ESCOPO_DO_RECURSO[leitura.recurso]);
  if (leitura.recurso === 'mensagens' && leitura.midia) {
    if (opcoes.semMidia) throw new ErroApi('sem_permissao', 'Mídia não sai por aqui.');
    exigirEscopo(ctx, 'midia');
  }
  const lojaIdPedida = 'lojaId' in leitura ? leitura.lojaId : null;
  const lojas = arrayDeUuids(lojasDaLeitura(ctx, lojaIdPedida));

  return deps.comoDono(ctx.donoUserId, async (q) => {
    // A trava: sem o papel do dono, nada é lido.
    const eu = await q.quemSou();
    if (eu.papel !== 'authenticated' || (eu.uid ?? '').toLowerCase() !== ctx.donoUserId) {
      throw new Error('api: a transação não está como o dono da chave');
    }
    if (!(await q.contaLiberada(ctx.contaId))) throw new ErroApi('conta_bloqueada');

    switch (leitura.recurso) {
      case 'lojas': {
        const r = await q.chamar({ funcao: 'api_v1_lojas', tipos: ['uuid[]'], args: [lojas] });
        return { dados: r.map(mapearLoja), proximo: null, linhas: r.length, midiaIds: [] };
      }
      case 'contatos': {
        const r = await q.chamar({
          funcao: 'api_v1_contatos',
          tipos: ['uuid[]', 'uuid', 'uuid', 'timestamptz', 'text', 'timestamptz', 'uuid', 'integer'],
          args: [lojas, leitura.etapaId, leitura.etiquetaId, leitura.atualizadoDesde, leitura.busca,
                 leitura.cursor?.ts ?? null, leitura.cursor?.id ?? null, leitura.limite],
        });
        return { dados: r.map(mapearContato), proximo: proximoCursor(r, leitura.limite, 'atualizado_em'), linhas: r.length, midiaIds: [] };
      }
      case 'conversas': {
        const comTexto = ctx.escopos.includes('mensagens');
        const r = await q.chamar({
          funcao: 'api_v1_conversas',
          tipos: ['uuid[]', 'uuid', 'boolean', 'timestamptz', 'timestamptz', 'boolean', 'timestamptz', 'uuid', 'integer'],
          args: [lojas, leitura.atendenteId, leitura.arquivada, leitura.desde, leitura.ate, comTexto,
                 leitura.cursor?.ts ?? null, leitura.cursor?.id ?? null, leitura.limite],
        });
        return { dados: r.map(mapearConversa), proximo: proximoCursor(r, leitura.limite, 'ultima_mensagem_em'), linhas: r.length, midiaIds: [] };
      }
      case 'mensagens': {
        const r = await q.chamar({
          funcao: 'api_v1_mensagens',
          tipos: ['uuid[]', 'uuid', 'timestamptz', 'timestamptz', 'timestamptz', 'uuid', 'integer'],
          args: [lojas, leitura.conversaId, leitura.desde, leitura.ate,
                 leitura.cursor?.ts ?? null, leitura.cursor?.id ?? null, leitura.limite],
        });
        let links = new Map<string, { url: string; expira_em: string }>();
        if (leitura.midia && !opcoes.semMidia) {
          links = await assinarMidia(q, deps, lojas, r.filter((m) => bool(m.tem_midia)).map((m) => String(m.id)));
        }
        return {
          dados: r.map((m) => mapearMensagem(m, links.get(String(m.id)) ?? null)),
          proximo: proximoCursor(r, leitura.limite, 'criada_em'),
          linhas: r.length,
          midiaIds: [...links.keys()],
        };
      }
      case 'funil': {
        const r = await q.chamar({ funcao: 'api_v1_funil', tipos: ['uuid[]'], args: [lojas] });
        return { dados: r.map(mapearEtapa), proximo: null, linhas: r.length, midiaIds: [] };
      }
      case 'equipe': {
        const r = await q.chamar({ funcao: 'api_v1_equipe', tipos: ['uuid[]'], args: [lojas] });
        return { dados: r.map(mapearPessoa), proximo: null, linhas: r.length, midiaIds: [] };
      }
      case 'metricas': {
        const ate = leitura.ate ?? deps.agora().toISOString();
        const desde = leitura.desde ?? new Date(Date.parse(ate) - METRICAS_DIAS_PADRAO * 86_400_000).toISOString();
        if (Date.parse(ate) <= Date.parse(desde) || Date.parse(ate) - Date.parse(desde) > 366 * 86_400_000) {
          throw new ErroApi('parametro_invalido', 'período: "desde" antes de "ate", até 366 dias.');
        }
        const r = await q.chamar({ funcao: 'api_v1_metricas', tipos: ['uuid[]', 'timestamptz', 'timestamptz'], args: [lojas, desde, ate] });
        return { dados: r.map(mapearMetricas), proximo: null, linhas: r.length, midiaIds: [] };
      }
    }
  });
}

/**
 * A mídia das mensagens desta página: lê como o dono (api_v1_midia), confere
 * que cada arquivo é da própria mensagem (a mesma regra de media-links) e
 * assina por 15 minutos.
 */
async function assinarMidia(
  q: ComoDono,
  deps: DependenciasApi,
  lojas: string,
  ids: string[],
): Promise<Map<string, { url: string; expira_em: string }>> {
  const saida = new Map<string, { url: string; expira_em: string }>();
  if (ids.length === 0) return saida;
  const linhas = (await q.chamar({ funcao: 'api_v1_midia', tipos: ['uuid[]', 'uuid[]'], args: [lojas, arrayDeUuids(ids)] })) as unknown as LinhaDaMensagem[];
  const porMensagem = new Map<string, string>();
  for (const l of linhas) {
    const caminho = whatsappMediaPath(l.media_url, deps.origemDoProjeto);
    if (caminho && caminhoBateComAMensagem(l, caminho)) porMensagem.set(String(l.id), caminho);
  }
  if (porMensagem.size === 0) return saida;
  const assinados = await deps.assinar([...new Set(porMensagem.values())], MIDIA_TTL_S);
  const porCaminho = new Map<string, string>();
  for (const a of assinados) if (a.signedUrl) porCaminho.set(a.path, a.signedUrl);
  const expira = new Date(deps.agora().getTime() + MIDIA_TTL_S * 1000).toISOString();
  for (const [id, caminho] of porMensagem) {
    const url = porCaminho.get(caminho);
    if (url) saida.set(id, { url, expira_em: expira });
  }
  return saida;
}

// -----------------------------------------------------------------------------
// REST: o pedido inteiro
// -----------------------------------------------------------------------------

export interface PedidoRest {
  metodo: string;
  url: string;
  cabecalhos: CabecalhosLike;
}

export interface RespostaApi {
  status: number;
  corpo: unknown;
  cabecalhos: Record<string, string>;
}

const CABECALHOS_BASE: Record<string, string> = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

function cabecalhosDoLimite(minuto: number | null | undefined, dia: number | null | undefined): Record<string, string> {
  const h: Record<string, string> = {};
  if (typeof minuto === 'number') h['X-Limite-Restante-Minuto'] = String(minuto);
  if (typeof dia === 'number') h['X-Limite-Restante-Dia'] = String(dia);
  return h;
}

export async function atenderRest(pedido: PedidoRest, deps: DependenciasApi): Promise<RespostaApi> {
  const inicio = deps.agora().getTime();
  const url = new URL(pedido.url);
  const caminho = caminhoDaApi(url.pathname);
  const ip = ipDoPedido(pedido.cabecalhos);
  const metodo = pedido.metodo.toUpperCase();

  const erro = (e: ErroApi, extra: Record<string, string> = {}): RespostaApi => ({
    status: e.status,
    corpo: corpoDoErro(e),
    cabecalhos: { ...CABECALHOS_BASE, ...extra },
  });

  // Pedido de navegador (pré-voo do CORS): não responde com permissão nenhuma.
  if (metodo === 'OPTIONS') return { status: 204, corpo: null, cabecalhos: { 'Cache-Control': 'no-store' } };

  const auth = await autenticar(pedido.cabecalhos, ip, deps);
  const rota = rotaRest(caminho);
  let filtros: Record<string, unknown> = {};

  const registrar = async (r: RespostaApi, linhas: number | null, midiaIds: string[] | null, resultado: string, chaveId: string | null, contaId: string | null) => {
    try {
      await deps.registrar({
        chave_id: chaveId,
        conta_id: contaId,
        canal: 'rest',
        metodo,
        rota: rota?.rota ?? caminho.slice(0, 120),
        filtros,
        linhas,
        status: r.status,
        resultado,
        ip,
        midia_ids: midiaIds && midiaIds.length ? midiaIds : null,
        duracao_ms: deps.agora().getTime() - inicio,
      });
      return r;
    } catch (e) {
      deps.log?.('error', 'api: registro não gravado; a resposta não sai', { erro: ocultarChave(String((e as Error)?.message ?? e)) });
      return erro(new ErroApi('indisponivel'));
    }
  };

  if (!auth.ok) {
    const extra: Record<string, string> = {};
    if (auth.erro.status === 401) extra['WWW-Authenticate'] = 'Bearer realm="convoflow"';
    if (auth.erro.status === 429) extra['Retry-After'] = auth.erro.codigo === 'limite_minuto' ? '60' : '3600';
    const r = erro(auth.erro, extra);
    // Sem chave nenhuma não há o que registrar: é só um endereço batido.
    if (auth.erro.codigo === 'chave_ausente') return r;
    return registrar(r, null, null, auth.erro.codigo, auth.chaveId, auth.contaId);
  }

  const ctx = auth.contexto;
  const limites = cabecalhosDoLimite(ctx.restanteMinuto, ctx.restanteDia);
  try {
    if (metodo !== 'GET') throw new ErroApi('metodo_nao_permitido');
    if (!rota) throw new ErroApi('nao_encontrado');
    const params = parametrosDaQuery(url.searchParams);
    filtros = filtrosParaRegistro(params);
    const leitura = montarLeitura(rota.recurso, params, rota.conversaId);
    const res = await executarLeitura(ctx, leitura, deps);
    const r: RespostaApi = {
      status: 200,
      corpo: { dados: res.dados, proximo: res.proximo },
      cabecalhos: { ...CABECALHOS_BASE, ...limites },
    };
    return registrar(r, res.linhas, res.midiaIds, 'ok', ctx.chaveId, ctx.contaId);
  } catch (e) {
    if (e instanceof ErroApi) {
      return registrar(erro(e, limites), null, null, e.codigo, ctx.chaveId, ctx.contaId);
    }
    deps.log?.('error', 'api: falha na leitura', { erro: ocultarChave(String((e as Error)?.message ?? e)) });
    return registrar(erro(new ErroApi('erro_interno'), limites), null, null, 'erro_interno', ctx.chaveId, ctx.contaId);
  }
}
