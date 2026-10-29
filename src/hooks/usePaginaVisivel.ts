import { useEffect, useState } from 'react';

/**
 * A aba do ConvoFlow está à vista? Outra aba na frente ou janela minimizada =
 * não. É o que impede a conversa aberta de mandar "lida" ao cliente enquanto
 * ninguém está olhando (lote 6d, decisão D4).
 */
export function usePaginaVisivel(): boolean {
  const ler = () => typeof document === 'undefined' || document.visibilityState !== 'hidden';
  const [visivel, setVisivel] = useState(ler);
  useEffect(() => {
    const aoMudar = () => setVisivel(ler());
    document.addEventListener('visibilitychange', aoMudar);
    return () => document.removeEventListener('visibilitychange', aoMudar);
  }, []);
  return visivel;
}
