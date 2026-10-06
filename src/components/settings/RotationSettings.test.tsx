/**
 * Aba Configurações › Escala/Transferência — cartão "Distribuição de conversas
 * novas" (migração 20260915000001).
 *
 * O que a tela precisa garantir:
 *  - com menos de 2 atendentes ativos, UMA linha explica por quê e nada mais;
 *  - a soma tem de dar 100 para salvar, e a tela diz o que falta ou sobra SEM
 *    corrigir o que o gestor digitou;
 *  - 0 % aparece marcado como "fora do rodízio" (≠ removido);
 *  - salvar manda o objeto INTEIRO para a RPC (tudo ou nada) e as três chaves
 *    para updateTenantSettings, e só ao clicar;
 *  - o contador de responsáveis indisponíveis aparece com o total;
 *  - sem `store.admin` é só leitura; atendente nem vê os controles.
 * Quem faz valer a regra é o banco (docs/teste_rotacao_conversas.sql).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

const { updateTenantSettings, mutateAsync, refetch, estado } = vi.hoisted(() => ({
  updateTenantSettings: vi.fn(),
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  estado: {
    settings: {} as Record<string, unknown>,
    canEdit: true,
    canManage: true,
    loading: false,
    role: 'gestor',
    members: [] as Array<{ profile_id: string; first_name: string; last_name: string | null; avatar_url: null; role: string; percent: number }>,
    ineligible: [] as Array<{ profile_id: string; first_name: string; last_name: string | null; reason: string; n_conversations: number }>,
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'loja-1', settings: estado.settings },
    profile: { id: 'p-gestor', role: estado.role },
    loading: estado.loading,
    updateTenantSettings,
  }),
  useCan: () => estado.canEdit,
}));

vi.mock('@/hooks/useConversationRotation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useConversationRotation')>();
  return {
    ...actual,
    useRotationSettings: () => ({
      rotation_enabled: estado.settings.rotation_enabled === true,
      rotation_includes_gestor: estado.settings.rotation_includes_gestor === true,
      rotation_timing: estado.settings.rotation_timing === 'after_bot' ? 'after_bot' : 'immediate',
      isLoading: estado.loading,
    }),
    useConversationRotation: () => ({ data: estado.members, isLoading: false, refetch }),
    useSaveConversationRotation: () => ({ mutateAsync }),
    useIneligibleOwners: () => {
      const owners = estado.ineligible;
      return {
        owners,
        ownerIds: new Set(owners.map((o) => o.profile_id)),
        total: owners.reduce((acc, o) => acc + o.n_conversations, 0),
        canManage: estado.canManage,
        isLoading: false,
      };
    },
  };
});

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { RotationSettings } from './RotationSettings';

const ANA = { profile_id: 'p-ana', first_name: 'Ana', last_name: 'Lima', avatar_url: null, role: 'atendente', percent: 50 };
const BRUNO = { profile_id: 'p-bruno', first_name: 'Bruno', last_name: null, avatar_url: null, role: 'atendente', percent: 50 };

const abrir = () =>
  render(
    <MemoryRouter>
      <RotationSettings />
    </MemoryRouter>,
  );

const campo = (nome: RegExp) => screen.getByLabelText(nome, { selector: 'input' }) as HTMLInputElement;

beforeEach(() => {
  updateTenantSettings.mockReset().mockResolvedValue(undefined);
  mutateAsync.mockReset().mockResolvedValue(undefined);
  refetch.mockReset().mockResolvedValue(undefined);
  estado.settings = {};
  estado.canEdit = true;
  estado.canManage = true;
  estado.loading = false;
  estado.role = 'gestor';
  estado.members = [ANA, BRUNO];
  estado.ineligible = [];
});

describe('RotationSettings', () => {
  it('com um atendente só: uma linha explica por quê e não há controles', () => {
    estado.members = [ANA];
    abrir();
    expect(screen.getByText(/O rodízio aparece quando a Loja tem pelo menos 2 atendentes ativos\. Hoje ela tem 1/)).toBeInTheDocument();
    expect(screen.queryByRole('switch', { name: /Distribuir conversas novas/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /salvar distribuição/i })).not.toBeInTheDocument();
  });

  it('com dois atendentes: chaves desligadas por padrão, "Na primeira mensagem", 50/50 e soma 100', () => {
    abrir();
    expect(screen.getByRole('switch', { name: /Distribuir conversas novas automaticamente/i })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Gestor também recebe/i })).not.toBeChecked();
    expect(screen.getByLabelText('Na primeira mensagem')).toBeChecked();
    expect(campo(/Ana Lima/)).toHaveValue(50);
    expect(campo(/^Bruno$/)).toHaveValue(50);
    expect(screen.getByText('Soma: 100 %.')).toBeInTheDocument();
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salvar distribuição/i })).toBeDisabled();
  });

  it('soma abaixo de 100: diz quanto falta, não corrige e bloqueia o salvar', async () => {
    const user = userEvent.setup();
    abrir();
    await user.clear(campo(/Ana Lima/));
    await user.type(campo(/Ana Lima/), '40');
    expect(campo(/Ana Lima/)).toHaveValue(40);
    expect(campo(/^Bruno$/)).toHaveValue(50);
    expect(screen.getByText('Soma: 90 %. Faltam 10 para chegar a 100.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salvar distribuição/i })).toBeDisabled();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('soma acima de 100: diz quanto sobra e bloqueia o salvar', async () => {
    const user = userEvent.setup();
    abrir();
    await user.clear(campo(/^Bruno$/));
    await user.type(campo(/^Bruno$/), '70');
    expect(screen.getByText('Soma: 120 %. Passou 20 de 100.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /salvar distribuição/i })).toBeDisabled();
  });

  it('0 % é permitido e aparece marcado como fora do rodízio (a linha continua)', async () => {
    const user = userEvent.setup();
    abrir();
    await user.clear(campo(/^Bruno$/));
    await user.type(campo(/^Bruno$/), '0');
    await user.clear(campo(/Ana Lima/));
    await user.type(campo(/Ana Lima/), '100');
    expect(screen.getByText('Fora do rodízio (0 %)')).toBeInTheDocument();
    expect(screen.getByText('Soma: 100 %.')).toBeInTheDocument();
    const lista = screen.getByRole('list', { name: /Fatia de cada pessoa/i });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /salvar distribuição/i })).toBeEnabled();
  });

  it('salvar manda o mapa INTEIRO para a RPC, e nada é gravado antes do clique', async () => {
    const user = userEvent.setup();
    abrir();
    await user.clear(campo(/Ana Lima/));
    await user.type(campo(/Ana Lima/), '70');
    await user.clear(campo(/^Bruno$/));
    await user.type(campo(/^Bruno$/), '30');
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText('Você tem alterações não salvas.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /salvar distribuição/i }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    expect(mutateAsync).toHaveBeenCalledWith({ 'p-ana': 70, 'p-bruno': 30 });
    // Chaves não mudaram: settings não são reescritas à toa.
    expect(updateTenantSettings).not.toHaveBeenCalled();
  });

  it('ligar o rodízio e escolher "quando o chatbot terminar" grava as três chaves soltas', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('switch', { name: /Distribuir conversas novas automaticamente/i }));
    await user.click(screen.getByLabelText('Quando o chatbot terminar'));
    await user.click(screen.getByRole('button', { name: /salvar distribuição/i }));

    expect(updateTenantSettings).toHaveBeenCalledTimes(1);
    expect(updateTenantSettings).toHaveBeenCalledWith(
      { rotation_enabled: true, rotation_includes_gestor: false, rotation_timing: 'after_bot' },
      { silent: true },
    );
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('mudar a chave do gestor trava as fatias até salvar, e o salvar refaz a lista', async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(screen.getByRole('switch', { name: /Gestor também recebe/i }));
    expect(screen.getByRole('note')).toHaveTextContent(/Salve primeiro/);
    expect(campo(/Ana Lima/)).toBeDisabled();
    await user.click(screen.getByRole('button', { name: /salvar distribuição/i }));
    expect(updateTenantSettings).toHaveBeenCalledWith(
      expect.objectContaining({ rotation_includes_gestor: true }),
      { silent: true },
    );
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(refetch).toHaveBeenCalled();
  });

  it('"Dividir igualmente" refaz as fatias em divisão igual (34/33/33 com três)', async () => {
    const user = userEvent.setup();
    estado.members = [ANA, BRUNO, { ...BRUNO, profile_id: 'p-carla', first_name: 'Carla', percent: 0 }];
    abrir();
    await user.click(screen.getByRole('button', { name: /dividir igualmente/i }));
    expect(campo(/Ana Lima/)).toHaveValue(34);
    expect(campo(/^Bruno$/)).toHaveValue(33);
    expect(campo(/^Carla$/)).toHaveValue(33);
  });

  it('mostra o total de conversas com responsável indisponível e leva para a pílula', () => {
    estado.ineligible = [
      { profile_id: 'p-x', first_name: 'Xavier', last_name: null, reason: 'suspended', n_conversations: 6 },
      { profile_id: 'p-bruno', first_name: 'Bruno', last_name: null, reason: 'zero_percent', n_conversations: 2 },
    ];
    abrir();
    expect(screen.getByText('8 conversas estão com responsável indisponível.')).toBeInTheDocument();
    expect(screen.getByText(/Xavier \(suspenso\): 6 · Bruno \(em 0 %\): 2/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Responsável indisponível/i })).toHaveAttribute(
      'href',
      '/dashboard/conversations?quick=responsavel-indisponivel',
    );
  });

  it('reflete o que já está gravado na Loja', () => {
    estado.settings = { rotation_enabled: true, rotation_includes_gestor: true, rotation_timing: 'after_bot' };
    estado.members = [ANA, BRUNO, { profile_id: 'p-gestor', first_name: 'Gil', last_name: null, avatar_url: null, role: 'gestor', percent: 0 }];
    abrir();
    expect(screen.getByRole('switch', { name: /Distribuir conversas novas automaticamente/i })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Gestor também recebe/i })).toBeChecked();
    expect(screen.getByLabelText('Quando o chatbot terminar')).toBeChecked();
    expect(screen.getByText('Gestor')).toBeInTheDocument();
  });

  it('sem store.admin é só leitura: avisa, desabilita e esconde o Salvar', () => {
    estado.canEdit = false;
    abrir();
    expect(screen.getByText(/Apenas Gerente ou Gestor pode alterar/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Distribuir conversas novas automaticamente/i })).toBeDisabled();
    expect(campo(/Ana Lima/)).toBeDisabled();
    expect(screen.queryByRole('button', { name: /salvar distribuição/i })).not.toBeInTheDocument();
  });

  it('atendente não vê os controles: uma frase diz o que muda para ele', () => {
    estado.canEdit = false;
    estado.canManage = false;
    estado.role = 'atendente';
    abrir();
    expect(screen.getByText(/as conversas novas chegam já com você como responsável, sem aviso no sino/i)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });
});
