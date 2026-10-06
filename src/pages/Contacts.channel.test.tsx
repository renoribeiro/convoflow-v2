import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

/**
 * Página de Contatos com o filtro de canal. Na Loja SEM Instagram (a
 * VagaCerta, por exemplo) a página é a de sempre: sem filtro, canal "Todos",
 * seletor com "Todas as instâncias" e busca "Nome ou telefone...".
 */

const { state, seen } = vi.hoisted(() => ({
  state: { instances: [] as { row: Record<string, unknown>; providerLabel: string }[] },
  seen: {
    table: null as null | Record<string, unknown>,
    selector: null as null | { instances: { row: { id: string } }[]; allLabel?: string },
    filters: null as null | Record<string, unknown>,
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: 't1', name: 'Loja' } }),
}));
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: state.instances }),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsBelowLg: () => false }));
vi.mock('@/components/shared/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));
vi.mock('@/components/contacts/ContactsTable', () => ({
  ContactsTable: (props: Record<string, unknown>) => {
    seen.table = props;
    return <div data-testid="table" />;
  },
}));
vi.mock('@/components/contacts/ContactModal', () => ({ ContactModal: () => null }));
vi.mock('@/components/contacts/ContactFilters', () => ({
  ContactFilters: (props: Record<string, unknown>) => {
    seen.filters = props;
    return null;
  },
}));
vi.mock('@/components/conversations/InstanceSelector', () => ({
  InstanceSelector: (props: { instances: { row: { id: string } }[]; allLabel?: string }) => {
    seen.selector = props;
    return <div data-testid="selector">{props.allLabel}</div>;
  },
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import Contacts from './Contacts';

const WA_INST = { row: { id: 'wa-inst', provider: 'official', name: 'Vaga Certa' }, providerLabel: 'Meta' };
const IG_INST = { row: { id: 'ig-inst', provider: 'instagram', name: 'Instagram @convoflow' }, providerLabel: 'Instagram' };

beforeEach(() => {
  seen.table = null;
  seen.selector = null;
  seen.filters = null;
});

describe('Contatos — Loja sem Instagram (como a VagaCerta)', () => {
  beforeEach(() => {
    state.instances = [WA_INST];
  });

  it('sem filtro de canal, canal "all", seletor e busca como sempre', () => {
    render(<Contacts />);
    expect(screen.queryByRole('group', { name: 'Canal dos contatos' })).not.toBeInTheDocument();
    expect(seen.table!.channel).toBe('all');
    expect(seen.selector!.allLabel).toBe('Todas as instâncias');
    expect(seen.selector!.instances.map((i) => i.row.id)).toEqual(['wa-inst']);
    expect(seen.filters!.searchByHandle).toBe(false);
  });
});

describe('Contatos — Loja com Instagram', () => {
  beforeEach(() => {
    state.instances = [WA_INST, IG_INST];
  });

  it('mostra o filtro Todos / WhatsApp / Instagram, começando em Todos', () => {
    render(<Contacts />);
    const group = screen.getByRole('group', { name: 'Canal dos contatos' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true');
    expect(seen.table!.channel).toBe('all');
    expect(seen.selector!.allLabel).toBe('Todas as conexões');
    expect(seen.filters!.searchByHandle).toBe(true);
  });

  it('Instagram: a tabela recebe o canal e o seletor só lista as contas do Instagram', () => {
    render(<Contacts />);
    fireEvent.click(screen.getByRole('button', { name: 'Instagram' }));
    expect(seen.table!.channel).toBe('instagram');
    expect(seen.selector!.instances.map((i) => i.row.id)).toEqual(['ig-inst']);
    expect(seen.selector!.allLabel).toBe('Todas as contas do Instagram');
  });

  it('WhatsApp: só as instâncias de WhatsApp', () => {
    render(<Contacts />);
    fireEvent.click(screen.getByRole('button', { name: 'WhatsApp' }));
    expect(seen.table!.channel).toBe('whatsapp');
    expect(seen.selector!.instances.map((i) => i.row.id)).toEqual(['wa-inst']);
    expect(seen.selector!.allLabel).toBe('Todas as instâncias');
  });
});
