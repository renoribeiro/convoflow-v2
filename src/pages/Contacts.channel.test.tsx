import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render as renderRtl, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Página de Contatos com o filtro de canal. Na Loja SEM Instagram (a
 * VagaCerta, por exemplo) a página é a de sempre: sem filtro, canal "Todos",
 * seletor com "Todas as instâncias" e busca "Nome, telefone ou email...".
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
  useWhatsAppInstancesSafe: () => ({ instances: state.instances }),
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
vi.mock('@/components/contacts/ContactModal', () => ({
  ContactModal: ({ isOpen, contactId }: { isOpen: boolean; contactId?: string | null }) =>
    isOpen ? <div data-testid="cartao-do-contato">{contactId}</div> : null,
}));
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
// Vínculos só entram na exportação ("Vinculado a"); aqui o assunto é o canal.
vi.mock('@/hooks/useContactLinks', () => ({ useContactLinks: () => ({ data: [] }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() } }));

import Contacts from './Contacts';

// A tela lê ?contact= (busca rápida, achado 28): precisa do roteador.
const render = (ui: React.ReactElement, endereco = '/dashboard/contacts') =>
  renderRtl(<MemoryRouter initialEntries={[endereco]}>{ui}</MemoryRouter>);

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
    expect(seen.selector!.allLabel).toBe('Todos os números');
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
    expect(seen.selector!.allLabel).toBe('Todos os números');
  });
});

describe('Contatos — vindo da busca rápida', () => {
  it('?contact= abre o cartão daquele contato', () => {
    state.instances = [WA_INST];
    render(<Contacts />, '/dashboard/contacts?contact=aaaaaaaa-0000-4000-8000-0000000000d1');
    expect(screen.getByTestId('cartao-do-contato').textContent).toBe('aaaaaaaa-0000-4000-8000-0000000000d1');
  });

  it('sem ?contact=, o cartão fica fechado', () => {
    state.instances = [WA_INST];
    render(<Contacts />);
    expect(screen.queryByTestId('cartao-do-contato')).not.toBeInTheDocument();
  });
});
