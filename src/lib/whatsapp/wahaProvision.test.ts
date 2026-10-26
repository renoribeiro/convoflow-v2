import { describe, it, expect, vi } from 'vitest';
import { provisionWaha, type WahaProvisionDeps } from '../../../supabase/functions/_shared/waha-provision.ts';
import { assertPublicUrl, OutboundUrlError } from '../../../supabase/functions/_shared/safe-outbound-url.ts';
import type { ProviderRequest, ProviderResponse } from '../../../supabase/functions/_shared/instance-control.ts';

/** Cadastro de número WAHA pelo servidor. Valores inventados; nada toca a rede. */

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const NOVO = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const SENHA = 'b'.repeat(64);
const gestor = { tenant_id: LOJA, role: 'gestor', status: 'active', capabilities: null };

const entrada = {
  name: 'WhatsApp Suporte',
  server_url: 'https://waha.exemplo.com.br',
  api_key: 'chave-waha-FAKE',
  session_name: 'loja-exemplo',
};

/** O mesmo checkUrl da função de verdade, com DNS falso. */
const checkUrlCom = (ips: string[]) => async (raw: string) => {
  try {
    return { ok: true as const, url: (await assertPublicUrl(raw, async () => ips)).toString() };
  } catch (e) {
    return { ok: false as const, message: e instanceof OutboundUrlError ? e.message : 'inválido' };
  }
};

function deps(over: Partial<WahaProvisionDeps> & { responses?: ProviderResponse[] } = {}) {
  const calls: ProviderRequest[] = [];
  const responses = [...(over.responses ?? [{ status: 200, json: { status: 'ok' } }, { status: 201, json: {} }])];
  const d = {
    caller: gestor,
    supabaseUrl: 'https://projeto.exemplo.supabase.co',
    newInstanceId: () => NOVO,
    newSecret: () => SENHA,
    checkUrl: checkUrlCom(['8.8.8.8']),
    instanceKeyTaken: vi.fn(async () => false),
    callWaha: vi.fn(async (req: ProviderRequest) => {
      calls.push(req);
      return responses.shift() ?? { status: 200, json: {} };
    }),
    insertInstance: vi.fn(async () => ({ error: null })),
    saveCredentials: vi.fn(async () => ({ error: null })),
    deleteInstance: vi.fn(async () => {}),
    ...over,
    calls,
  };
  return d as WahaProvisionDeps & { calls: ProviderRequest[] } & typeof d;
}

describe('quem pode cadastrar', () => {
  it('atendente: recusado antes de tocar no servidor do cliente', async () => {
    const d = deps({ caller: { ...gestor, role: 'atendente' } });
    const r = await provisionWaha(entrada, d);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('forbidden');
    expect(d.callWaha).not.toHaveBeenCalled();
    expect(d.insertInstance).not.toHaveBeenCalled();
  });

  it('perfil suspenso ou sem Conta: recusado', async () => {
    expect((await provisionWaha(entrada, deps({ caller: { ...gestor, status: 'suspended' } }))).status).toBe(403);
    expect((await provisionWaha(entrada, deps({ caller: { ...gestor, tenant_id: null } }))).status).toBe(403);
  });
});

describe('bloqueio de endereço interno', () => {
  it.each([
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://10.0.0.8',
    'http://169.254.169.254',
    'http://[::1]:3000',
    'http://metadata.google.internal',
    'http://waha',
  ])('%s: recusado sem nenhuma chamada', async (server_url) => {
    const d = deps();
    const r = await provisionWaha({ ...entrada, server_url }, d);
    expect(r.status).toBe(400);
    expect(r.body.reason).toBe('blocked_address');
    expect(d.callWaha).not.toHaveBeenCalled();
  });

  it('nome público que resolve para rede interna: recusado', async () => {
    const d = deps({ checkUrl: checkUrlCom(['192.168.0.20']) });
    const r = await provisionWaha(entrada, d);
    expect(r.body.reason).toBe('blocked_address');
    expect(d.callWaha).not.toHaveBeenCalled();
  });
});

describe('cadastro', () => {
  it('cria a sessão com webhook do número e senha só dele; nada disso fica na linha nem na resposta', async () => {
    const d = deps();
    const r = await provisionWaha(entrada, d);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, instance_id: NOVO, instance_key: 'loja-exemplo', name: 'WhatsApp Suporte' });

    expect(d.calls[0]).toMatchObject({ method: 'GET', url: 'https://waha.exemplo.com.br/api/health', customerServer: true });
    const sessao = d.calls[1]!;
    expect(sessao).toMatchObject({ method: 'POST', url: 'https://waha.exemplo.com.br/api/sessions', customerServer: true });
    const hook = (sessao.body as { config: { webhooks: Array<Record<string, unknown>> } }).config.webhooks[0]!;
    expect(hook.url).toBe(`https://projeto.exemplo.supabase.co/functions/v1/waha-webhook?instance=${NOVO}`);
    expect(hook.hmac).toEqual({ key: SENHA });
    expect(sessao.headers['X-Api-Key']).toBe('chave-waha-FAKE');

    const linha = (d.insertInstance as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(linha).toMatchObject({ id: NOVO, tenant_id: LOJA, provider: 'waha', instance_key: 'loja-exemplo' });
    const textoLinha = JSON.stringify(linha);
    expect(textoLinha).not.toContain('chave-waha-FAKE');
    expect(textoLinha).not.toContain(SENHA);
    expect(textoLinha).not.toContain('waha.exemplo.com.br');

    expect(d.saveCredentials).toHaveBeenCalledWith(NOVO, {
      baseUrl: 'https://waha.exemplo.com.br',
      apiKey: 'chave-waha-FAKE',
      webhookSecret: SENHA,
    });
    const resposta = JSON.stringify(r.body);
    expect(resposta).not.toContain('chave-waha-FAKE');
    expect(resposta).not.toContain(SENHA);
    expect(resposta).not.toContain('waha.exemplo.com.br');
  });

  it('sessão que já existe no servidor do cliente: só troca o webhook', async () => {
    const d = deps({ responses: [{ status: 200 }, { status: 422 }, { status: 200 }] });
    const r = await provisionWaha(entrada, d);
    expect(r.status).toBe(200);
    expect(d.calls[2]).toMatchObject({ method: 'PUT', url: 'https://waha.exemplo.com.br/api/sessions/loja-exemplo' });
  });

  it('nome de sessão já usado no ConvoFlow: recusado antes de chamar o servidor', async () => {
    const d = deps({ instanceKeyTaken: vi.fn(async () => true) });
    const r = await provisionWaha(entrada, d);
    expect(r.status).toBe(409);
    expect(d.callWaha).not.toHaveBeenCalled();
  });

  it('API Key recusada pelo WAHA: nada salvo', async () => {
    const d = deps({ responses: [{ status: 200 }, { status: 401 }] });
    const r = await provisionWaha(entrada, d);
    expect(r.body.reason).toBe('key_rejected');
    expect(d.insertInstance).not.toHaveBeenCalled();
  });

  it('cofre recusa: tira a linha e a sessão que NÓS criamos', async () => {
    const d = deps({ saveCredentials: vi.fn(async () => ({ error: 'cofre fora do ar' })) });
    const r = await provisionWaha(entrada, d);
    expect(r.status).toBe(500);
    expect(d.deleteInstance).toHaveBeenCalledWith(NOVO);
    expect(d.calls.at(-1)).toMatchObject({ method: 'DELETE', url: 'https://waha.exemplo.com.br/api/sessions/loja-exemplo' });
  });

  it('cofre recusa numa sessão que já existia: a sessão do cliente fica', async () => {
    const d = deps({
      responses: [{ status: 200 }, { status: 409 }, { status: 200 }],
      saveCredentials: vi.fn(async () => ({ error: 'cofre fora do ar' })),
    });
    await provisionWaha(entrada, d);
    expect(d.calls.some((c) => c.method === 'DELETE')).toBe(false);
  });

  it('valida nome e sessão', async () => {
    expect((await provisionWaha({ ...entrada, name: 'ab' }, deps())).body.reason).toBe('invalid_name');
    expect((await provisionWaha({ ...entrada, session_name: 'com espaço' }, deps())).body.reason).toBe('invalid_session');
  });
});
