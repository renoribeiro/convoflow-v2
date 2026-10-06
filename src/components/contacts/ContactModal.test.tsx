import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * O formulário de contato salva de verdade.
 *
 * Desde 2025-08-18 (42396ce) ele não salvava NENHUM contato, nem criar nem
 * editar: a validação exigia `tenant_id` que o formulário nunca manda, o hook
 * de mutação repetia a mesma validação (e recusava os `null`), e o payload
 * levava `assigned_to`, coluna que não existe em `contacts`. Estes testes usam
 * o hook de mutação REAL — só a rede é trocada — para que qualquer um dos três
 * portões, se voltar, derrube o teste.
 *
 * As linhas são cópias de contatos reais da Conta Teste Gerente e da Loja
 * Teste (sem dado pessoal: são fixtures de teste).
 */

const { state, calls } = vi.hoisted(() => ({
  state: { contact: null as Record<string, unknown> | null },
  calls: [] as { table: string; op: string; payload?: unknown; filter?: [string, unknown] }[],
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Conta Teste Gerente' },
    profile: { id: 'p1', role: 'gerente' },
    loading: false,
  }),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({
  useSupabaseQuery: (opts: { table: string }) => ({
    data: opts.table === 'contacts' && state.contact ? [state.contact] : [],
    isLoading: false,
    error: null,
  }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

/** Construtor encadeável que registra cada escrita e resolve com sucesso. */
function builder(table: string) {
  const entry: { table: string; op: string; payload?: unknown; filter?: [string, unknown] } = { table, op: '' };
  const chain: Record<string, unknown> = {};
  const record = (op: string) => (payload?: unknown) => {
    entry.op = op;
    entry.payload = payload;
    calls.push(entry);
    return chain;
  };
  chain.insert = record('insert');
  chain.update = record('update');
  chain.delete = record('delete');
  chain.select = () => chain;
  chain.eq = (col: string, val: unknown) => {
    entry.filter = [col, val];
    return chain;
  };
  chain.single = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data: [{ id: 'novo-id' }], error: null }).then(resolve);
  return chain;
}
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => builder(t) },
}));

import { ContactModal } from './ContactModal';

const WHATSAPP_ROW = {
  id: 'dddddddd-0000-4000-8000-000000000004',
  tenant_id: 'aaaaaaaa-0000-4000-8000-000000000001',
  channel: 'whatsapp',
  name: 'Ana Beatriz Nogueira',
  phone: '5585999990201',
  username: null,
  email: 'ana.nogueira@exemplo.com.br',
  notes: null,
  current_stage_id: null,
  lead_source_id: null,
  contact_tags: [],
};

const INSTAGRAM_ROW = {
  id: 'dddddddd-0000-4000-8000-000000000005',
  tenant_id: 'bbbbbbbb-0000-4000-8000-000000000002',
  channel: 'instagram',
  name: 'Paulo Andrade | Tráfego Pago',
  phone: null,
  username: 'opauloandrade',
  external_id: '1834150354615655',
  email: null,
  notes: null,
  current_stage_id: null,
  lead_source_id: null,
  contact_tags: [],
};

function renderModal(contactId: string | null) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const onClose = vi.fn();
  render(
    <QueryClientProvider client={qc}>
      <ContactModal isOpen onClose={onClose} contactId={contactId} />
    </QueryClientProvider>,
  );
  return { onClose };
}

const contactWrites = () => calls.filter((c) => c.table === 'contacts');
/** A única escrita em `contacts` — falha se houver zero ou mais de uma. */
function onlyWrite() {
  const writes = contactWrites();
  if (writes.length !== 1) throw new Error(`esperava 1 escrita em contacts, veio ${writes.length}`);
  return writes[0] as { op: string; payload: Record<string, unknown>; filter?: [string, unknown] };
}

beforeEach(() => {
  calls.length = 0;
  state.contact = null;
});

describe('ContactModal — salvar', () => {
  it('edita um contato de WhatsApp real e o UPDATE sai, filtrado pelo id', async () => {
    state.contact = { ...WHATSAPP_ROW };
    const { onClose } = renderModal(WHATSAPP_ROW.id);

    fireEvent.change(await screen.findByLabelText(/Observações/), { target: { value: 'Retomar em outubro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    const write = onlyWrite();
    expect(write.op).toBe('update');
    expect(write.filter).toEqual(['id', WHATSAPP_ROW.id]);
    expect(write.payload).toMatchObject({
      name: 'Ana Beatriz Nogueira',
      phone: '5585999990201',
      email: 'ana.nogueira@exemplo.com.br',
      notes: 'Retomar em outubro',
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('não manda assigned_to (a coluna não existe em contacts)', async () => {
    state.contact = { ...WHATSAPP_ROW };
    renderModal(WHATSAPP_ROW.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    expect(onlyWrite().payload).not.toHaveProperty('assigned_to');
    expect(screen.queryByText('Responsável')).not.toBeInTheDocument();
  });

  it('campo apagado vira NULL, nunca string vazia', async () => {
    state.contact = { ...WHATSAPP_ROW, notes: 'antiga' };
    renderModal(WHATSAPP_ROW.id);
    fireEvent.change(await screen.findByLabelText('E-mail'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText(/Observações/), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    const payload = onlyWrite().payload;
    expect(payload.email).toBeNull();
    expect(payload.notes).toBeNull();
    expect(payload.current_stage_id).toBeNull();
    expect(payload.lead_source_id).toBeNull();
    expect(Object.values(payload)).not.toContain('');
  });

  it.each([
    ['emoji', 'Maria 🌸 Recrutamento'],
    ['barra vertical', 'Paulo Andrade | Tráfego Pago'],
    ['acento combinante (NFD)', 'Tânia Moura'],
  ])('salva nome real com %s', async (_label, name) => {
    state.contact = { ...WHATSAPP_ROW, name };
    renderModal(WHATSAPP_ROW.id);
    fireEvent.click(await screen.findByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    expect(onlyWrite().payload.name).toBe(name);
  });

  it('telefone digitado com máscara vai só com dígitos', async () => {
    state.contact = { ...WHATSAPP_ROW };
    renderModal(WHATSAPP_ROW.id);
    fireEvent.change(await screen.findByLabelText(/Telefone/), { target: { value: '+55 (85) 99999-0201' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    expect(onlyWrite().payload.phone).toBe('5585999990201');
  });

  it('telefone vazio num contato de WhatsApp não salva e aponta o campo', async () => {
    state.contact = { ...WHATSAPP_ROW };
    renderModal(WHATSAPP_ROW.id);
    fireEvent.change(await screen.findByLabelText(/Telefone/), { target: { value: '' } });
    fireEvent.submit(screen.getByRole('button', { name: 'Salvar' }).closest('form')!);
    expect(await screen.findByText('Telefone é obrigatório')).toBeInTheDocument();
    expect(contactWrites()).toHaveLength(0);
  });

  it('Instagram: sem campo de telefone, @ só para leitura, payload sem phone', async () => {
    state.contact = { ...INSTAGRAM_ROW };
    renderModal(INSTAGRAM_ROW.id);

    expect(await screen.findByText('Editar Contato')).toBeInTheDocument();
    expect(screen.queryByLabelText(/Telefone/)).not.toBeInTheDocument();
    const handle = screen.getByLabelText('Instagram') as HTMLInputElement;
    expect(handle.value).toBe('@opauloandrade');
    expect(handle).toHaveAttribute('readonly');

    fireEvent.change(screen.getByLabelText(/Observações/), { target: { value: 'Veio pelo direct' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    const write = onlyWrite();
    expect(write.op).toBe('update');
    expect(write.filter).toEqual(['id', INSTAGRAM_ROW.id]);
    expect(write.payload).not.toHaveProperty('phone');
    expect(write.payload).not.toHaveProperty('username');
    expect(write.payload).toMatchObject({ name: 'Paulo Andrade | Tráfego Pago', notes: 'Veio pelo direct', email: null });
    expect(Object.values(write.payload)).not.toContain('');
  });

  it('Instagram sem @ ainda: mostra o aviso e salva sem inventar telefone', async () => {
    state.contact = { ...INSTAGRAM_ROW, username: null, name: null };
    renderModal(INSTAGRAM_ROW.id);
    const handle = (await screen.findByLabelText('Instagram')) as HTMLInputElement;
    expect(handle.value).toBe('');
    expect(handle.placeholder).toBe('@ ainda não informado');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    expect(onlyWrite().payload).not.toHaveProperty('phone');
    expect(onlyWrite().payload.name).toBeNull();
  });

  it('cria contato novo: INSERT com o tenant_id da sessão', async () => {
    renderModal(null);
    fireEvent.change(await screen.findByLabelText(/Nome/), { target: { value: 'Contato Novo' } });
    fireEvent.change(screen.getByLabelText(/Telefone/), { target: { value: '5585999990000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Criar' }));
    await waitFor(() => expect(contactWrites()).toHaveLength(1));
    const write = onlyWrite();
    expect(write.op).toBe('insert');
    expect(write.payload).toMatchObject({
      name: 'Contato Novo',
      phone: '5585999990000',
      email: null,
      notes: null,
      tenant_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    });
  });
});
