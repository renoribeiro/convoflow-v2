/**
 * Widget do Cloudflare Turnstile (a verificação "não sou um robô").
 *
 * O token que ele entrega vale uma vez só e por 5 minutos; quem confere é o
 * servidor (edge function public-signup), com a ação 'cadastro'. Depois de
 * qualquer resposta do servidor o token está gasto — por isso o `reset()`.
 *
 * O script vem de challenges.cloudflare.com, carregado uma vez e só nesta tela.
 * No PWA ele é NetworkOnly (vite.config.ts): token de verificação não se guarda.
 */
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

interface TurnstileRenderOptions {
  sitekey: string;
  action?: string;
  language?: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
}

interface TurnstileApi {
  render(el: HTMLElement, options: TurnstileRenderOptions): string;
  reset(widgetId?: string): void;
  remove(widgetId?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export const TURNSTILE_SCRIPT_SRC =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let carregamento: Promise<TurnstileApi> | null = null;

function carregarTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (carregamento) return carregamento;
  carregamento = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('Turnstile não carregou'));
    script.onerror = () => {
      carregamento = null;
      reject(new Error('Turnstile não carregou'));
    };
    document.head.appendChild(script);
  });
  return carregamento;
}

export interface TurnstileHandle {
  /** Descarta o token atual e pede outro (o anterior já foi gasto). */
  reset(): void;
}

interface Props {
  siteKey: string;
  action: string;
  /** Recebe o token, ou null quando ele expira/falha/é descartado. */
  onToken(token: string | null): void;
  /** Chamado se o script nem carregar (bloqueador, rede). */
  onLoadError?(): void;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(
  ({ siteKey, action, onToken, onLoadError }, ref) => {
    const alvo = useRef<HTMLDivElement>(null);
    const widgetId = useRef<string | null>(null);
    // As funções mudam a cada render; o widget guarda a primeira. O ref deixa
    // o widget sempre chamar a versão atual.
    const aoToken = useRef(onToken);
    aoToken.current = onToken;

    useImperativeHandle(ref, () => ({
      reset() {
        aoToken.current(null);
        if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      },
    }));

    useEffect(() => {
      let ativo = true;
      carregarTurnstile()
        .then((api) => {
          if (!ativo || !alvo.current || widgetId.current) return;
          widgetId.current = api.render(alvo.current, {
            sitekey: siteKey,
            action,
            language: 'pt-br',
            callback: (t) => aoToken.current(t),
            'expired-callback': () => aoToken.current(null),
            'error-callback': () => aoToken.current(null),
          });
        })
        .catch(() => {
          if (ativo) onLoadError?.();
        });
      return () => {
        ativo = false;
        if (window.turnstile && widgetId.current) window.turnstile.remove(widgetId.current);
        widgetId.current = null;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [siteKey, action]);

    return <div ref={alvo} data-testid="turnstile" className="flex justify-center" />;
  },
);

TurnstileWidget.displayName = 'TurnstileWidget';
