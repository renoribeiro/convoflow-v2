/**
 * Regras da criação de Loja (edge function `create-store`).
 *
 * O módulo testado vive em supabase/functions/_shared porque roda no Deno, mas
 * não importa nada do Deno — mesma convenção de `capabilities.ts`, que já é
 * importado assim por src/lib/capabilities.test.ts. Testar aqui é o que permite
 * cobrir permissão, vaga e slug sem subir a função.
 */
import { describe, it, expect } from 'vitest';

import {
  authorizeStoreCreation,
  buildStoreSlug,
  checkParentAccount,
  hasFreeStoreSlot,
  isCapacityViolation,
  isUniqueViolation,
  noFreeSlotMessage,
  storeCapacity,
  storeSlugBase,
  validateStoreName,
  STORE_CREATE_CAPABILITY,
  STORE_NAME_MAX,
  STORE_NAME_MESSAGES as SERVER_NAME_MESSAGES,
  STORE_NAME_MIN,
  type StoreCreationCaller,
} from '../../../supabase/functions/_shared/store-creation';
import { DEFAULT_CAPABILITIES } from '../../../supabase/functions/_shared/capabilities';
import {
  STORE_NAME_MAX as CLIENT_NAME_MAX,
  STORE_NAME_MESSAGES as CLIENT_NAME_MESSAGES,
  STORE_NAME_MIN as CLIENT_NAME_MIN,
  validateStoreName as validateStoreNameClient,
} from './storeName';

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA_CONTA = 'bbbbbbbb-0000-4000-8000-000000000002';

const caller = (
  role: string | null,
  tenantId: string | null = CONTA,
  capabilities: Record<string, unknown> | null = null,
): StoreCreationCaller => ({ role, tenant_id: tenantId, capabilities });

// ---------------------------------------------------------------------------
// Permissão
// ---------------------------------------------------------------------------

describe('quem pode criar Loja', () => {
  it('gestor é recusado com 403 e mensagem em pt-BR', () => {
    const resultado = authorizeStoreCreation(caller('gestor'), null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.status).toBe(403);
    expect(resultado.error).toContain('Apenas Gerente pode criar Lojas');
  });

  it('atendente é recusado com 403', () => {
    const resultado = authorizeStoreCreation(caller('atendente'), null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.status).toBe(403);
  });

  it('cargo desconhecido ou ausente cai no conjunto mais restritivo', () => {
    for (const role of [null, '', 'lixo']) {
      expect(authorizeStoreCreation(caller(role), null).ok).toBe(false);
    }
  });

  it('gerente cria na própria Conta', () => {
    const resultado = authorizeStoreCreation(caller('gerente'), null);
    expect(resultado).toEqual({ ok: true, accountId: CONTA });
  });

  it('gerente informando a própria Conta dá no mesmo', () => {
    expect(authorizeStoreCreation(caller('gerente'), CONTA)).toEqual({
      ok: true,
      accountId: CONTA,
    });
  });

  it('gerente NÃO cria Loja em Conta alheia', () => {
    const resultado = authorizeStoreCreation(caller('gerente'), OUTRA_CONTA);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.status).toBe(403);
    expect(resultado.error).toBe('Você só pode criar Lojas na sua própria Conta.');
  });

  it('gerente sem Conta vinculada não cria nada', () => {
    const resultado = authorizeStoreCreation(caller('gerente', null), null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.status).toBe(403);
  });

  it('superadmin cria em qualquer Conta, desde que indique qual', () => {
    expect(authorizeStoreCreation(caller('superadmin', null), OUTRA_CONTA)).toEqual({
      ok: true,
      accountId: OUTRA_CONTA,
    });

    const semConta = authorizeStoreCreation(caller('superadmin', null), null);
    expect(semConta.ok).toBe(false);
    if (semConta.ok) return;
    expect(semConta.status).toBe(400);
    expect(semConta.error).toBe('Informe a Conta em que a Loja será criada.');
  });

  it('cargo legado herda o poder do cargo atual equivalente', () => {
    expect(authorizeStoreCreation(caller('agencia'), null).ok).toBe(true); // = gerente
    expect(authorizeStoreCreation(caller('loja'), null).ok).toBe(false); // = gestor
  });

  it('a capability usada é a mesma que separa Gerente de Gestor', () => {
    expect(DEFAULT_CAPABILITIES.gerente[STORE_CREATE_CAPABILITY]).toBe(true);
    expect(DEFAULT_CAPABILITIES.superadmin[STORE_CREATE_CAPABILITY]).toBe(true);
    expect(DEFAULT_CAPABILITIES.gestor[STORE_CREATE_CAPABILITY]).toBe(false);
    expect(DEFAULT_CAPABILITIES.atendente[STORE_CREATE_CAPABILITY]).toBe(false);
  });

  it('override por usuário abre a permissão, mas o pai ainda precisa ser Conta', () => {
    // Um gestor com override passa na capability e cai no caminho "própria
    // Conta" — o tenant dele é uma Loja, e é checkParentAccount que barra.
    const resultado = authorizeStoreCreation(
      caller('gestor', CONTA, { 'stores.switch': true }),
      null,
    );
    expect(resultado).toEqual({ ok: true, accountId: CONTA });
    expect(
      checkParentAccount({
        id: CONTA,
        name: 'Loja disfarçada',
        kind: 'store',
        store_slots_included: 5,
        store_slots_extra: 0,
      }).ok,
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// A Conta que recebe a Loja
// ---------------------------------------------------------------------------

describe('a Conta precisa ser mesmo uma Conta', () => {
  const conta = {
    id: CONTA,
    name: 'Grupo Silva',
    kind: 'account',
    store_slots_included: 5,
    store_slots_extra: 0,
  };

  it('aceita kind=account', () => {
    expect(checkParentAccount(conta)).toEqual({ ok: true });
  });

  it('recusa uma linha kind=store com 409 explicando o cadastro torto', () => {
    const resultado = checkParentAccount({ ...conta, kind: 'store' });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.status).toBe(409);
    expect(resultado.error).toContain('cadastrada como Loja');
  });

  it('Conta inexistente vira 404', () => {
    const resultado = checkParentAccount(null);
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Vagas
// ---------------------------------------------------------------------------

describe('vagas de Loja', () => {
  it('capacidade é o que vem do plano mais o que foi contratado', () => {
    expect(storeCapacity({ store_slots_included: 5, store_slots_extra: 0 })).toBe(5);
    expect(storeCapacity({ store_slots_included: 5, store_slots_extra: 3 })).toBe(8);
    expect(storeCapacity({ store_slots_included: null, store_slots_extra: null })).toBe(0);
  });

  it('cabe enquanto o uso for menor que a capacidade', () => {
    expect(hasFreeStoreSlot(0, 5)).toBe(true);
    expect(hasFreeStoreSlot(4, 5)).toBe(true);
    expect(hasFreeStoreSlot(5, 5)).toBe(false);
    // Estado possível hoje: alguém baixa os slots com Lojas já criadas.
    expect(hasFreeStoreSlot(7, 5)).toBe(false);
  });

  it('lotado devolve a mensagem em pt-BR com a capacidade escrita', () => {
    expect(noFreeSlotMessage(5)).toBe(
      'Sua Conta já usa as 5 lojas disponíveis. Contrate lojas adicionais para criar mais.',
    );
  });

  it('a mensagem concorda em número', () => {
    expect(noFreeSlotMessage(1)).toContain('a única loja disponível');
    expect(noFreeSlotMessage(0)).toContain('não tem nenhuma loja disponível');
    expect(noFreeSlotMessage(8)).toContain('as 8 lojas disponíveis');
  });

  it('a exceção do trigger é reconhecida e traduzida', () => {
    expect(isCapacityViolation({ code: '23514', message: 'qualquer coisa' })).toBe(true);
    expect(
      isCapacityViolation({
        code: 'P0001',
        message: 'Account abc has no free store slots (used 5, capacity 5)',
      }),
    ).toBe(true);
    expect(isCapacityViolation({ code: '23505', message: 'duplicate key value' })).toBe(false);
    expect(isCapacityViolation(null)).toBe(false);
  });

  it('slug repetido é distinguido de falta de vaga', () => {
    expect(isUniqueViolation({ code: '23505', message: '' })).toBe(true);
    expect(isUniqueViolation({ code: '23514', message: 'no free store slots' })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Nome
// ---------------------------------------------------------------------------

describe('nome da Loja', () => {
  it('exige um nome', () => {
    for (const entrada of ['', '   ', null, undefined, 42]) {
      const resultado = validateStoreName(entrada);
      expect(resultado.ok).toBe(false);
      if (!resultado.ok) expect(resultado.error).toBe(SERVER_NAME_MESSAGES.required);
    }
  });

  it('apara as pontas e colapsa espaços repetidos', () => {
    expect(validateStoreName('  Loja   Centro  ')).toEqual({ ok: true, value: 'Loja Centro' });
  });

  it('respeita o mínimo e o máximo', () => {
    expect(validateStoreName('A').ok).toBe(false);
    expect(validateStoreName('AB').ok).toBe(true);
    expect(validateStoreName('x'.repeat(STORE_NAME_MAX)).ok).toBe(true);
    expect(validateStoreName('x'.repeat(STORE_NAME_MAX + 1)).ok).toBe(false);
  });

  it('recusa nome só de pontuação, que viraria slug vazio', () => {
    const resultado = validateStoreName('---');
    expect(resultado.ok).toBe(false);
    if (!resultado.ok) expect(resultado.error).toBe(SERVER_NAME_MESSAGES.noAlphanumeric);
  });

  it('aceita acento e número', () => {
    expect(validateStoreName('Unidade Guarapuava 2').ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slug
// ---------------------------------------------------------------------------

describe('slug da Loja', () => {
  const UUID = '7f3c1b2a-9d4e-4a1b-8c6d-0e5f2a7b9c11';

  it('tira acento e cedilha de um nome português', () => {
    expect(storeSlugBase('Óptica São João & Cia — Conceição')).toBe(
      'optica-sao-joao-cia-conceicao',
    );
  });

  it('gera slug válido para URL, com sufixo de 8 caracteres', () => {
    const slug = buildStoreSlug('Óptica São João', UUID);
    expect(slug).toBe('optica-sao-joao-7f3c1b2a');
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('dois nomes iguais produzem slugs diferentes', () => {
    const a = buildStoreSlug('Loja Centro', '11111111-1111-4111-8111-111111111111');
    const b = buildStoreSlug('Loja Centro', '22222222-2222-4222-8222-222222222222');
    expect(a).not.toBe(b);
    expect(a.startsWith('loja-centro-')).toBe(true);
    expect(b.startsWith('loja-centro-')).toBe(true);
  });

  it('corta a base em 40 caracteres', () => {
    expect(storeSlugBase('a'.repeat(80)).length).toBe(40);
  });

  it('nome sem nenhum caractere aproveitável cai no fallback', () => {
    // validateStoreName já barra este caso antes; o fallback existe para nunca
    // deixar o slug começar com hífen solto.
    expect(storeSlugBase('!!!')).toBe('loja');
  });
});

// ---------------------------------------------------------------------------
// Paridade cliente × servidor
// ---------------------------------------------------------------------------

describe('a validação do cliente espelha a do servidor', () => {
  it('os limites são os mesmos dos dois lados', () => {
    expect(CLIENT_NAME_MIN).toBe(STORE_NAME_MIN);
    expect(CLIENT_NAME_MAX).toBe(STORE_NAME_MAX);
  });

  it('as mensagens são as mesmas dos dois lados', () => {
    expect(CLIENT_NAME_MESSAGES).toEqual(SERVER_NAME_MESSAGES);
  });

  it('as duas funções concordam entrada por entrada', () => {
    const entradas = [
      'Loja Centro',
      '  Loja   Centro  ',
      'A',
      '',
      '   ',
      '---',
      'Óptica São João',
      'x'.repeat(STORE_NAME_MAX),
      'x'.repeat(STORE_NAME_MAX + 1),
    ];
    for (const entrada of entradas) {
      expect(validateStoreNameClient(entrada), `divergiu em "${entrada}"`).toEqual(
        validateStoreName(entrada),
      );
    }
  });
});
