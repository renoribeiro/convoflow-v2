/**
 * Configurações — quem alcança cada aba.
 *
 * A aba Assinatura aparecia para TODO MUNDO, inclusive Atendente: ele via o
 * plano, o preço e um botão "Assinar Agora". O servidor já recusava o checkout
 * dele, mas oferecer um botão que não pode funcionar é errado por si só — e
 * quem assina é a CONTA (do Gerente), não a Loja.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { DEFAULT_CAPABILITIES, type UserRole } from '@/types/userHierarchy';

let cargo: UserRole = 'gerente';

vi.mock('@/contexts/TenantContext', () => ({
  useCapabilities: () => DEFAULT_CAPABILITIES[cargo],
}));

// Os painéis são pesados e irrelevantes aqui: o que importa é a barra de abas.
vi.mock('@/components/settings/ProfileSettings', () => ({ ProfileSettings: () => <div /> }));
vi.mock('@/components/settings/AttendanceSettings', () => ({ AttendanceSettings: () => <div /> }));
vi.mock('@/components/settings/NotificationSettings', () => ({ NotificationSettings: () => <div /> }));
vi.mock('@/components/settings/SecuritySettings', () => ({ SecuritySettings: () => <div /> }));
vi.mock('@/components/settings/IntegrationSettings', () => ({ IntegrationSettings: () => <div /> }));
vi.mock('@/components/settings/SubscriptionSettings', () => ({
  SubscriptionSettings: () => <div data-testid="painel-assinatura" />,
}));
vi.mock('@/components/shared/FeatureHelp', () => ({ FeatureHelp: () => null }));
vi.mock('@/components/shared/PageHeader', () => ({ PageHeader: () => null }));

import Settings from './Settings';

const abrir = (url = '/dashboard/settings') =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Settings />
    </MemoryRouter>,
  );

const abaAssinatura = () => screen.queryByRole('tab', { name: /assinatura/i });

beforeEach(() => {
  vi.clearAllMocks();
  cargo = 'gerente';
});

describe('aba Assinatura', () => {
  it.each(['gerente', 'superadmin'] as UserRole[])('%s vê a aba', (papel) => {
    cargo = papel;
    abrir();
    expect(abaAssinatura()).not.toBeNull();
  });

  it.each(['gestor', 'atendente'] as UserRole[])('%s NÃO vê a aba', (papel) => {
    cargo = papel;
    abrir();
    expect(abaAssinatura()).toBeNull();
  });

  it('esconder o botão não basta: ?tab=subscription não abre o painel', () => {
    cargo = 'atendente';
    abrir('/dashboard/settings?tab=subscription');

    expect(screen.queryByTestId('painel-assinatura')).toBeNull();
    // Cai no Perfil em vez de tela vazia.
    expect(screen.getByRole('tab', { name: /perfil/i })).toHaveAttribute(
      'data-state',
      'active',
    );
  });

  it('para o gerente o deep link continua funcionando', () => {
    cargo = 'gerente';
    abrir('/dashboard/settings?tab=subscription');
    expect(screen.getByTestId('painel-assinatura')).toBeInTheDocument();
  });
});

describe('abas que todo cargo mantém', () => {
  it.each(['gerente', 'gestor', 'atendente'] as UserRole[])(
    '%s continua com Perfil, Atendimento, Notificações, Segurança e Integrações',
    (papel) => {
      cargo = papel;
      abrir();
      for (const nome of [/perfil/i, /atendimento/i, /notificações/i, /segurança/i, /integrações/i]) {
        expect(screen.queryByRole('tab', { name: nome })).not.toBeNull();
      }
    },
  );
});
