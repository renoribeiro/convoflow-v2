import { describe, it, expect } from 'vitest';
import { newInstanceSchema } from './whatsappInstance';

/**
 * O formulário da Evolution NÃO pede URL do servidor nem API Key, e isso é
 * decisão de segurança, não esquecimento: o servidor é da plataforma e a chave
 * global dele é chave-mestra de todas as instâncias. Medido no servidor de
 * produção em 2026-09-10 — com a chave global, `fetchInstances` devolve as 14
 * instâncias de todos os clientes; com a chave de uma instância, devolve 1 e
 * responde 401 nas outras.
 *
 * Estes testes existem para que os dois campos não voltem ao formulário.
 */

const evolutionBase = {
  provider: 'evolution' as const,
  name: 'WhatsApp Vendas',
  instance_key: 'vendas_001',
  enableWebhookAutomation: true,
  retryAttempts: 3,
  retryDelay: 2000,
};

describe('newInstanceSchema — Evolution', () => {
  it('aceita nome e chave, sem pedir credencial do servidor', () => {
    const parsed = newInstanceSchema.safeParse(evolutionBase);
    expect(parsed.success).toBe(true);
  });

  it('não deixa credencial do servidor entrar pelo payload', () => {
    const parsed = newInstanceSchema.safeParse({
      ...evolutionBase,
      serverUrl: 'https://servidor-do-atacante.com',
      apiKey: 'CHAVE_INJETADA_123',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Zod descarta chave desconhecida: nada de serverUrl/apiKey chega ao hook,
      // que por sua vez só manda instance_key e name para a edge function.
      expect(parsed.data).not.toHaveProperty('serverUrl');
      expect(parsed.data).not.toHaveProperty('apiKey');
    }
  });

  it('exige nome com pelo menos 3 caracteres', () => {
    const parsed = newInstanceSchema.safeParse({ ...evolutionBase, name: 'ab' });
    expect(parsed.success).toBe(false);
  });

  it('mantém a chave da instância restrita a letras, números, _ e -', () => {
    const parsed = newInstanceSchema.safeParse({
      ...evolutionBase,
      instance_key: 'vendas 001',
    });
    expect(parsed.success).toBe(false);
  });

  it('recusa chave da instância curta demais', () => {
    const parsed = newInstanceSchema.safeParse({ ...evolutionBase, instance_key: 'ab' });
    expect(parsed.success).toBe(false);
  });

  it('aplica os defaults do webhook quando eles não vêm', () => {
    const parsed = newInstanceSchema.safeParse({
      provider: 'evolution',
      name: 'WhatsApp Vendas',
      instance_key: 'vendas_001',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success && parsed.data.provider === 'evolution') {
      expect(parsed.data.enableWebhookAutomation).toBe(true);
      expect(parsed.data.retryAttempts).toBe(3);
      expect(parsed.data.retryDelay).toBe(2000);
    }
  });

  it('WAHA continua pedindo servidor: lá o servidor é do cliente mesmo', () => {
    const waha = newInstanceSchema.safeParse({
      provider: 'waha',
      name: 'WhatsApp Suporte',
      sessionName: 'default',
    });
    expect(waha.success).toBe(false);
  });
});
