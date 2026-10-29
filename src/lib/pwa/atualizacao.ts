import { registerSW } from 'virtual:pwa-register';

/**
 * Versão nova do site chega sozinha, também no app instalado no celular.
 *
 * O cache offline (vite-plugin-pwa, `registerType: 'autoUpdate'`) só procurava
 * versão nova quando a página carregava do zero. O app na tela inicial do
 * iPhone quase nunca carrega do zero: ele volta de segundo plano. Resultado:
 * celulares presos numa versão de dias antes (em 10/2026 um cliente ainda via
 * textos trocados no lote 3).
 *
 * Aqui o registro do cache procura versão nova sempre que a tela volta a
 * aparecer (abrir o app, voltar para a aba). Achou, instala; quando ela assume,
 * a página recarrega uma vez (comportamento do `autoUpdate`). Só nessa volta, e
 * nunca por relógio, para não recarregar no meio de uma mensagem.
 */
export function ligarAtualizacaoAutomatica(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  registerSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      if (!registro) return;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
        registro.update().catch(() => {
          // Sem rede ou servidor fora: tenta de novo na próxima volta.
        });
      });
    },
  });
}
