import { useState, type MouseEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

/** Quem está dentro de uma linha clicável não pode abrir a linha. */
const naoAbreALinha = (evento: MouseEvent) => evento.stopPropagation();

/**
 * O "+N" de uma lista curta: toque ou clique abre o resto. Sem `title`, que só
 * funciona com mouse e no iPhone não abria nada.
 *
 * Aberta, um fundo invisível cobre a tela: tocar fora só fecha, sem abrir a
 * conversa que está embaixo. Não troque por `<Popover modal>`: o modal desliga o
 * toque na página e, no celular, tocar fora deixa de fechar (medido no WebKit).
 * O fundo sai por portal, e evento de portal sobe pela árvore do React: por isso
 * ele e a janelinha param o clique. `data-alvo-expandido` dá 44 px de toque no
 * celular sem mudar o desenho.
 */
export function MaisComLista({
  quantidade,
  rotulo,
  titulo,
  children,
}: {
  quantidade: number;
  /** O que o leitor de tela lê: "Ver todas as 5 etiquetas". */
  rotulo: string;
  titulo: string;
  children: ReactNode;
}) {
  const [aberta, setAberta] = useState(false);

  return (
    <Popover open={aberta} onOpenChange={setAberta}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-alvo-expandido
          aria-label={rotulo}
          onClick={naoAbreALinha}
          className="flex-shrink-0 rounded-full border border-border px-1.5 text-[11px] font-medium leading-5 text-muted-foreground transition-colors hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          +{quantidade}
        </button>
      </PopoverTrigger>
      {aberta &&
        createPortal(
          <div
            aria-hidden
            className="fixed inset-0 z-40 cursor-pointer"
            onClick={(evento) => {
              evento.stopPropagation();
              setAberta(false);
            }}
          />,
          document.body,
        )}
      <PopoverContent
        align="start"
        className="w-auto max-w-[min(20rem,calc(100vw-2rem))] p-3"
        onClick={naoAbreALinha}
        // Quem fecha é o fundo: fechar antes faria o toque cair na conversa.
        onPointerDownOutside={(evento) => evento.preventDefault()}
      >
        <p className="mb-2 text-xs font-medium text-muted-foreground">{titulo}</p>
        <div className="flex flex-wrap items-center gap-1">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
