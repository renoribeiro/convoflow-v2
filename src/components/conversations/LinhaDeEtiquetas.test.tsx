import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { LinhaDeEtiquetas } from './LinhaDeEtiquetas';

/**
 * A etiqueta tem linha própria na lista de Conversas. Em 2026-10-28 (parte 6a)
 * ela foi para o fim da linha de selos e sumia no "+N", que só mostrava os nomes
 * com o mouse: no iPhone a cliente deixou de ver as etiquetas que tinha colocado.
 */

const etiqueta = (id: number, name: string) => ({ id: `tag-${id}`, name, color: '#22c55e' });
const CINCO = [
  etiqueta(1, 'Retomar em alguns dias'),
  etiqueta(2, 'Agendado'),
  etiqueta(3, 'Esperando dados'),
  etiqueta(4, 'Fora do perfil'),
  etiqueta(5, 'Finalizado'),
];

const naLinha = (container: HTMLElement) =>
  within(container.querySelector('[data-linha-de-etiquetas]') as HTMLElement);

describe('LinhaDeEtiquetas', () => {
  it('sem etiqueta não desenha nada: a linha da conversa fica da mesma altura', () => {
    const { container } = render(<LinhaDeEtiquetas tags={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('uma etiqueta: o nome, sem "+N"', () => {
    const { container } = render(<LinhaDeEtiquetas tags={CINCO.slice(0, 1)} />);
    expect(naLinha(container).getByText('Retomar em alguns dias')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('duas etiquetas: os dois nomes, sem "+N"', () => {
    const { container } = render(<LinhaDeEtiquetas tags={CINCO.slice(0, 2)} />);
    expect(naLinha(container).getByText('Agendado')).toBeInTheDocument();
    expect(naLinha(container).getByText('Retomar em alguns dias')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('cinco etiquetas: duas por ordem de nome e "+3"', () => {
    const { container } = render(<LinhaDeEtiquetas tags={CINCO} />);
    const linha = naLinha(container);
    expect(linha.getByText('Agendado')).toBeInTheDocument();
    expect(linha.getByText('Esperando dados')).toBeInTheDocument();
    expect(linha.queryByText('Finalizado')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver todas as 5 etiquetas deste contato' })).toHaveTextContent('+3');
  });

  it('o "+N" abre a lista com todas, sem depender de mouse parado em cima', async () => {
    render(<LinhaDeEtiquetas tags={CINCO} />);
    const mais = screen.getByRole('button', { name: /Ver todas/ });
    expect(mais).not.toHaveAttribute('title');
    fireEvent.click(mais);

    const janela = await screen.findByRole('dialog');
    for (const { name } of CINCO) expect(within(janela).getByText(name)).toBeInTheDocument();
  });

  it('tocar no "+N" ou na lista não abre a conversa que está por trás', async () => {
    const abrirConversa = vi.fn();
    render(
      <div onClick={abrirConversa}>
        <LinhaDeEtiquetas tags={CINCO} />
      </div>,
    );
    fireEvent.click(screen.getByRole('button', { name: /Ver todas/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByText('Finalizado'));
    expect(abrirConversa).not.toHaveBeenCalled();
  });

  it('nome comprido é cortado com reticências, e a etiqueta curta fica inteira', () => {
    const { container } = render(<LinhaDeEtiquetas tags={CINCO.slice(0, 2)} />);
    expect(naLinha(container).getByText('Retomar em alguns dias')).toHaveClass('truncate');
    const caixa = (nome: string) => naLinha(container).getByText(nome).parentElement?.parentElement;
    expect(caixa('Agendado')).toHaveClass('flex-shrink-0');
    expect(caixa('Retomar em alguns dias')).toHaveClass('min-w-0');
  });
});
