import { describe, it, expect, vi } from 'vitest';
import {
  resolveProviderCredentials,
  loadProviderCredentials,
  credentialsForVault,
} from '../../../supabase/functions/_shared/instance-credentials.ts';
import {
  authenticateWahaWebhook,
  wahaHmacHex,
  newWebhookSecret,
} from '../../../supabase/functions/_shared/waha-webhook-auth.ts';
import { authenticateEvolutionWebhook } from '../../../supabase/functions/_shared/evolution-webhook-auth.ts';

/** Onde o servidor acha endereço, chave e senha de entrega. Valores inventados. */

const PLATAFORMA = 'https://evolution.exemplo.com.br';
const env = { evolutionBaseUrl: PLATAFORMA };

describe('resolveProviderCredentials', () => {
  it('Evolution: o cofre vem primeiro', () => {
    const r = resolveProviderCredentials(
      { provider: 'evolution', connection_config: { apiKey: 'da-linha' }, evolution_api_key: 'coluna' },
      { baseUrl: 'https://evolution.exemplo.com.br/', apiKey: 'do-cofre' },
      env,
    );
    expect(r).toEqual({ source: 'vault', credentials: { baseUrl: PLATAFORMA, apiKey: 'do-cofre' } });
  });

  it('Evolution antigo: chave da linha, endereço SEMPRE o da plataforma (nunca o da linha)', () => {
    const r = resolveProviderCredentials(
      { provider: 'evolution', connection_config: { apiKey: 'da-linha', baseUrl: 'http://169.254.169.254' } },
      null,
      env,
    );
    expect(r).toEqual({ source: 'legacy_row', credentials: { baseUrl: PLATAFORMA, apiKey: 'da-linha' } });
    const coluna = resolveProviderCredentials({ provider: null, evolution_api_key: 'coluna', evolution_api_url: 'http://10.0.0.1' }, null, env);
    expect(coluna.credentials?.baseUrl).toBe(PLATAFORMA);
  });

  it('Evolution sem chave em lugar nenhum (o número de teste de hoje): nada', () => {
    expect(resolveProviderCredentials({ provider: 'evolution', connection_config: {} }, null, env)).toEqual({ source: 'none', credentials: null });
  });

  it('WAHA: cofre com senha de entrega; linha antiga como reserva', () => {
    const v = resolveProviderCredentials({ provider: 'waha' }, { baseUrl: 'https://waha.exemplo.com.br', apiKey: 'k', webhookSecret: 's' }, env);
    expect(v).toEqual({ source: 'vault', credentials: { baseUrl: 'https://waha.exemplo.com.br', apiKey: 'k', webhookSecret: 's' } });
    const l = resolveProviderCredentials({ provider: 'waha', connection_config: { baseUrl: 'https://waha.exemplo.com.br', apiKey: 'k' } }, null, env);
    expect(l.source).toBe('legacy_row');
  });

  it('Meta e Instagram: nunca por aqui', () => {
    expect(resolveProviderCredentials({ provider: 'official' }, { apiKey: 'x', baseUrl: 'y' }, env).credentials).toBeNull();
  });
});

describe('loadProviderCredentials', () => {
  it('pergunta ao cofre pela instância e decide', async () => {
    const rpc = vi.fn(async () => ({ data: { apiKey: 'do-cofre' }, error: null }));
    const r = await loadProviderCredentials({ rpc }, { id: 'aaaaaaaa-0000-4000-8000-0000000000a1', provider: 'evolution' }, env);
    expect(rpc).toHaveBeenCalledWith('get_instance_provider_credentials', { p_instance_id: 'aaaaaaaa-0000-4000-8000-0000000000a1' });
    expect(r.credentials?.apiKey).toBe('do-cofre');
  });

  it('erro do cofre não derruba: cai para a linha e avisa', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: 'fora do ar' } }));
    const r = await loadProviderCredentials({ rpc }, { id: 'x', provider: 'evolution', evolution_api_key: 'antiga' }, env);
    expect(r).toMatchObject({ source: 'legacy_row', vaultError: 'fora do ar' });
  });

  it('Meta: nem pergunta ao cofre', async () => {
    const rpc = vi.fn();
    await loadProviderCredentials({ rpc }, { id: 'x', provider: 'official' }, env);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('credentialsForVault só leva as três chaves preenchidas', () => {
    expect(credentialsForVault({ baseUrl: 'https://a.exemplo.com.br/', apiKey: ' k ', webhookSecret: '' })).toEqual({
      baseUrl: 'https://a.exemplo.com.br',
      apiKey: 'k',
    });
  });
});

describe('senha de entrega do WAHA (HMAC-SHA512 por número)', () => {
  const corpo = '{"event":"message","session":"sessao-exemplo"}';

  it('assinatura certa passa; errada, ausente ou de outro número não', async () => {
    const segredo = newWebhookSecret();
    expect(segredo).toMatch(/^[0-9a-f]{64}$/);
    const assinatura = await wahaHmacHex(corpo, segredo);
    expect(await authenticateWahaWebhook({ rawBody: corpo, signatureHeader: assinatura, algorithmHeader: 'sha512', secret: segredo })).toEqual({ ok: true });
    expect(await authenticateWahaWebhook({ rawBody: corpo, signatureHeader: assinatura.toUpperCase(), algorithmHeader: null, secret: segredo })).toEqual({ ok: true });
    expect((await authenticateWahaWebhook({ rawBody: corpo + ' ', signatureHeader: assinatura, algorithmHeader: null, secret: segredo })).ok).toBe(false);
    expect(await authenticateWahaWebhook({ rawBody: corpo, signatureHeader: null, algorithmHeader: null, secret: segredo })).toEqual({ ok: false, reason: 'missing_signature' });
    const outro = newWebhookSecret();
    expect(await authenticateWahaWebhook({ rawBody: corpo, signatureHeader: assinatura, algorithmHeader: null, secret: outro })).toEqual({ ok: false, reason: 'invalid_signature' });
  });

  it('número sem senha no cofre: recusa (falha fechada)', async () => {
    expect(await authenticateWahaWebhook({ rawBody: corpo, signatureHeader: 'a'.repeat(128), algorithmHeader: null, secret: null })).toEqual({ ok: false, reason: 'no_secret' });
  });

  it('algoritmo diferente de sha512: recusa', async () => {
    const segredo = newWebhookSecret();
    const assinatura = await wahaHmacHex(corpo, segredo);
    expect(await authenticateWahaWebhook({ rawBody: corpo, signatureHeader: assinatura, algorithmHeader: 'sha256', secret: segredo })).toEqual({ ok: false, reason: 'bad_algorithm' });
  });
});

describe('webhook do Evolution com a chave do cofre', () => {
  const instance = { instance_key: 'loja-exemplo', connection_config: {}, evolution_api_key: null };

  it('a chave do cofre autentica o evento', async () => {
    const r = await authenticateEvolutionWebhook({ instance, storedToken: 'chave-FAKE-1', payloadApiKey: 'chave-FAKE-1', headerSecret: null, webhookSecret: undefined });
    expect(r).toEqual({ ok: true, via: 'instance_token' });
  });

  it('a do cofre vence a da linha antiga', async () => {
    const legado = { ...instance, connection_config: { apiKey: 'antiga-FAKE' } };
    expect((await authenticateEvolutionWebhook({ instance: legado, storedToken: 'nova-FAKE', payloadApiKey: 'antiga-FAKE', headerSecret: null, webhookSecret: undefined })).ok).toBe(false);
  });

  it('sem cofre, número antigo segue valendo pela linha', async () => {
    const legado = { ...instance, connection_config: { apiKey: 'antiga-FAKE' } };
    expect((await authenticateEvolutionWebhook({ instance: legado, storedToken: null, payloadApiKey: 'antiga-FAKE', headerSecret: null, webhookSecret: undefined })).ok).toBe(true);
  });
});
