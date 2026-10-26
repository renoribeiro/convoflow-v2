import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Cobranca, NotaDaCobranca } from '@/lib/billing/cobrancas';

const { mockInvoke, mockToast } = vi.hoisted(() => ({ mockInvoke: vi.fn(), mockToast: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mockInvoke } } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));

import { NotaFiscalCelula } from '@/components/billing/NotaFiscalCelula';

const nota = (extra: Partial<NotaDaCobranca> = {}): NotaDaCobranca => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000001', ambiente: 'producao', status: 'emitida', numero_nfse: '42',
  chave_acesso: null, emitida_em: null, cancelada_em: null, ultimo_erro_codigo: null, ultimo_erro_mensagem: null,
  tentativas: 1, pdf_path: 'a.pdf', xml_path: 'a.xml', ...extra,
});
const cobranca = (status: string, notas: NotaDaCobranca[] = []): Cobranca => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000009', stripe_invoice_id: 'in_FAKE1', tenant_id: null, amount_paid_cents: 100,
  currency: 'brl', paid_at: '2026-10-13T15:00:00Z', period_start: null, period_end: null, hosted_invoice_url: null,
  amount_refunded_cents: 0, refunded_at: null, nota_status: status, notas,
});
const renderizar = (c: Cobranca, ehSuperadmin: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotaFiscalCelula cobranca={c} ehSuperadmin={ehSuperadmin} />
    </QueryClientProvider>,
  );

beforeEach(() => vi.clearAllMocks());

describe('NotaFiscalCelula', () => {
  it('Gerente: nota emitida mostra número, PDF e XML, nada de superadmin', () => {
    renderizar(cobranca('emitida', [nota()]), false);
    expect(screen.getByText('Emitida')).toBeInTheDocument();
    expect(screen.getByText('NFS-e 42')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PDF/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /XML/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar nota|Emitir de novo/ })).toBeNull();
  });

  it('Gerente: estado sem arquivo não oferece botão nem mostra o erro', () => {
    renderizar(cobranca('erro', [nota({ status: 'erro', ultimo_erro_mensagem: 'falhou' })]), false);
    expect(screen.getByText('Erro na emissão')).toBeInTheDocument();
    expect(screen.queryByText(/falhou/)).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('superadmin: nota de teste leva o selo, o erro e "Emitir de novo"', () => {
    renderizar(
      cobranca('erro', [nota({ ambiente: 'restrita', status: 'erro', ultimo_erro_codigo: 'E123', ultimo_erro_mensagem: 'Dado inválido' })]),
      true,
    );
    expect(screen.getByText('teste')).toBeInTheDocument();
    expect(screen.getByText(/E123: Dado inválido/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Emitir de novo/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cancelar nota/ })).toBeNull();
  });

  it('superadmin: emitida oferece cancelar, e só chama depois da confirmação', async () => {
    mockInvoke.mockResolvedValue({ data: { ok: true, nota_status: 'cancelada' }, error: null });
    const user = userEvent.setup();
    renderizar(cobranca('emitida', [nota()]), true);
    expect(screen.queryByRole('button', { name: /Emitir de novo/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Cancelar nota/ }));
    expect(mockInvoke).not.toHaveBeenCalled();
    expect(await screen.findByText(/Serviço não prestado/)).toBeInTheDocument();
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar nota' }));
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('nfse-admin', {
        body: { acao: 'cancelar', nota_id: 'aaaaaaaa-0000-4000-8000-000000000001' },
      }),
    );
  });

  it('reemitir chama a função e erro do servidor vira toast', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('x'), { context: { json: async () => ({ error: 'Certificado ausente.' }) } }),
    });
    const user = userEvent.setup();
    renderizar(cobranca('aguardando_prefeitura'), true);
    await user.click(screen.getByRole('button', { name: /Emitir de novo/ }));
    // Documento fiscal: confirma antes de pedir a emissão de novo.
    expect(mockInvoke).not.toHaveBeenCalled();
    await user.click(within(screen.getByTestId('confirmacao')).getByRole('button', { name: 'Emitir de novo' }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ description: 'Certificado ausente.', variant: 'destructive' })),
    );
    expect(mockInvoke).toHaveBeenCalledWith('nfse-admin', {
      body: { acao: 'reemitir', charge_id: 'aaaaaaaa-0000-4000-8000-000000000009' },
    });
  });

  it('PDF baixa pela URL assinada (clique num link, sem janela nova que o navegador barraria)', async () => {
    mockInvoke.mockResolvedValue({ data: { url: 'https://exemplo.com.br/a.pdf' }, error: null });
    const clicados: string[] = [];
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicados.push(this.href);
    });
    const abrir = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    renderizar(cobranca('emitida', [nota()]), false);
    await user.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(clicados).toEqual(['https://exemplo.com.br/a.pdf']));
    expect(mockInvoke).toHaveBeenCalledWith('nfse-admin', { body: { acao: 'baixar', nota_id: expect.any(String), tipo: 'pdf' } });
    expect(abrir).not.toHaveBeenCalled();
    clique.mockRestore();
    abrir.mockRestore();
  });
});
