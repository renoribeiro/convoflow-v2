/**
 * Aba Configurações › Escala/Transferência.
 *
 * O que a tela precisa garantir:
 *  - grava as DUAS chaves soltas em tenants.settings, pelo updateTenantSettings
 *    (merge raso via set_tenant_settings), e só ao clicar em Salvar;
 *  - sem `store.admin` é só leitura (atendente vê, não altera);
 *  - as três opções trazem a explicação em uma linha.
 * Quem faz valer a restrição é o banco (docs/teste_visibilidade_conversas.sql).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { updateTenantSettings, estado } = vi.hoisted(() => ({
  updateTenantSettings: vi.fn(),
  estado: {
    settings: {} as Record<string, unknown>,
    canEdit: true,
    loading: false,
    role: 'gestor',
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'loja-1', settings: estado.settings },
    profile: { id: 'p1', role: estado.role },
    loading: estado.loading,
    updateTenantSettings,
  }),
  useCan: () => estado.canEdit,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { VisibilitySettings } from './VisibilitySettings';
import { ATENDENTE_VISIBILITY_LABELS } from '@/hooks/useConversationVisibilityConfig';

beforeEach(() => {
  updateTenantSettings.mockReset().mockResolvedValue(undefined);
  estado.settings = {};
  estado.canEdit = true;
  estado.loading = false;
  estado.role = 'gestor';
});

describe('VisibilitySettings', () => {
  it('sem nada gravado mostra "Todas as conversas" e transferência ligada — o padrão é o comportamento de hoje', () => {
    render(<VisibilitySettings />);
    expect(screen.getByLabelText(ATENDENTE_VISIBILITY_LABELS.all.title)).toBeChecked();
    expect(screen.getByRole('switch', { name: /pode transferir/i })).toBeChecked();
    expect(screen.getByText('Tudo salvo.')).toBeInTheDocument();
  });

  it('cada opção traz a explicação em uma linha do que o atendente vê', () => {
    render(<VisibilitySettings />);
    for (const value of ['all', 'unassigned', 'own'] as const) {
      expect(screen.getByText(ATENDENTE_VISIBILITY_LABELS[value].explanation)).toBeInTheDocument();
    }
  });

  it('não grava nada antes de Salvar, e grava as duas chaves soltas em settings', async () => {
    const user = userEvent.setup();
    render(<VisibilitySettings />);

    await user.click(screen.getByLabelText(ATENDENTE_VISIBILITY_LABELS.own.title));
    await user.click(screen.getByRole('switch', { name: /pode transferir/i }));
    expect(updateTenantSettings).not.toHaveBeenCalled();
    expect(screen.getByText('Você tem alterações não salvas.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /salvar alterações/i }));

    expect(updateTenantSettings).toHaveBeenCalledTimes(1);
    expect(updateTenantSettings).toHaveBeenCalledWith(
      { atendente_visibility: 'own', atendente_can_transfer: false },
      { silent: true },
    );
  });

  it('reflete o que já está gravado na Loja', () => {
    estado.settings = { atendente_visibility: 'unassigned', atendente_can_transfer: false };
    render(<VisibilitySettings />);
    expect(screen.getByLabelText(ATENDENTE_VISIBILITY_LABELS.unassigned.title)).toBeChecked();
    expect(screen.getByRole('switch', { name: /pode transferir/i })).not.toBeChecked();
  });

  it('sem store.admin é só leitura: avisa, desabilita os controles e esconde o Salvar', () => {
    estado.canEdit = false;
    estado.role = 'atendente';
    render(<VisibilitySettings />);
    expect(screen.getByText(/Apenas Gerente ou Gestor pode alterar/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /pode transferir/i })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /salvar alterações/i })).not.toBeInTheDocument();
  });

  it('valor desconhecido em settings cai no padrão em vez de quebrar a tela', () => {
    estado.settings = { atendente_visibility: 'bogus', atendente_can_transfer: 'sim' };
    render(<VisibilitySettings />);
    expect(screen.getByLabelText(ATENDENTE_VISIBILITY_LABELS.all.title)).toBeChecked();
    expect(screen.getByRole('switch', { name: /pode transferir/i })).toBeChecked();
  });
});
