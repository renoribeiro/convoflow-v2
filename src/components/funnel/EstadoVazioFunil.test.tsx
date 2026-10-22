/**
 * Funil vazio, caso a caso: Gerente na Conta (uma Loja, várias, nenhuma),
 * Gestor/Gerente numa Loja sem etapa (criar agora ou usar as prontas, uma vez
 * só) e Atendente (pede a quem pode, sem botão).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useFunilPendente } from '@/lib/funnel/funilPendente';

const LOJA_A = { id: 'aaaaaaaa-0000-4000-8000-00000000000a', name: 'Loja Centro' };
const LOJA_B = { id: 'aaaaaaaa-0000-4000-8000-00000000000b', name: 'Loja Praia' };

let lojas = [LOJA_A];
const setActiveTenant = vi.fn();
const rpc = vi.fn();
const toastOk = vi.fn();
const toastInfo = vi.fn();
const toastErro = vi.fn();

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantId: 'aaaaaaaa-0000-4000-8000-0000000000b1', setActiveTenant }),
}));
vi.mock('@/hooks/useMyStores', () => ({ useMyStores: () => ({ stores: lojas, isLoading: false }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('sonner', () => ({
  toast: {
    success: (m: string) => toastOk(m),
    info: (m: string) => toastInfo(m),
    error: (m: string) => toastErro(m),
  },
}));

import { EstadoVazioFunil, TEXTO_ATENDENTE_SEM_ETAPAS } from './EstadoVazioFunil';

function montar(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  lojas = [LOJA_A];
  setActiveTenant.mockReset();
  rpc.mockReset();
  toastOk.mockReset();
  toastInfo.mockReset();
  toastErro.mockReset();
  useFunilPendente.getState().limpar();
});

describe('Gerente com a Conta em foco', () => {
  it('uma Loja só: um clique entra nela, avisa e pede para reabrir o Novo Lead', async () => {
    montar(<EstadoVazioFunil situacao="conta" acaoDepoisDaLoja="novo-lead" />);
    expect(screen.getByText(/As etapas do funil ficam em cada Loja/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Abrir a Loja Loja Centro' }));
    expect(setActiveTenant).toHaveBeenCalledWith(LOJA_A.id);
    expect(toastInfo).toHaveBeenCalledWith('Abrimos a Loja Loja Centro.');
    expect(useFunilPendente.getState().pendente?.acao).toBe('novo-lead');
  });

  it('várias Lojas: um botão por Loja', async () => {
    lojas = [LOJA_A, LOJA_B];
    montar(<EstadoVazioFunil situacao="conta" acaoDepoisDaLoja="configurar-etapas" />);
    await userEvent.click(screen.getByRole('button', { name: 'Loja Praia' }));
    expect(setActiveTenant).toHaveBeenCalledWith(LOJA_B.id);
    expect(useFunilPendente.getState().pendente?.acao).toBe('configurar-etapas');
  });

  it('nenhuma Loja: leva a Equipe para criar a primeira', () => {
    lojas = [];
    montar(<EstadoVazioFunil situacao="conta" />);
    expect(screen.getByRole('link', { name: 'Criar Loja' })).toHaveAttribute('href', '/dashboard/team');
  });

  it('sem botão de criar etapa na Conta', () => {
    montar(<EstadoVazioFunil situacao="conta" onConfigurarEtapas={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Usar etapas prontas|Criar etapas agora/ })).toBeNull();
  });
});

describe('Gestor ou Gerente numa Loja sem etapa', () => {
  it('"Criar etapas agora" abre Configurar Estágios', async () => {
    const onConfigurarEtapas = vi.fn();
    montar(<EstadoVazioFunil situacao="sem-etapas-configura" onConfigurarEtapas={onConfigurarEtapas} />);
    await userEvent.click(screen.getByRole('button', { name: 'Criar etapas agora' }));
    expect(onConfigurarEtapas).toHaveBeenCalled();
  });

  it('"Usar etapas prontas" cria uma vez só, mesmo com dois cliques seguidos', async () => {
    let liberar: (v: { data: number; error: null }) => void = () => {};
    rpc.mockImplementation(() => new Promise((r) => { liberar = r; }));
    montar(<EstadoVazioFunil situacao="sem-etapas-configura" onConfigurarEtapas={vi.fn()} />);
    const botao = screen.getByRole('button', { name: 'Usar etapas prontas' });
    await userEvent.dblClick(botao);
    await userEvent.click(botao);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('funnel_criar_etapas_padrao', { p_tenant_id: 'aaaaaaaa-0000-4000-8000-0000000000b1' });
    liberar({ data: 5, error: null });
    await waitFor(() =>
      expect(toastOk).toHaveBeenCalledWith('Etapas criadas: Novo contato, Em atendimento, Proposta, Fechado e Perdido.'),
    );
  });

  it('se o funil já tinha etapas (outra pessoa criou), avisa sem duplicar', async () => {
    rpc.mockResolvedValue({ data: 0, error: null });
    montar(<EstadoVazioFunil situacao="sem-etapas-configura" />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar etapas prontas' }));
    await waitFor(() => expect(toastInfo).toHaveBeenCalledWith('Este funil já tinha etapas.'));
    expect(toastOk).not.toHaveBeenCalled();
  });

  it('recusa do banco aparece em português', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'Só o Gestor ou o Gerente cria as etapas do funil.' } });
    montar(<EstadoVazioFunil situacao="sem-etapas-configura" />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar etapas prontas' }));
    await waitFor(() => expect(toastErro).toHaveBeenCalledWith('Só o Gestor ou o Gerente cria as etapas do funil.'));
  });
});

describe('Atendente numa Loja sem etapa', () => {
  it('só o aviso para pedir ao Gestor ou ao Gerente, sem botão', () => {
    montar(<EstadoVazioFunil situacao="sem-etapas-atendente" onConfigurarEtapas={vi.fn()} />);
    expect(screen.getByText(TEXTO_ATENDENTE_SEM_ETAPAS)).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
