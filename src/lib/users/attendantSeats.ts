/**
 * Vagas de atendente por Loja, do lado da tela.
 *
 * Espelha `public.store_attendant_seats` (migração 20261009000003) e as frases
 * de `supabase/functions/_shared/store-seats.ts`. Quem decide de verdade é o
 * banco; a tela só avisa antes, para ninguém preencher um convite que vai
 * voltar recusado. `storeSeats.test.ts` confere que as frases são as mesmas.
 *
 * Regra (decisão do dono, 2026-10-09):
 *   - toda Loja tem 2 atendentes, mais as vagas extras combinadas com o
 *     ConvoFlow (só o superadmin muda);
 *   - ocupam vaga: ativo e convite pendente; suspenso libera;
 *   - o gestor não ocupa vaga de atendente.
 */

export const CONTATO_CONVOFLOW = 'contato@convoflow.com.br';

/** Uma linha de `store_attendant_seats`. */
export interface StoreSeats {
  store_id: string;
  store_name: string;
  account_id: string | null;
  incluidos: number;
  extra: number;
  limite: number;
  ativos: number;
  pendentes: number;
  usados: number;
  livres: number;
}

export function isStoreFull(seats: Pick<StoreSeats, 'usados' | 'limite'>): boolean {
  return seats.usados >= seats.limite;
}

/** "Atendentes: 1 de 2" */
export function seatsCounterLabel(seats: Pick<StoreSeats, 'usados' | 'limite'>): string {
  return `Atendentes: ${seats.usados} de ${seats.limite}`;
}

/** "1 convite pendente" / "2 convites pendentes" / null */
export function pendingInvitesLabel(seats: Pick<StoreSeats, 'pendentes'>): string | null {
  if (seats.pendentes <= 0) return null;
  return seats.pendentes === 1 ? '1 convite pendente' : `${seats.pendentes} convites pendentes`;
}

/** Sufixo do seletor de Loja: "1 vaga livre" / "2 vagas livres" / "sem vaga de atendente" */
export function freeSeatsLabel(seats: Pick<StoreSeats, 'livres'>): string {
  if (seats.livres <= 0) return 'sem vaga de atendente';
  return seats.livres === 1 ? '1 vaga livre' : `${seats.livres} vagas livres`;
}

/** A mesma frase do banco e do manage-user. */
export function fullStoreMessage(seats: Pick<StoreSeats, 'usados' | 'limite'>): string {
  return `Esta Loja já tem ${seats.usados} de ${seats.limite} atendentes. Para ter mais, fale com o ConvoFlow: ${CONTATO_CONVOFLOW}`;
}

/** Mapa store_id → vagas, para as telas que já têm a lista de Lojas. */
export function seatsByStore(rows: StoreSeats[] | null | undefined): Record<string, StoreSeats> {
  const mapa: Record<string, StoreSeats> = {};
  for (const r of rows ?? []) mapa[r.store_id] = r;
  return mapa;
}

/** Normaliza o retorno da RPC (números podem vir como string em alguns drivers). */
export function parseSeatsRows(data: unknown): StoreSeats[] {
  if (!Array.isArray(data)) return [];
  const n = (v: unknown) => {
    const x = Number(v);
    return Number.isFinite(x) ? x : 0;
  };
  return data
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { store_id?: unknown }).store_id === 'string')
    .map((r) => ({
      store_id: r.store_id as string,
      store_name: typeof r.store_name === 'string' ? r.store_name : '',
      account_id: typeof r.account_id === 'string' ? r.account_id : null,
      incluidos: n(r.incluidos),
      extra: n(r.extra),
      limite: n(r.limite),
      ativos: n(r.ativos),
      pendentes: n(r.pendentes),
      usados: n(r.usados),
      livres: n(r.livres),
    }));
}
