import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { acao, toast } = vi.hoisted(() => ({ acao: vi.fn(), toast: vi.fn() }));

vi.mock('@/services/whatsapp/instanceActions', () => ({ instanceAction: acao }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }), toast }));

import { ViewInstanceModal } from './ViewInstanceModal';

/** Detalhes do número: só "Chave configurada: sim ou não" e a troca. Valores inventados. */

const instancia = {
  id: 'aaaaaaaa-0000-4000-8000-0000000000a2',
  name: 'Suporte WAHA',
  instance_key: 'suporte-exemplo',
  provider: 'waha',
  status: 'disconnected',
  created_at: '2026-10-26T12:00:00Z',
  // Mesmo que a linha viesse com isso (cache antigo), a janela não mostra.
  connection_config: { baseUrl: 'https://waha.exemplo.com.br', apiKey: 'chave-FAKE-que-nao-aparece' },
  evolution_api_key: 'outra-chave-FAKE',
  evolution_api_url: 'https://evolution.exemplo.com.br',
};

const abrir = (onKeyReplaced = vi.fn()) => {
  const { container } = render(
    <ViewInstanceModal open onOpenChange={vi.fn()} instance={instancia} onKeyReplaced={onKeyReplaced} />,
  );
  return { onKeyReplaced, container };
};

beforeEach(() => {
  acao.mockReset();
  toast.mockReset();
});

describe('ViewInstanceModal', () => {
  it('pergunta ao servidor e mostra só sim ou não; nunca chave nem endereço', async () => {
    acao.mockResolvedValue({ ok: true, credential_configured: true });
    abrir();
    expect(await screen.findByText('Chave configurada: sim')).toBeInTheDocument();
    expect(acao).toHaveBeenCalledWith(instancia.id, 'credential');
    const html = document.body.innerHTML;
    for (const segredo of ['chave-FAKE-que-nao-aparece', 'outra-chave-FAKE', 'waha.exemplo.com.br', 'evolution.exemplo.com.br']) {
      expect(html).not.toContain(segredo);
    }
  });

  it('sem chave salva: "não"', async () => {
    acao.mockResolvedValue({ ok: true, credential_configured: false });
    abrir();
    expect(await screen.findByText('Chave configurada: não')).toBeInTheDocument();
  });

  it('trocar a chave: manda ao servidor, que testa antes de guardar', async () => {
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'credential' ? { ok: true, credential_configured: false } : { ok: true, credential_configured: true },
    );
    const { onKeyReplaced } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Substituir chave' }));
    fireEvent.change(screen.getByLabelText('Chave nova'), { target: { value: 'chave-nova-FAKE-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Testar e guardar' }));
    await waitFor(() => expect(acao).toHaveBeenCalledWith(instancia.id, 'replace_key', { api_key: 'chave-nova-FAKE-1' }));
    expect(await screen.findByText('Chave configurada: sim')).toBeInTheDocument();
    expect(onKeyReplaced).toHaveBeenCalled();
  });

  it('servidor recusa a chave nova: avisa e não muda nada', async () => {
    acao.mockImplementation(async (_id: string, action: string) =>
      action === 'credential'
        ? { ok: true, credential_configured: true }
        : { ok: false, reason: 'key_rejected', error: 'O servidor recusou essa chave para este número. Nada foi trocado.' },
    );
    const { onKeyReplaced } = abrir();
    fireEvent.click(await screen.findByRole('button', { name: 'Substituir chave' }));
    fireEvent.change(screen.getByLabelText('Chave nova'), { target: { value: 'chave-errada-FAKE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Testar e guardar' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: 'O servidor recusou essa chave para este número. Nada foi trocado.' })),
    );
    expect(onKeyReplaced).not.toHaveBeenCalled();
  });
});
