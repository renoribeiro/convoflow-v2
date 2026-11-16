import { describe, it, expect } from 'vitest';
import {
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_EVENT_IDS,
  CAMPOS_DO_LEAD_NOVO,
  validateWebhookForm,
  signWebhookPayload,
  explicarResposta,
  rotuloDoEvento,
  situacaoDaEntrega,
  textoDasTentativas,
  quandoFoi,
} from './webhooks';
import { assinarAviso } from '../../supabase/functions/_shared/webhook-entrega.ts';

describe('Lead novo', () => {
  it('manda exatamente os campos que o banco monta (docs/teste_lead_novo.sql)', () => {
    expect([...CAMPOS_DO_LEAD_NOVO].sort()).toEqual(
      ['data_entrada', 'data_entrada_iso', 'lead_id', 'loja', 'nome', 'primeiramensagem', 'telefone'],
    );
  });

  it('tem o nome "Lead novo" na tela', () => {
    expect(rotuloDoEvento('lead.novo')).toBe('Lead novo');
    expect(rotuloDoEvento('contact.created')).toBe('Entra um contato novo');
    expect(rotuloDoEvento('outro.evento')).toBe('outro.evento');
  });
});

describe('explicarResposta', () => {
  it('explica os códigos do outro sistema', () => {
    expect(explicarResposta(200, null)).toBe('o outro sistema recebeu (código 200)');
    expect(explicarResposta(404, 'HTTP 404')).toBe('o endereço não existe no outro sistema (código 404)');
    expect(explicarResposta(410, 'HTTP 410')).toBe('o endereço foi desligado no outro sistema (código 410)');
    expect(explicarResposta(403, 'HTTP 403')).toBe('o outro sistema recusou o acesso (código 403)');
    expect(explicarResposta(429, 'HTTP 429')).toBe('o outro sistema pediu para esperar (código 429)');
    expect(explicarResposta(502, 'HTTP 502')).toBe('o outro sistema estava com erro (código 502)');
    expect(explicarResposta(400, 'HTTP 400')).toBe('o outro sistema recusou o aviso (código 400)');
  });

  it('explica a falha sem resposta', () => {
    expect(explicarResposta(null, 'tempo_esgotado')).toMatch(/demorou mais de 10 segundos/);
    expect(explicarResposta(null, 'endereco_bloqueado: redirect')).toMatch(/endereço final/);
    expect(explicarResposta(null, 'endereco_bloqueado: unresolved')).toMatch(/não existe na internet/);
    expect(explicarResposta(null, 'endereco_bloqueado: private_address')).toMatch(/rede interna/);
    expect(explicarResposta(null, 'Conta sem acesso')).toMatch(/sem acesso/);
    expect(explicarResposta(null, 'sem_conexao')).toBe('o outro sistema não respondeu');
  });

  it('nunca tem hífen nem travessão', () => {
    for (const s of [200, 404, 410, 401, 429, 500, 418, null]) {
      for (const e of [null, 'tempo_esgotado', 'endereco_bloqueado: redirect', 'endereco_bloqueado: x', 'sem_conexao']) {
        expect(explicarResposta(s, e)).not.toMatch(/[-–—]/);
      }
    }
  });
});

describe('histórico', () => {
  it('situação de cada entrega', () => {
    expect(situacaoDaEntrega({ status: 'delivered', attempts: 1 })).toBe('aceito');
    expect(situacaoDaEntrega({ status: 'failed', attempts: 5 })).toBe('falhou');
    expect(situacaoDaEntrega({ status: 'pending', attempts: 2 })).toBe('tentando');
    expect(situacaoDaEntrega({ status: 'pending', attempts: 0 })).toBe('na_fila');
  });

  it('tentativas', () => {
    expect(textoDasTentativas({ status: 'delivered', attempts: 1, max_attempts: 5 })).toBe('1 tentativa');
    expect(textoDasTentativas({ status: 'failed', attempts: 5, max_attempts: 5 })).toBe('5 tentativas');
    expect(textoDasTentativas({ status: 'pending', attempts: 2, max_attempts: 5 })).toBe('2 de 5 tentativas');
  });

  it('a hora é a de Brasília', () => {
    expect(quandoFoi('2026-11-11T02:30:00Z')).toBe('10/11 23:30');
    expect(quandoFoi('nada')).toBe('');
  });
});

describe('WEBHOOK_EVENT_TYPES', () => {
  it('cobre os 9 eventos suportados pelos triggers do banco, com o Lead novo primeiro', () => {
    expect(WEBHOOK_EVENT_IDS).toEqual([
      'lead.novo',
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
    expect(validateWebhookForm({ ...base, name: undefined }).error).toMatch(/nome ao aviso/);
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
    expect(r.error).toMatch(/não existe mais/);
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

describe('assinatura igual no servidor e na tela', () => {
  it('assinarAviso (_shared/webhook-entrega.ts) produz o mesmo que signWebhookPayload', async () => {
    const corpo = JSON.stringify({ lead_id: 'x', nome: 'Ana' });
    expect(await assinarAviso('senha', corpo)).toBe(await signWebhookPayload('senha', corpo));
  });
});
