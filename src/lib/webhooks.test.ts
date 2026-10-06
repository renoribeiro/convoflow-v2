import { describe, it, expect } from 'vitest';
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_IDS,
  validateWebhookForm,
  signWebhookPayload,
} from './webhooks';

describe('WEBHOOK_EVENT_TYPES', () => {
  it('cobre os 8 eventos suportados pelos triggers do banco', () => {
    expect(WEBHOOK_EVENT_IDS).toEqual([
      'message.received',
      'message.sent',
      'contact.created',
      'contact.updated',
      'campaign.started',
      'campaign.completed',
      'followup.scheduled',
      'chatbot.triggered',
    ]);
  });

  it('todo evento tem id e label', () => {
    for (const e of WEBHOOK_EVENT_TYPES) {
      expect(e.id).toBeTruthy();
      expect(e.label).toBeTruthy();
    }
  });
});

describe('validateWebhookForm', () => {
  const base = { name: 'CRM', url: 'https://exemplo.com/hook', events: ['message.received'] };

  it('aceita um formulário válido', () => {
    expect(validateWebhookForm(base)).toEqual({ valid: true });
  });

  it('exige nome', () => {
    expect(validateWebhookForm({ ...base, name: '  ' }).valid).toBe(false);
    expect(validateWebhookForm({ ...base, name: undefined }).error).toMatch(/Nome/);
  });

  it('exige URL', () => {
    expect(validateWebhookForm({ ...base, url: '' }).valid).toBe(false);
  });

  it('rejeita URL inválida', () => {
    expect(validateWebhookForm({ ...base, url: 'nao-e-url' }).valid).toBe(false);
  });

  it('rejeita protocolo não-http(s)', () => {
    const r = validateWebhookForm({ ...base, url: 'ftp://exemplo.com' });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/http/);
  });

  it('aceita http e https', () => {
    expect(validateWebhookForm({ ...base, url: 'http://exemplo.com' }).valid).toBe(true);
    expect(validateWebhookForm({ ...base, url: 'https://exemplo.com' }).valid).toBe(true);
  });

  it('exige ao menos um evento', () => {
    expect(validateWebhookForm({ ...base, events: [] }).valid).toBe(false);
    expect(validateWebhookForm({ ...base, events: undefined }).valid).toBe(false);
  });

  it('rejeita evento desconhecido', () => {
    const r = validateWebhookForm({ ...base, events: ['evento.fantasma'] });
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/inválido/i);
  });
});

describe('signWebhookPayload', () => {
  // Vetor canônico de HMAC-SHA256 (Wikipedia):
  // key="key", msg="The quick brown fox jumps over the lazy dog"
  it('produz o vetor de teste conhecido', async () => {
    const sig = await signWebhookPayload('key', 'The quick brown fox jumps over the lazy dog');
    expect(sig).toBe('f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  });

  it('é determinístico', async () => {
    const a = await signWebhookPayload('s3cr3t', '{"event":"message.received"}');
    const b = await signWebhookPayload('s3cr3t', '{"event":"message.received"}');
    expect(a).toBe(b);
  });

  it('muda com secret diferente', async () => {
    const a = await signWebhookPayload('secret-a', 'body');
    const b = await signWebhookPayload('secret-b', 'body');
    expect(a).not.toBe(b);
  });

  it('retorna hex de 64 chars (sha256)', async () => {
    const sig = await signWebhookPayload('k', 'x');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
