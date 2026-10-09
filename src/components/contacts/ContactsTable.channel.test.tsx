import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * Contatos por canal (fatia 4a do Instagram): o filtro de canal vai para o
 * SERVIDOR (consulta + chave do cache), a busca acha pelo @, toda linha tem o
 * logo do canal, e a linha do WhatsApp continua com o telefone de sempre.
 */

const { state } = vi.hoisted(() => ({
  state: {
    rows: [] as Record<string, unknown>[],
    lastQuery: null as null | { queryKey: unknown[]; filter: { column: string; operator: string; value: unknown }[] },
  },
}));

vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: (opts: { queryKey: unknown[]; filter: { column: string; operator: string; value: unknown }[] }) => {
    state.lastQuery = { queryKey: opts.queryKey, filter: opts.filter };
    // Simula o servidor: aplica os filtros "eq" que a tabela mandou.
    const rows = state.rows.filter((r) => opts.filter.every((f) => f.operator !== 'eq' || r[f.column] === f.value));
    return { data: rows, isLoading: false, error: null };
  },
}));
vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
// Vínculo WhatsApp ↔ Instagram (migração 20261009000001): a tabela marca a
// linha vinculada. O índice vem do estado do teste; o diálogo não é o assunto.
const { links } = vi.hoisted(() => ({ links: { list: [] as Array<Record<string, unknown>> } }));
vi.mock('@/hooks/useContactLinks', async () => {
  const { buildLinkIndex } = await import('@/lib/contacts/links');
  return {
    useContactLinkIndex: () => buildLinkIndex(links.list as never),
    useUnlinkContact: () => ({ mutate: vi.fn(), isPending: false }),
  };
});
vi.mock('@/contexts/TenantContext', () => ({ useCan: () => true }));
vi.mock('@/components/contacts/LinkContactDialog', () => ({ LinkContactDialog: () => null }));

import { ContactsTable } from './ContactsTable';

const base = {
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
  conversations: [],
  contact_tags: [],
};
const WA = { ...base, id: 'wa-1', channel: 'whatsapp', name: 'Ana Beatriz Nogueira', phone: '5585999990201', username: null };
const WA_NO_NAME = { ...base, id: 'wa-2', channel: 'whatsapp', name: null, phone: '5585999997890', username: null };
const IG = { ...base, id: 'ig-1', channel: 'instagram', name: 'Paulo Andrade | Tráfego Pago', phone: null, username: 'opauloandrade' };
const IG_NO_NAME = { ...base, id: 'ig-2', channel: 'instagram', name: null, phone: null, username: 'rena_alves9' };
const IG_BARE = { ...base, id: 'ig-3', channel: 'instagram', name: null, phone: null, username: null };

const noFilters = { search: '', stage: '', source: '', tags: [] as string[] };

function renderTable(props: Partial<React.ComponentProps<typeof ContactsTable>> = {}) {
  return render(
    <MemoryRouter>
      <ContactsTable filters={noFilters} onEdit={vi.fn()} {...props} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  state.rows = [WA, WA_NO_NAME, IG, IG_NO_NAME, IG_BARE];
  state.lastQuery = null;
  links.list = [];
});

describe('ContactsTable — vínculo WhatsApp ↔ Instagram', () => {
  it('as duas linhas vinculadas ganham a marca; as outras não', () => {
    links.list = [
      {
        link_id: 'l1',
        whatsapp_contact_id: 'wa-1',
        instagram_contact_id: 'ig-1',
        linked_by: null,
        linked_by_name: null,
        linked_at: '2026-10-09T12:00:00Z',
        can_unlink: true,
      },
    ];
    const { container } = renderTable();
    expect(container.querySelectorAll('[data-contact-linked]')).toHaveLength(2);
    expect(screen.getByText('(vinculado ao contato do Instagram)')).toBeInTheDocument();
    expect(screen.getByText('(vinculado ao contato do WhatsApp)')).toBeInTheDocument();
    // Vinculadas continuam duas linhas.
    expect(screen.getByText('5 contatos encontrados')).toBeInTheDocument();
  });
});

describe('ContactsTable — canal', () => {
  it('"Todos" (padrão): sem filtro de canal na consulta, e "all" na chave do cache', () => {
    renderTable();
    expect(state.lastQuery!.filter.some((f) => f.column === 'channel')).toBe(false);
    expect(state.lastQuery!.queryKey).toContain('all');
    expect(screen.getByText('5 contatos encontrados')).toBeInTheDocument();
  });

  it('Instagram: filtro channel=instagram vai para o servidor e para a chave do cache', () => {
    renderTable({ channel: 'instagram' });
    expect(state.lastQuery!.filter).toContainEqual({ column: 'channel', operator: 'eq', value: 'instagram' });
    expect(state.lastQuery!.queryKey[0]).toBe('contacts');
    expect(state.lastQuery!.queryKey).toContain('instagram');
    expect(screen.getByText('3 contatos encontrados')).toBeInTheDocument();
    expect(screen.queryByText('Ana Beatriz Nogueira')).not.toBeInTheDocument();
  });

  it('WhatsApp: filtro channel=whatsapp, só os dois de WhatsApp', () => {
    renderTable({ channel: 'whatsapp' });
    expect(state.lastQuery!.filter).toContainEqual({ column: 'channel', operator: 'eq', value: 'whatsapp' });
    expect(screen.getByText('2 contatos encontrados')).toBeInTheDocument();
  });

  it('chaves de cache diferentes por canal (um canal nunca mostra o cache do outro)', () => {
    const { unmount } = renderTable({ channel: 'whatsapp' });
    const k1 = JSON.stringify(state.lastQuery!.queryKey);
    unmount();
    renderTable({ channel: 'instagram' });
    expect(JSON.stringify(state.lastQuery!.queryKey)).not.toBe(k1);
  });

  it('toda linha tem o logo do canal', () => {
    renderTable();
    expect(document.querySelectorAll('[data-channel-logo="whatsapp"]').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelectorAll('[data-channel-logo="instagram"]').length).toBeGreaterThanOrEqual(3);
  });
});

describe('ContactsTable — o que cada linha mostra', () => {
  it('WhatsApp: o nome e o telefone de sempre; sem nome, "Contato sem nome"', () => {
    renderTable();
    expect(screen.getAllByText('Ana Beatriz Nogueira').length).toBeGreaterThan(0);
    expect(screen.getAllByText('5585999990201').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Contato sem nome').length).toBeGreaterThan(0);
  });

  it('Instagram: o @ no lugar do telefone; sem nome, o @ vira o nome; sem nada, "Cliente do Instagram"', () => {
    renderTable({ channel: 'instagram' });
    expect(screen.getAllByText('@opauloandrade').length).toBeGreaterThan(0);
    expect(screen.getAllByText('@rena_alves9').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cliente do Instagram').length).toBeGreaterThan(0);
    // e a linha de identificação do contato sem @ diz o canal, não fica em branco
    expect(screen.getAllByText('Instagram', { selector: 'p' }).length).toBeGreaterThan(0);
  });
});

describe('ContactsTable — busca', () => {
  it('acha contato do Instagram pelo @ (com "@")', () => {
    renderTable({ filters: { ...noFilters, search: '@opaulo' } });
    expect(screen.getByText('1 contatos encontrados')).toBeInTheDocument();
    expect(screen.getAllByText('Paulo Andrade | Tráfego Pago').length).toBeGreaterThan(0);
  });

  it('acha pelo @ sem o "@"', () => {
    renderTable({ filters: { ...noFilters, search: 'rena_' } });
    expect(screen.getByText('1 contatos encontrados')).toBeInTheDocument();
  });

  it('acha contato do Instagram pelo nome', () => {
    renderTable({ filters: { ...noFilters, search: 'tráfego' } });
    expect(screen.getByText('1 contatos encontrados')).toBeInTheDocument();
  });

  it('busca por telefone continua achando o WhatsApp', () => {
    renderTable({ filters: { ...noFilters, search: '9990201' } });
    expect(screen.getByText('1 contatos encontrados')).toBeInTheDocument();
    expect(screen.getAllByText('Ana Beatriz Nogueira').length).toBeGreaterThan(0);
  });
});
