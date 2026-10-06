/**
 * A recusa de transferência acontece no SERVIDOR (trigger
 * tg_guard_conversation_transfer, 42501 — provado em
 * docs/teste_visibilidade_conversas.sql, N8c/N8d). Aqui fica o lado do
 * cliente: a frase do servidor chega intacta na tela, e um 42501 de RLS
 * (a linha sairia do alcance de quem escreveu) vira uma frase que faz sentido.
 * Os testes do passo 1 (assignment.test.ts) não mudam.
 */
import { describe, it, expect } from 'vitest';
import {
  TRANSFER_DISABLED_MESSAGE,
  describeAssignmentError,
  transferConversation,
  type ConversationsClient,
} from './assignment';

const CONVERSA = 'c0000000-0000-4000-8000-000000000001';
const LOJA = 'a0000000-0000-4000-8000-000000000001';
const ANA = 'p0000000-0000-4000-8000-00000000000a';
const BRUNO = 'p0000000-0000-4000-8000-00000000000b';

/** Banco de mentira que recusa o UPDATE como o trigger faz. */
const clientQueRecusa = (code: string, message: string): ConversationsClient => ({
  from: () => ({
    update: () => {
      const chain = {
        eq: () => chain,
        is: () => chain,
        select: () => Promise.resolve({ data: null, error: { code, message } }),
      };
      return chain;
    },
    select: () => {
      const chain = { eq: () => chain, maybeSingle: () => Promise.resolve({ data: null, error: null }) };
      return chain;
    },
  }),
});

describe('describeAssignmentError', () => {
  it('a recusa do trigger chega na tela com a frase do servidor, sem tradução', () => {
    expect(
      describeAssignmentError({ code: '42501', message: TRANSFER_DISABLED_MESSAGE }),
    ).toBe(TRANSFER_DISABLED_MESSAGE);
  });

  it('42501 de RLS (linha sairia do alcance) vira uma frase sem jargão', () => {
    const texto = describeAssignmentError({
      code: '42501',
      message: 'new row violates row-level security policy for table "conversations"',
    });
    expect(texto).toMatch(/tiraria a conversa do seu alcance/);
  });

  it('qualquer outro erro devolve null — o hook usa o texto genérico', () => {
    expect(describeAssignmentError({ code: '23505', message: 'duplicate key' })).toBeNull();
    expect(describeAssignmentError(new Error('rede caiu'))).toBeNull();
    expect(describeAssignmentError(null)).toBeNull();
    expect(describeAssignmentError({ code: '42501', message: 'permission denied for table x' })).toBeNull();
  });
});

describe('transferConversation quando o servidor recusa', () => {
  it('propaga o erro do trigger em vez de fingir sucesso (é o que faz o toast dizer o motivo)', async () => {
    const client = clientQueRecusa('42501', TRANSFER_DISABLED_MESSAGE);
    await expect(
      transferConversation(client, { conversationId: CONVERSA, tenantId: LOJA, toProfileId: BRUNO, byProfileId: ANA }),
    ).rejects.toMatchObject({ code: '42501', message: TRANSFER_DISABLED_MESSAGE });
  });
});
