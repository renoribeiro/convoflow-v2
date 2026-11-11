/**
 * useMetaEmbeddedSignup — o que o navegador manda para meta-oauth-exchange e
 * o que o usuário vê depois.
 *
 * 2026-09-19: a função passou a distinguir primeira conexão de reconexão. O
 * navegador precisa (1) mandar a Conta/Loja ATIVA no seletor — para o gerente
 * dentro de uma Loja, a Loja — e (2) avisar "Número reconectado" em vez de
 * "Instância criada" quando `mode === 'reconnect'`. Também: a recusa da
 * função (número de outra Conta) chega ao usuário com a mensagem dela, que não
 * diz de quem é o número.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const invoke = vi.fn();
const toast = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/env', () => ({
  env: { get: (k: string) => ({ FACEBOOK_APP_ID: 'app', META_CONFIG_ID: 'cfg' } as Record<string, string>)[k] ?? '' },
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 'bbbbbbbb-0000-4000-8000-000000000002' }));

import { useMetaEmbeddedSignup, META_SIGNUP_SUCCESS_TOAST, META_SIGNUP_TOAST_OUTRA_EMPRESA } from './useMetaEmbeddedSignup';

const fbInit = vi.fn();
const fbLoginOptions = vi.fn();

/** Simula o SDK: login devolve o código e a janela da Meta manda FINISH. */
function stubFacebookDialog() {
  (window as unknown as { FB: unknown }).FB = {
    init: fbInit,
    login: (cb: (r: unknown) => void, options: unknown) => {
      fbLoginOptions(options);
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://www.facebook.com',
          data: JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH',
            data: { phone_number_id: '1291744174026561', waba_id: '2542773286191227' },
          }),
        }),
      );
      cb({ authResponse: { code: 'AUTH-CODE' } });
    },
  };
  // O script já "carregou": o hook só espera o fbAsyncInit que ele mesmo
  // registra ao iniciar. Dispara assim que o hook o registrar.
  const tag = document.createElement('script');
  tag.id = 'facebook-jssdk';
  document.head.appendChild(tag);
  window.fbAsyncInit = undefined;
  const timer = setInterval(() => {
    if (window.fbAsyncInit) {
      clearInterval(timer);
      window.fbAsyncInit();
    }
  }, 1);
}

describe('useMetaEmbeddedSignup', () => {
  beforeEach(() => {
    invoke.mockReset();
    toast.mockReset();
    invalidateQueries.mockReset();
    fbInit.mockReset();
    fbLoginOptions.mockReset();
    document.getElementById('facebook-jssdk')?.remove();
    stubFacebookDialog();
  });

  it('manda code, wabaId, phoneNumberId, name E a Conta/Loja ativa do seletor', async () => {
    invoke.mockResolvedValue({ data: { success: true, mode: 'connect', instance: { id: 'i1' }, registered: true }, error: null });
    const { result } = renderHook(() => useMetaEmbeddedSignup());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startSignup('Vendas');
    });

    expect(invoke).toHaveBeenCalledWith('meta-oauth-exchange', {
      body: {
        code: 'AUTH-CODE',
        wabaId: '2542773286191227',
        phoneNumberId: '1291744174026561',
        name: 'Vendas',
        tenantId: 'bbbbbbbb-0000-4000-8000-000000000002',
      },
    });
    expect(outcome).toEqual({ mode: 'connect', instanceId: 'i1', registered: true, deOutraEmpresa: false });
    expect(toast).toHaveBeenCalledWith(META_SIGNUP_SUCCESS_TOAST.connect);
    expect(toast.mock.calls[0]?.[0].title).toBe('Conta Meta conectada');
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['whatsapp-instances'] });
  });

  it('abre a janela da Meta na versão 4 do Embedded Signup, sem os campos que a Meta ignora', async () => {
    invoke.mockResolvedValue({ data: { success: true, mode: 'connect', instance: { id: 'i1' }, registered: true }, error: null });
    const { result } = renderHook(() => useMetaEmbeddedSignup());

    await act(async () => {
      await result.current.startSignup();
    });

    expect(fbLoginOptions).toHaveBeenCalledWith({
      config_id: 'cfg',
      response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {} },
    });
  });

  it('reconexão: o aviso diz "Número reconectado", não "criada"', async () => {
    invoke.mockResolvedValue({ data: { success: true, mode: 'reconnect', instance: { id: 'i1' }, registered: true }, error: null });
    const { result } = renderHook(() => useMetaEmbeddedSignup());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startSignup();
    });

    expect(outcome).toEqual({ mode: 'reconnect', instanceId: 'i1', registered: true, deOutraEmpresa: false });
    expect(toast).toHaveBeenCalledWith(META_SIGNUP_SUCCESS_TOAST.reconnect);
    const shown = toast.mock.calls[0]?.[0];
    expect(shown.title).toBe('Número reconectado');
    expect(shown.description).toMatch(/histórico continua/);
    expect(shown.description).not.toMatch(/criada/);
  });

  it('número que já funcionava em outra empresa: o aviso diz o que falta fazer na Meta', async () => {
    invoke.mockResolvedValue({
      data: { success: true, mode: 'connect', instance: { id: 'i1' }, registered: true, numeroDeOutraEmpresa: true },
      error: null,
    });
    const { result } = renderHook(() => useMetaEmbeddedSignup());

    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.startSignup();
    });

    expect(outcome).toEqual({ mode: 'connect', instanceId: 'i1', registered: true, deOutraEmpresa: true });
    expect(toast).toHaveBeenCalledWith(META_SIGNUP_TOAST_OUTRA_EMPRESA);
    const shown = toast.mock.calls[0]?.[0];
    expect(shown.description).toMatch(/roteamento de conversas/);
    expect(shown.description).toMatch(/aquecimento/);
    expect(`${shown.title} ${shown.description}`).not.toMatch(/[-‐‑‒–—―−]/);
  });

  it('recusa da função (número de outra Conta): mostra a mensagem dela, sem dizer de quem é', async () => {
    const msg = 'Este número já está conectado em outra Conta ou Loja que você não administra. Se ele é seu, escreva para contato@convoflow.com.br.';
    invoke.mockResolvedValue({
      data: null,
      error: { message: 'Edge Function returned a non-2xx status code', context: new Response(JSON.stringify({ success: false, reason: 'foreign_instance', error: msg }), { status: 403 }) },
    });
    const { result } = renderHook(() => useMetaEmbeddedSignup());

    await act(async () => {
      await expect(result.current.startSignup()).rejects.toThrow(msg);
    });

    expect(toast).toHaveBeenCalledWith({ title: 'Não deu certo', description: msg, variant: 'destructive' });
    expect(invalidateQueries).not.toHaveBeenCalled();
  });
});
