import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const { acao, from, toastFn } = vi.hoisted(() => ({ acao: vi.fn(), from: vi.fn(), toastFn: vi.fn() }));

vi.mock('@/services/whatsapp/instanceActions', () => ({
  instanceAction: acao,
  isConnectedState: (s: string | null | undefined) => s === 'open' || s === 'connected',
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from, functions: { invoke: vi.fn() } } }));
vi.mock('@/hooks/use-toast', () => ({ toast: toastFn, useToast: () => ({ toast: toastFn }) }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } }));

import { QRCodeModal, INTERVALO_ACOMPANHAMENTO_MS } from './QRCodeModal';

/** QR e acompanhamento pelo servidor. Valores inventados. */

const ID = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const QR1 = 'data:image/png;base64,QUJD';
const QR2 = 'data:image/png;base64,UE5H';

const qc = () => new QueryClient();

function Janela({ open = true, onSuccess = vi.fn(), onOpenChange = vi.fn(), client }: {
  open?: boolean;
  onSuccess?: () => void;
  onOpenChange?: (o: boolean) => void;
  client: QueryClient;
}) {
  return (
    <QueryClientProvider client={client}>
      <QRCodeModal open={open} onOpenChange={onOpenChange} instanceId={ID} instanceName="Comercial" onSuccess={onSuccess} />
    </QueryClientProvider>
  );
}

function abrir(onSuccess = vi.fn()) {
  const client = qc();
  const view = render(<Janela client={client} onSuccess={onSuccess} />);
  return { onSuccess, client, ...view };
}

const chamadas = (action: string) => acao.mock.calls.filter((c) => c[1] === action).length;
const passar = async (ms: number) => {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
};

beforeEach(() => {
  acao.mockReset();
  from.mockReset();
  toastFn.mockReset();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('QRCodeModal', () => {
  it('pede o QR ao servidor pelo id do número e mostra a imagem e o código', async () => {
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect'
        ? { ok: true, state: 'qrcode', qr: QR1, pairing_code: 'ABCD1234' }
        : { ok: true, state: 'qrcode', qr: QR1, pairing_code: 'ABCD1234' },
    );
    abrir();
    expect(await screen.findByAltText('QR Code para conexão WhatsApp')).toHaveAttribute('src', QR1);
    expect(screen.getByText('ABCD1234')).toBeInTheDocument();
    expect(acao).toHaveBeenCalledWith(ID, 'connect');
    expect(from).not.toHaveBeenCalled();
  });

  it('mostra a frase do servidor quando não dá, e não tenta conectar de novo sozinha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockResolvedValue({ ok: false, reason: 'no_credentials', error: 'Este número não tem chave salva no ConvoFlow.' });
    abrir();
    expect(await screen.findByText('Este número não tem chave salva no ConvoFlow.')).toBeInTheDocument();
    await passar(60_000);
    expect(acao).toHaveBeenCalledTimes(1);
  });

  it('janela aberta: UM connect só, nunca disconnect, mesmo com a conexão fechando e a tela redesenhando', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    // Depois da leitura o WhatsApp reinicia a conexão: o estado passa por "close".
    const estados = ['qrcode', 'close', 'connecting', 'qrcode', 'close', 'qrcode'];
    acao.mockImplementation(async (_id: string, action: string) => {
      if (action === 'connect') return { ok: true, state: 'qrcode', qr: QR1, pairing_code: null };
      const s = estados.shift() ?? 'qrcode';
      return { ok: true, state: s, qr: s === 'qrcode' ? QR2 : null, pairing_code: null };
    });
    const { client, rerender } = abrir();
    await screen.findByAltText('QR Code para conexão WhatsApp');
    for (let i = 0; i < 8; i++) {
      // A página manda um onSuccess novo a cada desenho (era o que pedia o QR de novo a cada 30 s).
      rerender(<Janela client={client} onSuccess={vi.fn()} />);
      await passar(INTERVALO_ACOMPANHAMENTO_MS);
    }
    expect(chamadas('connect')).toBe(1);
    expect(chamadas('disconnect')).toBe(0);
    expect(chamadas('qr')).toBeGreaterThanOrEqual(6);
    expect(screen.getByAltText('QR Code para conexão WhatsApp')).toHaveAttribute('src', QR2);
  });

  it('conectou: avisa UMA vez, chama onSuccess uma vez e para de acompanhar', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect'
        ? { ok: true, state: 'qrcode', qr: QR1, pairing_code: null }
        : { ok: true, state: 'open', qr: null, pairing_code: null },
    );
    const { onSuccess, client, rerender } = abrir();
    await screen.findByAltText('QR Code para conexão WhatsApp');
    await passar(INTERVALO_ACOMPANHAMENTO_MS + 100);
    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    const depois = acao.mock.calls.length;
    for (let i = 0; i < 5; i++) {
      rerender(<Janela client={client} onSuccess={onSuccess} />);
      await passar(INTERVALO_ACOMPANHAMENTO_MS);
    }
    expect(acao.mock.calls.length).toBe(depois);
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(toastFn.mock.calls.filter((c) => c[0]?.title === 'Conectado!')).toHaveLength(1);
    expect(from).not.toHaveBeenCalled();
  });

  it('já conectado ao abrir: aviso uma vez, sem acompanhamento', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockResolvedValue({ ok: true, state: 'open', qr: null, pairing_code: null });
    const { client, rerender } = abrir();
    await waitFor(() => expect(toastFn).toHaveBeenCalledTimes(1));
    rerender(<Janela client={client} onSuccess={vi.fn()} />);
    await passar(30_000);
    expect(acao).toHaveBeenCalledTimes(1);
    expect(toastFn).toHaveBeenCalledTimes(1);
  });

  it('fechar a janela para o acompanhamento', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockResolvedValue({ ok: true, state: 'qrcode', qr: QR1, pairing_code: null });
    const { client, rerender } = abrir();
    await screen.findByAltText('QR Code para conexão WhatsApp');
    await passar(INTERVALO_ACOMPANHAMENTO_MS);
    rerender(<Janela client={client} open={false} />);
    const antes = acao.mock.calls.length;
    await passar(60_000);
    expect(acao.mock.calls.length).toBe(antes);
  });

  it('sair da tela (desmontar) para o acompanhamento', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockResolvedValue({ ok: true, state: 'qrcode', qr: QR1, pairing_code: null });
    const { unmount } = abrir();
    await screen.findByAltText('QR Code para conexão WhatsApp');
    unmount();
    const antes = acao.mock.calls.length;
    await passar(60_000);
    expect(acao.mock.calls.length).toBe(antes);
  });

  it('conexão fechada por muito tempo: diz que o QR venceu, para, e não reconecta sozinha', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect'
        ? { ok: true, state: 'qrcode', qr: QR1, pairing_code: null }
        : { ok: true, state: 'close', qr: null, pairing_code: null },
    );
    abrir();
    await screen.findByAltText('QR Code para conexão WhatsApp');
    await passar(INTERVALO_ACOMPANHAMENTO_MS * 5);
    expect(await screen.findByText('O QR Code venceu')).toBeInTheDocument();
    const antes = acao.mock.calls.length;
    await passar(60_000);
    expect(acao.mock.calls.length).toBe(antes);
    expect(chamadas('connect')).toBe(1);
  });

  it('servidor ainda preparando (WAHA iniciando): mostra "Preparando" e espera pelo acompanhamento, sem novo connect', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'connect'
        ? { ok: true, state: 'connecting', qr: null, pairing_code: null }
        : { ok: true, state: 'qrcode', qr: QR2, pairing_code: null },
    );
    abrir();
    expect(await screen.findByText('Preparando o QR Code...')).toBeInTheDocument();
    await passar(INTERVALO_ACOMPANHAMENTO_MS + 100);
    expect(await screen.findByAltText('QR Code para conexão WhatsApp')).toHaveAttribute('src', QR2);
    expect(chamadas('connect')).toBe(1);
  });
});
