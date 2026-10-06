/**
 * Filtros rápidos da lista de conversas (as "pílulas" no estilo WhatsApp).
 *
 * `conversations` não tem coluna `status`, então cada pílula é traduzida de uma
 * de duas formas:
 *
 *   - "Não lidas" e "Arquivadas" viram filtro DE SERVIDOR (`unread_count > 0` e
 *     `is_archived`), porque são colunas reais. Assim a paginação por cursor
 *     continua trazendo o conjunto certo página após página.
 *   - "Aguardando", "Não respondidas" e "Em atendimento" são níveis DERIVADOS
 *     (as regras vivem em `conversationGroups.ts` e `slaLevels.ts` e não são
 *     duplicadas aqui), então só podem ser aplicados no cliente, sobre o que já
 *     foi carregado.
 *   - "Minhas" e "Sem responsável" olham `assigned_profile_id` (migração
 *     20260913000001) e também viram filtro DE SERVIDOR (`assigned_profile_id
 *     = eu` e `IS NULL`), com contagem própria — o número delas é o total da
 *     fila, exato. Até 2026-09-21 elas recortavam só o carregado, e em
 *     VagaCerta "Sem responsável" mostrava "16+" de 163 até rolar tudo. O
 *     predicado de cliente delas continua em `matchesQuickFilter` por
 *     segurança (sobre o que o servidor já recortou, ele é um no-op).
 *   - "Responsável indisponível" (só gestor/gerente) segue derivada: a lista
 *     de quem está indisponível vem de uma RPC, não é coluna.
 *
 * Filtro por atendente (modal "Filtros", só gestor/gerente) e as pílulas
 * "Minhas" / "Sem responsável" escrevem a mesma coluna, então são
 * mutuamente exclusivos: escolher atendente devolve a pílula a "Todas", e
 * clicar numa das duas pílulas limpa os atendentes (ver `reconcile*`). Sem
 * isso, "Minhas" + "Maria" daria lista vazia sem explicação.
 *
 * "Não respondidas" ainda depende da Loja ter ligado a sinalização de SLA — com
 * ela desligada a pílula não existe (ver `visibleQuickFilters`).
 */

import {
  resolveAttendanceGroup,
  type AttendanceGroup,
  type AttendanceInput,
} from './conversationGroups';
import { resolveSlaLevel, type SlaInput, type SlaThresholds } from './slaLevels';

export type QuickFilterType =
  | 'todas'
  | 'minhas'
  | 'sem-responsavel'
  | 'nao-lidas'
  | 'aguardando'
  | 'nao-respondidas'
  | 'em-atendimento'
  | 'responsavel-indisponivel'
  | 'arquivadas';

export const QUICK_FILTERS: ReadonlyArray<{ id: QuickFilterType; label: string; hint: string }> = [
  { id: 'todas', label: 'Todas', hint: 'Todas as conversas ativas.' },
  { id: 'minhas', label: 'Minhas', hint: 'Conversas que estão com você como responsável.' },
  { id: 'sem-responsavel', label: 'Sem responsável', hint: 'Conversas que ninguém assumiu ainda.' },
  { id: 'nao-lidas', label: 'Não lidas', hint: 'Conversas com mensagens ainda não lidas.' },
  { id: 'aguardando', label: 'Aguardando', hint: 'O cliente falou por último e ainda não foi respondido.' },
  { id: 'nao-respondidas', label: 'Não respondidas', hint: 'Conversas pendentes há mais tempo que o limite configurado pela Loja.' },
  { id: 'em-atendimento', label: 'Em atendimento', hint: 'Você respondeu por último e a conversa se mexeu nas últimas 24h.' },
  // Só Gestor e Gerente veem esta: conversas presas com alguém suspenso,
  // excluído, movido de Loja ou em 0 % no rodízio. Quem alimenta é a RPC
  // loja_ineligible_owners (migração 20260915000001).
  { id: 'responsavel-indisponivel', label: 'Responsável indisponível', hint: 'Conversas cujo responsável está suspenso, excluído, fora da Loja ou em 0 % no rodízio. Só o Gestor move.' },
  { id: 'arquivadas', label: 'Arquivadas', hint: 'Conversas arquivadas.' },
] as const;

/** True para a pílula reservada a quem administra a Loja. */
export function isAdminOnlyFilter(quickFilter: QuickFilterType): boolean {
  return quickFilter === 'responsavel-indisponivel';
}

/** As duas pílulas que escrevem `assigned_profile_id` no recorte de servidor. */
export function isOwnershipPill(quickFilter: QuickFilterType): boolean {
  return quickFilter === 'minhas' || quickFilter === 'sem-responsavel';
}

/**
 * Exclusão mútua entre as pílulas de responsável e o filtro por atendente.
 *
 * As duas funções são puras e simétricas; a tela chama uma ao clicar numa
 * pílula e a outra ao mudar o modal. Nenhuma das duas mexe no que não
 * colide: "Aguardando" + "Maria" ou "Responsável indisponível" + "Maria"
 * passam intactos.
 */
export interface OwnershipSelection {
  quickFilter: QuickFilterType;
  /** Atendentes marcados no modal "Filtros" (profiles.id). */
  assignedProfileIds: string[];
}

/** Pílula escolhida: se for "Minhas" ou "Sem responsável", os atendentes saem. */
export function reconcilePillChoice(
  next: QuickFilterType,
  assignedProfileIds: string[],
): OwnershipSelection {
  return {
    quickFilter: next,
    assignedProfileIds: isOwnershipPill(next) ? [] : assignedProfileIds,
  };
}

/** Atendentes escolhidos: se houver algum, a pílula de responsável volta a "Todas". */
export function reconcileAttendantChoice(
  assignedProfileIds: string[],
  quickFilter: QuickFilterType,
): OwnershipSelection {
  return {
    quickFilter: assignedProfileIds.length > 0 && isOwnershipPill(quickFilter) ? 'todas' : quickFilter,
    assignedProfileIds,
  };
}

/** Configuração de SLA da Loja, quando a sinalização está ligada. */
export interface SlaFilterConfig {
  enabled: boolean;
  thresholds: SlaThresholds;
}

/** O que as pílulas de responsável precisam saber de cada conversa. */
export interface OwnershipInput {
  /** profiles.id do responsável; null/ausente = sem responsável. */
  assigned_profile_id?: string | null;
}

/** Quem está olhando a lista — é o "eu" de "Minhas". */
export interface OwnershipFilterContext {
  /** profiles.id de quem está logado; null enquanto o perfil não carrega. */
  viewerProfileId: string | null;
  /**
   * profiles.id dos responsáveis INDISPONÍVEIS (suspenso, excluído, fora da
   * Loja, 0 %), vindos da RPC loja_ineligible_owners. Ausente = a pílula
   * "Responsável indisponível" não existe para quem está olhando.
   */
  ineligibleOwnerIds?: ReadonlySet<string>;
}

/** Entrada completa de uma conversa para as pílulas. */
export type QuickFilterInput = SlaInput & OwnershipInput;

/**
 * Pílulas visíveis para esta Loja. Com a sinalização de SLA desligada,
 * "Não respondidas" não aparece — não fica desabilitada, some.
 */
export function visibleQuickFilters(
  slaEnabled: boolean,
  options: { canSeeIneligible?: boolean } = {},
): typeof QUICK_FILTERS {
  return QUICK_FILTERS.filter((filter) => {
    if (filter.id === 'nao-respondidas' && !slaEnabled) return false;
    if (isAdminOnlyFilter(filter.id) && !options.canSeeIneligible) return false;
    return true;
  });
}

/**
 * Contagem de uma pílula, com o alcance dela junto.
 *
 * As pílulas não são todas do mesmo tipo, então o número delas não pode ser
 * lido do mesmo jeito:
 *
 *   - "Todas", "Não lidas" e "Arquivadas" são colunas reais, então dá para
 *     perguntar o total ao servidor: `exact: true`, é o tamanho da fila.
 *   - "Aguardando", "Não respondidas" e "Em atendimento" são derivadas de
 *     regras que só existem no cliente. Enquanto houver página por carregar, o
 *     número é um PISO, não o total: `exact: false`.
 *
 * Sem essa distinção os dois significados sairiam com a mesma cara no mesmo
 * lugar da tela — que é exatamente o problema que a contagem veio resolver.
 */
export interface QuickFilterCount {
  value: number;
  /** false = só o que já foi carregado; o total real é este número ou maior. */
  exact: boolean;
}

/** Contagem por pílula. Chave ausente = desconhecida no conjunto carregado. */
export type QuickFilterCounts = Partial<Record<QuickFilterType, QuickFilterCount>>;

/**
 * Pílulas cujo total o servidor sabe responder, porque são coluna de verdade
 * em `conversations` (`is_archived`, `unread_count`, `assigned_profile_id`).
 *
 * As outras três dependem de `conversationGroups.ts` / `slaLevels.ts`. Traduzir
 * essas regras para filtro do PostgREST criaria uma segunda fonte da verdade
 * para uma regra que já mostrou ser sutil (o 'incoming' que a normalização de
 * direção conserta) — e as duas cópias iam divergir na primeira mudança.
 * "Responsável indisponível" também fica de fora: o conjunto de indisponíveis
 * vem da RPC loja_ineligible_owners, e uma contagem de servidor teria que
 * repetir a regra dela.
 */
export const SERVER_COUNTED_FILTERS: ReadonlyArray<QuickFilterType> = [
  'todas',
  'minhas',
  'sem-responsavel',
  'nao-lidas',
  'arquivadas',
] as const;

export function isServerCountedFilter(quickFilter: QuickFilterType): boolean {
  return SERVER_COUNTED_FILTERS.includes(quickFilter);
}

/** Nível de atendimento exigido por cada pílula — só as derivadas aparecem. */
const ATTENDANCE_BY_FILTER: Partial<Record<QuickFilterType, AttendanceGroup>> = {
  aguardando: 'waiting',
  'em-atendimento': 'in_progress',
};

/**
 * Recorte que a query aceita hoje (colunas reais de `conversations`).
 *
 * Os dois campos de responsável são opcionais: ausentes (ou vazio/false) é
 * "sem recorte por responsável" — o que o modal manda quando nenhum atendente
 * está marcado, e o que as pílulas que não são de responsável preservam.
 */
export interface QuickFilterScope {
  hasUnread: boolean;
  isArchived: boolean;
  /** Responsáveis (profiles.id), QUALQUER um. Do modal, ou `[eu]` na pílula "Minhas". */
  assignedProfileIds?: string[];
  /** Só sem responsável — a pílula "Sem responsável". */
  unassignedOnly?: boolean;
}

/**
 * Compõe a pílula ativa com o que veio do modal "Filtros".
 *
 * Desempate: "Arquivadas" sobrescreve o modal — a pílula vence. "Minhas" e
 * "Sem responsável" sobrescrevem só o campo de responsável, porque é o que
 * clicar nelas faz (ver `reconcilePillChoice`): a contagem de cada uma tem de
 * ser a da fila que apareceria ao clicar. As demais apenas somam ao que o
 * modal pediu, para não desfazer escolha do usuário sem ele perceber.
 *
 * "Minhas" sem perfil carregado não vira filtro nenhum aqui (a lista ficaria
 * com tudo); quem segura é o predicado de cliente, que sem "eu" não deixa
 * nada passar, e a contagem de "Minhas", que a tela só liga com o perfil.
 */
export function resolveQuickFilterScope(
  quickFilter: QuickFilterType,
  modal: QuickFilterScope,
  viewerProfileId?: string | null,
): QuickFilterScope {
  const base: QuickFilterScope = {
    ...modal,
    hasUnread: quickFilter === 'nao-lidas' ? true : modal.hasUnread,
    isArchived: quickFilter === 'arquivadas' ? true : modal.isArchived,
  };
  if (quickFilter === 'minhas') {
    return {
      ...base,
      assignedProfileIds: viewerProfileId ? [viewerProfileId] : [],
      unassignedOnly: false,
    };
  }
  if (quickFilter === 'sem-responsavel') {
    return { ...base, assignedProfileIds: [], unassignedOnly: true };
  }
  return base;
}

/**
 * Pílulas de responsável. "Minhas" e "Sem responsável" já vêm recortadas do
 * servidor; o predicado de cliente fica como rede (é no-op sobre o que o
 * servidor devolveu). "Responsável indisponível" é só cliente.
 */
function isOwnershipFilter(quickFilter: QuickFilterType): boolean {
  return isOwnershipPill(quickFilter) || isAdminOnlyFilter(quickFilter);
}

/** True para as pílulas que só existem como regra no cliente. */
function isDerivedFilter(quickFilter: QuickFilterType): boolean {
  return (
    quickFilter === 'nao-respondidas' ||
    isOwnershipFilter(quickFilter) ||
    !!ATTENDANCE_BY_FILTER[quickFilter]
  );
}

/** Predicado do lado do cliente. Só as pílulas derivadas descartam algo aqui. */
export function matchesQuickFilter(
  conversation: QuickFilterInput,
  quickFilter: QuickFilterType,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
  ownership?: OwnershipFilterContext,
): boolean {
  if (quickFilter === 'minhas') {
    // Sem perfil carregado nada é "meu" — a lista fica vazia em vez de mentir.
    const viewer = ownership?.viewerProfileId ?? null;
    return !!viewer && conversation.assigned_profile_id === viewer;
  }
  if (quickFilter === 'sem-responsavel') {
    return !conversation.assigned_profile_id;
  }
  if (quickFilter === 'responsavel-indisponivel') {
    // Sem a lista (ainda carregando, ou quem olha não é gestor) nada é "indisponível".
    const ids = ownership?.ineligibleOwnerIds;
    return !!ids && !!conversation.assigned_profile_id && ids.has(conversation.assigned_profile_id);
  }

  if (quickFilter === 'nao-respondidas') {
    // Sem SLA ligado a pílula nem aparece; se chegar aqui (estado antigo na
    // tela), não recorta nada em vez de esvaziar a lista.
    if (!sla?.enabled) return true;
    return resolveSlaLevel(conversation, sla.thresholds, now) !== 'ok';
  }

  const required = ATTENDANCE_BY_FILTER[quickFilter];
  if (!required) return true;
  return resolveAttendanceGroup(conversation, now) === required;
}

/** Aplica o recorte derivado preservando a ordem que veio da query. */
export function applyQuickFilter<T extends QuickFilterInput>(
  conversations: T[],
  quickFilter: QuickFilterType,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
  ownership?: OwnershipFilterContext,
): T[] {
  if (!isDerivedFilter(quickFilter)) return conversations;
  if (quickFilter === 'nao-respondidas' && !sla?.enabled) return conversations;
  return conversations.filter((conversation) =>
    matchesQuickFilter(conversation, quickFilter, now, sla, ownership),
  );
}

/**
 * Contagens tiradas do que já está em memória — sem query extra.
 *
 * O conjunto carregado muda junto com o recorte de servidor ativo, então só dá
 * para contar aquilo que esse recorte cobre. As chaves não cobertas ficam de
 * fora do retorno e quem chama mantém o último valor conhecido, em vez de
 * exibir um zero mentiroso.
 *
 * `allLoaded` diz se a última página já chegou. Com ela falsa, todo número
 * daqui é um piso — a contagem sai marcada `exact: false` e a pílula mostra
 * isso. Com ela verdadeira, o conjunto carregado É a fila inteira e o número
 * vira exato sem precisar perguntar nada ao servidor.
 *
 * As chaves de `SERVER_COUNTED_FILTERS` continuam saindo daqui como fallback:
 * valem enquanto a contagem do servidor não chega (ou se ela falhar), e são
 * sobrescritas por `mergeServerTotals` assim que chega.
 */
export function buildQuickFilterCounts(
  conversations: QuickFilterInput[],
  scope: QuickFilterScope,
  now: Date = new Date(),
  sla?: SlaFilterConfig,
  allLoaded: boolean = false,
  ownership?: OwnershipFilterContext,
): QuickFilterCounts {
  const conta = (value: number): QuickFilterCount => ({ value, exact: allLoaded });

  // Universo dos arquivados: só sabemos o total deles.
  if (scope.isArchived) return { arquivadas: conta(conversations.length) };
  // Universo já recortado por não lidas: idem.
  if (scope.hasUnread) return { 'nao-lidas': conta(conversations.length) };
  // Universo já recortado por "sem responsável": idem.
  if (scope.unassignedOnly) return { 'sem-responsavel': conta(conversations.length) };

  const viewer = ownership?.viewerProfileId ?? null;
  const ineligible = ownership?.ineligibleOwnerIds;
  const owners = scope.assignedProfileIds ?? [];
  // Universo já recortado por "Minhas" (só eu): idem.
  if (owners.length === 1 && viewer && owners[0] === viewer) {
    return { minhas: conta(conversations.length) };
  }
  // Universo recortado por atendente(s) do modal: as pílulas de mensagem
  // ("Aguardando", "Não lidas"...) contam dentro desse universo, e é isso que
  // elas mostrariam ao clicar. "Minhas" e "Sem responsável" não: clicar nelas
  // limpa os atendentes, então o que se contaria aqui não é a fila delas.
  const filtradoPorAtendente = owners.length > 0;

  let naoLidas = 0;
  let aguardando = 0;
  let emAtendimento = 0;
  let naoRespondidas = 0;
  let minhas = 0;
  let semResponsavel = 0;
  let indisponivel = 0;

  for (const conversation of conversations) {
    if ((conversation.unread_count ?? 0) > 0) naoLidas += 1;
    const group = resolveAttendanceGroup(conversation, now);
    if (group === 'waiting') aguardando += 1;
    else if (group === 'in_progress') emAtendimento += 1;
    if (sla?.enabled && resolveSlaLevel(conversation, sla.thresholds, now) !== 'ok') {
      naoRespondidas += 1;
    }
    if (!conversation.assigned_profile_id) semResponsavel += 1;
    else if (viewer && conversation.assigned_profile_id === viewer) minhas += 1;
    if (ineligible && conversation.assigned_profile_id && ineligible.has(conversation.assigned_profile_id)) {
      indisponivel += 1;
    }
  }

  const counts: QuickFilterCounts = {
    todas: conta(conversations.length),
    'nao-lidas': conta(naoLidas),
    aguardando: conta(aguardando),
    'em-atendimento': conta(emAtendimento),
  };
  if (!filtradoPorAtendente) {
    counts.minhas = conta(minhas);
    counts['sem-responsavel'] = conta(semResponsavel);
  }

  // Com o SLA desligado a chave nem é publicada — a pílula não existe.
  if (sla?.enabled) counts['nao-respondidas'] = conta(naoRespondidas);
  // Idem para quem não administra a Loja: sem a lista, sem a chave.
  if (ineligible) counts['responsavel-indisponivel'] = conta(indisponivel);

  return counts;
}

/**
 * Sobrepõe os totais vindos do servidor às contagens do conjunto carregado.
 *
 * Só as chaves de `SERVER_COUNTED_FILTERS` são aceitas, e só com número
 * definido — uma contagem ainda carregando (ou que falhou) devolve `undefined`
 * e a pílula segue com o piso do conjunto carregado, marcado como tal, em vez
 * de piscar ou mentir um total.
 */
export function mergeServerTotals(
  loaded: QuickFilterCounts,
  totals: Partial<Record<QuickFilterType, number | undefined>>,
): QuickFilterCounts {
  const merged: QuickFilterCounts = { ...loaded };

  for (const id of SERVER_COUNTED_FILTERS) {
    const total = totals[id];
    if (typeof total === 'number') {
      merged[id] = { value: total, exact: true };
    }
  }

  return merged;
}
