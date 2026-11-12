import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AnunciosConversas } from './AnunciosConversas';
import { lerResumo } from '@/lib/rastreamento/resumo';

vi.mock('@/components/shared/FeatureHelp', () => ({ FeatureHelp: () => null }));

const LOJA_A = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOJA_B = 'aaaaaaaa-0000-4000-8000-000000000003';

function resumo(todas: boolean) {
  return lerResumo({
    todas_lojas: todas,
    lojas: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', nome: 'Conta Exemplo', tipo: 'account' },
      { id: LOJA_A, nome: 'Loja Centro', tipo: 'store' },
      { id: LOJA_B, nome: 'Loja Praia', tipo: 'store' },
    ],
    totais: { conversas_anuncio: 5, novos: 4, voltaram: 1 },
    anuncios: [
      { tenant_id: LOJA_A, anuncio_id: '120000000000000001', titulo: 'Consulta de avaliação', conversas: 3, novos: 2, voltaram: 1 },
      { tenant_id: LOJA_B, anuncio_id: '120000000000000002', titulo: null, conversas: 2, novos: 2, voltaram: 0 },
    ],
    anuncios_por_dia: [
      { tenant_id: LOJA_A, dia: '2026-11-12', anuncio_id: '120000000000000001', conversas: 2, novos: 1, voltaram: 1 },
      { tenant_id: LOJA_A, dia: '2026-11-01', anuncio_id: '120000000000000001', conversas: 1, novos: 1, voltaram: 0 },
      { tenant_id: LOJA_B, dia: '2026-11-01', anuncio_id: '120000000000000002', conversas: 2, novos: 2, voltaram: 0 },
    ],
  });
}

describe('Conversas iniciadas por anúncio', () => {
  it('mostra o ID completo, novos e quem voltou, por anúncio', () => {
    render(<AnunciosConversas resumo={resumo(false)} />);
    expect(screen.getByText(/5 conversas no período: 4 de contatos novos e 1 de quem já era contato e voltou/)).toBeInTheDocument();
    const linha = screen.getByText('120000000000000001').closest('tr')!;
    expect(within(linha).getByText('Consulta de avaliação')).toBeInTheDocument();
    expect(within(linha).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      'Consulta de avaliação', '120000000000000001', '3', '2', '1',
    ]);
    expect(screen.queryByRole('columnheader', { name: 'Loja' })).toBeNull();
  });

  it('em Todas as Lojas cada linha diz a Loja', () => {
    render(<AnunciosConversas resumo={resumo(true)} />);
    expect(screen.getByRole('columnheader', { name: 'Loja' })).toBeInTheDocument();
    const linha = screen.getByText('120000000000000002').closest('tr')!;
    expect(within(linha).getByText('Loja Praia')).toBeInTheDocument();
    expect(within(linha).getByText('Anúncio 120000000000000002')).toBeInTheDocument();
  });

  it('"Por dia" mostra o dia de Brasília e repete o título do anúncio', async () => {
    render(<AnunciosConversas resumo={resumo(true)} />);
    await userEvent.click(screen.getByRole('tab', { name: 'Por dia' }));
    const linhas = screen.getAllByRole('row').slice(1);
    expect(linhas).toHaveLength(3);
    expect(within(linhas[0]!).getByText('12/11/2026')).toBeInTheDocument();
    expect(within(linhas[0]!).getByText('Consulta de avaliação')).toBeInTheDocument();
  });

  it('sem conversa de anúncio, diz isso', () => {
    render(<AnunciosConversas resumo={lerResumo({})} />);
    expect(screen.getByText('Nenhuma conversa de anúncio no período')).toBeInTheDocument();
  });
});
