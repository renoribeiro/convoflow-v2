import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockRpc, mockInvoke, mockToast } = vi.hoisted(() => ({
  mockRpc: vi.fn(),
  mockInvoke: vi.fn(),
  mockToast: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: mockRpc, functions: { invoke: mockInvoke } },
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }), toast: mockToast }));
vi.mock('@/lib/logger', () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { DeleteInstanceModal, providerEffectLines, type DeleteInstanceCounts } from './DeleteInstanceModal';

/**
 * O modal não decide nada: ele mostra o que a RPC whatsapp_instance_delete_preview
 * devolveu e só oferece "Excluir instância" quando ela disse ok. Estes testes
 * fixam os quatro estados (conferindo, recusada com histórico, vazia, erro) e
 * o texto — em especial que NENHUM estado manda o usuário "criar uma nova
 * instância", que é o caminho que perde o histórico.
 */

const ZERO: DeleteInstanceCounts = {
  conversations: 0, messages: 0, contacts: 0, chatbots: 0,
  chatbot_sessions: 0, campaigns: 0, followups: 0, followup_enrollments: 0, followup_sequences: 0,
};

const VAGA_CERTA: DeleteInstanceCounts = {
  conversations: 163, messages: 2622, contacts: 163, chatbots: 1,
  chatbot_sessions: 155, campaigns: 0, followups: 0, followup_enrollments: 0, followup_sequences: 0,
};

const baseInstance = {
  id: 'cccccccc-0000-4000-8000-000000000006',
  name: 'Vaga Certa',
  instance_key: '100000000000099',
  phone_number: '5511999999999',
  status: 'open',
  provider: 'official' as const,
};

function stubPreview(result: Record<string, unknown> | null, error: { message: string } | null = null) {
  mockRpc.mockResolvedValue({ data: result, error });
}

function renderModal(props: Partial<React.ComponentProps<typeof DeleteInstanceModal>> = {}) {
  const onOpenChange = vi.fn();
  const onSuccess = vi.fn();
  render(
    <DeleteInstanceModal open onOpenChange={onOpenChange} instance={baseInstance} onSuccess={onSuccess} {...props} />,
  );
  return { onOpenChange, onSuccess };
}

const deleteButton = () => screen.queryByRole('button', { name: 'Excluir instância' });

beforeEach(() => {
  vi.clearAllMocks();
});

describe('DeleteInstanceModal — estados', () => {
  it('ao abrir, chama o preview com o id da instância e mostra "conferindo" sem botão de excluir', async () => {
    let resolvePreview: (v: unknown) => void = () => {};
    mockRpc.mockReturnValue(new Promise((r) => { resolvePreview = r; }));
    renderModal();

    expect(mockRpc).toHaveBeenCalledWith('whatsapp_instance_delete_preview', { p_instance_id: baseInstance.id });
    expect(screen.getByTestId('delete-preview-loading')).toBeInTheDocument();
    expect(deleteButton()).toBeNull();

    resolvePreview({ data: { ok: true, reason: 'empty', counts: ZERO, total: 0 }, error: null });
    await waitFor(() => expect(deleteButton()).not.toBeNull());
  });

  it('recusada com histórico: mostra os números reais, NÃO oferece excluir e aponta reconectar/suporte', async () => {
    stubPreview({ ok: false, reason: 'has_history', counts: VAGA_CERTA, total: 3104, message: 'x' });
    renderModal();

    await screen.findByText('Exclusão recusada: esta instância guarda histórico');
    const table = screen.getByTestId('delete-counts');
    expect(table).toHaveTextContent('Conversas163');
    expect(table).toHaveTextContent('Mensagens2.622');
    expect(table).toHaveTextContent('Contatos163');
    expect(table).toHaveTextContent('Chatbots1');
    expect(table).toHaveTextContent('Sessões de chatbot155');
    expect(table).toHaveTextContent('Campanhas0');
    expect(table).toHaveTextContent('Follow-ups0');

    expect(deleteButton()).toBeNull();
    expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument();
    expect(screen.getByText(/não há como forçar/)).toBeInTheDocument();
    expect(screen.getByText('reconectar')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'contato@convoflow.com.br' })).toHaveAttribute(
      'href',
      'mailto:contato@convoflow.com.br',
    );
    // O texto antigo que mandava criar outra instância não existe mais.
    expect(screen.queryByText(/criar uma nova instância/)).toBeNull();
    expect(screen.queryByText(/removida da Evolution API/)).toBeNull();
  });

  it('follow-ups somam as três tabelas', async () => {
    stubPreview({
      ok: false, reason: 'has_history', total: 6,
      counts: { ...ZERO, followups: 1, followup_enrollments: 2, followup_sequences: 3 },
    });
    renderModal();
    await screen.findByTestId('delete-counts');
    expect(screen.getByTestId('delete-counts')).toHaveTextContent('Follow-ups6');
    expect(deleteButton()).toBeNull();
  });

  it('recusada por permissão: mostra a mensagem da RPC e não oferece excluir', async () => {
    stubPreview({ ok: false, reason: 'forbidden', message: 'Apenas Gestor ou Gerente pode excluir números de WhatsApp.' });
    renderModal();
    await screen.findByText('Apenas Gestor ou Gerente pode excluir números de WhatsApp.');
    expect(deleteButton()).toBeNull();
  });

  it('preview falhou: explica, oferece "Tentar de novo" e não oferece excluir', async () => {
    stubPreview(null, { message: 'permission denied for function' });
    renderModal();
    await screen.findByText('Não deu para conferir a instância');
    expect(screen.getByText('permission denied for function')).toBeInTheDocument();
    expect(deleteButton()).toBeNull();

    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(deleteButton()).not.toBeNull());
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('vazia (Meta): oferece excluir e diz que na Meta nada muda', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    renderModal();
    await screen.findByText('Esta instância está vazia');
    expect(deleteButton()).not.toBeNull();
    expect(screen.getByText(/Na Meta, nada muda/)).toBeInTheDocument();
    expect(screen.getByText(/app do ConvoFlow continua inscrito/)).toBeInTheDocument();
    expect(screen.queryByText(/Evolution/)).toBeNull();
    expect(screen.queryByText(/criar uma nova instância/)).toBeNull();
  });

  it('vazia (Evolution): diz que a sessão é encerrada no servidor da plataforma', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    renderModal({ instance: { ...baseInstance, provider: 'evolution' } });
    await screen.findByText('Esta instância está vazia');
    expect(screen.getByText(/servidor WhatsApp da plataforma \(Evolution\)/)).toBeInTheDocument();
    expect(screen.queryByText(/Na Meta, nada muda/)).toBeNull();
  });

  it('vazia (WAHA): diz que a sessão é apagada no servidor do cliente', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    renderModal({ instance: { ...baseInstance, provider: 'waha' } });
    await screen.findByText('Esta instância está vazia');
    expect(screen.getByText(/seu servidor WAHA/)).toBeInTheDocument();
  });
});

describe('DeleteInstanceModal — excluir', () => {
  it('chama a edge function com instance_id e, no ok, fecha e avisa onSuccess', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    mockInvoke.mockResolvedValue({ data: { ok: true, provider_cleanup: 'not_applicable' }, error: null });
    const { onOpenChange, onSuccess } = renderModal();

    await screen.findByText('Esta instância está vazia');
    fireEvent.click(deleteButton()!);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockInvoke).toHaveBeenCalledWith('delete-whatsapp-instance', { body: { instance_id: baseInstance.id } });
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Instância excluída' }));
  });

  it('provedor não confirmou: ainda é sucesso no ConvoFlow, mas o aviso diz isso', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    mockInvoke.mockResolvedValue({ data: { ok: true, provider_cleanup: 'failed' }, error: null });
    const { onSuccess } = renderModal({ instance: { ...baseInstance, provider: 'evolution' } });

    await screen.findByText('Esta instância está vazia');
    fireEvent.click(deleteButton()!);

    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Instância excluída do ConvoFlow', variant: 'destructive' }),
    );
  });

  it('servidor recusou na hora (ok:false): nada de onSuccess, recarrega o preview', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    mockInvoke.mockResolvedValue({
      data: { ok: false, reason: 'has_history', error: 'Chegou uma mensagem nesta instância durante a exclusão.' },
      error: null,
    });
    const { onSuccess, onOpenChange } = renderModal();

    await screen.findByText('Esta instância está vazia');
    stubPreview({ ok: false, reason: 'has_history', counts: { ...ZERO, messages: 1, conversations: 1 }, total: 2 });
    fireEvent.click(deleteButton()!);

    await screen.findByText('Exclusão recusada: esta instância guarda histórico');
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Exclusão recusada', variant: 'destructive' }));
    expect(deleteButton()).toBeNull();
  });

  it('edge function devolveu non-2xx: mostra a mensagem do corpo, sem onSuccess', async () => {
    stubPreview({ ok: true, reason: 'empty', counts: ZERO, total: 0 });
    const context = new Response(JSON.stringify({ ok: false, error: 'Instância não encontrada.' }), { status: 404 });
    mockInvoke.mockResolvedValue({ data: null, error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }) });
    const { onSuccess } = renderModal();

    await screen.findByText('Esta instância está vazia');
    fireEvent.click(deleteButton()!);

    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Erro', description: 'Instância não encontrada.' })),
    );
    expect(onSuccess).not.toHaveBeenCalled();
  });
});

describe('providerEffectLines', () => {
  it('nunca fala em Evolution para instância Meta, e nunca manda recriar', () => {
    for (const p of ['official', 'evolution', 'waha', null, undefined] as const) {
      const text = providerEffectLines(p).join(' ');
      expect(text).not.toMatch(/nova instância/i);
      if (p === 'official') expect(text).not.toMatch(/Evolution/);
    }
    expect(providerEffectLines(null)).toEqual(providerEffectLines('evolution'));
  });
});
