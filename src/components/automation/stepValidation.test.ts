import { describe, it, expect } from 'vitest';
import { validateStep } from './stepValidation';

/**
 * Achado 86 (lote 6a, B9): "Enviar Mensagem" vazio aparecia "Configurado" e
 * deixava salvar automação ativa; o motor falhava o passo depois. O selo do
 * cartão e a trava de salvar do AutomationBuilder usam esta mesma conta.
 */
const passo = (config: Record<string, unknown>) => ({ config });

describe('Enviar Mensagem', () => {
  it('sem resposta rápida e sem texto: incompleto, os dois campos marcados', () => {
    const v = validateStep(passo({ type: 'send_message' }));
    expect(v.complete).toBe(false);
    expect(v.missing).toEqual(['Resposta rápida ou mensagem personalizada']);
    expect(v.missingKeys).toEqual(['quick_reply_id', 'custom_message']);
  });

  it('texto só de espaços conta como vazio', () => {
    expect(validateStep(passo({ type: 'send_message', custom_message: '   ' })).complete).toBe(false);
  });

  it('com texto: configurado', () => {
    expect(validateStep(passo({ type: 'send_message', custom_message: 'Olá {first_name}' })).complete).toBe(true);
  });

  it('com resposta rápida: configurado', () => {
    expect(validateStep(passo({ type: 'send_message', quick_reply_id: 'aaaaaaaa-0000-4000-8000-000000000001' })).complete).toBe(true);
  });
});

describe('Agendar follow up', () => {
  it('sem mensagem: incompleto', () => {
    const v = validateStep(passo({ type: 'schedule_followup', delay_hours: 24, followup_type: 'whatsapp' }));
    expect(v.complete).toBe(false);
    expect(v.missingKeys).toEqual(['message']);
  });

  it('com mensagem: configurado', () => {
    expect(validateStep(passo({ type: 'schedule_followup', message: 'Confirmando a visita?' })).complete).toBe(true);
  });
});
