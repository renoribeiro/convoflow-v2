import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

/**
 * Público da campanha (decisão do dono, 2026-09-25): contato do Instagram NÃO é
 * oferecido. A lista de "Contatos" pede channel=whatsapp ao servidor, e o total
 * das Tags só conta contato de WhatsApp. Os contatos de WhatsApp aparecem
 * exatamente como antes. A rede de segurança continua no servidor
 * (schedule_campaign_messages só agenda quem tem phone).
 *
 * O mock do Supabase aplica os filtros `eq` que a tela manda — inclusive o
 * `contacts.channel` do embed —, então o que aparece é o que o servidor
 * devolveria.
 */

type Row = Record<string, unknown>;
const { db, calls } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]> },
  calls: [] as { table: string; op: string; args: unknown[] }[],
}));

function valueAt(row: Row, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => (acc as Row | undefined)?.[key], row);
}

function query(table: string) {
  let rows = [...(db.tables[table] ?? [])];
  const chain: Record<string, unknown> = {};
  const log = (op: string, ...args: unknown[]) => calls.push({ table, op, args });
  chain.select = (...a: unknown[]) => (log('select', ...a), chain);
  chain.order = (...a: unknown[]) => (log('order', ...a), chain);
  chain.eq = (col: string, val: unknown) => {
    log('eq', col, val);
    rows = rows.filter((r) => valueAt(r, col) === val);
    return chain;
  };
  chain.in = (col: string, vals: unknown[]) => {
    log('in', col, vals);
    rows = rows.filter((r) => vals.includes(valueAt(r, col)));
    return chain;
  };
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => query(t), rpc: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 't1' }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }), toast: vi.fn() }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/hooks/useCampaigns', () => ({
  useCampaignMutations: () => ({
    createCampaign: { mutateAsync: vi.fn() },
    updateCampaign: { mutateAsync: vi.fn() },
    scheduleCampaign: { mutateAsync: vi.fn() },
  }),
}));

import { CampaignWizard } from './CampaignWizardNew';

const ANA = { id: 'wa-1', tenant_id: 't1', channel: 'whatsapp', name: 'Ana Beatriz Nogueira', phone: '5585999990201', current_stage_id: null };
const BRUNO = { id: 'wa-2', tenant_id: 't1', channel: 'whatsapp', name: 'Bruno Carvalho Lima', phone: '5585999990202', current_stage_id: null };
const SEM_NOME = { id: 'wa-3', tenant_id: 't1', channel: 'whatsapp', name: null, phone: '5585999997890', current_stage_id: null };
const PAULO_IG = { id: 'ig-1', tenant_id: 't1', channel: 'instagram', name: 'Paulo Andrade | Tráfego Pago', phone: null, username: 'opauloandrade', current_stage_id: null };
const DEBS_IG = { id: 'ig-2', tenant_id: 't1', channel: 'instagram', name: null, phone: null, username: 'rena_alves9', current_stage_id: null };

const draft = {
  id: 'camp-1',
  tenant_id: 't1',
  name: 'Lançamento zona sul',
  status: 'draft',
  whatsapp_instance_id: 'inst-1',
  message_type: 'text',
  message_template: 'Oi {first_name}',
  audience_type: 'contact_list',
  audience_config: { contact_ids: [] },
  target_tags: [],
  timezone: 'America/Sao_Paulo',
} as unknown as React.ComponentProps<typeof CampaignWizard>['campaign'];

function contactTagRow(contact: Row, tagId: string) {
  return { contact_id: contact.id, tag_id: tagId, contacts: { channel: contact.channel } };
}

beforeEach(() => {
  calls.length = 0;
  db.tables = {
    whatsapp_instances: [{ id: 'inst-1', tenant_id: 't1', is_active: true, name: 'Vaga Certa', status: 'open', provider: 'evolution' }],
    tags: [{ id: 'tag-quente', tenant_id: 't1', name: 'lead-quente', color: '#f00' }],
    funnel_stages: [],
    contacts: [ANA, PAULO_IG, BRUNO, DEBS_IG, SEM_NOME],
    contact_tags: [contactTagRow(ANA, 'tag-quente'), contactTagRow(PAULO_IG, 'tag-quente'), contactTagRow(DEBS_IG, 'tag-quente')],
  };
});

async function goToAudienceStep() {
  render(<CampaignWizard onClose={vi.fn()} campaign={draft} />);
  const next = await screen.findByRole('button', { name: 'Próximo' });
  await waitFor(() => expect(next).not.toBeDisabled());
  fireEvent.click(next);
}

/** Cada linha da lista de contatos: o texto do bloco ao lado do checkbox. */
function listedContacts(): string[] {
  return screen
    .getAllByRole('checkbox')
    .map((cb) => cb.closest('label')?.querySelector('div')?.textContent?.trim() ?? '');
}

describe('Campanha › Público › Contatos', () => {
  it('pede ao servidor só contatos de WhatsApp', async () => {
    await goToAudienceStep();
    await screen.findByText('Ana Beatriz Nogueira');
    expect(calls).toContainEqual({ table: 'contacts', op: 'eq', args: ['channel', 'whatsapp'] });
  });

  it('nenhum contato do Instagram na lista; WhatsApp exatamente como antes, na mesma ordem', async () => {
    await goToAudienceStep();
    await screen.findByText('Ana Beatriz Nogueira');
    expect(listedContacts()).toEqual([
      'Ana Beatriz Nogueira5585999990201',
      'Bruno Carvalho Lima5585999990202',
      '5585999997890',
    ]);
    const list = screen.getByText('Ana Beatriz Nogueira').closest('div.max-h-64') as HTMLElement;
    expect(within(list).queryByText(/Paulo|opauloandrade|rena_alves9/)).toBeNull();
    expect(screen.getByText(/de 3$/)).toBeInTheDocument();
  });

  it('"selecionar todos" nunca pega contato do Instagram', async () => {
    await goToAudienceStep();
    await screen.findByText('Ana Beatriz Nogueira');
    fireEvent.click(screen.getByRole('button', { name: /Selecionar todos/i }));
    expect(screen.getByText(/3 selecionado\(s\) de 3/)).toBeInTheDocument();
  });

  it('busca pelo @ não traz o contato do Instagram', async () => {
    await goToAudienceStep();
    await screen.findByText('Ana Beatriz Nogueira');
    fireEvent.change(screen.getByPlaceholderText(/Buscar/i), { target: { value: 'opaulo' } });
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByText('Nenhum contato encontrado.')).toBeInTheDocument();
  });
});

describe('Campanha › Público › Tags', () => {
  it('o total conta só WhatsApp (o Instagram com a mesma etiqueta fica de fora)', async () => {
    await goToAudienceStep();
    fireEvent.click(screen.getByText('Tags'));
    fireEvent.click(await screen.findByRole('button', { name: 'lead-quente' }));
    const alert = await screen.findByText(/contatos encontrados para as tags selecionadas/);
    await waitFor(() => expect(alert).toHaveTextContent('1 contatos encontrados'));
    expect(calls).toContainEqual({ table: 'contact_tags', op: 'eq', args: ['contacts.channel', 'whatsapp'] });
  });

  it('sem Instagram na etiqueta, o total é o mesmo de antes', async () => {
    db.tables.contact_tags = [contactTagRow(ANA, 'tag-quente'), contactTagRow(BRUNO, 'tag-quente')];
    await goToAudienceStep();
    fireEvent.click(screen.getByText('Tags'));
    fireEvent.click(await screen.findByRole('button', { name: 'lead-quente' }));
    const alert = await screen.findByText(/contatos encontrados para as tags selecionadas/);
    await waitFor(() => expect(alert).toHaveTextContent('2 contatos encontrados'));
  });
});
