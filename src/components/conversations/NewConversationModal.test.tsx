/**
 * "Nova Conversa" (item 13 do backlog): o diálogo mandava tudo pela Evolution
 * do navegador, inclusive para número da API Oficial, e falhava antes de sair
 * do computador com "Falha ao iniciar conversa. Tente novamente".
 *
 * O que este arquivo trava:
 *  - o envio sai pelo adapter do número (o mesmo da tela da conversa);
 *  - número oficial começa por template aprovado; texto livre só quando o
 *    telefone escreveu para esse número nas últimas 24 horas;
 *  - sem template aprovado, a tela diz isso e aponta para Templates;
 *  - na recusa, o motivo real aparece e nenhum contato é criado.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { WhatsAppTemplate } from '@/services/whatsapp';

const TENANT = 'aaaaaaaa-0000-4000-8000-000000000001';
const INSTANCIA = 'aaaaaaaa-0000-4000-8000-000000000002';
const CONTATO = 'aaaaaaaa-0000-4000-8000-000000000003';
const CONTATO_NOVO = 'aaaaaaaa-0000-4000-8000-000000000004';
const DIGITADO = '5511999990000';
const SEM_O_NOVE = '551199990000';

// ---------------------------------------------------------------- adapters ---
const sendText = vi.fn();
const sendTemplate = vi.fn();
let tipoDoNumero: 'official' | 'evolution' = 'official';

function instancias() {
  const oficial = tipoDoNumero === 'official';
  return [
    {
      row: { id: INSTANCIA, name: 'Recepção', phone_number: '+55 11 3333-0000', is_active: true },
      providerLabel: oficial ? 'WhatsApp Cloud (Meta)' : 'Evolution API',
      adapter: {
        type: tipoDoNumero,
        isReadyToSend: () => true,
        getCapabilities: () => ({ requiresTemplateOutsideWindow: oficial }),
        sendText,
        ...(oficial ? { sendTemplate } : {}),
      },
    },
  ];
}
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: instancias(), isLoading: false, error: null }),
}));

// --------------------------------------------------------------- templates ---
let templates: WhatsAppTemplate[] = [];
const pedidosDeTemplate = vi.fn();
vi.mock('@/hooks/useMetaTemplates', () => ({
  useMetaTemplates: (instanceId: string | null) => {
    pedidosDeTemplate(instanceId);
    const ativo = !!instanceId;
    return {
      data: ativo ? templates : undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      isSuccess: ativo,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

// ---------------------------------------------------------------- supabase ---
let contatosNoBanco: Array<{ id: string; phone: string }> = [];
let entradasNoBanco: Array<{ contact_id: string; created_at: string }> = [];
const inserts: Array<{ table: string; row: Record<string, unknown> }> = [];
const buscasDeTelefone: unknown[] = [];

function tabela(nome: string) {
  let op: 'select' | 'insert' | 'update' = 'select';
  const resultado = () => {
    if (nome === 'contacts' && op === 'select') return { data: contatosNoBanco, error: null };
    if (nome === 'contacts' && op === 'insert') return { data: { id: CONTATO_NOVO }, error: null };
    if (nome === 'messages' && op === 'select') return { data: entradasNoBanco, error: null };
    return { data: null, error: null };
  };
  const b: Record<string, unknown> = {
    select: () => b,
    eq: () => b,
    order: () => b,
    limit: () => b,
    in: (coluna: string, valores: unknown) => {
      if (nome === 'contacts' && coluna === 'phone') buscasDeTelefone.push(valores);
      return b;
    },
    insert: (row: Record<string, unknown>) => {
      op = 'insert';
      inserts.push({ table: nome, row });
      return b;
    },
    update: () => {
      op = 'update';
      return b;
    },
    single: () => Promise.resolve(resultado()),
    maybeSingle: () => Promise.resolve(resultado()),
    then: (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
      Promise.resolve(resultado()).then(ok, erro),
  };
  return b;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (t: string) => tabela(t) } }));

// ------------------------------------------------------------------ resto ---
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: TENANT } }) }));
const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/components/shared/FeatureHelp', () => ({ FeatureHelp: () => null }));

// Select do Radix não abre no jsdom: cada item vira um botão que escolhe o valor.
vi.mock('@/components/ui/select', async () => {
  const R = await import('react');
  const Escolher = R.createContext<(v: string) => void>(() => {});
  return {
    Select: ({ onValueChange, children }: { onValueChange?: (v: string) => void; children: React.ReactNode }) => (
      <Escolher.Provider value={onValueChange ?? (() => {})}>{children}</Escolher.Provider>
    ),
    SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectValue: () => null,
    SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const escolher = R.useContext(Escolher);
      return (
        <button type="button" data-testid={`opcao-${value}`} onClick={() => escolher(value)}>
          {children}
        </button>
      );
    },
  };
});

import { NewConversationModal } from './NewConversationModal';

const template = (over: Partial<WhatsAppTemplate> = {}): WhatsAppTemplate => ({
  name: 'boas_vindas',
  language: 'pt_BR',
  status: 'APPROVED',
  bodyText: 'Olá {{1}}, aqui é da clínica.',
  paramCount: 1,
  ...over,
});
const horasAtras = (h: number) => new Date(Date.now() - h * 3600 * 1000).toISOString();

function abrirComTelefone(onCreated = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NewConversationModal onConversationCreated={onCreated} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole('button', { name: /Nova Conversa/ }));
  fireEvent.change(screen.getByLabelText('Número do WhatsApp'), { target: { value: '11999990000' } });
  return onCreated;
}

const botaoIniciar = () => screen.getByRole('button', { name: /Iniciar Conversa/ });
const insertsEm = (t: string) => inserts.filter((i) => i.table === t).map((i) => i.row);

beforeEach(() => {
  tipoDoNumero = 'official';
  templates = [template()];
  contatosNoBanco = [];
  entradasNoBanco = [];
  inserts.length = 0;
  buscasDeTelefone.length = 0;
  sendText.mockReset().mockResolvedValue({ status: 'sent', providerMessageId: 'wamid.FAKE1' });
  sendTemplate
    .mockReset()
    .mockResolvedValue({ status: 'sent', providerMessageId: 'wamid.FAKE2', recipientId: SEM_O_NOVE });
  pedidosDeTemplate.mockReset();
  toast.mockReset();
});

describe('número oficial, fora da janela de 24 horas', () => {
  it('telefone que nunca escreveu: só template; texto livre bloqueado', async () => {
    abrirComTelefone();
    expect(await screen.findByText(/não escreveu para este número nas últimas 24 horas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Texto livre' })).toBeDisabled();
    expect(screen.queryByLabelText('Mensagem inicial')).not.toBeInTheDocument();
  });

  it('contato que escreveu há mais de 24 horas também fica só no template', async () => {
    contatosNoBanco = [{ id: CONTATO, phone: SEM_O_NOVE }];
    entradasNoBanco = [{ contact_id: CONTATO, created_at: horasAtras(25) }];
    abrirComTelefone();
    expect(await screen.findByText(/não escreveu para este número/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Texto livre' })).toBeDisabled();
  });

  it('envia o template com as variáveis e só então cria o contato, com o telefone que a Meta confirmou', async () => {
    const onCreated = abrirComTelefone();
    fireEvent.click(await screen.findByTestId('opcao-boas_vindas::pt_BR'));
    fireEvent.change(screen.getByLabelText('Variável {{1}}'), { target: { value: 'Ana' } });
    fireEvent.click(botaoIniciar());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CONTATO_NOVO));
    expect(sendTemplate).toHaveBeenCalledWith(DIGITADO, {
      templateName: 'boas_vindas',
      language: 'pt_BR',
      bodyParams: ['Ana'],
    });
    expect(sendText).not.toHaveBeenCalled();
    // Procurou nas duas formas do celular antes de decidir que era novo.
    expect(buscasDeTelefone[0]).toEqual([DIGITADO, SEM_O_NOVE]);
    expect(insertsEm('contacts')).toEqual([
      expect.objectContaining({ phone: SEM_O_NOVE, tenant_id: TENANT, whatsapp_instance_id: INSTANCIA }),
    ]);
    expect(insertsEm('messages')).toEqual([
      expect.objectContaining({
        contact_id: CONTATO_NOVO,
        content: 'Template: boas_vindas',
        status: 'sent',
        evolution_message_id: 'wamid.FAKE2',
      }),
    ]);
  });

  it('não envia com variável vazia', async () => {
    abrirComTelefone();
    fireEvent.click(await screen.findByTestId('opcao-boas_vindas::pt_BR'));
    expect(botaoIniciar()).toBeDisabled();
  });
});

describe('número oficial, dentro da janela de 24 horas', () => {
  it('libera o texto livre e envia para o telefone gravado no contato, sem criar outro', async () => {
    contatosNoBanco = [{ id: CONTATO, phone: SEM_O_NOVE }];
    entradasNoBanco = [{ contact_id: CONTATO, created_at: horasAtras(2) }];
    const onCreated = abrirComTelefone();

    expect(await screen.findByText(/escreveu para este número nas últimas 24 horas: você pode/)).toBeInTheDocument();
    const textoLivre = screen.getByRole('button', { name: 'Texto livre' });
    expect(textoLivre).toBeEnabled();
    fireEvent.click(textoLivre);
    fireEvent.change(screen.getByLabelText('Mensagem inicial'), { target: { value: 'Oi, tudo bem?' } });
    fireEvent.click(botaoIniciar());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CONTATO));
    expect(sendText).toHaveBeenCalledWith(SEM_O_NOVE, 'Oi, tudo bem?');
    expect(sendTemplate).not.toHaveBeenCalled();
    expect(insertsEm('contacts')).toEqual([]);
    expect(insertsEm('messages')).toEqual([
      expect.objectContaining({ contact_id: CONTATO, content: 'Oi, tudo bem?', evolution_message_id: 'wamid.FAKE1' }),
    ]);
  });

  it('o padrão continua sendo o template', async () => {
    contatosNoBanco = [{ id: CONTATO, phone: SEM_O_NOVE }];
    entradasNoBanco = [{ contact_id: CONTATO, created_at: horasAtras(2) }];
    abrirComTelefone();
    await screen.findByText(/você pode mandar texto livre/);
    expect(screen.getByRole('button', { name: 'Template aprovado' })).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('número oficial sem template aprovado', () => {
  it('diz que não há template aprovado, aponta para Templates e não deixa enviar', async () => {
    templates = [
      template({ name: 'em_analise', status: 'PENDING' }),
      template({ name: 'com_imagem', header: { format: 'IMAGE', text: '' } }),
    ];
    abrirComTelefone();

    const aviso = await screen.findByTestId('sem-template');
    expect(within(aviso).getByText('Nenhum template aprovado neste número.')).toBeInTheDocument();
    expect(within(aviso).getByRole('link', { name: 'Templates' })).toHaveAttribute('href', '/dashboard/templates');
    expect(within(aviso).getByText(/1 template aprovado não aparece aqui/)).toBeInTheDocument();
    expect(botaoIniciar()).toBeDisabled();
  });
});

describe('número de QR Code', () => {
  it('manda texto livre pelo adapter do número, sem template e sem a Evolution do navegador', async () => {
    tipoDoNumero = 'evolution';
    const onCreated = abrirComTelefone();

    fireEvent.change(screen.getByLabelText('Mensagem inicial'), { target: { value: 'Oi!' } });
    await waitFor(() => expect(botaoIniciar()).toBeEnabled());
    expect(screen.queryByRole('button', { name: 'Template aprovado' })).not.toBeInTheDocument();
    fireEvent.click(botaoIniciar());

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(CONTATO_NOVO));
    expect(sendText).toHaveBeenCalledWith(DIGITADO, 'Oi!');
    expect(pedidosDeTemplate).not.toHaveBeenCalledWith(INSTANCIA);
    expect(insertsEm('contacts')).toEqual([expect.objectContaining({ phone: DIGITADO })]);
  });
});

describe('recusa', () => {
  it('mostra o motivo real e não cria contato nem mensagem', async () => {
    sendTemplate.mockResolvedValue({
      status: 'failed',
      errorCode: '132001',
      error:
        'Este template não existe neste número, nesse idioma, ou ainda não foi aprovado. Confira na tela Templates. (código 132001 da Meta)',
    });
    const onCreated = abrirComTelefone();
    fireEvent.click(await screen.findByTestId('opcao-boas_vindas::pt_BR'));
    fireEvent.change(screen.getByLabelText('Variável {{1}}'), { target: { value: 'Ana' } });
    fireEvent.click(botaoIniciar());

    const erro = await screen.findByTestId('erro-envio');
    expect(erro).toHaveTextContent('(código 132001 da Meta)');
    expect(erro).not.toHaveTextContent('Tente novamente');
    expect(insertsEm('contacts')).toEqual([]);
    expect(insertsEm('messages')).toEqual([]);
    expect(onCreated).not.toHaveBeenCalled();
  });
});
