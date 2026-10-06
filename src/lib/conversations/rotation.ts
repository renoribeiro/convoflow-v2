/**
 * Rodízio de conversas novas (passo 3 da atribuição) — regras puras, sem React.
 *
 * O que existe no banco (migração 20260915000001):
 *   - três chaves em `tenants.settings`: `rotation_enabled`,
 *     `rotation_includes_gestor`, `rotation_timing` ('immediate' | 'after_bot');
 *   - a tabela `conversation_rotation (tenant_id, profile_id, percent, credit)`,
 *     lida pela RPC `conversation_rotation_get` e gravada SÓ pela RPC
 *     `set_conversation_rotation` (tudo ou nada, soma 100, 0 permitido).
 *
 * Quem escolhe a pessoa é o banco (`rotation_pick`, round-robin ponderado
 * suave, serializado por Loja). O `pickNext` daqui é o MESMO algoritmo, para o
 * teste de unidade provar a proporção e para a tela poder simular — nunca para
 * decidir de verdade.
 */

export type RotationTiming = 'immediate' | 'after_bot';

export const ROTATION_TIMING_VALUES: readonly RotationTiming[] = ['immediate', 'after_bot'];

export const DEFAULT_ROTATION_ENABLED = false;
export const DEFAULT_ROTATION_INCLUDES_GESTOR = false;
export const DEFAULT_ROTATION_TIMING: RotationTiming = 'immediate';

/** Quantos atendentes ATIVOS a Loja precisa ter para o rodízio fazer sentido. */
export const ROTATION_MIN_ATENDENTES = 2;

/** Formato guardado em `tenants.settings` (três chaves soltas, como as do passo 2). */
export interface RotationSettings {
  rotation_enabled: boolean;
  rotation_includes_gestor: boolean;
  rotation_timing: RotationTiming;
}

/** Texto único de cada momento — o mesmo na aba de Configurações e na Ajuda. */
export const ROTATION_TIMING_LABELS: Record<RotationTiming, { title: string; explanation: string }> = {
  immediate: {
    title: 'Na primeira mensagem',
    explanation:
      'A conversa nova ganha responsável assim que a primeira mensagem do cliente chega, mesmo que um chatbot ainda vá atender.',
  },
  after_bot: {
    title: 'Quando o chatbot terminar',
    explanation:
      'A conversa só ganha responsável quando não há sessão de chatbot em andamento com o cliente. Sem chatbot publicado para o número, é na hora. Se o chatbot não engatar, o sistema atribui sozinho em até 2 minutos.',
  },
};

export const isRotationTiming = (value: unknown): value is RotationTiming =>
  typeof value === 'string' && (ROTATION_TIMING_VALUES as readonly string[]).includes(value);

/** Lê as três chaves do JSON de settings, com os defaults. Puro, testável. */
export const parseRotationSettings = (settings: unknown): RotationSettings => {
  const raw = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  const enabled = raw.rotation_enabled;
  const includesGestor = raw.rotation_includes_gestor;
  const timing = raw.rotation_timing;
  return {
    rotation_enabled: typeof enabled === 'boolean' ? enabled : DEFAULT_ROTATION_ENABLED,
    rotation_includes_gestor:
      typeof includesGestor === 'boolean' ? includesGestor : DEFAULT_ROTATION_INCLUDES_GESTOR,
    rotation_timing: isRotationTiming(timing) ? timing : DEFAULT_ROTATION_TIMING,
  };
};

// ---------------------------------------------------------------------------
// Porcentagens
// ---------------------------------------------------------------------------

/** Uma linha da RPC conversation_rotation_get. */
export interface RotationMember {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  role: string;
  percent: number;
}

/** Mapa profile_id → porcentagem, como a RPC set_conversation_rotation recebe. */
export type PercentMap = Record<string, number>;

export const PERCENT_TOTAL = 100;

export type PercentValidation =
  | { ok: true; sum: number }
  /** `missing` > 0 = falta chegar a 100; `excess` > 0 = passou de 100. */
  | { ok: false; sum: number; missing: number; excess: number; reason: 'sum' }
  | { ok: false; sum: number; missing: 0; excess: 0; reason: 'invalid'; profileId: string };

/**
 * A regra de salvar: cada valor é inteiro 0..100 e a soma é exatamente 100.
 * Não corrige nada — devolve o que falta ou sobra para a tela mostrar. Quem
 * arredonda ou redistribui é o gestor digitando, nunca este código.
 */
export const validatePercentages = (percents: PercentMap): PercentValidation => {
  let sum = 0;
  for (const [profileId, value] of Object.entries(percents)) {
    if (!Number.isInteger(value) || value < 0 || value > PERCENT_TOTAL) {
      return { ok: false, sum: 0, missing: 0, excess: 0, reason: 'invalid', profileId };
    }
    sum += value;
  }
  if (sum !== PERCENT_TOTAL) {
    return {
      ok: false,
      sum,
      missing: Math.max(0, PERCENT_TOTAL - sum),
      excess: Math.max(0, sum - PERCENT_TOTAL),
      reason: 'sum',
    };
  }
  return { ok: true, sum };
};

/**
 * Divisão igual, na mesma regra de `rotation_rebalance` no banco: participam
 * os que não estão em 0 % e os que acabaram de entrar (`newcomers`); os 0 %
 * continuam 0 %; se ninguém participa, participam todos. Inteiros; o resto vai
 * para quem vem primeiro na ordem recebida (= quem entrou primeiro).
 *
 * Existe aqui para o teste provar a regra e para a tela poder oferecer
 * "dividir igualmente" sem inventar uma segunda regra.
 */
export const rebalanceEvenly = (
  entries: ReadonlyArray<{ profile_id: string; percent: number }>,
  newcomers: ReadonlySet<string> = new Set(),
): PercentMap => {
  const ids = entries.map((e) => e.profile_id);
  let participants = entries.filter((e) => e.percent > 0 || newcomers.has(e.profile_id)).map((e) => e.profile_id);
  if (participants.length === 0) participants = ids;
  const k = participants.length;
  const out: PercentMap = {};
  for (const id of ids) out[id] = 0;
  if (k === 0) return out;
  const base = Math.floor(PERCENT_TOTAL / k);
  const rem = PERCENT_TOTAL - base * k;
  participants.forEach((id, index) => {
    out[id] = base + (index < rem ? 1 : 0);
  });
  return out;
};

// ---------------------------------------------------------------------------
// O escolhedor (espelho de rotation_pick, para teste e simulação)
// ---------------------------------------------------------------------------

export interface RotationState {
  profile_id: string;
  percent: number;
  credit: number;
}

/**
 * Round-robin ponderado suave: todo participante (percent > 0) ganha +percent;
 * o maior crédito vence (empate: quem vem primeiro na lista) e perde a soma
 * das porcentagens participantes. Devolve o vencedor e o estado novo; nunca
 * muta a entrada. `null` quando ninguém participa.
 */
export const pickNext = (
  state: ReadonlyArray<RotationState>,
): { winner: string | null; state: RotationState[] } => {
  const participants = state.filter((s) => s.percent > 0);
  const total = participants.reduce((acc, s) => acc + s.percent, 0);
  if (total <= 0) return { winner: null, state: state.map((s) => ({ ...s })) };

  const next = state.map((s) => (s.percent > 0 ? { ...s, credit: s.credit + s.percent } : { ...s }));
  let winner: RotationState | null = null;
  for (const s of next) {
    if (s.percent <= 0) continue;
    if (!winner || s.credit > winner.credit) winner = s;
  }
  if (!winner) return { winner: null, state: next };
  winner.credit -= total;
  return { winner: winner.profile_id, state: next };
};

/** Roda `n` escolhas seguidas e conta quantas cada pessoa levou. */
export const simulateRotation = (
  initial: ReadonlyArray<RotationState>,
  n: number,
): { counts: Record<string, number>; state: RotationState[] } => {
  const counts: Record<string, number> = {};
  for (const s of initial) counts[s.profile_id] = 0;
  let state = initial.map((s) => ({ ...s }));
  for (let i = 0; i < n; i += 1) {
    const result = pickNext(state);
    state = result.state;
    if (result.winner) counts[result.winner] = (counts[result.winner] ?? 0) + 1;
  }
  return { counts, state };
};

// ---------------------------------------------------------------------------
// Responsável indisponível (RPC loja_ineligible_owners)
// ---------------------------------------------------------------------------

export type IneligibleReason = 'suspended' | 'pending' | 'deleted' | 'moved' | 'zero_percent' | string;

export interface IneligibleOwner {
  profile_id: string;
  first_name: string | null;
  last_name: string | null;
  reason: IneligibleReason;
  n_conversations: number;
}

/** Texto curto do motivo, em pt-BR, para a pílula e o contador. */
export const ineligibleReasonLabel = (reason: IneligibleReason): string => {
  switch (reason) {
    case 'suspended':
      return 'suspenso';
    case 'pending':
      return 'convite pendente';
    case 'deleted':
      return 'excluído';
    case 'moved':
      return 'fora da Loja';
    case 'zero_percent':
      return 'em 0 %';
    default:
      return reason;
  }
};

/** Soma das conversas presas com responsável indisponível. */
export const countIneligibleConversations = (owners: ReadonlyArray<IneligibleOwner>): number =>
  owners.reduce((acc, o) => acc + Number(o.n_conversations ?? 0), 0);
