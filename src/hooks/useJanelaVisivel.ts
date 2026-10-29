import { useEffect, useState } from 'react';

export interface JanelaVisivel {
  /** Altura do que se vê da página, em px (encolhe quando o teclado abre). */
  altura: number;
  /** Quanto o navegador deslocou a parte visível para baixo (teclado aberto no iPhone). */
  topo: number;
}

function ler(): JanelaVisivel {
  if (typeof window === 'undefined') return { altura: 0, topo: 0 };
  const vv = window.visualViewport;
  return {
    altura: Math.round(vv?.height ?? window.innerHeight),
    topo: Math.round(vv?.offsetTop ?? 0),
  };
}

/**
 * A parte da página que está de fato na tela do celular.
 *
 * No Safari do iPhone, abrir o teclado não encolhe a página: ele a empurra para
 * cima e o cabeçalho some atrás da barra de endereço. Uma tela presa a esta
 * medida (posição fixa, `top` e `height` daqui) fica sempre entre o topo
 * visível e o teclado, com o campo de digitar encostado embaixo.
 *
 * Só escuta enquanto `ativo`: fora disso devolve a última medida e não custa nada.
 */
export function useJanelaVisivel(ativo = true): JanelaVisivel {
  const [janela, setJanela] = useState<JanelaVisivel>(ler);

  useEffect(() => {
    if (!ativo) return;
    const vv = window.visualViewport;
    const atualizar = () => {
      const nova = ler();
      setJanela((velha) => (velha.altura === nova.altura && velha.topo === nova.topo ? velha : nova));
    };
    atualizar();
    vv?.addEventListener('resize', atualizar);
    vv?.addEventListener('scroll', atualizar);
    window.addEventListener('resize', atualizar);
    window.addEventListener('orientationchange', atualizar);
    return () => {
      vv?.removeEventListener('resize', atualizar);
      vv?.removeEventListener('scroll', atualizar);
      window.removeEventListener('resize', atualizar);
      window.removeEventListener('orientationchange', atualizar);
    };
  }, [ativo]);

  return janela;
}
