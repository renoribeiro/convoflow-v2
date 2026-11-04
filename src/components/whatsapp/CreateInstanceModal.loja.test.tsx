import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * "Conectar número" e a Loja (lote 6b, B2; decisão D1: número de WhatsApp é
 * sempre de uma Loja). Com a Conta em foco a janela pede a Loja antes de tudo;
 * com a Loja em foco ela diz onde o número vai ficar e manda essa Loja nos
 * três caminhos (QR Code, WAHA e formulário manual da API Oficial). Quem
 * confere de verdade é o servidor (connectTarget.test.ts).
 */

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOJA_2 = 'aaaaaaaa-0000-4000-8000-000000000005';

const { state, setActiveTenant, createEvolution, createWaha, createMeta, mockToast } = vi.hoisted(() => ({
  state: {
    tenant: null as null | { id: string; name: string; kind: string },
    stores: [] as { id: string; name: string; parent_tenant_id: string }[],
  },
  setActiveTenant: vi.fn(),
  createEvolution: vi.fn(async () => ({ instance_id: 'inst-novo' })),
  createWaha: vi.fn(async () => {}),
  createMeta: vi.fn(async () => {}),
  mockToast: vi.fn(),
}));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: state.tenant, tenantId: state.tenant?.id ?? null, setActiveTenant }),
  useTenantId: () => state.tenant?.id ?? null,
}));
vi.mock('@/hooks/useMyStores', () => ({
  useMyStores: () => ({ stores: state.stores, isLoading: false, error: null, refetch: vi.fn() }),
}));
vi.mock('@/hooks/useEvolutionApi', () => ({ useEvolutionApi: () => ({ createInstance: createEvolution }) }));
vi.mock('@/hooks/useWahaApi', () => ({ useWahaApi: () => ({ createInstance: createWaha }) }));
vi.mock('@/hooks/useMetaApi', () => ({ useMetaApi: () => ({ createInstance: createMeta }) }));
vi.mock('@/hooks/useMetaEmbeddedSignup', () => ({
  useMetaEmbeddedSignup: () => ({ isAvailable: false, startSignup: vi.fn(), loading: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('sonner', () => ({ toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() } }));
vi.mock('./QRCodeModal', () => ({ QRCodeModal: () => null }));

import { CreateInstanceModal } from './CreateInstanceModal';
import { consumirConectarNumero } from '@/lib/whatsapp/conectarPendente';
import { TooltipProvider } from '@/components/ui/tooltip';

function abrir() {
  return render(
    <MemoryRouter>
      <TooltipProvider>
        <CreateInstanceModal open onOpenChange={vi.fn()} onSuccess={vi.fn()} />
      </TooltipProvider>
    </MemoryRouter>,
  );
}

/** O campo de "Avançado" (o "?" ao lado tem nome parecido: por isso o papel). */
const campoNomeNoServidor = () => screen.getByRole('textbox', { name: /Nome no servidor de conexão/ });

function escolherProvedor(titulo: RegExp) {
  fireEvent.click(screen.getByText(titulo));
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
}

beforeEach(() => {
  vi.clearAllMocks();
  consumirConectarNumero();
  state.stores = [
    { id: LOJA, name: 'Loja Centro', parent_tenant_id: CONTA },
    { id: LOJA_2, name: 'Loja Praia', parent_tenant_id: CONTA },
  ];
});

describe('Conta em foco: a janela pede a Loja', () => {
  beforeEach(() => {
    state.tenant = { id: CONTA, name: 'Conta Exemplo', kind: 'account' };
  });

  it('mostra as Lojas e nenhum jeito de conectar', () => {
    abrir();
    expect(screen.getByTestId('escolher-loja-do-numero')).toBeInTheDocument();
    expect(screen.getByText(/fica numa Loja, não na Conta/)).toBeInTheDocument();
    expect(screen.queryByText(/Conectar pelo QR Code/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
  });

  it('escolher a Loja abre a Loja e pede para a janela reabrir lá', () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /Loja Praia/ }));
    expect(setActiveTenant).toHaveBeenCalledWith(LOJA_2);
    expect(consumirConectarNumero()).toBe(true);
  });

  it('Conta sem Loja: manda criar a primeira em Equipe', () => {
    state.stores = [];
    abrir();
    expect(screen.getByText(/ainda não tem Loja/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar Loja' })).toHaveAttribute('href', '/dashboard/team');
  });
});

describe('Loja em foco: diz onde fica e manda a Loja nos três caminhos', () => {
  beforeEach(() => {
    state.tenant = { id: LOJA, name: 'Loja Centro', kind: 'store' };
  });

  it('diz a Loja do número', () => {
    abrir();
    expect(screen.getByTestId('loja-do-numero')).toHaveTextContent('O número vai ficar na Loja Loja Centro.');
  });

  it('QR Code (Evolution)', async () => {
    abrir();
    escolherProvedor(/Conectar pelo QR Code/);
    fireEvent.change(screen.getByLabelText(/Nome do número/), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: /Avançado/ }));
    // Em "Avançado" o nome no servidor é trocado; o que não serve vira _ e minúscula.
    fireEvent.change(campoNomeNoServidor(), { target: { value: 'Loja Centro-Vendas' } });
    expect(campoNomeNoServidor()).toHaveValue('loja_centro-vendas');
    fireEvent.click(screen.getByRole('button', { name: /Criar e abrir QR Code/ }));
    await waitFor(() => expect(createEvolution).toHaveBeenCalled());
    expect(createEvolution).toHaveBeenCalledWith('loja_centro-vendas', undefined, expect.objectContaining({ tenantId: LOJA }));
  });

  it('WAHA', async () => {
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /Avançado/ }));
    escolherProvedor(/QR Code no seu servidor/);
    fireEvent.change(screen.getByLabelText(/Nome do número/), { target: { value: 'Suporte' } });
    fireEvent.change(screen.getByLabelText(/Endereço do seu servidor WAHA/), { target: { value: 'https://waha.exemplo.com.br' } });
    fireEvent.change(document.getElementById('waha-session')!, { target: { value: 'suporte' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar número' }));
    await waitFor(() => expect(createWaha).toHaveBeenCalled());
    expect(createWaha).toHaveBeenCalledWith(expect.objectContaining({ sessionName: 'suporte' }), LOJA);
  });

  it('formulário manual da API Oficial', async () => {
    abrir();
    escolherProvedor(/API oficial da Meta/);
    fireEvent.change(screen.getByLabelText(/Nome do número/), { target: { value: 'Oficial' } });
    fireEvent.change(screen.getByLabelText(/Phone Number ID/), { target: { value: '100000000000001' } });
    fireEvent.change(screen.getByLabelText(/WABA ID/), { target: { value: '200000000000001' } });
    fireEvent.change(screen.getByLabelText(/Access Token/), { target: { value: 'EAAG' + 'x'.repeat(60) } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar e conectar' }));
    await waitFor(() => expect(createMeta).toHaveBeenCalled());
    expect(createMeta).toHaveBeenCalledWith(expect.objectContaining({ phoneNumberId: '100000000000001' }), LOJA);
  });
});

describe('Duas opções e o Avançado (lote 6e, achado 106, decisão D12)', () => {
  beforeEach(() => {
    state.tenant = { id: LOJA, name: 'Loja Centro', kind: 'store' };
  });

  it('mostra só QR Code e API oficial; o WAHA fica no Avançado', () => {
    abrir();
    expect(screen.getByText('Conectar pelo QR Code')).toBeInTheDocument();
    expect(screen.getByText('API oficial da Meta')).toBeInTheDocument();
    expect(screen.queryByText('QR Code no seu servidor WAHA')).not.toBeInTheDocument();
    const avancado = screen.getByRole('button', { name: /Avançado/ });
    expect(avancado).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(avancado);
    expect(avancado).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('QR Code no seu servidor WAHA')).toBeInTheDocument();
  });

  it('QR Code só com o nome: o nome no servidor nasce dele, aparece embaixo, e os campos técnicos ficam fechados', async () => {
    abrir();
    escolherProvedor(/Conectar pelo QR Code/);
    expect(screen.queryByRole('textbox', { name: /Nome no servidor de conexão/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Endereço de entrega/)).not.toBeInTheDocument();
    expect(screen.getByTestId('nome-no-servidor-gerado')).toHaveTextContent('aparece quando você digitar o nome');
    fireEvent.change(screen.getByLabelText(/Nome do número/), { target: { value: 'WhatsApp Vendas' } });
    expect(screen.getByTestId('nome-no-servidor-gerado')).toHaveTextContent(/Nome no servidor de conexão: whatsapp_vendas_[a-z0-9]{4}/);
    fireEvent.click(screen.getByRole('button', { name: /Criar e abrir QR Code/ }));
    await waitFor(() => expect(createEvolution).toHaveBeenCalled());
    expect(createEvolution).toHaveBeenCalledWith(
      expect.stringMatching(/^whatsapp_vendas_[a-z0-9]{4}$/),
      undefined,
      expect.objectContaining({ tenantId: LOJA, displayName: 'WhatsApp Vendas' }),
    );
  });

  it('o sufixo fica o mesmo enquanto se digita; acento e espaço saem do nome no servidor', () => {
    abrir();
    escolherProvedor(/Conectar pelo QR Code/);
    const nome = screen.getByLabelText(/Nome do número/);
    fireEvent.change(nome, { target: { value: 'Recepção' } });
    const primeiro = screen.getByTestId('nome-no-servidor-gerado').textContent!.match(/recepcao_([a-z0-9]{4})/)![1];
    fireEvent.change(nome, { target: { value: 'Recepção Ótica' } });
    expect(screen.getByTestId('nome-no-servidor-gerado')).toHaveTextContent(`recepcao_otica_${primeiro}`);
  });

  it('nome trocado em Avançado não é reescrito pelo nome do número; Gerar de novo volta a montar', () => {
    abrir();
    escolherProvedor(/Conectar pelo QR Code/);
    const nome = screen.getByLabelText(/Nome do número/);
    fireEvent.change(nome, { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: /Avançado/ }));
    fireEvent.change(campoNomeNoServidor(), { target: { value: 'agencia_cliente_01' } });
    fireEvent.change(nome, { target: { value: 'Vendas Centro' } });
    expect(campoNomeNoServidor()).toHaveValue('agencia_cliente_01');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar de novo' }));
    expect((campoNomeNoServidor() as HTMLInputElement).value).toMatch(/^vendas_centro_[a-z0-9]{4}$/);
  });

  it('nome no servidor curto demais: diz o que fazer e não cria', async () => {
    abrir();
    escolherProvedor(/Conectar pelo QR Code/);
    fireEvent.change(screen.getByLabelText(/Nome do número/), { target: { value: 'Vendas' } });
    fireEvent.click(screen.getByRole('button', { name: /Avançado/ }));
    fireEvent.change(campoNomeNoServidor(), { target: { value: 'ab' } });
    expect(screen.getByText('O nome no servidor de conexão precisa de pelo menos 3 caracteres.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Criar e abrir QR Code/ }));
    await waitFor(() => expect(mockToast).toHaveBeenCalled());
    expect(createEvolution).not.toHaveBeenCalled();
  });

  it('API oficial sem a conexão automática: os campos manuais já aparecem abertos', () => {
    abrir();
    escolherProvedor(/API oficial da Meta/);
    expect(screen.getByRole('button', { name: /Avançado/ })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/Phone Number ID/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Validar e conectar' })).toBeInTheDocument();
  });
});
