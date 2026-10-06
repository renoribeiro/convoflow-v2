import { describe, it, expect } from 'vitest';
import {
  contactAllowedInFollowupMode,
  followupModeSendsWhatsapp,
  followupPickerContacts,
} from './contactPicker';

const wa = { id: 'wa', channel: 'whatsapp', phone: '5585999990201' };
const legacy = { id: 'legacy', phone: '5511999990000' }; // sem canal gravado = WhatsApp
const ig = { id: 'ig', channel: 'instagram', phone: null, username: 'opauloandrade' };

describe('regra do seletor de follow-up', () => {
  it('Agendado e Sequência mandam WhatsApp; Manual não', () => {
    expect(followupModeSendsWhatsapp('scheduled')).toBe(true);
    expect(followupModeSendsWhatsapp('sequence')).toBe(true);
    expect(followupModeSendsWhatsapp('manual')).toBe(false);
  });

  it('Instagram nunca nos modos que mandam WhatsApp', () => {
    expect(contactAllowedInFollowupMode(ig, 'scheduled')).toBe(false);
    expect(contactAllowedInFollowupMode(ig, 'sequence')).toBe(false);
    expect(contactAllowedInFollowupMode(ig, 'manual')).toBe(true);
  });

  it('WhatsApp (inclusive o legado sem canal) em todos os modos', () => {
    for (const mode of ['manual', 'scheduled', 'sequence'] as const) {
      expect(contactAllowedInFollowupMode(wa, mode)).toBe(true);
      expect(contactAllowedInFollowupMode(legacy, mode)).toBe(true);
    }
  });

  it('a lista mantém a ordem e os mesmos objetos', () => {
    const list = [wa, ig, legacy];
    expect(followupPickerContacts(list, 'scheduled')).toEqual([wa, legacy]);
    expect(followupPickerContacts(list, 'scheduled')[0]).toBe(wa);
    expect(followupPickerContacts(list, 'manual')).toEqual(list);
  });
});
