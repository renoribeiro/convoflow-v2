/**
 * A pílula "Responsável indisponível" (passo 3 da atribuição, migração
 * 20260915000001): só existe para quem administra a Loja, recorta no cliente
 * pelo conjunto vindo da RPC loja_ineligible_owners e só publica contagem
 * quando esse conjunto foi fornecido.
 */
import { describe, expect, it } from 'vitest';
import {
  QUICK_FILTERS,
  SERVER_COUNTED_FILTERS,
  applyQuickFilter,
  buildQuickFilterCounts,
  isAdminOnlyFilter,
  matchesQuickFilter,
  visibleQuickFilters,
  type QuickFilterInput,
} from './quickFilters';

const EU = 'p-eu';
const SUSPENSO = 'p-suspenso';
const ATIVO = 'p-ativo';

const conversa = (assigned: string | null): QuickFilterInput => ({
  assigned_profile_id: assigned,
  last_message_direction: 'inbound',
  last_message_at: '2026-09-14T10:00:00.000Z',
  unread_count: 1,
});

const INDISPONIVEIS = new Set([SUSPENSO]);
const escopoLimpo = { hasUnread: false, isArchived: false };

describe('visibilidade da pílula', () => {
  it('existe em QUICK_FILTERS, antes de "Arquivadas", e é a única reservada', () => {
    const ids = QUICK_FILTERS.map((f) => f.id);
    expect(ids.indexOf('responsavel-indisponivel')).toBe(ids.indexOf('arquivadas') - 1);
    expect(QUICK_FILTERS.filter((f) => isAdminOnlyFilter(f.id)).map((f) => f.id)).toEqual(['responsavel-indisponivel']);
  });

  it('some para quem não administra a Loja (o padrão) e aparece para gestor/gerente', () => {
    for (const sla of [true, false]) {
      expect(visibleQuickFilters(sla).map((f) => f.id)).not.toContain('responsavel-indisponivel');
      expect(visibleQuickFilters(sla, { canSeeIneligible: false }).map((f) => f.id)).not.toContain('responsavel-indisponivel');
      expect(visibleQuickFilters(sla, { canSeeIneligible: true }).map((f) => f.id)).toContain('responsavel-indisponivel');
    }
  });

  it('a chamada antiga (um argumento) continua igual: SLA decide só "Não respondidas"', () => {
    expect(visibleQuickFilters(false).map((f) => f.id)).not.toContain('nao-respondidas');
    expect(visibleQuickFilters(true).map((f) => f.id)).toContain('nao-respondidas');
  });

  it('NÃO é pílula de servidor', () => {
    expect([...SERVER_COUNTED_FILTERS]).not.toContain('responsavel-indisponivel');
  });
});

describe('recorte', () => {
  it('casa só a conversa cujo responsável está no conjunto', () => {
    const ctx = { viewerProfileId: EU, ineligibleOwnerIds: INDISPONIVEIS };
    expect(matchesQuickFilter(conversa(SUSPENSO), 'responsavel-indisponivel', undefined, undefined, ctx)).toBe(true);
    expect(matchesQuickFilter(conversa(ATIVO), 'responsavel-indisponivel', undefined, undefined, ctx)).toBe(false);
    expect(matchesQuickFilter(conversa(null), 'responsavel-indisponivel', undefined, undefined, ctx)).toBe(false);
  });

  it('sem o conjunto (carregando, ou cargo sem a pílula) nada é "indisponível"', () => {
    expect(matchesQuickFilter(conversa(SUSPENSO), 'responsavel-indisponivel', undefined, undefined, { viewerProfileId: EU })).toBe(false);
    expect(matchesQuickFilter(conversa(SUSPENSO), 'responsavel-indisponivel')).toBe(false);
  });

  it('applyQuickFilter preserva a ordem e descarta o resto', () => {
    const lista = [conversa(ATIVO), conversa(SUSPENSO), conversa(null), conversa(SUSPENSO)];
    const out = applyQuickFilter(lista, 'responsavel-indisponivel', undefined, undefined, {
      viewerProfileId: EU,
      ineligibleOwnerIds: INDISPONIVEIS,
    });
    expect(out).toEqual([lista[1], lista[3]]);
  });

  it('as outras pílulas não mudam com o conjunto presente', () => {
    const ctx = { viewerProfileId: EU, ineligibleOwnerIds: INDISPONIVEIS };
    expect(matchesQuickFilter(conversa(EU), 'minhas', undefined, undefined, ctx)).toBe(true);
    expect(matchesQuickFilter(conversa(null), 'sem-responsavel', undefined, undefined, ctx)).toBe(true);
    expect(matchesQuickFilter(conversa(SUSPENSO), 'todas', undefined, undefined, ctx)).toBe(true);
  });
});

describe('contagem', () => {
  it('publica a chave só quando o conjunto foi fornecido', () => {
    const lista = [conversa(ATIVO), conversa(SUSPENSO), conversa(SUSPENSO)];
    const sem = buildQuickFilterCounts(lista, escopoLimpo, undefined, undefined, true, { viewerProfileId: EU });
    expect(sem['responsavel-indisponivel']).toBeUndefined();

    const com = buildQuickFilterCounts(lista, escopoLimpo, undefined, undefined, true, {
      viewerProfileId: EU,
      ineligibleOwnerIds: INDISPONIVEIS,
    });
    expect(com['responsavel-indisponivel']).toEqual({ value: 2, exact: true });
  });

  it('é piso enquanto houver página por carregar', () => {
    const com = buildQuickFilterCounts([conversa(SUSPENSO)], escopoLimpo, undefined, undefined, false, {
      viewerProfileId: EU,
      ineligibleOwnerIds: INDISPONIVEIS,
    });
    expect(com['responsavel-indisponivel']).toEqual({ value: 1, exact: false });
  });

  it('conjunto vazio publica zero (o gestor vê que não há nada preso)', () => {
    const com = buildQuickFilterCounts([conversa(ATIVO)], escopoLimpo, undefined, undefined, true, {
      viewerProfileId: EU,
      ineligibleOwnerIds: new Set(),
    });
    expect(com['responsavel-indisponivel']).toEqual({ value: 0, exact: true });
  });
});
