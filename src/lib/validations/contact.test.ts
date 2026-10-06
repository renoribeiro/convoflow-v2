import { describe, it, expect } from 'vitest';
import { buildContactPayload, contactFormSchemaFor, type ContactFormValues } from './contact';

const blank: ContactFormValues = {
  name: '',
  phone: '',
  email: '',
  current_stage_id: '',
  lead_source_id: '',
  notes: '',
};

describe('buildContactPayload — NULL onde é NULL, nunca string vazia', () => {
  it('WhatsApp: vazio vira null; telefone só com dígitos', () => {
    const p = buildContactPayload({ ...blank, phone: '+55 (85) 99999-0201', notes: '   ' }, 'whatsapp');
    expect(p).toEqual({
      name: null,
      phone: '5585999990201',
      email: null,
      current_stage_id: null,
      lead_source_id: null,
      notes: null,
    });
  });

  it('Instagram: não leva phone nenhum (nem "" nem null) — o banco fica como está', () => {
    const p = buildContactPayload({ ...blank, name: 'Tânia Moura', phone: '' }, 'instagram');
    expect(p).not.toHaveProperty('phone');
    expect(p).not.toHaveProperty('username');
    expect(p.name).toBe('Tânia Moura');
    expect(Object.values(p)).not.toContain('');
  });

  it('dois contatos do Instagram salvos do formulário nunca levam phone "" (a colisão da chave antiga)', () => {
    const a = buildContactPayload({ ...blank, name: 'A' }, 'instagram');
    const b = buildContactPayload({ ...blank, name: 'B' }, 'instagram');
    expect('phone' in a || 'phone' in b).toBe(false);
  });
});

describe('contactFormSchemaFor — o formulário por canal', () => {
  it('WhatsApp exige telefone', () => {
    const r = contactFormSchemaFor('whatsapp').safeParse({ ...blank, name: 'Ana' });
    expect(r.success).toBe(false);
    expect(r.success ? [] : r.error.errors.map((e) => e.path[0])).toContain('phone');
  });

  it('Instagram não pede telefone', () => {
    const r = contactFormSchemaFor('instagram').safeParse({ ...blank, name: 'Débora' });
    expect(r.success).toBe(true);
  });

  it('não exige tenant_id (foi isso que travou o formulário desde 2025-08-18)', () => {
    const r = contactFormSchemaFor('whatsapp').safeParse({ ...blank, phone: '5585999990201' });
    expect(r.success).toBe(true);
  });
});
