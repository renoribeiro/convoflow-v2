/**
 * Aba Automação › Automações prontas (2026-11-23).
 *
 * O que a tela precisa garantir:
 *  - Gerente e Gestor (store.admin) ligam, desligam e ajustam os dois cartões;
 *    o Atendente vê só a frase de leitura, sem chave nem botão;
 *  - o cartão do nome grava só lead_name_enabled e lead_name_variable, e avisa
 *    quando uma automação comum ativa também troca o nome;
 *  - o cartão do aviso nasce com o texto padrão, grava minutos, texto e a
 *    chave do horário (nunca business_hours), diz que sem horário salvo o aviso
 *    sai a qualquer hora e que sai uma mensagem só, sem abrir chatbot;
 *  - Conta em foco (Gerente sem Loja aberta): pede para escolher a Loja.
 * Quem faz valer no servidor: a RPC set_tenant_settings e o CHECK do banco
 * (docs/teste_automacoes_prontas.sql, grupos PE e CK).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import userEvent from '@testing-library/user-event';

const { updateTenantSettings, estado } = vi.hoisted(() => ({
  updateTenantSettings: vi.fn(),
  estado: {
    settings: {} as Record<string, unknown>,
    role: 'gestor' as 'gerente' | 'gestor' | 'atendente',
    kind: 'store' as 'store' | 'account',
  },
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({
    tenant: { id: 'aaaaaaaa-0000-4000-8000-000000000001', kind: estado.kind, settings: estado.settings },
    profile: { id: 'p', role: estado.role },
    loading: false,
    updateTenantSettings,
  }),
  // store.admin: Gerente e Gestor sim, Atendente não (DEFAULT_CAPABILITIES).
  useCan: (cap: string) => cap === 'store.admin' && estado.role !== 'atendente',
}));

vi.mock('@/integrations/supabase/client', () => {
  const resposta = Promise.resolve({ data: [{ data: { save_to_variable: 'nome' } }], error: null });
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.eq = () => builder;
  builder.then = (ok: (v: unknown) => unknown) => resposta.then(ok);
  return { supabase: { from: () => builder } };
});

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { AutomacoesProntas } from './AutomacoesProntas';
import { TEXTO_PADRAO_DO_AVISO } from '@/lib/automation/automacoesProntas';

const passoNome = { id: 's1', type: 'action', config: { type: 'update_contact', field: 'name', value: '{nome_cliente}' } };

function montar(fluxos: Array<{ name: string; active: boolean; steps: unknown }> = []) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <AutomacoesProntas fluxos={fluxos} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const cartaoNome = () => screen.getByTestId('cartao-nome-do-lead');
const cartaoAviso = () => screen.getByTestId('cartao-aviso-de-espera');

beforeEach(() => {
  updateTenantSettings.mockReset();
  updateTenantSettings.mockResolvedValue(undefined);
  estado.settings = {};
  estado.role = 'gestor';
  estado.kind = 'store';
});

describe('quem pode mexer', () => {
  it.each(['gerente', 'gestor'] as const)('%s vê as chaves, os campos e o Salvar dos dois cartões', (role) => {
    estado.role = role;
    montar();
    for (const cartao of [cartaoNome(), cartaoAviso()]) {
      expect(within(cartao).getAllByRole('switch').length).toBeGreaterThan(0);
      expect(within(cartao).getByRole('button', { name: /^(Tudo salvo|Salvar)$/ })).toBeInTheDocument();
    }
  });

  it('atendente vê só a leitura: sem chave, sem campo, sem Salvar', () => {
    estado.role = 'atendente';
    estado.settings = { waiting_notice_enabled: true, waiting_notice_minutes: 5, lead_name_enabled: true, lead_name_variable: 'nome' };
    montar();
    for (const cartao of [cartaoNome(), cartaoAviso()]) {
      expect(within(cartao).queryByRole('switch')).not.toBeInTheDocument();
      expect(within(cartao).queryByRole('textbox')).not.toBeInTheDocument();
      expect(within(cartao).queryByRole('button', { name: /^(Tudo salvo|Salvar)$/ })).not.toBeInTheDocument();
      expect(within(cartao).getByText(/Apenas Gerente ou Gestor muda/)).toBeInTheDocument();
    }
    expect(within(cartaoNome()).getByText(/guarda em \{nome\} vira o nome do contato/)).toBeInTheDocument();
    expect(within(cartaoAviso()).getByText(/espera 5 min sem resposta/)).toBeInTheDocument();
  });

  it('Conta em foco: pede para abrir uma Loja', () => {
    estado.kind = 'account';
    montar();
    expect(screen.getAllByText(/Escolha uma Loja no seletor do topo/)).toHaveLength(2);
  });
});

describe('Salvar o nome do lead', () => {
  it('liga com a variável e grava só as duas chaves', async () => {
    const user = userEvent.setup();
    montar();
    const cartao = cartaoNome();
    await user.click(within(cartao).getByRole('switch', { name: 'Ligar nesta Loja' }));
    const campo = within(cartao).getByRole('combobox', { name: 'Variável do chatbot com o nome' });
    expect(campo).toHaveValue('nome');
    await user.click(within(cartao).getByRole('button', { name: 'Salvar' }));
    expect(updateTenantSettings).toHaveBeenCalledWith({ lead_name_enabled: true, lead_name_variable: 'nome' }, { silent: true });
  });

  it('variável inválida não salva', async () => {
    const user = userEvent.setup();
    montar();
    const cartao = cartaoNome();
    await user.click(within(cartao).getByRole('switch', { name: 'Ligar nesta Loja' }));
    const campo = within(cartao).getByRole('combobox', { name: 'Variável do chatbot com o nome' });
    await user.clear(campo);
    await user.type(campo, 'nome do');
    expect(within(cartao).getByText(/começa com letra/)).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('avisa quando uma automação comum ativa também troca o nome', () => {
    montar([
      { name: 'Grava nome do cliente', active: true, steps: [passoNome] },
      { name: 'Pausada', active: false, steps: [passoNome] },
    ]);
    const cartao = cartaoNome();
    expect(within(cartao).getByText('Grava nome do cliente')).toBeInTheDocument();
    expect(within(cartao).getByText(/também troca o nome do contato/)).toBeInTheDocument();
    expect(within(cartao).queryByText('Pausada')).not.toBeInTheDocument();
  });

  it('sem automação comum que troca o nome, nenhum aviso', () => {
    montar([{ name: 'Etiqueta', active: true, steps: [{ type: 'action', config: { type: 'add_tag' } }] }]);
    expect(within(cartaoNome()).queryByText(/também troca/)).not.toBeInTheDocument();
  });
});

describe('Aviso quando ninguém responde', () => {
  it('a Loja de hoje aparece como está: ligado, 5 minutos, texto padrão', () => {
    estado.settings = { waiting_notice_enabled: true, waiting_notice_minutes: 5 };
    montar();
    const cartao = cartaoAviso();
    expect(within(cartao).getByRole('switch', { name: 'Ligar nesta Loja' })).toBeChecked();
    expect(within(cartao).getByRole('spinbutton', { name: 'Minutos sem resposta' })).toHaveValue(5);
    expect(within(cartao).getByRole('textbox', { name: 'Mensagem' })).toHaveValue(TEXTO_PADRAO_DO_AVISO);
    expect(within(cartao).getByRole('button', { name: 'Tudo salvo' })).toBeDisabled();
  });

  it('grava minutos, texto e a chave do horário, nunca o horário', async () => {
    const user = userEvent.setup();
    estado.settings = { waiting_notice_enabled: true, waiting_notice_minutes: 5 };
    montar();
    const cartao = cartaoAviso();
    const minutos = within(cartao).getByRole('spinbutton', { name: 'Minutos sem resposta' });
    await user.clear(minutos);
    await user.type(minutos, '12');
    const texto = within(cartao).getByRole('textbox', { name: 'Mensagem' });
    await user.clear(texto);
    await user.type(texto, 'Já já respondemos.');
    await user.click(within(cartao).getByRole('switch', { name: 'Respeitar o horário de funcionamento' }));
    await user.click(within(cartao).getByRole('button', { name: 'Salvar' }));
    expect(updateTenantSettings).toHaveBeenCalledWith(
      {
        waiting_notice_enabled: true,
        waiting_notice_minutes: 12,
        waiting_notice_text: 'Já já respondemos.',
        waiting_notice_respect_hours: false,
      },
      { silent: true },
    );
  });

  it('minutos fora de 1 a 240 não salvam', async () => {
    const user = userEvent.setup();
    montar();
    const cartao = cartaoAviso();
    const minutos = within(cartao).getByRole('spinbutton', { name: 'Minutos sem resposta' });
    await user.clear(minutos);
    await user.type(minutos, '241');
    expect(within(cartao).getByText(/de 1 a 240/)).toBeInTheDocument();
    expect(within(cartao).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('sem horário salvo, diz que o aviso sai a qualquer hora, com o link para a aba Horário', () => {
    montar();
    const cartao = cartaoAviso();
    expect(within(cartao).getByText(/não tem horário de funcionamento salvo: o aviso sai a qualquer hora/)).toBeInTheDocument();
    expect(within(cartao).getByRole('link', { name: 'Ajustar o horário na aba Horário' })).toHaveAttribute(
      'href',
      '/dashboard/settings?tab=horario',
    );
  });

  it('com horário salvo, a chave decide a frase', async () => {
    const user = userEvent.setup();
    estado.settings = { business_hours: { timezone: 'America/Sao_Paulo', schedule: {} } };
    montar();
    const cartao = cartaoAviso();
    expect(within(cartao).getByText(/só sai com a Loja aberta/)).toBeInTheDocument();
    await user.click(within(cartao).getByRole('switch', { name: 'Respeitar o horário de funcionamento' }));
    expect(within(cartao).getByText(/mesmo com a Loja fechada/)).toBeInTheDocument();
  });

  it('diz que sai uma mensagem só e não cita o gatilho que saiu do chatbot', () => {
    montar();
    const cartao = cartaoAviso();
    expect(within(cartao).getByText(/Sai uma mensagem só, uma vez por espera, e nenhum chatbot é aberto/)).toBeInTheDocument();
    expect(within(cartao).queryByText(/Sem resposta do atendente/)).not.toBeInTheDocument();
  });
});
