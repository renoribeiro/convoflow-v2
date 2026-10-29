import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * Template na campanha (achado 93, decisão D12): número da API Oficial com
 * "Template aprovado" escolhe da lista e esconde o texto livre; editar uma
 * campanha de template volta com ele; variável em branco trava o avanço.
 */

type Row = Record<string, unknown>;
const { db, mutacoes, toast } = vi.hoisted(() => ({
  db: { tables: {} as Record<string, Row[]> },
  mutacoes: { create: vi.fn(), update: vi.fn(), schedule: vi.fn() },
  toast: vi.fn(),
}));

function query(table: string) {
  let rows = [...(db.tables[table] ?? [])];
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.order = () => chain;
  chain.eq = (col: string, val: unknown) => {
    rows = rows.filter((r) => r[col] === val);
    return chain;
  };
  chain.in = () => chain;
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
  return chain;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: (t: string) => query(t), rpc: vi.fn(), storage: { from: vi.fn() } },
}));
vi.mock('@/contexts/TenantContext', () => ({ useTenantId: () => 't1' }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));
vi.mock('@/hooks/useCampaigns', () => ({
  useCampaignMutations: () => ({
    createCampaign: { mutateAsync: mutacoes.create },
    updateCampaign: { mutateAsync: mutacoes.update },
    scheduleCampaign: { mutateAsync: mutacoes.schedule },
  }),
}));

vi.mock('@/hooks/useMetaTemplates', () => ({
  useMetaTemplates: () => ({
    data: [{ name: 'retorno_orcamento', language: 'pt_BR', status: 'APPROVED', paramCount: 2, bodyText: 'Oi {{1}}, o orçamento de {{2}} está pronto.' }],
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

import { CampaignWizard } from './CampaignWizardNew';

const campanhaDeTemplate = {
  id: 'aaaaaaaa-0000-4000-8000-000000000002',
  tenant_id: 't1',
  name: 'Retomar orçamentos',
  status: 'draft',
  whatsapp_instance_id: 'inst-oficial',
  message_type: 'text',
  message_template: '',
  audience_type: 'contact_list',
  audience_config: { contact_ids: ['c-1'] },
  target_tags: [],
  timezone: 'America/Sao_Paulo',
  is_template: true,
  template_name: 'retorno_orcamento',
  template_language: 'pt_BR',
  template_params: ['{first_name}', 'apartamento'],
} as unknown as React.ComponentProps<typeof CampaignWizard>['campaign'];

beforeEach(() => {
  toast.mockReset();
  mutacoes.update.mockReset().mockResolvedValue({ id: 'x' });
  db.tables = {
    whatsapp_instances: [{ id: 'inst-oficial', tenant_id: 't1', is_active: true, name: 'Oficial Centro', status: 'connected', provider: 'official' }],
    tags: [],
    funnel_stages: [],
    contacts: [],
  };
});

function montar() {
  render(
    <MemoryRouter>
      <CampaignWizard onClose={vi.fn()} campaign={campanhaDeTemplate} />
    </MemoryRouter>,
  );
}

describe('Campanha › Template aprovado', () => {
  it('editar volta com o template escolhido e as variáveis; o texto livre some', async () => {
    montar();
    expect(await screen.findByText('Oi {{1}}, o orçamento de {{2}} está pronto.')).toBeInTheDocument();
    expect(screen.getByLabelText('Variável 1')).toHaveValue('{first_name}');
    expect(screen.getByLabelText('Variável 2')).toHaveValue('apartamento');
    expect(screen.queryByLabelText('Mensagem *')).toBeNull();
    expect(screen.queryByText('Tipo de Mensagem *')).toBeNull();
    expect(screen.queryByLabelText('Nome do template *')).toBeNull();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Próximo' })).not.toBeDisabled());
  });

  it('variável em branco trava o avanço', async () => {
    montar();
    fireEvent.change(await screen.findByLabelText('Variável 2'), { target: { value: ' ' } });
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
  });

  it('salvar grava o template, sem texto livre', async () => {
    montar();
    await screen.findByLabelText('Variável 1');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar como rascunho' }));
    await waitFor(() => expect(mutacoes.update).toHaveBeenCalledTimes(1));
    const input = mutacoes.update.mock.calls[0]![0].input;
    expect(input).toMatchObject({
      is_template: true,
      template_name: 'retorno_orcamento',
      template_params: ['{first_name}', 'apartamento'],
      message_template: '',
      media_url: null,
    });
  });
});
