/**
 * Áudio e citação no compositor das Conversas (ChatWindow).
 *
 * O que precisa continuar verdadeiro:
 *  - responder citando manda o id do WHATSAPP (wamid.*), não o nosso id;
 *  - o microfone trava ANTES de gravar quando o envio vai ser recusado
 *    (janela de 24 h da Meta fechada, número desconectado);
 *  - a gravação sai como mensagem de voz (ptt) e o anexo como arquivo;
 *  - áudio não leva legenda: ela não vai, não é gravada, e o texto fica no campo;
 *  - áudio anexado fora de MP3/M4A/AAC/OGG recebe "formato não aceito".
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MOTIVOS_AUDIO_BLOQUEADO } from '@/lib/conversations/audioBlock';

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
const adapter = {
  type: 'official',
  isReadyToSend: () => estado.conectada,
  sendText,
  sendMedia,
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
vi.mock('@/hooks/useChatHistorySync', () => ({
  useChatHistorySync: () => ({ syncConversation: vi.fn(async () => {}) }),
}));
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

// O gravador de verdade tem teste próprio; aqui interessa o que o ChatWindow passa a ele.
const gravador = vi.hoisted(() => ({ props: null as null | Record<string, any> }));
vi.mock('./AudioRecorder', () => ({
  AudioRecorder: (p: Record<string, any>) => {
    gravador.props = p;
    return <button type="button" aria-label="Gravar áudio" data-motivo={p.blockedReason ?? ''} />;
  },
}));

vi.mock('./ContactPanel', () => ({ ContactPanel: () => null }));
vi.mock('./ChatSearchBar', () => ({ ChatSearchBar: () => null }));
vi.mock('./SendTemplateDialog', () => ({ SendTemplateDialog: () => null }));
vi.mock('./SaveQuickReplyDialog', () => ({ SaveQuickReplyDialog: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('./QuickRepliesPopover', () => ({ QuickRepliesPopover: () => null }));
vi.mock('./ConversationOwnerControl', () => ({ ConversationOwnerControl: () => null }));

import { ChatWindow } from './ChatWindow';

const HORA = 60 * 60 * 1000;
const mensagemDoCliente = (horasAtras: number, extra: Record<string, unknown> = {}) => ({
  id: 'aaaaaaaa-0000-4000-8000-000000000020',
  content: 'Quero saber o preço',
  created_at: new Date(Date.now() - horasAtras * HORA).toISOString(),
  direction: 'inbound',
  status: 'read',
  message_type: 'text',
  media_url: null,
  evolution_message_id: 'wamid.FAKE_CLIENTE',
  ...extra,
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

const campo = () => screen.getByRole('textbox') as HTMLTextAreaElement;
const inputArquivo = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const anexar = (file: File) => fireEvent.change(inputArquivo(), { target: { files: [file] } });
const ultimaGravacao = () => mutateAsync.mock.calls.at(-1)?.[0] as Record<string, unknown>;

beforeEach(() => {
  estado.mensagens = [mensagemDoCliente(1)];
  estado.oficial = true;
  estado.conectada = true;
  gravador.props = null;
  [sendText, sendMedia, mutateAsync, uploadWhatsAppMedia, toast.error, toast.info, toast.warning].forEach((f) => f.mockClear());
});

// =============================================================================
describe('responder citando: vai o id do WhatsApp', () => {
  it('texto em resposta leva o wamid da mensagem do cliente, não o nosso id', async () => {
    const user = userEvent.setup();
    renderChat();
    fireEvent.doubleClick(screen.getByText('Quero saber o preço'));
    expect(screen.getByText('Respondendo:')).toBeInTheDocument();

    await user.click(campo());
    await user.keyboard('Custa R$ 50{Enter}');

    await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    expect(sendText).toHaveBeenCalledWith('5511999998888', 'Custa R$ 50', {
      quotedMessageId: 'wamid.FAKE_CLIENTE',
      linkPreview: true,
    });
  });

  it('mensagem sem id do WhatsApp: a resposta sai sem citação (nunca com o nosso id)', async () => {
    estado.mensagens = [mensagemDoCliente(1, { evolution_message_id: null })];
    const user = userEvent.setup();
    renderChat();
    fireEvent.doubleClick(screen.getByText('Quero saber o preço'));
    await user.click(campo());
    await user.keyboard('ok{Enter}');
    await waitFor(() => expect(sendText).toHaveBeenCalledTimes(1));
    expect((sendText.mock.calls[0] as unknown[])[2]).toEqual({ quotedMessageId: undefined, linkPreview: true });
  });

  it('áudio em resposta também cita pelo wamid', async () => {
    renderChat();
    fireEvent.doubleClick(screen.getByText('Quero saber o preço'));
    await act(async () => {
      await gravador.props!.onSend(new File(['x'], 'voz-1.ogg', { type: 'audio/ogg' }), { voz: true });
    });
    expect((sendMedia.mock.calls[0] as unknown[])[1]).toMatchObject({ quotedMessageId: 'wamid.FAKE_CLIENTE' });
  });
});

// =============================================================================
describe('microfone travado antes de gravar', () => {
  it('cliente escreveu há 1 hora: liberado', () => {
    renderChat();
    expect(gravador.props?.blockedReason).toBeNull();
  });

  it('número oficial e cliente sem escrever há 25 horas: travado com o motivo da janela', () => {
    estado.mensagens = [mensagemDoCliente(25)];
    renderChat();
    expect(gravador.props?.blockedReason).toBe(MOTIVOS_AUDIO_BLOQUEADO.janelaFechada);
  });

  it('QR Code (sem janela de 24h) não trava por tempo', () => {
    estado.mensagens = [mensagemDoCliente(25)];
    estado.oficial = false;
    renderChat();
    expect(gravador.props?.blockedReason).toBeNull();
  });

  it('número desconectado: travado dizendo qual', () => {
    estado.conectada = false;
    renderChat();
    expect(gravador.props?.blockedReason).toBe(MOTIVOS_AUDIO_BLOQUEADO.desconectada('Principal'));
  });
});

// =============================================================================
describe('gravação sai como mensagem de voz', () => {
  it('ptt true, sem legenda, gravada como áudio com conteúdo vazio', async () => {
    renderChat();
    let saiu: unknown;
    await act(async () => {
      saiu = await gravador.props!.onSend(new File(['x'], 'voz-1.ogg', { type: 'audio/ogg' }), { voz: true });
    });
    expect(saiu).toBe(true);
    expect(sendMedia).toHaveBeenCalledWith('5511999998888', expect.objectContaining({
      mediaType: 'audio',
      mimeType: 'audio/ogg',
      ptt: true,
      caption: undefined,
    }));
    expect(ultimaGravacao()).toMatchObject({ message_type: 'audio', content: '', status: 'sent' });
  });

  it('bucket privado: o provedor recebe o link temporário e o caminho; a mensagem grava só o caminho', async () => {
    renderChat();
    await act(async () => {
      await gravador.props!.onSend(new File(['x'], 'voz-1.ogg', { type: 'audio/ogg' }), { voz: true });
    });
    expect(sendMedia).toHaveBeenCalledWith('5511999998888', expect.objectContaining({
      mediaUrl: 'https://exemplo.com.br/storage/v1/object/sign/whatsapp-media/t/voz-1.ogg?token=FAKE',
      mediaPath: 't/voz-1.ogg',
    }));
    expect(ultimaGravacao()).toMatchObject({ media_url: 't/voz-1.ogg' });
  });

  it('fora da janela, um envio que escapou da trava é barrado antes do upload e devolve false', async () => {
    estado.mensagens = [mensagemDoCliente(25)];
    renderChat();
    let saiu: unknown;
    await act(async () => {
      saiu = await gravador.props!.onSend(new File(['x'], 'voz-1.ogg', { type: 'audio/ogg' }), { voz: true });
    });
    expect(saiu).toBe(false);
    expect(uploadWhatsAppMedia).not.toHaveBeenCalled();
    expect(sendMedia).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(MOTIVOS_AUDIO_BLOQUEADO.janelaFechada);
  });
});

// =============================================================================
describe('áudio anexado pelo clipe', () => {
  it('MP3 vai como ARQUIVO (ptt false); o texto do campo não vira legenda e fica no campo', async () => {
    const user = userEvent.setup();
    renderChat();
    anexar(new File(['mp3'], 'recado.mp3', { type: 'audio/mpeg' }));
    expect(screen.getByText('recado.mp3')).toBeInTheDocument();

    await user.click(campo());
    await user.keyboard('Segue o áudio{Enter}');

    await waitFor(() => expect(sendMedia).toHaveBeenCalledTimes(1));
    expect(sendMedia).toHaveBeenCalledWith('5511999998888', expect.objectContaining({
      mediaType: 'audio',
      mimeType: 'audio/mpeg',
      ptt: false,
      caption: undefined,
    }));
    // A conversa não mostra uma legenda que o cliente não recebeu.
    expect(ultimaGravacao()).toMatchObject({ message_type: 'audio', content: '' });
    await waitFor(() => expect(campo()).toHaveValue('Segue o áudio'));
    expect(toast.info).toHaveBeenCalledWith(expect.stringContaining('não aceita legenda em áudio'));
    expect(screen.queryByText('recado.mp3')).toBeNull();
  });

  it('M4A do Windows (audio/x-m4a) sobe com o tipo padrão audio/mp4', async () => {
    const user = userEvent.setup();
    renderChat();
    anexar(new File(['m4a'], 'recado.m4a', { type: 'audio/x-m4a' }));
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(uploadWhatsAppMedia).toHaveBeenCalledTimes(1));
    expect((uploadWhatsAppMedia.mock.calls[0] as unknown as [File])[0].type).toBe('audio/mp4');
  });

  it('WAV recebe "formato não aceito" e não fica anexado', () => {
    renderChat();
    anexar(new File(['wav'], 'gravacao.wav', { type: 'audio/wav' }));
    expect(toast.error).toHaveBeenCalledWith('Formato de áudio não aceito. Envie MP3, M4A, AAC ou OGG.');
    expect(screen.queryByText('gravacao.wav')).toBeNull();
  });

  it('imagem continua com legenda', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:foto');
    URL.revokeObjectURL = vi.fn();
    renderChat();
    anexar(new File(['jpg'], 'foto.jpg', { type: 'image/jpeg' }));
    await user.click(campo());
    await user.keyboard('Olha a foto{Enter}');
    await waitFor(() => expect(sendMedia).toHaveBeenCalledTimes(1));
    expect((sendMedia.mock.calls[0] as unknown[])[1]).toMatchObject({ mediaType: 'image', caption: 'Olha a foto' });
    expect(ultimaGravacao()).toMatchObject({ content: 'Olha a foto' });
  });

  it('fora da janela de 24h o anexo é barrado antes do upload e continua anexado', async () => {
    estado.mensagens = [mensagemDoCliente(25)];
    const user = userEvent.setup();
    renderChat();
    anexar(new File(['mp3'], 'recado.mp3', { type: 'audio/mpeg' }));
    await user.click(screen.getByRole('button', { name: 'Enviar' }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(MOTIVOS_AUDIO_BLOQUEADO.janelaFechada));
    expect(uploadWhatsAppMedia).not.toHaveBeenCalled();
    expect(screen.getByText('recado.mp3')).toBeInTheDocument();
  });
});
