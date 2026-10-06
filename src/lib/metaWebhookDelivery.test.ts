/**
 * O que o meta-webhook sabe sobre UMA entrega durante a troca de app da Meta
 * (2026-09): qual app assinou, e se a segunda entrega do mesmo wamid perdeu a
 * corrida no índice único (23505) — o caso que mandava a resposta do bot em
 * dobro enquanto os dois apps estavam inscritos na mesma WABA.
 *
 * Módulo compartilhado com o Deno (supabase/functions/_shared), sem I/O.
 */
import { describe, it, expect } from 'vitest';
import {
  appSlotName,
  isDuplicateInsertError,
  summarizeDelivery,
} from '../../supabase/functions/_shared/meta-webhook-delivery';

describe('appSlotName — o índice de verifyMetaSignatureAny vira nome no log', () => {
  it('0 = primary, 1 = secondary, resto = unknown', () => {
    expect(appSlotName(0)).toBe('primary');
    expect(appSlotName(1)).toBe('secondary');
    expect(appSlotName(-1)).toBe('unknown');
    expect(appSlotName(2)).toBe('unknown');
  });
});

describe('isDuplicateInsertError — só 23505 é "outra entrega chegou primeiro"', () => {
  it('reconhece o código do Postgres', () => {
    expect(isDuplicateInsertError({ code: '23505', message: 'duplicate key value violates unique constraint "idx_messages_evolution_message_id_unique"' })).toBe(true);
  });

  it('reconhece pela mensagem quando o código não veio', () => {
    expect(isDuplicateInsertError({ message: 'duplicate key value violates unique constraint "x"' })).toBe(true);
  });

  it('qualquer outro erro NÃO é duplicata (o handler segue o caminho de sempre)', () => {
    expect(isDuplicateInsertError({ code: 'P0001', message: 'WhatsApp instance not found' })).toBe(false);
    expect(isDuplicateInsertError({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isDuplicateInsertError(new Error('network'))).toBe(false);
  });

  it('sem erro não é duplicata', () => {
    expect(isDuplicateInsertError(null)).toBe(false);
    expect(isDuplicateInsertError(undefined)).toBe(false);
    expect(isDuplicateInsertError('23505')).toBe(false);
  });
});

describe('summarizeDelivery — um log por request, sem conteúdo', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '979901055032057',
        changes: [
          {
            field: 'messages',
            value: {
              metadata: { display_phone_number: '5585...', phone_number_id: '100000000000099' },
              messages: [{ id: 'wamid.1', type: 'text', text: { body: 'segredo do cliente' } }, { id: 'wamid.2', type: 'image' }],
              statuses: [{ id: 'wamid.3', status: 'delivered' }],
            },
          },
          { field: 'account_update', value: { event: 'VERIFIED_ACCOUNT' } },
        ],
      },
      {
        id: '979901055032057',
        changes: [{ field: 'messages', value: { metadata: { phone_number_id: '100000000000099' }, messages: [{ id: 'wamid.4' }] } }],
      },
      {
        id: '2542773286191227',
        changes: [{ field: 'phone_number_quality_update', value: {} }],
      },
    ],
  };

  it('conta mensagens e status, lista WABAs e números sem repetir, e os outros campos', () => {
    expect(summarizeDelivery(payload)).toEqual({
      wabaIds: ['979901055032057', '2542773286191227'],
      phoneNumberIds: ['100000000000099'],
      messages: 3,
      statuses: 1,
      otherFields: ['account_update', 'phone_number_quality_update'],
    });
  });

  it('nunca carrega o texto da mensagem', () => {
    expect(JSON.stringify(summarizeDelivery(payload))).not.toContain('segredo do cliente');
  });

  it('payload sem entry, ou lixo, vira zeros', () => {
    const zero = { wabaIds: [], phoneNumberIds: [], messages: 0, statuses: 0, otherFields: [] };
    expect(summarizeDelivery({})).toEqual(zero);
    expect(summarizeDelivery(null)).toEqual(zero);
    expect(summarizeDelivery({ entry: 'x' })).toEqual(zero);
    expect(summarizeDelivery({ entry: [{ changes: 'x' }] })).toEqual(zero);
  });
});
