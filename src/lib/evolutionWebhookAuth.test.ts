/**
 * Item 14, lote 5 (H2): quem pode entregar evento no `evolution-webhook`.
 *
 * O furo que estes testes existem para impedir: a função achava a instância
 * por `instance_key = <nome>` e depois conferia `apikey === instance_key` —
 * ou seja, o nome da instância era a senha. Qualquer um que soubesse o nome
 * forjava mensagem recebida, status de conexão e QR de qualquer Conta.
 */
import { describe, it, expect } from 'vitest';

import {
  authenticateEvolutionWebhook,
  evolutionInstanceToken,
  type EvolutionWebhookInstance,
} from '../../supabase/functions/_shared/evolution-webhook-auth.ts';

const NAME = 'loja-centro';
const TOKEN = '6f1c2b9e-4d7a-4c1e-9b0a-2f3e4d5c6b7a';
const SECRET = 'segredo-global-de-teste-0123456789';

const withToken: EvolutionWebhookInstance = {
  instance_key: NAME,
  connection_config: { baseUrl: 'https://evo.example.com', apiKey: TOKEN },
};

const run = (
  instance: EvolutionWebhookInstance,
  payloadApiKey: unknown,
  headerSecret: string | null = null,
  webhookSecret: string | undefined = undefined,
) => authenticateEvolutionWebhook({ instance, payloadApiKey, headerSecret, webhookSecret });

describe('evolutionInstanceToken', () => {
  it('lê connection_config.apiKey primeiro, como o provider-factory', () => {
    expect(
      evolutionInstanceToken({ ...withToken, evolution_api_key: 'legado' }),
    ).toBe(TOKEN);
  });

  it('cai para a coluna legada evolution_api_key', () => {
    expect(
      evolutionInstanceToken({ instance_key: NAME, connection_config: {}, evolution_api_key: 'legado' }),
    ).toBe('legado');
  });

  it('sem token nenhum → null', () => {
    expect(evolutionInstanceToken({ instance_key: NAME, connection_config: {} })).toBeNull();
    expect(evolutionInstanceToken({ instance_key: NAME, connection_config: null })).toBeNull();
    expect(evolutionInstanceToken({ instance_key: NAME, connection_config: [TOKEN] })).toBeNull();
    expect(
      evolutionInstanceToken({ instance_key: NAME, connection_config: { apiKey: 42 } }),
    ).toBeNull();
  });

  it('token igual ao nome da instância nunca conta — é o furo antigo', () => {
    expect(
      evolutionInstanceToken({ instance_key: NAME, connection_config: { apiKey: NAME } }),
    ).toBeNull();
    expect(
      evolutionInstanceToken({ instance_key: NAME, connection_config: {}, evolution_api_key: NAME }),
    ).toBeNull();
  });
});

describe('authenticateEvolutionWebhook', () => {
  it('RECUSA o nome da instância como apikey (H2)', async () => {
    expect(await run(withToken, NAME)).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('RECUSA o nome mesmo quando a instância não tem token e o secret não está setado', async () => {
    const semToken = { instance_key: NAME, connection_config: {} };
    expect(await run(semToken, NAME)).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('RECUSA o nome mesmo se alguém gravou o nome como token', async () => {
    const nomeComoToken = { instance_key: NAME, connection_config: { apiKey: NAME } };
    expect(await run(nomeComoToken, NAME)).toEqual({ ok: false, reason: 'invalid_credentials' });
  });

  it('aceita o token da instância no apikey do corpo', async () => {
    expect(await run(withToken, TOKEN)).toEqual({ ok: true, via: 'instance_token' });
  });

  it('aceita o token vindo da coluna legada', async () => {
    const legado = { instance_key: NAME, connection_config: {}, evolution_api_key: TOKEN };
    expect(await run(legado, TOKEN)).toEqual({ ok: true, via: 'instance_token' });
  });

  it('recusa token de OUTRA instância', async () => {
    expect(await run(withToken, '11111111-2222-3333-4444-555555555555')).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('recusa prefixo, sufixo e caixa diferente do token', async () => {
    for (const quase of [TOKEN.slice(0, -1), `${TOKEN}x`, TOKEN.toUpperCase(), ` ${TOKEN}`]) {
      expect((await run(withToken, quase)).ok).toBe(false);
    }
  });

  it('sem apikey e sem cabeçalho → missing_credentials', async () => {
    for (const vazio of [undefined, null, '', 0, {}]) {
      expect(await run(withToken, vazio)).toEqual({ ok: false, reason: 'missing_credentials' });
    }
  });

  it('apikey null (servidor com EXPOSE_IN_FETCH_INSTANCES=false) é recusado', async () => {
    expect((await run(withToken, null)).ok).toBe(false);
  });

  it('aceita EVOLUTION_WEBHOOK_SECRET no cabeçalho x-webhook-secret', async () => {
    const semToken = { instance_key: NAME, connection_config: {} };
    expect(await run(semToken, null, SECRET, SECRET)).toEqual({ ok: true, via: 'webhook_secret' });
  });

  it('recusa cabeçalho errado', async () => {
    expect(await run(withToken, null, `${SECRET}!`, SECRET)).toEqual({
      ok: false,
      reason: 'invalid_credentials',
    });
  });

  it('secret NÃO configurado: nenhum cabeçalho passa, nem vazio contra vazio', async () => {
    expect((await run(withToken, null, SECRET, undefined)).ok).toBe(false);
    expect((await run(withToken, null, SECRET, '')).ok).toBe(false);
    expect((await run(withToken, null, '', '')).ok).toBe(false);
  });

  it('as credenciais não se cruzam: secret no corpo e token no cabeçalho não valem', async () => {
    expect((await run(withToken, SECRET, null, SECRET)).ok).toBe(false);
    expect((await run(withToken, null, TOKEN, SECRET)).ok).toBe(false);
  });

  it('corpo errado não impede um cabeçalho certo', async () => {
    expect(await run(withToken, NAME, SECRET, SECRET)).toEqual({ ok: true, via: 'webhook_secret' });
  });
});
