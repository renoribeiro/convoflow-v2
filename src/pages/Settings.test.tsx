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
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DEFAULT_CAPABILITIES, type UserRole } from '@/types/userHierarchy';

let cargo: UserRole = 'gerente';
let apiAtiva = false;

vi.mock('@/contexts/TenantContext', () => ({
  useCapabilities: () => DEFAULT_CAPABILITIES[cargo],
  useIsGerente: () => cargo === 'gerente',
  useTenant: () => ({ profile: { tenant_id: 'conta-1' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: async () => ({ data: [{ ativo: apiAtiva, motivo: apiAtiva ? 'manual' : 'desligado', ate: null }], error: null }),
  },
}));
vi.mock('@/components/settings/ApiKeysSettings', () => ({
  ApiKeysSettings: () => <div data-testid="painel-api" />,
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
import { API_ADDON_RELEASED } from '@/lib/api/release';

const abrir = (url = '/dashboard/settings') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={[url]}>
        <Settings />
      </MemoryRouter>
    </QueryClientProvider>,
  );

const abaAssinatura = () => screen.queryByRole('tab', { name: /assinatura/i });

beforeEach(() => {
  vi.clearAllMocks();
  cargo = 'gerente';
  apiAtiva = false;
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

describe('aba Chaves de API', () => {
  const abaApi = () => screen.queryByRole('tab', { name: /chaves de api/i });

  it(API_ADDON_RELEASED ? 'com a API liberada: só o Gerente vê, mesmo com a Conta sem a API ligada' : 'some para todos com a API não liberada e a Conta sem a API ligada', async () => {
    for (const papel of ['gerente', 'gestor', 'atendente', 'superadmin'] as UserRole[]) {
      cargo = papel;
      const { unmount } = abrir();
      await new Promise((r) => setTimeout(r, 20));
      if (API_ADDON_RELEASED && papel === 'gerente') expect(abaApi()).not.toBeNull();
      else expect(abaApi()).toBeNull();
      unmount();
    }
  });

  it('aparece para o Gerente da Conta em que a API já está ligada', async () => {
    apiAtiva = true;
    abrir('/dashboard/settings?tab=api');
    await waitFor(() => expect(abaApi()).not.toBeNull());
    expect(await screen.findByTestId('painel-api')).toBeInTheDocument();
  });

  it('Gestor e Atendente não veem a aba nem pelo endereço, mesmo com a API ligada', async () => {
    apiAtiva = true;
    for (const papel of ['gestor', 'atendente'] as UserRole[]) {
      cargo = papel;
      const { unmount } = abrir('/dashboard/settings?tab=api');
      await new Promise((r) => setTimeout(r, 20));
      expect(abaApi()).toBeNull();
      expect(screen.queryByTestId('painel-api')).toBeNull();
      unmount();
    }
  });

  it('?tab=api não abre com a aba escondida', async () => {
    cargo = API_ADDON_RELEASED ? 'gestor' : cargo; // liberada, a aba só esconde de quem não é Gerente
    abrir('/dashboard/settings?tab=api');
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByTestId('painel-api')).toBeNull();
    expect(screen.getByRole('tab', { name: /perfil/i })).toHaveAttribute('data-state', 'active');
  });
});
