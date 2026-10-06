import { ineligibleReasonLabel, type IneligibleReason } from '@/lib/conversations/rotation';

/**
 * Métricas por pessoa, por POSSE de conversa (RPC loja_attendant_metrics,
 * migração 20260921000002) — regras puras, sem React.
 *
 * O que o banco sabe com honestidade é QUEM ESTÁ COM cada conversa, não quem
 * respondeu. Por isso a seção fala de posse, e por isso a linha "sem
 * responsável" (profile_id null) é a primeira coisa que a tela mostra: na
 * VagaCerta, em 2026-09-21, 4 de 168 conversas tinham dono e 92 esperavam
 * resposta sem dono. Uma tabela só de pessoas diria que ninguém deve nada.
 */
export interface AttendantMetricsRow {
  /** null = a linha "sem responsável". */
  profile_id: string | null;
  first_name: string | null;
  last_name: string | null;
  role: string | null;
  /** Gerente da Conta acima da Loja (atende junto). */
  is_parent_account: boolean;
  /** null = está no time; senão o vocabulário de loja_ineligible_owners. */
  reason: IneligibleReason | null;
  n_held: number;
  n_assumed: number;
  n_transferred: number;
  n_automatic: number;
  n_waiting: number;
  n_no_human_reply: number;
  n_rule_transfers_suffered: number;
  n_rule_transfers_received: number;
}

const toNumber = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));

/** Normaliza a linha crua da RPC (bigint chega como string). */
export const parseAttendantRow = (r: Record<string, unknown>): AttendantMetricsRow => ({
  profile_id: (r.profile_id as string | null) ?? null,
  first_name: (r.first_name as string | null) ?? null,
  last_name: (r.last_name as string | null) ?? null,
  role: (r.role as string | null) ?? null,
  is_parent_account: r.is_parent_account === true,
  reason: (r.reason as IneligibleReason | null) ?? null,
  n_held: toNumber(r.n_held),
  n_assumed: toNumber(r.n_assumed),
  n_transferred: toNumber(r.n_transferred),
  n_automatic: toNumber(r.n_automatic),
  n_waiting: toNumber(r.n_waiting),
  n_no_human_reply: toNumber(r.n_no_human_reply),
  n_rule_transfers_suffered: toNumber(r.n_rule_transfers_suffered),
  n_rule_transfers_received: toNumber(r.n_rule_transfers_received),
});

export interface AttendantMetricsView {
  /** A linha "sem responsável" — sempre presente na RPC; zeros se faltar. */
  unowned: AttendantMetricsRow;
  /** As pessoas, na ordem da RPC (mais conversas primeiro). */
  people: AttendantMetricsRow[];
  /** Total de conversas não arquivadas (pessoas + sem responsável). */
  totalHeld: number;
  totalWaiting: number;
}

const EMPTY_UNOWNED: AttendantMetricsRow = {
  profile_id: null, first_name: null, last_name: null, role: null, is_parent_account: false, reason: null,
  n_held: 0, n_assumed: 0, n_transferred: 0, n_automatic: 0, n_waiting: 0, n_no_human_reply: 0,
  n_rule_transfers_suffered: 0, n_rule_transfers_received: 0,
};

export const splitAttendantRows = (rows: ReadonlyArray<AttendantMetricsRow>): AttendantMetricsView => {
  const unowned = rows.find((r) => r.profile_id === null) ?? EMPTY_UNOWNED;
  const people = rows.filter((r) => r.profile_id !== null);
  const totalHeld = rows.reduce((acc, r) => acc + r.n_held, 0);
  const totalWaiting = rows.reduce((acc, r) => acc + r.n_waiting, 0);
  return { unowned, people, totalHeld, totalWaiting };
};

/**
 * A frase do aviso de "sem responsável", em palavras simples. É a parte
 * honesta da seção: vem antes da tabela e não some quando é zero.
 */
export const unownedNotice = (view: AttendantMetricsView): string => {
  const { unowned, totalHeld, totalWaiting } = view;
  if (totalHeld === 0) return 'Nenhuma conversa aberta na Loja.';
  if (unowned.n_held === 0) return 'Todas as conversas abertas estão com alguém.';
  const held = `${unowned.n_held} de ${totalHeld} conversas abertas estão sem responsável`;
  if (unowned.n_waiting === 0) return `${held}.`;
  const waiting = `${held}, e ${unowned.n_waiting} delas esperam uma pessoa responder.`;
  // Todas as que esperam estão sem dono: dizer isso, porque é o que manda agir.
  return totalWaiting === unowned.n_waiting
    ? `${waiting} Nenhuma conversa que espera resposta tem dono.`
    : waiting;
};

/** "Maria Souza", "Maria Souza (suspenso)", "Helena (da Conta)". */
export const attendantLabel = (row: AttendantMetricsRow): string => {
  const name = [row.first_name, row.last_name].map((p) => (p ?? '').trim()).filter(Boolean).join(' ') || 'Sem nome';
  if (row.reason) return `${name} (${ineligibleReasonLabel(row.reason)})`;
  if (row.is_parent_account) return `${name} (da Conta)`;
  return name;
};

/** "2 assumiu · 1 de colega · 0 automático" — como as conversas chegaram. */
export const obtainedLabel = (row: AttendantMetricsRow): string =>
  `${row.n_assumed} assumiu · ${row.n_transferred} de colega · ${row.n_automatic} automático`;
