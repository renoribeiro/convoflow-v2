import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { acao, from } = vi.hoisted(() => ({ acao: vi.fn(), from: vi.fn() }));

vi.mock('@/services/whatsapp/instanceActions', () => ({
  instanceAction: acao,
  isConnectedState: (s: string | null | undefined) => s === 'open' || s === 'connected',
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/use-toast', () => ({ toast: vi.fn(), useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { QRCodeModal } from './QRCodeModal';

/** QR e acompanhamento pelo servidor. Valores inventados. */

const ID = 'aaaaaaaa-0000-4000-8000-0000000000a1';

function abrir(onSuccess = vi.fn()) {
  const qc = new QueryClient();
  render(
    <QueryClientProvider client={qc}>
      <QRCodeModal open onOpenChange={vi.fn()} instanceId={ID} instanceName="Comercial" onSuccess={onSuccess} />
    </QueryClientProvider>,
  );
  return onSuccess;
}

beforeEach(() => {
  acao.mockReset();
  from.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('QRCodeModal', () => {
  it('pede o QR ao servidor pelo id do número e mostra a imagem e o código', async () => {
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect'
        ? { ok: true, state: 'qrcode', qr: 'data:image/png;base64,QUJD', pairing_code: 'ABCD1234' }
        : { ok: true, status: 'qrcode' },
    );
    abrir();
    expect(await screen.findByAltText('QR Code para conexão WhatsApp')).toHaveAttribute('src', 'data:image/png;base64,QUJD');
    expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    expect(acao).toHaveBeenCalledWith(ID, 'connect');
    expect(from).not.toHaveBeenCalled();
  });

  it('mostra a frase do servidor quando não dá (ex.: número sem chave salva)', async () => {
    acao.mockResolvedValue({ ok: false, reason: 'no_credentials', error: 'Este número não tem chave salva no ConvoFlow.' });
    abrir();
    expect(await screen.findByText('Este número não tem chave salva no ConvoFlow.')).toBeInTheDocument();
  });

  it('quando o servidor diz que conectou, avisa e não grava nada pelo navegador', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect'
        ? { ok: true, state: 'qrcode', qr: 'data:image/png;base64,QUJD', pairing_code: null }
        : { ok: true, status: 'open' },
    );
    const onSuccess = abrir();
    await screen.findByAltText('QR Code para conexão WhatsApp');
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(acao).toHaveBeenCalledWith(ID, 'status');
    expect(from).not.toHaveBeenCalled();
  });

  it('servidor ainda preparando (WAHA iniciando): mostra "Preparando" e pede de novo', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const respostas = [
      { ok: true, state: 'connecting', qr: null, pairing_code: null },
      { ok: true, state: 'qrcode', qr: 'data:image/png;base64,UE5H', pairing_code: null },
    ];
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect' ? respostas.shift() : { ok: true, status: 'qrcode' },
    );
    abrir();
    expect(await screen.findByText('Preparando o QR Code...')).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(3100);
    });
    expect(await screen.findByAltText('QR Code para conexão WhatsApp')).toHaveAttribute('src', 'data:image/png;base64,UE5H');
  });
});
