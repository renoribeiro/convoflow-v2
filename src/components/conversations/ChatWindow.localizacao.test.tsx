/**
 * Localização pelo clipe das Conversas (lote 6f, B5, decisão D4).
 *
 * O que precisa continuar verdadeiro:
 *  - o clipe abre o menu com "Arquivo" e "Localização";
 *  - a localização sai pelo adapter (servidor, nos três provedores) com
 *    latitude, longitude, nome e endereço, e a conversa grava a linha com o
 *    tipo 'location' e o ponto em metadata (é dele que a bolha tira o mapa);
 *  - se não saiu, a linha fica com o motivo, como os outros envios;
 *  - número desconectado: nada sai e nada é gravado (a janela fica aberta);
 *  - fora das 24 horas da API Oficial, o clipe nem aparece.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000010';
const CONTACT_ID = 'aaaaaaaa-0000-4000-8000-000000000011';
const CONVERSATION_ID = 'aaaaaaaa-0000-4000-8000-000000000012';

const toast = vi.hoisted(() => ({ error: vi.fn(), info: vi.fn(), success: vi.fn(), warning: vi.fn() }));
vi.mock('sonner', () => ({ toast }));

// ---- estado ajustável por teste ------------------------------------------------
const estado = vi.hoisted(() => ({
  mensagens: [] as Record<string, unknown>[],
  oficial: true,
  conectada: true,
}));

const sendText = vi.fn(async () => ({ status: 'sent', providerMessageId: 'wamid.FAKE_SAIDA' }));
const sendMedia = vi.fn(async () => ({ status: 'sent', providerMessageId: 'wamid.FAKE_MIDIA' }));
const sendLocation = vi.fn(async (..._a: unknown[]): Promise<Record<string, unknown>> => ({ status: 'sent', providerMessageId: 'wamid.FAKE_LOCAL' }));
const adapter = {
  type: 'official',
  isReadyToSend: () => estado.conectada,
  sendText,
  sendMedia,
  sendLocation,
  setTyping: vi.fn(() => Promise.resolve()),
  getCapabilities: () => ({ fetchHistory: false, requiresTemplateOutsideWindow: estado.oficial }),
  getProfilePicture: vi.fn(() => Promise.resolve(null)),
};

const conversation = {
  id: CONVERSATION_ID,
  contact_id: CONTACT_ID,
  whatsapp_instance_id: 'inst-1',
  unread_count: 0,
  contacts: { id: CONTACT_ID, name: 'Helena Duarte', phone: '5511999998888', contact_tags: [] },
};

const mutateAsync = vi.fn(async (_linha: Record<string, unknown>) => ({ id: 'msg-otimista' }));

vi.mock('@/contexts/TenantContext', () => ({
  useTenant: () => ({ tenant: { id: TENANT_ID, name: 'Loja Teste' } }),
}));
vi.mock('@/hooks/useConversations', () => ({
  useConversation: () => ({ data: conversation, isLoading: false, error: null }),
  useMarkConversationAsRead: () => ({ mutate: vi.fn(), isPending: false }),
  useArchiveConversation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useMessages', () => ({
  useMessages: () => ({ isLoading: false, error: null, hasNextPage: false, isFetchingNextPage: false, fetchNextPage: vi.fn() }),
  getAllMessages: () => estado.mensagens,
  useSendMessage: () => ({ mutateAsync, isPending: false }),
  useMarkMessagesAsRead: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useEndChatbotSession', () => ({
  useEndChatbotSession: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useRealtimeMessages', () => ({ useRealtimeMessages: () => {} }));
vi.mock('@/hooks/useWhatsAppApi', () => ({
  useWhatsAppInstancesWithAdapter: () => ({ instances: [] }),
  useWhatsAppInstancesSafe: () => ({ instances: [] }),
  pickActiveInstance: () => ({ row: { id: 'inst-1', name: 'Principal', provider: 'official' }, adapter }),
}));
vi.mock('@/hooks/useSupabaseQuery', () => ({ useSupabaseQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSupabaseMutation', () => ({
  useSupabaseMutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('react-intersection-observer', () => ({ useInView: () => ({ ref: vi.fn(), inView: false }) }));
vi.mock('@/integrations/supabase/client', () => {
  const chain = { update: () => chain, eq: () => Promise.resolve({ error: null }), from: () => chain };
  return { supabase: { from: () => chain } };
});

const uploadWhatsAppMedia = vi.fn(async (file: File) => ({
  signedUrl: `https://exemplo.com.br/storage/v1/object/sign/whatsapp-media/t/${file.name}?token=FAKE`,
  path: `t/${file.name}`,
  mimeType: file.type,
  fileName: file.name,
  size: file.size,
}));
vi.mock('@/services/whatsapp/media-upload', async (orig) => ({
  ...(await orig<typeof import('@/services/whatsapp/media-upload')>()),
  uploadWhatsAppMedia: (f: File) => uploadWhatsAppMedia(f),
}));

vi.mock('./AudioRecorder', () => ({
  AudioRecorder: () => <button type="button" aria-label="Gravar áudio" />,
}));

vi.mock('./ContactPanel', () => ({ ContactPanel: () => null }));
vi.mock('./ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('./SendTemplateDialog', () => ({ SendTemplateDialog: () => null }));
vi.mock('./SaveQuickReplyDialog', () => ({ SaveQuickReplyDialog: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('./QuickRepliesPopover', () => ({ QuickRepliesPopover: () => null }));
vi.mock('./ConversationOwnerControl', () => ({ ConversationOwnerControl: () => null }));

// A janela tem teste próprio (SendLocationDialog.test); aqui interessa o que
// o ChatWindow faz com o ponto escolhido.
const PONTO = { latitude: -3.73186, longitude: -38.52667, nome: 'Loja Centro', endereco: 'Rua Um, 10, Fortaleza, CE' };
const janela = vi.hoisted(() => ({ resultado: null as null | boolean }));
vi.mock('./SendLocationDialog', () => ({
  SendLocationDialog: (p: { open: boolean; contactName: string; onSend: (x: unknown) => Promise<boolean> }) =>
    p.open ? (
      <div role="dialog" aria-label="Enviar localização">
        <p>para {p.contactName}</p>
        <button
          type="button"
          onClick={async () => {
            janela.resultado = await p.onSend(PONTO);
          }}
        >
          enviar ponto
        </button>
      </div>
    ) : null,
}));

import { ChatWindow } from './ChatWindow';

const HORA = 60 * 60 * 1000;
const mensagemDoCliente = (horasAtras: number) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000020',
  content: 'Onde fica a loja?',
  created_at: new Date(Date.now() - horasAtras * HORA).toISOString(),
  direction: 'inbound',
  status: 'read',
  message_type: 'text',
  media_url: null,
  evolution_message_id: 'wamid.FAKE_CLIENTE',
});

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ChatWindow conversationId={CONVERSATION_ID} />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

const ultimaGravacao = () => mutateAsync.mock.calls.at(-1)?.[0] as Record<string, unknown>;

async function abrirLocalizacao(user: ReturnType<typeof userEvent.setup>) {
  const clipe = screen.getByRole('button', { name: 'Anexar arquivo ou localização' });
  clipe.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('menuitem', { name: 'Arquivo' })).toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: 'Localização' }));
  return screen.findByRole('dialog', { name: 'Enviar localização' });
}

beforeEach(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  estado.mensagens = [mensagemDoCliente(1)];
  estado.oficial = true;
  estado.conectada = true;
  janela.resultado = null;
  [sendText, sendMedia, sendLocation, mutateAsync, toast.error].forEach((f) => f.mockClear());
  sendLocation.mockImplementation(async () => ({ status: 'sent', providerMessageId: 'wamid.FAKE_LOCAL' }));
});

describe('clipe: Arquivo e Localização', () => {
  it('a localização sai pelo adapter e a conversa grava o ponto', async () => {
    const user = userEvent.setup();
    renderChat();
    const dialogo = await abrirLocalizacao(user);
    expect(dialogo).toHaveTextContent('para Helena Duarte');

    await user.click(screen.getByRole('button', { name: 'enviar ponto' }));

    await waitFor(() => expect(sendLocation).toHaveBeenCalledTimes(1));
    expect(sendLocation).toHaveBeenCalledWith('5511999998888', {
      latitude: -3.73186,
      longitude: -38.52667,
      name: 'Loja Centro',
      address: 'Rua Um, 10, Fortaleza, CE',
    });
    await waitFor(() => expect(janela.resultado).toBe(true));
    expect(ultimaGravacao()).toMatchObject({
      contact_id: CONTACT_ID,
      message_type: 'location',
      content: 'Loja Centro',
      direction: 'outbound',
      status: 'sent',
      evolution_message_id: 'wamid.FAKE_LOCAL',
      metadata: { latitude: -3.73186, longitude: -38.52667, name: 'Loja Centro', address: 'Rua Um, 10, Fortaleza, CE' },
    });
  });

  it('o provedor recusou: a linha fica com o motivo, e o aviso diz que não saiu', async () => {
    sendLocation.mockImplementation(async () => ({ status: 'failed', error: 'O servidor recusou o envio.', reason: 'provider_error' }));
    const user = userEvent.setup();
    renderChat();
    await abrirLocalizacao(user);
    await user.click(screen.getByRole('button', { name: 'enviar ponto' }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(ultimaGravacao()).toMatchObject({ message_type: 'location', status: 'failed' });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('A localização não foi enviada.'));
    await waitFor(() => expect(janela.resultado).toBe(true));
  });

  it('número desconectado: nada sai, nada é gravado e a janela fica', async () => {
    estado.conectada = false;
    const user = userEvent.setup();
    renderChat();
    await abrirLocalizacao(user);
    await user.click(screen.getByRole('button', { name: 'enviar ponto' }));

    await waitFor(() => expect(janela.resultado).toBe(false));
    expect(sendLocation).not.toHaveBeenCalled();
    expect(mutateAsync).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it('API Oficial fora das 24 horas: sem clipe (só "Enviar template")', () => {
    estado.mensagens = [mensagemDoCliente(30)];
    renderChat();
    expect(screen.queryByRole('button', { name: 'Anexar arquivo ou localização' })).toBeNull();
    expect(screen.getByTestId('fora-da-janela-24h')).toBeInTheDocument();
  });
});
