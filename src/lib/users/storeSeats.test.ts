/**
 * Vagas de atendente por Loja (migração 20261009000003, entrega 1 de 2).
 *
 * A regra mora no banco; o manage-user e a tela têm cópias para responder
 * antes. Estes testes travam as cópias: quem ocupa vaga, quando a reativação
 * precisa de vaga, as frases (iguais nas três pontas) e a ORDEM no manage-user
 * — a vaga é conferida antes de o login ser liberado.
 *
 * O arquivo de manage-user é lido como texto (mesma convenção de
 * campaignClaim.test.ts); a pasta supabase/functions vai para a cópia pública,
 * então este teste roda lá também. A paridade com a migração SQL fica em
 * storeSeatsParity.test.ts, que só roda aqui.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ATENDENTE_FORA_DA_LOJA,
  checkAttendantEntry,
  CONTATO_CONVOFLOW as CONTATO_SERVIDOR,
  EXCLUIDO_NAO_REATIVA,
  lojaCheiaMessage,
  occupiesSeat,
  reactivationPlan,
  seatErrorFromDb,
  seatLimit,
} from '../../../supabase/functions/_shared/store-seats';
import {
  CONTATO_CONVOFLOW,
  freeSeatsLabel,
  fullStoreMessage,
  isStoreFull,
  parseSeatsRows,
  pendingInvitesLabel,
  seatsByStore,
  seatsCounterLabel,
} from './attendantSeats';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const MANAGE_USER = fs
  .readFileSync(path.join(ROOT, 'supabase', 'functions', 'manage-user', 'index.ts'), 'utf8')
  .replace(/\r\n/g, '\n');

const LOJA = { kind: 'store', atendentes_incluidos: 2, atendentes_extra: 0 };

describe('quem ocupa vaga', () => {
  it('ativo e convite pendente ocupam; suspenso e excluído não', () => {
    expect(occupiesSeat('active')).toBe(true);
    expect(occupiesSeat('pending')).toBe(true);
    expect(occupiesSeat('suspended')).toBe(false);
    expect(occupiesSeat('deleted')).toBe(false);
    expect(occupiesSeat(null)).toBe(false);
  });

  it('limite = 2 incluídos + extras; sem coluna, vale o padrão 2', () => {
    expect(seatLimit(LOJA)).toBe(2);
    expect(seatLimit({ atendentes_incluidos: 2, atendentes_extra: 3 })).toBe(5);
    expect(seatLimit({ atendentes_incluidos: null, atendentes_extra: null })).toBe(2);
  });
});

describe('cabe mais um atendente?', () => {
  it('com 1 de 2, cabe', () => {
    expect(checkAttendantEntry(LOJA, 1)).toEqual({ ok: true, usados: 1, limite: 2 });
  });

  it('com 2 de 2, não cabe, com a frase do banco', () => {
    expect(checkAttendantEntry(LOJA, 2)).toEqual({
      ok: false,
      code: 'STORE_FULL',
      status: 409,
      message: 'Esta Loja já tem 2 de 2 atendentes. Para ter mais, fale com o ConvoFlow: contato@convoflow.com.br',
    });
  });

  it('vaga extra abre espaço', () => {
    expect(checkAttendantEntry({ ...LOJA, atendentes_extra: 1 }, 2)).toMatchObject({ ok: true, limite: 3 });
  });

  it('na Conta, nunca', () => {
    expect(checkAttendantEntry({ ...LOJA, kind: 'account' }, 0)).toEqual({
      ok: false,
      code: 'ATTENDANT_OUTSIDE_STORE',
      status: 409,
      message: ATENDENTE_FORA_DA_LOJA,
    });
  });

  it('Loja que não existe é tratada como fora de Loja', () => {
    expect(checkAttendantEntry(null, 0)).toMatchObject({ ok: false, code: 'ATTENDANT_OUTSIDE_STORE' });
  });
});

describe('reativar', () => {
  it('atendente suspenso precisa de vaga', () => {
    expect(reactivationPlan({ role: 'atendente', status: 'suspended' })).toBe('needs_seat');
  });
  it('excluído não volta por "Reativar", em cargo nenhum', () => {
    for (const role of ['atendente', 'gestor', 'gerente']) {
      expect(reactivationPlan({ role, status: 'deleted' })).toBe('refuse_deleted');
    }
  });
  it('pendente já ocupa a vaga; gestor não usa vaga de atendente', () => {
    expect(reactivationPlan({ role: 'atendente', status: 'pending' })).toBe('no_seat_needed');
    expect(reactivationPlan({ role: 'gestor', status: 'suspended' })).toBe('no_seat_needed');
  });
});

describe('erro do banco vira a frase dele', () => {
  it('as recusas desta regra passam direto', () => {
    const msg = 'Esta Loja já tem 2 de 2 atendentes. Para ter mais, fale com o ConvoFlow: contato@convoflow.com.br';
    expect(seatErrorFromDb({ code: '23514', hint: 'LOJA_CHEIA', message: msg })).toBe(msg);
    expect(seatErrorFromDb({ code: '23514', hint: 'ATENDENTE_FORA_DA_LOJA', message: ATENDENTE_FORA_DA_LOJA })).toBe(
      ATENDENTE_FORA_DA_LOJA,
    );
  });
  it('qualquer outro erro não', () => {
    expect(seatErrorFromDb({ code: '23514', hint: 'OUTRA_COISA', message: 'x' })).toBeNull();
    expect(seatErrorFromDb({ code: '23505', hint: 'LOJA_CHEIA', message: 'x' })).toBeNull();
    expect(seatErrorFromDb(null)).toBeNull();
  });
});

describe('as frases são as mesmas no servidor e na tela', () => {
  it('Loja cheia', () => {
    expect(fullStoreMessage({ usados: 2, limite: 2 })).toBe(lojaCheiaMessage(2, 2));
    expect(fullStoreMessage({ usados: 3, limite: 3 })).toBe(lojaCheiaMessage(3, 3));
    expect(CONTATO_CONVOFLOW).toBe(CONTATO_SERVIDOR);
  });
});

describe('rótulos da tela', () => {
  const s = { usados: 1, limite: 2, pendentes: 1, livres: 1 };
  it('contador, pendentes e vagas livres', () => {
    expect(seatsCounterLabel(s)).toBe('Atendentes: 1 de 2');
    expect(pendingInvitesLabel(s)).toBe('1 convite pendente');
    expect(pendingInvitesLabel({ pendentes: 2 })).toBe('2 convites pendentes');
    expect(pendingInvitesLabel({ pendentes: 0 })).toBeNull();
    expect(freeSeatsLabel({ livres: 1 })).toBe('1 vaga livre');
    expect(freeSeatsLabel({ livres: 3 })).toBe('3 vagas livres');
    expect(freeSeatsLabel({ livres: 0 })).toBe('sem vaga de atendente');
    expect(isStoreFull({ usados: 2, limite: 2 })).toBe(true);
    expect(isStoreFull({ usados: 1, limite: 2 })).toBe(false);
  });

  it('lê a resposta da RPC e indexa por Loja', () => {
    const linhas = parseSeatsRows([
      { store_id: 'l1', store_name: 'Matriz', account_id: 'c1', incluidos: 2, extra: '1', limite: 3, ativos: 1, pendentes: 1, usados: 2, livres: 1 },
      { lixo: true },
      null,
    ]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0]?.extra).toBe(1);
    expect(seatsByStore(linhas).l1?.store_name).toBe('Matriz');
    expect(parseSeatsRows(null)).toEqual([]);
  });
});

describe('manage-user: a ordem que importa', () => {
  const reativar = MANAGE_USER.slice(MANAGE_USER.indexOf('async function actionChangeStatus'));

  it('confere a vaga ANTES de liberar o login', () => {
    const vaga = reativar.indexOf("await ensureStoreHasRoom(admin, target.tenant_id, 'atendente', target.id)");
    const desban = reativar.indexOf('setLoginBan(admin.auth.admin, [target.user_id], false)');
    expect(vaga).toBeGreaterThan(0);
    expect(desban).toBeGreaterThan(0);
    expect(vaga).toBeLessThan(desban);
  });

  it('recusa excluído antes de liberar o login', () => {
    const recusa = reativar.indexOf("'DELETED_CANNOT_REACTIVATE'");
    const desban = reativar.indexOf('setLoginBan(admin.auth.admin, [target.user_id], false)');
    expect(recusa).toBeGreaterThan(0);
    expect(recusa).toBeLessThan(desban);
    expect(EXCLUIDO_NAO_REATIVA).toMatch(/convide de novo/);
  });

  it('confere a vaga antes de mandar o convite', () => {
    const criar = MANAGE_USER.slice(MANAGE_USER.indexOf('async function actionCreate'));
    expect(criar.indexOf('await ensureStoreHasRoom(admin, resolvedTenantId, effectiveRole)')).toBeLessThan(
      criar.indexOf('inviteUserByEmail'),
    );
  });

  it('não sobrou o limite antigo de 5', () => {
    expect(MANAGE_USER).not.toMatch(/5 atendentes/);
    expect(MANAGE_USER).not.toMatch(/role === 'gestor' \? 1 : 5/);
  });
});
