import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { ResponsiveTable, type ResponsiveColumn } from './ResponsiveTable';

/**
 * Testa o PADRÃO, não cada tabela: o que a ResponsiveTable promete a quem a
 * usa (mesmas linhas e ações nos dois modos, colunas escondidas só na tabela,
 * estados de vazio/carregando/erro nos dois modos, clique na ação não abre a
 * linha). As sete tabelas do produto são só colunas em cima disto.
 */

const isMobile = vi.fn(() => false);
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => isMobile(),
}));

interface Pessoa {
  id: string;
  nome: string;
  email: string;
  cargo: string;
  cidade: string;
  acessos: number;
}

const ROWS: Pessoa[] = [
  { id: '1', nome: 'Ana Souza', email: 'ana@exemplo.com', cargo: 'Gestor', cidade: 'Recife', acessos: 12 },
  { id: '2', nome: 'Bruno Lima', email: 'bruno@exemplo.com', cargo: 'Atendente', cidade: 'Natal', acessos: 3 },
];

const COLUMNS: ResponsiveColumn<Pessoa>[] = [
  { key: 'nome', header: 'Nome', cell: (p) => p.nome, card: 'title' },
  { key: 'email', header: 'E-mail', cell: (p) => p.email, card: 'subtitle', hideBelow: '2xl' },
  { key: 'cargo', header: 'Cargo', cell: (p) => <span data-testid={`cargo-${p.id}`}>{p.cargo}</span>, card: 'badge' },
  { key: 'cidade', header: 'Cidade', cell: (p) => p.cidade },
  { key: 'acessos', header: 'Acessos', cell: (p) => p.acessos, card: 'hidden' },
];

beforeEach(() => {
  isMobile.mockReturnValue(false);
});

describe('ResponsiveTable — escolha do modo', () => {
  it('acima de md renderiza uma <table>; abaixo, uma lista de cartões', () => {
    const { unmount } = render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} />);
    expect(screen.getByRole('table')).toHaveAttribute('data-responsive-table', 'table');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    unmount();

    isMobile.mockReturnValue(true);
    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} />);
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('list')).toHaveAttribute('data-responsive-table', 'cards');
  });

  it('`mode` força o modo, ignorando a largura', () => {
    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} mode="cards" />);
    expect(screen.getByRole('list')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('ResponsiveTable — as mesmas linhas nos dois modos', () => {
  it('renderiza uma linha por item, na mesma ordem, na tabela e nos cartões', () => {
    const { unmount } = render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} mode="table" />);
    const linhas = screen.getAllByRole('row').slice(1); // sem o cabeçalho
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toHaveTextContent('Ana Souza');
    expect(linhas[1]).toHaveTextContent('Bruno Lima');
    unmount();

    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} mode="cards" />);
    const cartoes = screen.getAllByRole('listitem');
    expect(cartoes).toHaveLength(2);
    expect(cartoes[0]).toHaveTextContent('Ana Souza');
    expect(cartoes[1]).toHaveTextContent('Bruno Lima');
  });

  it('a coluna com hideBelow some SÓ na tabela; no cartão o valor continua', () => {
    const { unmount } = render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} mode="table" />);
    const cabecalho = screen.getByRole('columnheader', { name: 'E-mail' });
    expect(cabecalho.className).toContain('hidden');
    expect(cabecalho.className).toContain('2xl:table-cell');
    unmount();

    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} mode="cards" />);
    const primeiro = screen.getAllByRole('listitem')[0]!;
    expect(primeiro).toHaveTextContent('ana@exemplo.com');
    expect(primeiro.className).not.toContain('hidden');
  });
});

describe('ResponsiveTable — o que vai onde no cartão', () => {
  it("title lidera, subtitle segue, badge vira chip, field vira rótulo/valor e hidden não aparece", () => {
    render(<ResponsiveTable columns={COLUMNS} rows={[ROWS[0]!]} rowKey={(p) => p.id} mode="cards" />);
    const cartao = screen.getByRole('listitem');

    // Ordem visual: o título vem antes do subtítulo, que vem antes dos campos.
    const texto = cartao.textContent ?? '';
    expect(texto.indexOf('Ana Souza')).toBeLessThan(texto.indexOf('ana@exemplo.com'));
    expect(texto.indexOf('ana@exemplo.com')).toBeLessThan(texto.indexOf('Cidade'));

    // Campo: rótulo (dt) + valor (dd).
    expect(within(cartao).getByRole('term')).toHaveTextContent('Cidade');
    expect(within(cartao).getByRole('definition')).toHaveTextContent('Recife');

    // Badge não ganha rótulo.
    expect(within(cartao).getByTestId('cargo-1')).toBeInTheDocument();
    expect(within(cartao).queryByText('Cargo')).not.toBeInTheDocument();

    // Hidden fica de fora do cartão (vive no diálogo de detalhes).
    expect(cartao).not.toHaveTextContent('Acessos');
    expect(cartao).not.toHaveTextContent('12');
  });

  it('cardCell substitui a célula só no cartão; cardLabel substitui o cabeçalho como rótulo', () => {
    const colunas: ResponsiveColumn<Pessoa>[] = [
      { key: 'nome', header: 'Nome', cell: (p) => p.nome, card: 'title', cardCell: (p) => `Sra. ${p.nome}` },
      { key: 'cidade', header: '', cardLabel: 'Onde mora', cell: (p) => p.cidade },
    ];
    const { unmount } = render(<ResponsiveTable columns={colunas} rows={[ROWS[0]!]} rowKey={(p) => p.id} mode="table" />);
    expect(screen.getByRole('table')).toHaveTextContent('Ana Souza');
    expect(screen.getByRole('table')).not.toHaveTextContent('Sra.');
    unmount();

    render(<ResponsiveTable columns={colunas} rows={[ROWS[0]!]} rowKey={(p) => p.id} mode="cards" />);
    expect(screen.getByRole('listitem')).toHaveTextContent('Sra. Ana Souza');
    expect(screen.getByRole('term')).toHaveTextContent('Onde mora');
  });
});

describe('ResponsiveTable — ações da linha', () => {
  const acoes = (p: Pessoa) => <button type="button">Editar {p.nome}</button>;

  it('as ações existem nos dois modos, uma por linha', () => {
    const { unmount } = render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} actions={acoes} mode="table" />);
    expect(screen.getAllByRole('button', { name: /^Editar/ })).toHaveLength(2);
    // A coluna de ações é sticky à direita (é o que a mantém alcançável quando a tabela rola).
    const celula = screen.getByRole('button', { name: 'Editar Ana Souza' }).closest('td');
    expect(celula?.className).toContain('sticky');
    unmount();

    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} actions={acoes} mode="cards" />);
    expect(screen.getAllByRole('button', { name: /^Editar/ })).toHaveLength(2);
    expect(screen.getAllByRole('listitem')[0]!.querySelector('[data-responsive-actions]')).not.toBeNull();
  });

  it('clicar numa ação não dispara onRowClick, nos dois modos; clicar no resto da linha dispara', () => {
    for (const mode of ['table', 'cards'] as const) {
      const onRowClick = vi.fn();
      const { unmount } = render(
        <ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} actions={acoes} onRowClick={onRowClick} mode={mode} />,
      );
      fireEvent.click(screen.getByRole('button', { name: 'Editar Ana Souza' }));
      expect(onRowClick).not.toHaveBeenCalled();
      fireEvent.click(screen.getByText('Bruno Lima'));
      expect(onRowClick).toHaveBeenCalledWith(ROWS[1]);
      unmount();
    }
  });
});

describe('ResponsiveTable — estados', () => {
  it.each(['table', 'cards'] as const)('%s: carregando mostra esqueletos e nenhuma linha', (mode) => {
    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} loading loadingRows={4} mode={mode} />);
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
    const container = mode === 'table' ? screen.getByRole('table') : screen.getByRole('list');
    expect(container.querySelectorAll('.animate-pulse').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('[data-responsive-row]')).toHaveLength(0);
  });

  it.each(['table', 'cards'] as const)('%s: vazio mostra a mensagem de vazio', (mode) => {
    render(<ResponsiveTable columns={COLUMNS} rows={[]} rowKey={(p) => p.id} empty="Ninguém por aqui" mode={mode} />);
    expect(screen.getByText('Ninguém por aqui')).toBeInTheDocument();
  });

  it.each(['table', 'cards'] as const)('%s: erro vence as linhas', (mode) => {
    render(<ResponsiveTable columns={COLUMNS} rows={ROWS} rowKey={(p) => p.id} error="Deu ruim" mode={mode} />);
    expect(screen.getByText('Deu ruim')).toBeInTheDocument();
    expect(screen.queryByText('Ana Souza')).not.toBeInTheDocument();
  });
});
