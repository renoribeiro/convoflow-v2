import { env } from '@/lib/env';

/**
 * Rewardful (programa de afiliados externo) — rastreamento client-side.
 *
 * `initRewardful()` injeta o script de rastreamento SÓ quando a chave pública
 * está configurada (`VITE_REWARDFUL_API_KEY`). O `rw.js` lê o parâmetro `?via=`
 * da URL, grava o cookie de indicação e expõe `window.Rewardful.referral`.
 * Esse referral é enviado ao `create-checkout-session` e vira o
 * `client_reference_id` da sessão de Stripe Checkout (é assim que o Rewardful
 * atribui a comissão). A chave é client-side, pode ser exposta.
 *
 * Ref.: https://developers.rewardful.com/javascript-api/overview
 */
export function initRewardful(): void {
  const apiKey = env.get('REWARDFUL_API_KEY');
  if (!apiKey) return; // sem conta Rewardful configurada → não carrega nada
  if (typeof document === 'undefined') return;
  if (document.querySelector('script[data-rewardful]')) return; // já injetado

  // Fila de comandos rewardful() (snippet oficial).
  (function (w: any, r: string) {
    w._rwq = r;
    w[r] = w[r] || function () {
      (w[r].q = w[r].q || []).push(arguments);
    };
  })(window, 'rewardful');

  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://r.wdfl.co/rw.js';
  script.setAttribute('data-rewardful', apiKey);
  document.head.appendChild(script);
}

/**
 * Retorna o referral atual do Rewardful, ou `undefined` se não houver
 * indicação (visitante direto) ou o script ainda não tiver carregado.
 */
export function getRewardfulReferral(): string | undefined {
  const ref = (window as unknown as { Rewardful?: { referral?: string } }).Rewardful?.referral;
  return ref && typeof ref === 'string' && ref.length > 0 ? ref : undefined;
}
