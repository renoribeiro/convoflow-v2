/**
 * A garantia mais importante da fatia 3 do Instagram: uma conversa do
 * Instagram NUNCA responde por outra instância — em especial, nunca pelo
 * WhatsApp da Conta.
 */
import { describe, it, expect, vi } from 'vitest';

// Só o escolhedor puro do hook interessa; o resto do módulo não pode tocar rede.
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: null }) }));

import { resolveConversationInstance, isWhatsAppConversation } from './instanceForConversation';
import { pickActiveInstance } from '@/hooks/useWhatsAppApi';

type Item = { row: { id: string; provider: string | null }; adapter: { isReadyToSend: () => boolean } };

const wa = (id: string, ready = true): Item => ({
  row: { id, provider: 'official' },
  adapter: { isReadyToSend: () => ready },
});
const evo = (id: string, ready = true): Item => ({
  row: { id, provider: 'evolution' },
  adapter: { isReadyToSend: () => ready },
});
const ig = (id: string): Item => ({ row: { id, provider: 'instagram' }, adapter: { isReadyToSend: () => true } });

// O escolhedor de verdade do WhatsApp, o mesmo que o ChatWindow usa.
const legacyPick = pickActiveInstance as unknown as (list: Item[], id?: string | null) => Item | null;

describe('conversa do Instagram: nunca cai em outra instância', () => {
  it('usa a instância de Instagram da conversa', () => {
    const list = [wa('wa-1'), ig('ig-1')];
    const r = resolveConversationInstance({
      list, preferredInstanceId: 'ig-1', channel: 'instagram', contactPhone: null, legacyPick,
    });
    expect(r?.row.id).toBe('ig-1');
  });

  it('instância de Instagram fora da lista (adapter não montou): null, NÃO o WhatsApp pronto da Conta', () => {
    const list = [wa('wa-1', true), evo('evo-1', true)];
    const r = resolveConversationInstance({
      list, preferredInstanceId: 'ig-1', channel: 'instagram', contactPhone: null, legacyPick,
    });
    expect(r).toBeNull();
  });

  it('conversa sem instância gravada: null', () => {
    const r = resolveConversationInstance({
      list: [wa('wa-1')], preferredInstanceId: null, channel: 'instagram', contactPhone: null, legacyPick,
    });
    expect(r).toBeNull();
  });

  it('a instância da conversa não é de Instagram (dado torto): null, mesmo existindo e pronta', () => {
    const r = resolveConversationInstance({
      list: [wa('wa-1')], preferredInstanceId: 'wa-1', channel: 'instagram', contactPhone: null, legacyPick,
    });
    expect(r).toBeNull();
  });

  it('nem um telefone no contato abre o fallback quando o canal é instagram', () => {
    const r = resolveConversationInstance({
      list: [wa('wa-1')], preferredInstanceId: 'ig-1', channel: 'instagram', contactPhone: '5511999998888', legacyPick,
    });
    expect(r).toBeNull();
  });

  it('o escolhedor antigo nem é chamado para o Instagram', () => {
    const spy = vi.fn(legacyPick);
    resolveConversationInstance({
      list: [wa('wa-1')], preferredInstanceId: 'ig-1', channel: 'instagram', contactPhone: null, legacyPick: spy,
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('canal desconhecido (futuro) nasce estrito', () => {
    const r = resolveConversationInstance({
      list: [wa('wa-1')], preferredInstanceId: 'x-1', channel: 'messenger', contactPhone: null, legacyPick,
    });
    expect(r).toBeNull();
  });
});

describe('conversa do WhatsApp: comportamento de sempre', () => {
  it('prefere a instância da conversa', () => {
    const r = resolveConversationInstance({
      list: [wa('wa-1'), evo('evo-1')], preferredInstanceId: 'evo-1', channel: 'whatsapp', contactPhone: '55', legacyPick,
    });
    expect(r?.row.id).toBe('evo-1');
  });

  it('continua caindo na primeira pronta quando a da conversa sumiu (como antes)', () => {
    const r = resolveConversationInstance({
      list: [evo('evo-1', false), wa('wa-1', true)], preferredInstanceId: 'sumiu', channel: 'whatsapp', contactPhone: '55', legacyPick,
    });
    expect(r?.row.id).toBe('wa-1');
  });

  it('sem canal carregado mas com telefone: é WhatsApp (dado antigo)', () => {
    expect(isWhatsAppConversation(undefined, '5511999998888')).toBe(true);
    expect(isWhatsAppConversation(null, null)).toBe(false);
    expect(isWhatsAppConversation('instagram', '5511')).toBe(false);
  });
});
