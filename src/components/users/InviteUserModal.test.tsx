/**
 * Convite de usuário.
 *
 * O campo de vínculo era um texto livre pedindo "UUID do tenant", digitado à
 * mão, sem lista e sem dizer que tinha de ser uma LOJA. Em 2026-08-18 um
 * gerente colou ali o id da CONTA — que é o que a tela sugeria por padrão — e
 * levou um 403 que ainda por cima chegou ilegível. Estes testes travam o
 * comportamento por cargo.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { mockMutateAsync } = vi.hoisted(() => ({ mockMutateAsync: vi.fn() }));

let callerRole: string | null = 'gerente';
let tenant: { id: string; name: string } | null = null;
let stores: Array<{ id: string; name: string }> = [];

vi.mock('@/contexts/TenantContext', () => ({
  useRole: () => callerRole,
  useTenant: () => ({ tenant }),
}));

vi.mock('@/hooks/useMyStores', () => ({
  useMyStores: () => ({ stores, isLoading: false }),
}));

vi.mock('@/hooks/users/useManageUser', () => ({
  useInviteUser: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

type VagasFake = { store_id: string; usados: number; limite: number; pendentes: number; livres: number };
let vagas: Record<string, VagasFake> = {};
vi.mock('@/hooks/useStoreAttendantSeats', () => ({
  useStoreAttendantSeats: () => ({ seats: Object.values(vagas), byStore: vagas, isLoading: false, error: null }),
}));
const vagasDe = (id: string, usados: number, pendentes = 0, limite = 2): VagasFake => ({
  store_id: id, usados, limite, pendentes, livres: Math.max(limite - usados, 0),
});

vi.mock('@/components/admin/RoleDescriptionCard', () => ({
  RoleDescriptionCard: () => null,
}));

import { InviteUserModal } from './InviteUserModal';

const CONTA = 'aaaaaaaa-conta';
const LOJA_A = 'bbbbbbbb-loja-a';
const LOJA_B = 'aaaa1111-loja-b';

/** Payload do primeiro convite disparado. Falha o teste se não houve nenhum. */
function payloadEnviado(): Record<string, unknown> {
  const chamada = mockMutateAsync.mock.calls[0];
  if (!chamada) throw new Error('nenhum convite foi enviado');
  return chamada[0] as Record<string, unknown>;
}

function abrir(defaultTenantId?: string | null) {
  return render(
    <InviteUserModal open onOpenChange={() => {}} defaultTenantId={defaultTenantId} />,
  );
}

// O Select do Radix usa captura de ponteiro, que o jsdom não tem.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => {};
}

/** Troca a Função no seletor (Radix Select). */
async function escolherFuncao(rotulo: string) {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText('Função'));
  await user.click(await screen.findByRole('option', { name: rotulo }));
}

const preencherBasico = () => {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Sobrenome'), { target: { value: 'Souza' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@x.example' } });
};

beforeEach(() => {
  vi.clearAllMocks();
  mockMutateAsync.mockResolvedValue({});
  callerRole = 'gerente';
  tenant = { id: CONTA, name: 'Conta Teste' };
  stores = [
    { id: LOJA_A, name: 'Loja Teste' },
    { id: LOJA_B, name: 'Filial Norte' },
  ];
  vagas = {};
});

describe('Loja cheia (2 atendentes por Loja, 2026-10-09)', () => {
  const AVISO = 'Esta Loja já tem 2 de 2 atendentes. Para ter mais, fale com o ConvoFlow: contato@convoflow.com.br';

  it('gestor com a Loja cheia: aviso com o contato e o envio travado', () => {
    callerRole = 'gestor';
    tenant = { id: LOJA_A, name: 'Loja Teste' };
    vagas = { [LOJA_A]: vagasDe(LOJA_A, 2) };
    abrir();
    preencherBasico();
    expect(screen.getByRole('alert')).toHaveTextContent(AVISO);
    expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeDisabled();
  });

  it('com convite pendente, o aviso diz como liberar a vaga', () => {
    callerRole = 'gestor';
    tenant = { id: LOJA_A, name: 'Loja Teste' };
    vagas = { [LOJA_A]: vagasDe(LOJA_A, 2, 1) };
    abrir();
    expect(screen.getByRole('alert')).toHaveTextContent('Convite pendente também ocupa vaga');
  });

  it('gestor com vaga: mostra o contador e deixa enviar', async () => {
    callerRole = 'gestor';
    tenant = { id: LOJA_A, name: 'Loja Teste' };
    vagas = { [LOJA_A]: vagasDe(LOJA_A, 1) };
    abrir();
    preencherBasico();
    expect(screen.getByText('Atendentes: 1 de 2')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enviar convite' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
  });

  it('gerente convidando Gestor: a vaga de atendente não importa', () => {
    vagas = { [LOJA_A]: vagasDe(LOJA_A, 2), [LOJA_B]: vagasDe(LOJA_B, 0) };
    abrir(LOJA_A);
    preencherBasico();
    // O gerente começa em Gestor, e o gestor não ocupa vaga de atendente.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar convite' })).not.toBeDisabled();
  });

  it('gerente convidando Atendente: a Loja mostra as vagas livres e a cheia trava', async () => {
    vagas = { [LOJA_A]: vagasDe(LOJA_A, 2), [LOJA_B]: vagasDe(LOJA_B, 1) };
    abrir(LOJA_A);
    preencherBasico();
    await escolherFuncao('Atendente');
    expect(screen.getByText('Loja Teste — sem vaga de atendente')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(AVISO);
    expect(screen.getByRole('button', { name: 'Enviar convite' })).toBeDisabled();
  });

  it('gerente convidando Atendente para uma Loja com vaga', async () => {
    vagas = { [LOJA_A]: vagasDe(LOJA_A, 2), [LOJA_B]: vagasDe(LOJA_B, 1) };
    abrir(LOJA_B);
    preencherBasico();
    await escolherFuncao('Atendente');
    expect(screen.getByText('Filial Norte — 1 vaga livre')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar convite' })).not.toBeDisabled();
  });

  it('sem a leitura das vagas, nada é travado (quem decide é o servidor)', () => {
    callerRole = 'gestor';
    tenant = { id: LOJA_A, name: 'Loja Teste' };
    vagas = {};
    abrir();
    preencherBasico();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar convite' })).not.toBeDisabled();
  });
});

describe('nunca mais um campo de UUID', () => {
  it('não existe campo pedindo Tenant ID em cargo nenhum', () => {
    for (const cargo of ['gerente', 'gestor', 'superadmin']) {
      callerRole = cargo;
      const { unmount } = abrir(LOJA_A);
      expect(screen.queryByLabelText(/tenant id/i)).toBeNull();
      expect(screen.queryByPlaceholderText(/uuid/i)).toBeNull();
      unmount();
    }
  });
});

describe('gerente', () => {
  it('escolhe entre as Lojas da Conta, por nome', () => {
    abrir(LOJA_A);
    expect(screen.getByLabelText('Loja')).toBeInTheDocument();
    expect(screen.getByText('Loja Teste')).toBeInTheDocument();
  });

  it('manda a Loja em foco, não a Conta', async () => {
    abrir(LOJA_A);
    preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(payloadEnviado().tenantId).toBe(LOJA_A);
    // O id da CONTA era exatamente o valor errado que a tela sugeria antes.
    expect(payloadEnviado().tenantId).not.toBe(CONTA);
  });

  it('sem Loja escolhida, não deixa enviar', () => {
    abrir(null);
    preencherBasico();
    expect(screen.getByRole('button', { name: /enviar convite/i })).toBeDisabled();
  });

  it('Conta sem nenhuma Loja explica o que fazer em vez de travar em silêncio', () => {
    stores = [];
    abrir(null);
    expect(screen.getByText(/Crie uma em "Nova Loja"/i)).toBeInTheDocument();
  });

  it('convida para /definir-senha, não para o dashboard', async () => {
    abrir(LOJA_A);
    preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(payloadEnviado().redirectTo).toContain('/definir-senha');
  });
});

describe('gestor', () => {
  beforeEach(() => {
    callerRole = 'gestor';
    tenant = { id: LOJA_A, name: 'Loja Teste' };
    stores = [];
  });

  it('não escolhe Loja: mostra a dele e pronto', () => {
    abrir(LOJA_A);
    expect(screen.queryByLabelText('Loja')).toBeNull();
    expect(screen.getByText(/Entra na sua Loja/i)).toBeInTheDocument();
    expect(screen.getByText('Loja Teste')).toBeInTheDocument();
  });

  it('só pode convidar Atendente', () => {
    abrir(LOJA_A);
    expect(screen.getByText('Atendente')).toBeInTheDocument();
    expect(screen.queryByText('Gerente')).toBeNull();
  });

  it('manda a própria Loja', async () => {
    abrir(LOJA_A);
    preencherBasico();
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const payload = payloadEnviado();
    expect(payload.tenantId).toBe(LOJA_A);
    expect(payload.role).toBe('atendente');
  });
});

describe('superadmin convidando gerente', () => {
  beforeEach(() => {
    callerRole = 'superadmin';
    tenant = null;
    stores = [];
  });

  it('pede o nome da Conta, não uma Loja', () => {
    abrir(null);
    expect(screen.getByLabelText(/nome da conta/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Loja')).toBeNull();
  });

  it('sem o nome da Conta não deixa enviar', () => {
    abrir(null);
    preencherBasico();
    expect(screen.getByRole('button', { name: /enviar convite/i })).toBeDisabled();
  });

  it('manda newTenantName — sem ele o servidor recusa o convite', async () => {
    abrir(null);
    preencherBasico();
    fireEvent.change(screen.getByLabelText(/nome da conta/i), {
      target: { value: 'Imobiliária Silva' },
    });
    fireEvent.click(screen.getByRole('button', { name: /enviar convite/i }));

    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    const payload = payloadEnviado();
    expect(payload.newTenantName).toBe('Imobiliária Silva');
    expect(payload.role).toBe('gerente');
    expect(payload.tenantId).toBeNull();
  });
});
