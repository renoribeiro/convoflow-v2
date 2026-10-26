import { describe, it, expect, vi } from 'vitest';
import {
  runInstanceAction,
  mapWahaStatus,
  type ControlDeps,
  type ProviderRequest,
  type ProviderResponse,
} from '../../../supabase/functions/_shared/instance-control.ts';

/**
 * Estado, QR, desconectar e chave de número Evolution/WAHA pelo servidor
 * (edge function whatsapp-instance-action). Valores inventados.
 */

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA = 'aaaaaaaa-0000-4000-8000-000000000009';
const CHAVE = 'chave-da-instancia-FAKE-1234';
const SERVIDOR = 'https://evolution.exemplo.com.br';
const WAHA = 'https://waha.exemplo.com.br';

const gestor = { tenant_id: LOJA, role: 'gestor', status: 'active', capabilities: null };
const atendente = { tenant_id: LOJA, role: 'atendente', status: 'active', capabilities: null };
const gerenteDaConta = { tenant_id: CONTA, role: 'gerente', status: 'active', capabilities: null };

const evolution = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a1',
  tenant_id: LOJA,
  instance_key: 'loja-exemplo',
  provider: 'evolution',
  status: 'close',
  connection_config: {},
};
const waha = { ...evolution, id: 'aaaaaaaa-0000-4000-8000-0000000000a2', provider: 'waha', instance_key: 'sessao-exemplo', status: 'disconnected', connection_config: { sessionName: 'sessao-exemplo' } };
const lojaTenant = { id: LOJA, kind: 'store', parent_tenant_id: CONTA };

function deps(over: Partial<ControlDeps> & { responses?: ProviderResponse[] } = {}) {
  const calls: ProviderRequest[] = [];
  const responses = [...(over.responses ?? [])];
  const d: ControlDeps & { calls: ProviderRequest[] } = {
    caller: gestor,
    instance: evolution,
    instanceTenant: lojaTenant,
    env: { evolutionBaseUrl: SERVIDOR, evolutionGlobalKey: 'chave-global-FAKE' },
    loadCredentials: vi.fn(async () => ({ source: 'vault' as const, credentials: { baseUrl: SERVIDOR, apiKey: CHAVE } })),
    saveCredentials: vi.fn(async () => ({ error: null })),
    clearLegacyRowSecrets: vi.fn(async () => {}),
    updateStatus: vi.fn(async () => {}),
    callProvider: vi.fn(async (req: ProviderRequest) => {
      calls.push(req);
      return responses.shift() ?? { status: 200, json: {} };
    }),
    now: () => new Date('2026-10-26T12:00:00Z'),
    ...over,
    calls,
  };
  return d;
}

const semSegredo = (body: unknown) => {
  const txt = JSON.stringify(body);
  expect(txt).not.toContain(CHAVE);
  expect(txt).not.toContain(SERVIDOR);
  expect(txt).not.toContain(WAHA);
};

describe('quem pode', () => {
  it('atendente da própria Loja: recusado, sem chamar o provedor nem ler o cofre', async () => {
    const d = deps({ caller: atendente });
    const r = await runInstanceAction('status', {}, d);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('forbidden');
    expect(d.callProvider).not.toHaveBeenCalled();
    expect(d.loadCredentials).not.toHaveBeenCalled();
  });

  it('gestor de outra Conta: "não encontrada", sem revelar que existe', async () => {
    const d = deps({ caller: { ...gestor, tenant_id: OUTRA }, instanceTenant: lojaTenant });
    for (const action of ['status', 'connect', 'disconnect', 'credential', 'replace_key']) {
      const r = await runInstanceAction(action, { api_key: 'qualquer-coisa-1' }, d);
      expect(r.status).toBe(404);
      expect(r.body.reason).toBe('not_found');
    }
    expect(d.callProvider).not.toHaveBeenCalled();
    expect(d.loadCredentials).not.toHaveBeenCalled();
  });

  it('gerente da Conta numa Loja filha direta: passa', async () => {
    const d = deps({ caller: gerenteDaConta, responses: [{ status: 200, json: { instance: { state: 'open' } } }] });
    const r = await runInstanceAction('status', {}, d);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('open');
  });

  it('gerente de OUTRA Conta numa Loja: não encontrada', async () => {
    const d = deps({ caller: { ...gerenteDaConta, tenant_id: OUTRA } });
    expect((await runInstanceAction('status', {}, d)).status).toBe(404);
  });

  it('perfil suspenso: recusado', async () => {
    const d = deps({ caller: { ...gestor, status: 'suspended' } });
    const r = await runInstanceAction('status', {}, d);
    expect(r.status).toBe(403);
    expect(r.body.reason).toBe('inactive');
  });

  it('gestor com a capacidade negada por exceção: recusado', async () => {
    const d = deps({ caller: { ...gestor, capabilities: { 'whatsapp.configure': false } } });
    expect((await runInstanceAction('connect', {}, d)).status).toBe(403);
  });

  it('número da Meta: a ação não vale', async () => {
    const d = deps({ instance: { ...evolution, provider: 'official' } });
    const r = await runInstanceAction('status', {}, d);
    expect(r.status).toBe(400);
    expect(r.body.reason).toBe('unsupported_provider');
  });

  it('ação desconhecida e instância inexistente', async () => {
    expect((await runInstanceAction('apagar_tudo', {}, deps())).status).toBe(400);
    expect((await runInstanceAction('status', {}, deps({ instance: null }))).status).toBe(404);
  });
});

describe('sem chave salva (como o número antigo de teste)', () => {
  it('status, connect e disconnect respondem 409 dizendo o que fazer', async () => {
    for (const action of ['status', 'connect', 'disconnect']) {
      const d = deps({ loadCredentials: async () => ({ source: 'none', credentials: null }) });
      const r = await runInstanceAction(action, {}, d);
      expect(r.status).toBe(409);
      expect(r.body.reason).toBe('no_credentials');
      expect(r.body.credential_configured).toBe(false);
      expect(d.callProvider).not.toHaveBeenCalled();
    }
  });

  it('"tem chave?" responde só sim ou não', async () => {
    const sem = await runInstanceAction('credential', {}, deps({ loadCredentials: async () => ({ source: 'none', credentials: null }) }));
    expect(sem.body).toEqual({ ok: true, credential_configured: false });
    const com = await runInstanceAction('credential', {}, deps());
    expect(com.body).toEqual({ ok: true, credential_configured: true });
  });
});

describe('Evolution', () => {
  it('status: usa a chave da INSTÂNCIA (nunca a global), grava o estado novo e não devolve chave', async () => {
    const d = deps({ responses: [{ status: 200, json: { instance: { state: 'open' } } }] });
    const r = await runInstanceAction('status', {}, d);
    expect(d.calls[0]!.url).toBe(`${SERVIDOR}/instance/connectionState/loja-exemplo`);
    expect(d.calls[0]!.headers.apikey).toBe(CHAVE);
    expect(d.calls[0]!.customerServer).toBe(false);
    expect(d.updateStatus).toHaveBeenCalledWith({ status: 'open', last_connected_at: '2026-10-26T12:00:00.000Z' });
    expect(r.body).toMatchObject({ ok: true, status: 'open', changed: true });
    semSegredo(r.body);
  });

  it('status igual ao do banco: não grava', async () => {
    const d = deps({ responses: [{ status: 200, json: { instance: { state: 'close' } } }] });
    const r = await runInstanceAction('status', {}, d);
    expect(r.body.changed).toBe(false);
    expect(d.updateStatus).not.toHaveBeenCalled();
  });

  it('connect: devolve a imagem do QR e o código de pareamento, nunca o QR cru', async () => {
    const d = deps({ responses: [{ status: 200, json: { base64: 'data:image/png;base64,QUJD', code: '2@cru', pairingCode: 'ABCD1234' } }] });
    const r = await runInstanceAction('connect', {}, d);
    expect(d.calls[0]!.url).toBe(`${SERVIDOR}/instance/connect/loja-exemplo`);
    expect(r.body).toEqual({ ok: true, state: 'qrcode', qr: 'data:image/png;base64,QUJD', pairing_code: 'ABCD1234' });
  });

  it('connect de instância já conectada: diz conectado e grava', async () => {
    const d = deps({ responses: [{ status: 200, json: { instance: { state: 'open' } } }] });
    const r = await runInstanceAction('connect', {}, d);
    expect(r.body.state).toBe('open');
    expect(d.updateStatus).toHaveBeenCalled();
  });

  it('disconnect: logout com a chave da instância e status close', async () => {
    const d = deps({ responses: [{ status: 200, json: {} }] });
    const r = await runInstanceAction('disconnect', {}, d);
    expect(d.calls[0]).toMatchObject({ method: 'DELETE', url: `${SERVIDOR}/instance/logout/loja-exemplo` });
    expect(d.updateStatus).toHaveBeenCalledWith({ status: 'close' });
    expect(r.body).toEqual({ ok: true, status: 'close' });
  });

  it('provedor recusa a chave salva: mensagem em pt-BR, sem repetir o corpo', async () => {
    const d = deps({ responses: [{ status: 401, json: { message: 'apikey errada ' + CHAVE } }] });
    const r = await runInstanceAction('status', {}, d);
    expect(r.status).toBe(502);
    expect(r.body.reason).toBe('provider_auth');
    semSegredo(r.body);
  });
});

describe('WAHA (servidor do cliente)', () => {
  const credWaha = async () => ({ source: 'vault' as const, credentials: { baseUrl: WAHA, apiKey: 'chave-waha-FAKE', webhookSecret: 'senha-FAKE' } });

  it('toda chamada é marcada como servidor do cliente (passa pelo bloqueio de endereço)', async () => {
    const d = deps({ instance: waha, loadCredentials: credWaha, responses: [{ status: 200, json: { status: 'WORKING' } }] });
    const r = await runInstanceAction('status', {}, d);
    expect(d.calls.every((c) => c.customerServer)).toBe(true);
    expect(d.calls[0]!.headers['X-Api-Key']).toBe('chave-waha-FAKE');
    expect(r.body.status).toBe('connected');
  });

  it('connect com sessão parada: inicia a sessão e pede para esperar o QR', async () => {
    const d = deps({ instance: waha, loadCredentials: credWaha, responses: [{ status: 200, json: { status: 'STOPPED' } }, { status: 201, json: {} }] });
    const r = await runInstanceAction('connect', {}, d);
    expect(d.calls[1]).toMatchObject({ method: 'POST', url: `${WAHA}/api/sessions/sessao-exemplo/start` });
    expect(r.body).toMatchObject({ ok: true, state: 'connecting', qr: null });
  });

  it('connect esperando leitura: devolve a imagem do QR', async () => {
    const d = deps({
      instance: waha,
      loadCredentials: credWaha,
      responses: [{ status: 200, json: { status: 'SCAN_QR_CODE' } }, { status: 200, base64: 'UE5H', contentType: 'image/png' }],
    });
    const r = await runInstanceAction('connect', {}, d);
    expect(d.calls[1]!.url).toBe(`${WAHA}/api/sessao-exemplo/auth/qr?format=image`);
    expect(r.body.qr).toBe('data:image/png;base64,UE5H');
    semSegredo(r.body);
  });

  it('disconnect: logout da sessão e status disconnected', async () => {
    const d = deps({ instance: waha, loadCredentials: credWaha, responses: [{ status: 201, json: {} }] });
    const r = await runInstanceAction('disconnect', {}, d);
    expect(d.calls[0]).toMatchObject({ method: 'POST', url: `${WAHA}/api/sessions/sessao-exemplo/logout` });
    expect(r.body.status).toBe('disconnected');
  });

  it('endereço recusado pelo bloqueio vira 400 com a mensagem do bloqueio', async () => {
    const d = deps({ instance: waha, loadCredentials: credWaha, responses: [{ status: 0, blocked: 'Esse endereço aponta para uma rede interna ou reservada.' }] });
    const r = await runInstanceAction('status', {}, d);
    expect(r.status).toBe(400);
    expect(r.body.reason).toBe('blocked_address');
  });

  it('mapa de estado igual ao do webhook', () => {
    expect(mapWahaStatus('WORKING')).toBe('connected');
    expect(mapWahaStatus('SCAN_QR_CODE')).toBe('qrcode');
    expect(mapWahaStatus('STARTING')).toBe('connecting');
    expect(mapWahaStatus('FAILED')).toBe('disconnected');
    expect(mapWahaStatus('???')).toBeNull();
  });
});

describe('trocar a chave', () => {
  it('recusa a chave GLOBAL do Evolution', async () => {
    const d = deps();
    const r = await runInstanceAction('replace_key', { api_key: 'chave-global-FAKE' }, d);
    expect(r.body.reason).toBe('global_key');
    expect(d.saveCredentials).not.toHaveBeenCalled();
  });

  it('só guarda chave que abre ESTE número; recusada não troca nada', async () => {
    const d = deps({ responses: [{ status: 401 }] });
    const r = await runInstanceAction('replace_key', { api_key: 'outra-chave-FAKE-99' }, d);
    expect(r.body.reason).toBe('key_rejected');
    expect(d.saveCredentials).not.toHaveBeenCalled();
  });

  it('chave que abre: guarda no cofre, limpa a linha antiga e responde só "configurada"', async () => {
    const d = deps({
      loadCredentials: async () => ({ source: 'none', credentials: null }),
      responses: [{ status: 200, json: { instance: { state: 'close' } } }],
    });
    const r = await runInstanceAction('replace_key', { api_key: 'nova-chave-FAKE-77' }, d);
    expect(d.calls[0]!.headers.apikey).toBe('nova-chave-FAKE-77');
    expect(d.saveCredentials).toHaveBeenCalledWith({ baseUrl: SERVIDOR, apiKey: 'nova-chave-FAKE-77' });
    expect(d.clearLegacyRowSecrets).toHaveBeenCalled();
    expect(r.body).toEqual({ ok: true, credential_configured: true });
  });

  it('WAHA mantém a senha de entrega ao trocar a chave', async () => {
    const d = deps({
      instance: waha,
      loadCredentials: async () => ({ source: 'vault', credentials: { baseUrl: WAHA, apiKey: 'velha', webhookSecret: 'senha-FAKE' } }),
      responses: [{ status: 200, json: { status: 'WORKING' } }],
    });
    await runInstanceAction('replace_key', { api_key: 'chave-waha-nova-FAKE' }, d);
    expect(d.saveCredentials).toHaveBeenCalledWith({ baseUrl: WAHA, apiKey: 'chave-waha-nova-FAKE', webhookSecret: 'senha-FAKE' });
  });

  it('chave curta ou com espaço é recusada antes de chamar alguém', async () => {
    const d = deps();
    expect((await runInstanceAction('replace_key', { api_key: 'curta' }, d)).body.reason).toBe('invalid_key');
    expect((await runInstanceAction('replace_key', { api_key: 'tem espaco no meio' }, d)).body.reason).toBe('invalid_key');
    expect(d.callProvider).not.toHaveBeenCalled();
  });
});
