import { useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import { useTenantId } from '@/contexts/TenantContext';

// ---------------------------------------------------------------------------
// Global FB SDK types (minimal — only what we use)
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    FB: {
      init(params: {
        appId: string;
        autoLogAppEvents: boolean;
        xfbml: boolean;
        version: string;
      }): void;
      login(
        callback: (response: FBLoginResponse) => void,
        options: {
          config_id: string;
          response_type: 'code';
          override_default_response_type: boolean;
          extras: {
            setup: Record<string, unknown>;
            featureType: string;
            sessionInfoVersion: string;
          };
        },
      ): void;
    };
    fbAsyncInit?: () => void;
  }
}

interface FBLoginResponse {
  authResponse: {
    code: string;
    userID: string;
    expiresIn: number;
    signedRequest: string;
    graphDomain: string;
    data_access_expiration_time: number;
  } | null;
  status: string;
}

// Shape of the WA_EMBEDDED_SIGNUP postMessage payload (session event).
// Assumption: this matches Meta's documented format for sessionInfoVersion '3'.
// The outer message event data is JSON-parseable with { type, event, data }.
interface EmbeddedSignupMessageData {
  type: 'WA_EMBEDDED_SIGNUP';
  event: 'FINISH' | 'CANCEL' | 'ERROR';
  data: {
    phone_number_id: string;
    waba_id: string;
  };
  error_message?: string;
}

interface EmbeddedSignupResult {
  code: string;
  wabaId: string;
  phoneNumberId: string;
}

let sdkLoaded = false;

function loadFacebookSdk(appId: string): Promise<void> {
  if (sdkLoaded && window.FB) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.getElementById('facebook-jssdk');
    if (existing) {
      // Script tag already injected by a previous call; wait for fbAsyncInit
      const prev = window.fbAsyncInit;
      window.fbAsyncInit = () => {
        prev?.();
        resolve();
      };
      return;
    }

    window.fbAsyncInit = () => {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v20.0',
      });
      sdkLoaded = true;
      resolve();
    };

    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Falha ao carregar o SDK do Facebook'));
    document.head.appendChild(script);
  });
}

/** O que a edge function devolve de útil para a tela. */
export interface MetaSignupOutcome {
  /** 'reconnect' = o número já existia e a instância foi atualizada no lugar. */
  mode: 'connect' | 'reconnect';
  instanceId: string;
  registered: boolean;
}

export interface UseMetaEmbeddedSignupReturn {
  isAvailable: boolean;
  startSignup: (instanceName?: string) => Promise<MetaSignupOutcome>;
  loading: boolean;
}

/**
 * Texto do aviso de sucesso por modo. Exportado para o teste — e para deixar
 * explícito que "criada" e "reconectada" são avisos diferentes.
 */
export const META_SIGNUP_SUCCESS_TOAST: Record<
  MetaSignupOutcome['mode'],
  { title: string; description: string }
> = {
  connect: {
    title: 'Conta Meta conectada',
    description: 'Instância criada com sucesso via Embedded Signup.',
  },
  reconnect: {
    title: 'Número reconectado',
    description:
      'O ConvoFlow reconheceu este número: a instância foi atualizada no lugar e o histórico continua onde estava.',
  },
};

export const useMetaEmbeddedSignup = (): UseMetaEmbeddedSignupReturn => {
  const appId = env.get('FACEBOOK_APP_ID') || '';
  const configId = env.get('META_CONFIG_ID') || '';
  const isAvailable = Boolean(appId && configId);

  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  // A Conta/Loja ATIVA no seletor — para o gerente dentro de uma Loja, é a
  // Loja, não a Conta do perfil dele. A função revalida no servidor; na
  // reconexão ela ignora isto e usa a Conta da própria linha.
  const activeTenantId = useTenantId();

  const startSignup = useCallback(
    async (instanceName?: string): Promise<MetaSignupOutcome> => {
      if (!isAvailable) throw new Error('Conexão automática com a Meta não configurada');
      if (loadingRef.current) throw new Error('Conexão com a Meta já em andamento');
      loadingRef.current = true;
      setLoading(true);

      try {
        await loadFacebookSdk(appId);

        const result = await new Promise<EmbeddedSignupResult>((resolve, reject) => {
          let wabaId: string | null = null;
          let phoneNumberId: string | null = null;
          let loginCode: string | null = null;

          const tryResolve = () => {
            if (wabaId && phoneNumberId && loginCode) {
              cleanup();
              resolve({ code: loginCode, wabaId, phoneNumberId });
            }
          };

          const handleMessage = (event: MessageEvent) => {
            // Only accept messages from facebook.com origins
            if (!event.origin.endsWith('facebook.com')) return;

            let parsed: EmbeddedSignupMessageData | null = null;
            try {
              parsed =
                typeof event.data === 'string'
                  ? JSON.parse(event.data)
                  : event.data;
            } catch {
              return;
            }

            if (!parsed || parsed.type !== 'WA_EMBEDDED_SIGNUP') return;

            if (parsed.event === 'FINISH') {
              wabaId = parsed.data?.waba_id ?? null;
              phoneNumberId = parsed.data?.phone_number_id ?? null;
              tryResolve();
            } else if (parsed.event === 'CANCEL' || parsed.event === 'ERROR') {
              cleanup();
              reject(new Error(parsed.error_message || 'Cadastro cancelado pelo usuário'));
            }
          };

          const cleanup = () => {
            window.removeEventListener('message', handleMessage);
          };

          window.addEventListener('message', handleMessage);

          window.FB.login(
            (response: FBLoginResponse) => {
              if (!response.authResponse) {
                cleanup();
                reject(new Error('Login cancelado'));
                return;
              }
              loginCode = response.authResponse.code;
              tryResolve();
            },
            {
              config_id: configId,
              response_type: 'code',
              override_default_response_type: true,
              extras: {
                setup: {},
                featureType: '',
                sessionInfoVersion: '3',
              },
            },
          );
        });

        // Call the edge function
        const { data, error } = await supabase.functions.invoke('meta-oauth-exchange', {
          body: {
            code: result.code,
            wabaId: result.wabaId,
            phoneNumberId: result.phoneNumberId,
            ...(instanceName ? { name: instanceName } : {}),
            ...(activeTenantId ? { tenantId: activeTenantId } : {}),
          },
        });

        if (error || !data?.success) {
          // A função recusa ANTES de falar com a Meta quando o número é de
          // outra Conta ou o chamador não alcança a Conta ativa; a mensagem
          // dela já vem em português e sem dizer de quem é o número. Com
          // `error` (status != 2xx) o corpo pode vir dentro de error.context.
          const msg =
            data?.error ||
            (await readFunctionError(error)) ||
            'Erro ao conectar com a Meta';
          logger.error('useMetaEmbeddedSignup: meta-oauth-exchange falhou', { msg });
          throw new Error(msg);
        }

        queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

        const mode: MetaSignupOutcome['mode'] = data.mode === 'reconnect' ? 'reconnect' : 'connect';
        toast(META_SIGNUP_SUCCESS_TOAST[mode]);

        return {
          mode,
          instanceId: String(data.instance?.id ?? ''),
          registered: Boolean(data.registered),
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Erro desconhecido no Embedded Signup';

        if (message !== 'Login cancelado') {
          toast({ title: 'Erro', description: message, variant: 'destructive' });
        } else {
          toast({
            title: 'Cadastro cancelado',
            description: 'O fluxo de conexão com a Meta foi cancelado.',
          });
        }

        logger.error('useMetaEmbeddedSignup falhou', { message });
        throw err;
      } finally {
        loadingRef.current = false;
        setLoading(false);
      }
    },
    [isAvailable, appId, configId, toast, queryClient, activeTenantId],
  );

  return { isAvailable, startSignup, loading };
};

/**
 * supabase.functions.invoke devolve o corpo de um 4xx/5xx só dentro de
 * `error.context` (uma Response). Lê `{ error }` de lá; se não der, usa a
 * mensagem genérica do erro.
 */
async function readFunctionError(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null;
  const ctx = (error as { context?: unknown }).context;
  if (ctx && typeof (ctx as Response).json === 'function') {
    try {
      const body = await (ctx as Response).clone().json();
      if (body && typeof body.error === 'string' && body.error) return body.error;
    } catch {
      // corpo não é JSON — cai na mensagem genérica
    }
  }
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message ? message : null;
}
