import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Excluir e renomear uma conta do Instagram (fatia 4a): o modal trata como
 * Instagram, não como Evolution. Os rótulos não dizem "instância" nem "chave",
 * o texto do que acontece é o do Instagram, e a exclusão continua RECUSADA
 * quando há histórico (quem decide é a RPC, igual ao WhatsApp).
 */

const { mockRpc, mockInvoke, mockToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockInvoke: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc, functions: { invoke: mockInvoke }, from: vi.fn() },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: mockToast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { DeleteInstanceModal, providerEffectLines, type DeleteInstanceCounts } from './DeleteInstanceModal';
import { RenameInstanceModal } from './RenameInstanceModal';

const ZERO: DeleteInstanceCounts = {
  conversations: 0, messages: 0, contacts: 0, chatbots: 0,
  chatbot_sessions: 0, campaigns: 0, followups: 0, followup_enrollments: 0, followup_sequences: 0,
};
// O que a conta de teste guarda hoje (Loja Teste): 3 contatos, 3 conversas, 9 mensagens.
const LOJA_TESTE: DeleteInstanceCounts = { ...ZERO, conversations: 3, messages: 9, contacts: 3 };

const instagramAccount = {
  id: 'cccccccc-0000-4000-8000-000000000003',
  name: 'Instagram Teste',
  instance_key: 'instagram_17841419262135883',
  status: 'connected',
  provider: 'instagram' as const,
  profile_name: '@convoflow',
  connection_config: { igUsername: 'convoflow' },
};

function renderDelete() {
  render(<DeleteInstanceModal open onOpenChange={vi.fn()} instance={instagramAccount} onSuccess={vi.fn()} />);
}

const dialogText = () => document.body.textContent ?? '';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Excluir conta do Instagram', () => {
  it('rótulos de Instagram: título, @ e canal — sem "Chave", sem "instância", sem o instance_key', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, reason: 'empty', counts: ZERO, total: 0 }, error: null });
    renderDelete();
    expect(screen.getByText('Excluir conta do Instagram')).toBeInTheDocument();
    expect(screen.getByText('@convoflow')).toBeInTheDocument();
    expect(screen.getByText('Canal')).toBeInTheDocument();
    await screen.findByText('Esta conta está vazia');
    expect(dialogText()).not.toMatch(/chave/i);
    expect(dialogText()).not.toMatch(/inst[aâ]ncia/i);
    expect(dialogText()).not.toContain('instagram_17841419262135883');
    expect(dialogText()).not.toContain('Evolution');
    expect(screen.getByRole('button', { name: 'Excluir conta' })).toBeInTheDocument();
  });

  it('o que acontece é o do Instagram (nada muda lá; some o vínculo e o acesso no cofre)', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, reason: 'empty', counts: ZERO, total: 0 }, error: null });
    renderDelete();
    await screen.findByText('Esta conta está vazia');
    for (const line of providerEffectLines('instagram')) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    expect(dialogText()).toContain('No Instagram, nada muda');
    expect(dialogText()).toContain('acesso guardado no cofre');
    expect(dialogText()).not.toMatch(/servidor WhatsApp da plataforma|sessão é encerrada/);
  });

  it('com histórico continua RECUSADA: números reais, sem botão de excluir, e o caminho é reconectar', async () => {
    mockRpc.mockResolvedValue({
      data: { ok: false, reason: 'has_history', counts: LOJA_TESTE, total: 15, message: 'x' },
      error: null,
    });
    renderDelete();
    await screen.findByText('Exclusão recusada: esta conta guarda histórico');
    expect(screen.queryByRole('button', { name: /Excluir/ })).toBeNull();
    expect(screen.getByTestId('delete-counts')).toHaveTextContent('Mensagens9');
    expect(dialogText()).toContain('reconectar');
    expect(dialogText()).not.toMatch(/QR Code|Desconectar|Nova Instância/);
    expect(dialogText()).not.toMatch(/inst[aâ]ncia/i);
  });

  it('excluir chama a mesma edge function (a RPC decide) e avisa "Conta do Instagram excluída"', async () => {
    mockRpc.mockResolvedValue({ data: { ok: true, reason: 'empty', counts: ZERO, total: 0 }, error: null });
    mockInvoke.mockResolvedValue({ data: { ok: true, provider: 'instagram', provider_cleanup: 'skipped' }, error: null });
    renderDelete();
    (await screen.findByRole('button', { name: 'Excluir conta' })).click();
    await waitFor(() =>
      expect(mockInvoke).toHaveBeenCalledWith('delete-whatsapp-instance', { body: { instance_id: instagramAccount.id } }),
    );
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith({
        title: 'Conta do Instagram excluída',
        description: 'Nenhum histórico foi apagado: a conta estava vazia.',
      }),
    );
  });
});

describe('Renomear conta do Instagram', () => {
  it('sem "instância" e sem "Chave técnica"', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <RenameInstanceModal open onOpenChange={vi.fn()} instance={instagramAccount} />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Renomear conta do Instagram')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da conta')).toHaveValue('Instagram Teste');
    expect(dialogText()).not.toMatch(/chave/i);
    expect(dialogText()).not.toMatch(/inst[aâ]ncia/i);
  });

  it('WhatsApp continua com os textos de sempre', () => {
    const qc = new QueryClient();
    render(
      <QueryClientProvider client={qc}>
        <RenameInstanceModal
          open
          onOpenChange={vi.fn()}
          instance={{ id: 'wa-1', name: 'Vaga Certa', instance_key: '100000000000099', provider: 'official' }}
        />
      </QueryClientProvider>,
    );
    expect(screen.getByText('Renomear instância')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da Instância')).toBeInTheDocument();
    expect(dialogText()).toContain('Chave técnica:');
  });
});
