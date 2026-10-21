/**
 * Janela "Novo Lead": valida antes de gravar, grava pela regra de
 * src/lib/funnel/novoLead.ts, avisa quando o telefone já era contato e NUNCA
 * diz "criado" sem o banco confirmar (até 2026-10-21 ela fingia salvar).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const ETAPAS = [
  { id: 'aaaaaaaa-0000-4000-8000-0000000000e1', name: 'Novo lead', order: 1 },
  { id: 'aaaaaaaa-0000-4000-8000-0000000000e2', name: 'Visita agendada', order: 2 },
];

const salvar = vi.fn();
const ok = vi.fn();
const erro = vi.fn();

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenantId: 'aaaaaaaa-0000-4000-8000-0000000000b1' }),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: () => ({ data: ETAPAS, isLoading: false }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
vi.mock('sonner', () => ({ toast: { success: (m: string) => ok(m), error: (m: string) => erro(m) } }));
vi.mock('@/lib/funnel/novoLead', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/funnel/novoLead')>();
  return { ...real, salvarNovoLead: (...a: unknown[]) => salvar(...a) };
});

import { NewLeadModal } from './NewLeadModal';
import { NovoLeadErro } from '@/lib/funnel/novoLead';

const onClose = vi.fn();

function montar(etapaInicialId?: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NewLeadModal isOpen onClose={onClose} etapaInicialId={etapaInicialId} />
    </QueryClientProvider>,
  );
}

async function preencher(nome: string, telefone: string) {
  if (nome) await userEvent.type(screen.getByLabelText('Nome *'), nome);
  if (telefone) await userEvent.type(screen.getByLabelText('Telefone *'), telefone);
}

beforeEach(() => {
  salvar.mockReset();
  ok.mockReset();
  erro.mockReset();
  onClose.mockReset();
});

describe('Novo Lead', () => {
  it('valida antes de gravar: sem nome e com telefone curto, nada vai ao banco', async () => {
    montar();
    await preencher('', '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Criar lead' }));
    expect(screen.getByText('Digite o nome do lead.')).toBeInTheDocument();
    expect(screen.getByText(/Telefone inválido/)).toBeInTheDocument();
    expect(salvar).not.toHaveBeenCalled();
  });

  it('grava na Loja em foco, na primeira etapa por padrão, e avisa', async () => {
    salvar.mockResolvedValue({ tipo: 'criado', contatoId: 'c', nome: 'Fulana Exemplo' });
    montar();
    await preencher('Fulana Exemplo', '(11) 99999-9999');
    await userEvent.click(screen.getByRole('button', { name: 'Criar lead' }));
    await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    expect(salvar.mock.calls[0]![1]).toEqual({
      tenantId: 'aaaaaaaa-0000-4000-8000-0000000000b1',
      nome: 'Fulana Exemplo',
      telefone: '(11) 99999-9999',
      etapaId: 'aaaaaaaa-0000-4000-8000-0000000000e1',
    });
    await waitFor(() => expect(ok).toHaveBeenCalledWith('Lead Fulana Exemplo criado em Novo lead.'));
    expect(onClose).toHaveBeenCalled();
  });

  it('"Adicionar Lead" da coluna já chega com a etapa dela', async () => {
    salvar.mockResolvedValue({ tipo: 'criado', contatoId: 'c', nome: 'Fulana' });
    montar('aaaaaaaa-0000-4000-8000-0000000000e2');
    await preencher('Fulana', '11999999999');
    await userEvent.click(screen.getByRole('button', { name: 'Criar lead' }));
    await waitFor(() => expect(salvar).toHaveBeenCalled());
    expect((salvar.mock.calls[0]![1] as { etapaId: string }).etapaId).toBe('aaaaaaaa-0000-4000-8000-0000000000e2');
    await waitFor(() => expect(ok).toHaveBeenCalledWith('Lead Fulana criado em Visita agendada.'));
  });

  it('telefone que já era contato: diz de quem é e que não duplicou', async () => {
    salvar.mockResolvedValue({ tipo: 'existente', contatoId: 'c', nome: 'Fulano Cadastrado' });
    montar();
    await preencher('Outro Nome', '11999999999');
    await userEvent.click(screen.getByRole('button', { name: 'Criar lead' }));
    await waitFor(() =>
      expect(ok).toHaveBeenCalledWith('Esse telefone já é de Fulano Cadastrado. O card foi para Novo lead, sem duplicar o contato.'),
    );
  });

  it('nunca finge: se o banco recusa, não há "criado", a janela fica aberta e o erro aparece', async () => {
    salvar.mockRejectedValue(new NovoLeadErro('Não deu para criar o lead. Tente de novo.'));
    montar();
    await preencher('Fulana', '11999999999');
    await userEvent.click(screen.getByRole('button', { name: 'Criar lead' }));
    await waitFor(() => expect(erro).toHaveBeenCalledWith('Não deu para criar o lead. Tente de novo.'));
    expect(ok).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nome *')).toHaveValue('Fulana');
  });
});
