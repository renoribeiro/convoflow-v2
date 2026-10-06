import React, { useState, useEffect, useMemo, useRef } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Send,
  Paperclip,
  Smile,
  MoreVertical,
  AlertCircle,
  Edit,
  Tag,
  RefreshCw,
  Archive,
  EyeOff,
  X,
  Image as ImageIcon,
  FileText as FileTextIcon,
  MessageCircle,
  Search,
  PanelRightOpen,
  PanelRightClose,
  ArrowLeft,
  SquareX,
} from 'lucide-react';
import { format, isToday, differenceInMinutes } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useMessages, useSendMessage, useMarkMessagesAsRead, getAllMessages } from '@/hooks/useMessages';
import { useInView } from 'react-intersection-observer';
import { useTenant } from '@/contexts/TenantContext';
import { toast } from 'sonner';
import { EmptyState } from '@/components/shared/EmptyState';
import { Link } from 'react-router-dom';
import { tutorialKey } from '@/lib/help/tutorials';
import {
  useConversation,
  useMarkConversationAsRead,
  useArchiveConversation,
} from '@/hooks/useConversations';
import { useEndChatbotSession, SESSION_END_FORBIDDEN_MESSAGE } from '@/hooks/useEndChatbotSession';
import { invalidateConversationCounts } from '@/lib/conversations/countKeys';
import {
  asChannel,
  initialsOf,
  type ConversationChannel,
} from '@/lib/conversations/channel';
import { contactDisplayName, instagramHandle } from '@/lib/instagram/contactProfile';
import { useInstagramContactProfiles } from '@/hooks/useInstagramContactProfiles';
import { useConversationBotSession } from '@/hooks/useChatbotSessions';
import { useRealtimeMessages } from '@/hooks/useRealtimeMessages';
import { useChatHistorySync } from '@/hooks/useChatHistorySync';
import { useWhatsAppInstancesWithAdapter, pickActiveInstance } from '@/hooks/useWhatsAppApi';
import { resolveConversationInstance } from '@/lib/conversations/instanceForConversation';
import { useInstagramReplyWindow } from '@/hooks/useInstagramReplyWindow';
import {
  INSTAGRAM_COMPOSER_TEXT,
  INSTAGRAM_TEXT_MAX_BYTES,
  INSTAGRAM_TEXT_WARN_BYTES,
  isInstagramConnectionExpired,
  utf8ByteLength,
} from '@/lib/instagram/reply';
import { sendInstagramReply } from '@/services/instagram/sendInstagramReply';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { providerLabel, WhatsAppAdapterError } from '@/services/whatsapp';
import { uploadWhatsAppMedia, detectMediaTypeFromMime } from '@/services/whatsapp/media-upload';
import { logger } from '@/lib/logger';
import { formatPhoneBR } from '@/lib/utils';
import { MessageBubble, type RenderableMessage } from './MessageBubble';
import { LeadTagsDialog } from '@/components/etiquetas/LeadTagsDialog';
import { ContactPanel } from './ContactPanel';
import { ChatSearchBar } from './ChatSearchBar';
import { QuickRepliesPopover } from './QuickRepliesPopover';
import { SaveQuickReplyDialog } from './SaveQuickReplyDialog';
import { shouldOpenQuickReplies } from './quickReplyContext';
import { AudioRecorder } from './AudioRecorder';
import { SendTemplateDialog } from './SendTemplateDialog';
import { ConversationOwnerControl } from './ConversationOwnerControl';
import { BotSessionBadge } from './BotSessionBadge';

interface ChatWindowProps {
  conversationId?: string;
  /** Controlled in-conversation search visibility (driven by the page shortcut hook). */
  searchOpen?: boolean;
  onSearchOpenChange?: (open: boolean) => void;
  /** Controlled contact panel visibility (driven by the page + persisted to localStorage). */
  panelOpen?: boolean;
  onPanelOpenChange?: (open: boolean) => void;
  /** When provided (mobile), shows a back arrow in the header to return to the list. */
  onBack?: () => void;
  /**
   * Avisa o canal da conversa aberta, para a chave WhatsApp/Instagram da página
   * acompanhar (link direto para uma conversa do outro canal, por exemplo).
   */
  onChannelDetected?: (channel: ConversationChannel) => void;
}

/** Max auto-grow height for the message textarea (~5 rows). */
const MAX_TEXTAREA_HEIGHT = 120;

/**
 * Ponteiro grosso = dedo (celular/tablet). Serve para NÃO puxar o foco de volta
 * ao campo nesses aparelhos: puxar abriria o teclado virtual sem o usuário pedir.
 */
function isCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** Parses webhook metadata that some providers store as JSON inside `content`. */
function parseContentMeta(content: string | null): Record<string, any> {
  if (typeof content === 'string' && content.startsWith('{')) {
    try {
      return JSON.parse(content);
    } catch {
      return {};
    }
  }
  return {};
}

/** Best-effort extraction of a quoted/reply reference from parsed metadata.
 *  NOTE: the `messages` table has no quoted column — this only resolves when a
 *  provider webhook embedded the reference inside the JSON content. */
function extractQuoted(meta: Record<string, any>): RenderableMessage['quoted'] {
  const q = meta?.quoted ?? meta?.context?.quoted ?? meta?.quotedMessage ?? null;
  if (q && typeof q === 'object') {
    return {
      id: String(q.id ?? q.stanzaId ?? ''),
      content: q.content ?? q.text ?? q.body ?? null,
      sender: q.sender ?? q.author ?? q.participant ?? null,
    };
  }
  return null;
}

function lastSeenLabel(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  const mins = differenceInMinutes(new Date(), d);
  if (mins < 1) return 'Visto agora há pouco';
  if (mins < 60) return `Visto há ${mins} min`;
  if (isToday(d)) return `Visto às ${format(d, 'HH:mm', { locale: ptBR })}`;
  return `Visto em ${format(d, 'dd/MM', { locale: ptBR })} às ${format(d, 'HH:mm', { locale: ptBR })}`;
}

export const ChatWindow = ({
  conversationId,
  searchOpen = false,
  onSearchOpenChange,
  panelOpen = false,
  onPanelOpenChange,
  onBack,
  onChannelDetected,
}: ChatWindowProps) => {
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [quickRepliesOpen, setQuickRepliesOpen] = useState(false);
  // Salvar uma mensagem já enviada como resposta rápida. O texto fica em estado
  // próprio: o diálogo é montado uma vez e reaproveitado a cada mensagem.
  const [saveQuickReplyOpen, setSaveQuickReplyOpen] = useState(false);
  const [quickReplyDraft, setQuickReplyDraft] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingFilePreview, setPendingFilePreview] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<RenderableMessage | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false);
  const [isEndSessionOpen, setIsEndSessionOpen] = useState(false);
  // Contact is "typing" — no provider currently emits inbound typing to the client,
  // so this stays false. The UI slot below the name is ready for when it does.
  const [isContactTyping] = useState(false);
  const [editForm, setEditForm] = useState({
    name: '',
    phone: '',
    lead_source_id: '',
    current_stage_id: '',
  });

  // In-conversation search.
  const [searchTerm, setSearchTerm] = useState('');
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef<number>(0);
  const messageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const { instances } = useWhatsAppInstancesWithAdapter();

  // Buscar conversa por ID da conversa para obter contact_id e dados do contato
  const { data: conversation, isLoading: conversationLoading, error: conversationError } = useConversation(conversationId || '');
  const contact = conversation?.contacts;
  const contactId = conversation?.contact_id;
  const contactTagIds = useMemo(
    () =>
      ((contact as any)?.contact_tags ?? [])
        .map((ct: any) => ct.tags?.id)
        .filter(Boolean) as string[],
    [contact],
  );
  const conversationInstanceId = (conversation as any)?.whatsapp_instance_id ?? null;
  // Canal da conversa (fatia 1 do Instagram). A conversa carrega o seu; o do
  // contato é a rede para dado sem a coluna.
  const conversationChannel: string | null =
    (conversation as any)?.channel ?? (contact as any)?.channel ?? null;
  const isInstagram = conversationChannel === 'instagram';

  // A chave da página segue o canal da conversa aberta.
  useEffect(() => {
    if (!conversationId || !conversation) return;
    onChannelDetected?.(asChannel(conversationChannel));
  }, [conversationId, conversationChannel]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Nome no cabeçalho. Instagram: nome, senão @, senão "Cliente do Instagram". WhatsApp: o de sempre. */
  const headerName = isInstagram
    ? contactDisplayName(contact, 'instagram')
    : contact?.name || 'Contato';
  /** O @ embaixo do nome — só quando o nome já não é o próprio @. */
  const igHandle = isInstagram ? instagramHandle((contact as any)?.username) : null;
  const igHandleLine = igHandle && igHandle !== headerName ? igHandle : null;

  // Active instance + adapter. WhatsApp: o escolhedor de sempre. Qualquer
  // outro canal: SÓ a instância da própria conversa — nunca cai no WhatsApp da
  // Conta (ver instanceForConversation.ts).
  const active = useMemo(
    () =>
      resolveConversationInstance({
        list: instances,
        preferredInstanceId: conversationInstanceId,
        channel: conversationChannel,
        contactPhone: contact?.phone,
        legacyPick: pickActiveInstance,
      }),
    [instances, conversationInstanceId, conversationChannel, contact?.phone],
  );
  const capabilities = active?.adapter.getCapabilities();

  // Conversa do Instagram aberta sem nome ainda: pede o perfil agora (a lista
  // também pede; a marca do servidor garante uma busca só).
  useInstagramContactProfiles({
    contacts: contact ? [contact as any] : [],
    instances,
    enabled: isInstagram,
    onUpdated: () => {
      queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, tenant?.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations', tenant?.id] });
    },
  });

  const messagesQuery = useMessages({
    contactId: contactId || '',
    pageSize: 50,
    enabled: !!contactId,
  });

  const messages = getAllMessages(messagesQuery);
  const messagesLoading = messagesQuery.isLoading;
  const messagesError = messagesQuery.error;

  // ---- Instagram: janela de 24 h, conexão vencida, limite em bytes ---------
  // A última mensagem recebida refaz a consulta da janela quando o cliente
  // escreve de novo.
  const lastInboundMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].direction === 'inbound') return messages[i].id as string;
    }
    return null;
  }, [messages]);
  const igWindow = useInstagramReplyWindow(contactId, isInstagram, lastInboundMessageId);
  const igConnectionExpired =
    isInstagram && !!active && isInstagramConnectionExpired(active.row.connection_config, new Date());
  const igBytes = isInstagram ? utf8ByteLength(message.trim()) : 0;
  const igTooLong = igBytes > INSTAGRAM_TEXT_MAX_BYTES;
  /** Por que o compositor do Instagram está travado (null = não está). */
  const igBlockedReason: string | null = !isInstagram
    ? null
    : !active
      ? INSTAGRAM_COMPOSER_TEXT.noConnection
      : igConnectionExpired
        ? INSTAGRAM_COMPOSER_TEXT.connectionExpired
        : !igWindow.isLoading && !igWindow.isError && !igWindow.open
          ? INSTAGRAM_COMPOSER_TEXT.windowClosed
          : null;
  const igSendDisabled = isInstagram && (!!igBlockedReason || igWindow.isLoading || igTooLong);

  useRealtimeMessages({
    contactId: contactId || undefined,
    enabled: !!contactId,
  });

  const { syncConversation } = useChatHistorySync();
  const syncedContactRef = useRef<string | null>(null);

  // Auto-sync de histórico — só faz sentido para providers que SUPORTAM fetchHistory.
  useEffect(() => {
    // Instagram: nada de histórico nem foto de perfil (o adapter também não faz nada).
    if (!contactId || !contact?.phone || !active || isInstagram) return;
    if (syncedContactRef.current === contactId) return;
    syncedContactRef.current = contactId;

    if (capabilities?.fetchHistory) {
      syncConversation(contact.phone, contactId).catch((err) => {
        logger.warn('[ChatWindow] auto-sync falhou', {
          error: err instanceof Error ? err.message : String(err),
        });
      });
    }

    // Foto de perfil — best-effort em qualquer provider que retorne algo
    if (!(contact as any)?.avatar_url) {
      active.adapter
        .getProfilePicture(contact.phone)
        .then(async (url) => {
          if (url) {
            await supabase.from('contacts').update({ avatar_url: url }).eq('id', contactId);
            queryClient.invalidateQueries({ queryKey: ['conversation', conversationId, tenant?.id] });
          }
        })
        .catch(() => {});
    }
  }, [contactId, contact?.phone, (contact as any)?.avatar_url, active, isInstagram, capabilities?.fetchHistory, syncConversation, conversationId, tenant?.id, queryClient]);

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px 0px 0px 0px',
  });

  const { data: leadSources = [] } = useSupabaseQuery({
    table: 'lead_sources',
    select: 'id, name',
    filters: tenant?.id ? [{ column: 'tenant_id', operator: 'eq', value: tenant.id }] : [],
    enabled: !!tenant?.id,
  });

  const { data: funnelStages = [] } = useSupabaseQuery({
    table: 'funnel_stages',
    select: 'id, name',
    filters: tenant?.id ? [{ column: 'tenant_id', operator: 'eq', value: tenant.id }] : [],
    enabled: !!tenant?.id,
  });

  const sendMessageMutation = useSendMessage();
  const markAsReadMutation = useMarkMessagesAsRead();
  const markConversationAsReadMutation = useMarkConversationAsRead();
  const archiveConversationMutation = useArchiveConversation();
  const endChatbotSessionMutation = useEndChatbotSession();
  // Sessão ativa de chatbot neste contato (lida do mapa da Loja, o mesmo cache
  // da lista). null = nenhum bot conduzindo; o selo e o item do menu seguem isso.
  const { session: botSession, botName } = useConversationBotSession(contactId, conversationInstanceId);

  const updateContactMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'update',
    onSuccess: () => {
      toast.success('Contato atualizado com sucesso!');
      setIsEditModalOpen(false);
    },
    onError: () => {
      toast.error('Erro ao atualizar contato. Tente novamente.');
    },
  });

  useEffect(() => {
    if (inView && messagesQuery.hasNextPage && !messagesQuery.isFetchingNextPage) {
      messagesQuery.fetchNextPage();
    }
  }, [inView, messagesQuery]);

  useEffect(() => {
    // Don't yank the scroll while the user is navigating search results.
    if (searchOpen) return;
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, searchOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmojiPicker && !(event.target as Element).closest('.emoji-picker')) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showEmojiPicker]);

  // ESC closes the emoji picker / quick replies FIRST (highest priority). Capture
  // phase + stopPropagation prevents the page-level ESC chain from also firing.
  useEffect(() => {
    if (!showEmojiPicker && !quickRepliesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowEmojiPicker(false);
        setQuickRepliesOpen(false);
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [showEmojiPicker, quickRepliesOpen]);

  // Marcar mensagens como lidas localmente quando a conversa é aberta
  useEffect(() => {
    if (contactId && messages.length > 0) {
      const unreadMessages = messages.filter(
        (msg) => msg.direction === 'inbound' && msg.status !== 'read',
      );
      if (unreadMessages.length > 0) {
        markAsReadMutation.mutate({
          contactId,
          messageIds: unreadMessages.map((msg) => msg.id),
        });
      }
    }
  }, [contactId, messages.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (conversationId && conversation?.unread_count && conversation.unread_count > 0) {
      markConversationAsReadMutation.mutate(conversationId);
    }
  }, [conversationId, conversation?.unread_count]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cálculo da janela de 24h (Meta)
  const lastInboundAt = useMemo(() => {
    const inbound = messages.filter((m) => m.direction === 'inbound');
    if (!inbound.length) return null;
    return new Date(inbound[inbound.length - 1].created_at);
  }, [messages]);
  const outsideMetaWindow = useMemo(() => {
    if (!capabilities?.requiresTemplateOutsideWindow) return false;
    if (!lastInboundAt) return true;
    const ms = Date.now() - lastInboundAt.getTime();
    return ms > 24 * 60 * 60 * 1000;
  }, [capabilities?.requiresTemplateOutsideWindow, lastInboundAt]);

  // Collect unique campaign_ids from messages so we can resolve their names.
  const campaignIds = useMemo(() => {
    const ids = new Set<string>();
    messages.forEach((m: any) => {
      if (m.campaign_id) ids.add(m.campaign_id as string);
    });
    return [...ids];
  }, [messages]);

  const { data: campaignNames } = useQuery({
    queryKey: ['campaign-names', ...campaignIds],
    queryFn: async () => {
      if (campaignIds.length === 0) return {} as Record<string, string>;
      const { data } = await supabase
        .from('mass_message_campaigns')
        .select('id, name')
        .in('id', campaignIds);
      const map: Record<string, string> = {};
      (data ?? []).forEach((row: { id: string; name: string }) => {
        map[row.id] = row.name;
      });
      return map;
    },
    enabled: campaignIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  // Hook precisa ficar ANTES dos early returns para manter contagem estável.
  const renderable: RenderableMessage[] = useMemo(() => {
    return messages.map((m: any) => {
      const meta = parseContentMeta(m.content ?? null);
      return {
        id: m.id,
        content: m.content ?? null,
        created_at: m.created_at,
        direction: m.direction,
        status: m.status,
        message_type: m.message_type ?? 'text',
        media_url: m.media_url ?? null,
        metadata: Object.keys(meta).length ? meta : null,
        quoted: extractQuoted(meta),
        source: m.source ?? null,
        campaign_id: m.campaign_id ?? null,
        campaign_name: m.campaign_id && campaignNames ? (campaignNames[m.campaign_id] ?? null) : null,
        is_from_bot: m.is_from_bot ?? null,
        ad_referral: (m.ad_referral as RenderableMessage['ad_referral']) ?? null,
      };
    });
  }, [messages, campaignNames]);

  // ---- In-conversation search (client-side over loaded messages) ----
  const matchIds = useMemo(() => {
    const t = searchTerm.trim().toLowerCase();
    if (!searchOpen || t.length === 0) return [] as string[];
    return renderable.filter((m) => (m.content || '').toLowerCase().includes(t)).map((m) => m.id);
  }, [renderable, searchTerm, searchOpen]);

  const activeMatchId = matchIds[activeMatchIndex];

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [searchTerm, searchOpen]);

  useEffect(() => {
    if (activeMatchId) {
      messageRefs.current[activeMatchId]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeMatchId]);

  // Server-side total (older, not-yet-loaded history) — informational only.
  const { data: serverMatchCount } = useQuery({
    queryKey: ['chat-search-count', contactId, tenant?.id, searchTerm.trim()],
    enabled: searchOpen && searchTerm.trim().length >= 2 && !!contactId && !!tenant?.id,
    queryFn: async () => {
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant!.id)
        .eq('contact_id', contactId!)
        .ilike('content', `%${searchTerm.trim()}%`);
      return count ?? 0;
    },
    staleTime: 30 * 1000,
  });

  const hasMoreServerMatches = (serverMatchCount ?? 0) > matchIds.length;

  // Early returns APÓS todos os hooks
  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-full bg-card">
        <EmptyState
          icon={<MessageCircle className="w-full h-full" />}
          title="Nenhuma conversa selecionada"
          description="Selecione uma conversa da lista para começar a conversar"
        />
        {/* Único ponto de entrada do tutorial do dia a dia fora da Ajuda: o
            cartão do Dashboard só existe enquanto a Loja não tem instância. */}
        <Link
          to={`/dashboard/help#${tutorialKey('atender-conversas')}`}
          className="-mt-8 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
        >
          Primeira vez por aqui? Veja como atender conversas no dia a dia.
        </Link>
      </div>
    );
  }

  if (conversationError || messagesError) {
    return (
      <div className="flex-1 flex items-center justify-center p-4 h-full bg-card">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar a conversa. Tente novamente.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleEditContact = () => {
    if (contact) {
      setEditForm({
        name: contact.name || '',
        phone: contact.phone || '',
        lead_source_id: (contact as any).lead_source_id || '',
        current_stage_id: (contact as any).current_stage_id || '',
      });
      setIsEditModalOpen(true);
    }
  };

  const handleSaveContact = () => {
    if (!contact?.id) return;
    updateContactMutation.mutate({
      data: {
        name: editForm.name?.trim() || null,
        // Contato do Instagram não tem telefone: mandar o campo gravaria '' no
        // lugar de NULL. O identificador dele é o do Instagram (external_id).
        ...(isInstagram ? {} : { phone: editForm.phone }),
        lead_source_id: editForm.lead_source_id || null,
        current_stage_id: editForm.current_stage_id || null,
      },
      options: { filter: { column: 'id', operator: 'eq', value: contact.id } },
    });
  };

  const handleArchive = () => {
    if (!conversationId) return;
    archiveConversationMutation.mutate({ conversationId, isArchived: !(conversation as any)?.is_archived });
    if (active) {
      active.adapter.archiveChat(contact?.phone || '', !(conversation as any)?.is_archived).catch(() => {
        // Provider não suportar archive (ex.: Meta) é tratado em-tela; o estado local persiste.
      });
    }
  };

  const handleMarkUnread = async () => {
    if (!conversationId || !tenant?.id) return;
    const { error } = await supabase
      .from('conversations')
      .update({ unread_count: 1, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .eq('tenant_id', tenant.id);
    if (error) {
      toast.error('Falha ao marcar conversa como não lida.');
    } else {
      toast.success('Conversa marcada como não lida.');
      queryClient.invalidateQueries({ queryKey: ['conversations', tenant.id] });
      invalidateConversationCounts(queryClient);
    }
  };

  const handleEndChatbotSession = async () => {
    if (!contactId) return;
    try {
      // Mira a sessão que o selo mostrou; a instância dela pode não ser a da
      // conversa (contato antigo), por isso vai a da sessão quando existe.
      const { ended } = await endChatbotSessionMutation.mutateAsync({
        contactId,
        whatsappInstanceId: botSession?.whatsapp_instance_id ?? conversationInstanceId,
        sessionId: botSession?.id ?? null,
      });
      if (ended) {
        toast.success('Sessão do bot encerrada. A partir daqui é você quem responde.');
      } else {
        toast.info('Nenhuma sessão do bot ativa neste contato.');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      toast.error(
        msg === SESSION_END_FORBIDDEN_MESSAGE
          ? msg
          : 'Falha ao encerrar a sessão do bot. Tente novamente.',
      );
    } finally {
      setIsEndSessionOpen(false);
    }
  };

  /** Shared media sender used by the attachment flow and the audio recorder. */
  const sendMediaFile = async (file: File, caption: string) => {
    // Os controles de mídia nem aparecem numa conversa do Instagram; isto é a
    // rede de baixo.
    if (isInstagram) {
      toast.error('O Instagram só responde texto por aqui.');
      return;
    }
    if (!contactId || !tenant?.id || !active) {
      toast.error('Nenhuma instância de WhatsApp disponível.');
      return;
    }
    if (!active.adapter.isReadyToSend()) {
      toast.error(`A instância "${active.row.name}" não está conectada.`);
      return;
    }
    const phone = phoneOf(contact);
    if (!phone) {
      toast.error(SEM_ENDERECO);
      return;
    }
    const uploaded = await uploadWhatsAppMedia(file, tenant.id);
    const mediaType = detectMediaTypeFromMime(uploaded.mimeType);
    const providerResult = await active.adapter.sendMedia(phone, {
      mediaUrl: uploaded.publicUrl,
      mediaType,
      mimeType: uploaded.mimeType,
      fileName: uploaded.fileName,
      caption: caption || undefined,
      quotedMessageId: replyTo?.id,
    });
    const status = providerResult?.status === 'sent' || providerResult?.status === 'pending' ? 'sent' : 'failed';
    if (status === 'failed') {
      toast.error(`Mídia não enviada: ${providerResult?.error || 'erro desconhecido.'}`);
    }
    await sendMessageMutation.mutateAsync({
      contact_id: contactId,
      whatsapp_instance_id: active.row.id,
      content: caption,
      direction: 'outbound',
      message_type: mediaType,
      media_url: uploaded.publicUrl,
      status,
      // Guarda o id do provider (wamid) p/ o webhook avançar delivered/read.
      evolution_message_id: providerResult?.providerMessageId ?? null,
      is_from_bot: false,
    } as any);
  };

  const handleSendAudio = async (file: File) => {
    try {
      await sendMediaFile(file, '');
      setReplyTo(null);
    } catch (e) {
      logger.error('[ChatWindow] envio de áudio falhou', {
        error: e instanceof Error ? e.message : String(e),
      });
      throw e; // let AudioRecorder show its own toast
    }
  };

  /**
   * Resposta de texto para o Instagram (fatia 3). Caminho próprio: nunca passa
   * pelo envio do WhatsApp logo abaixo. A linha é gravada com a sessão do
   * usuário (autor e participante); ver sendInstagramReply.
   */
  const handleSendInstagram = async () => {
    const text = message.trim();
    if (!text || !contactId || !tenant?.id) return;
    if (igBlockedReason) {
      toast.error(igBlockedReason);
      return;
    }
    if (!active) {
      toast.error(INSTAGRAM_COMPOSER_TEXT.noConnection);
      return;
    }
    if (igTooLong) {
      toast.error(INSTAGRAM_COMPOSER_TEXT.tooLong(igBytes));
      return;
    }

    setIsSending(true);
    try {
      const res = await sendInstagramReply({
        client: supabase as unknown as Parameters<typeof sendInstagramReply>[0]['client'],
        adapter: active.adapter,
        tenantId: (conversation as any)?.tenant_id ?? tenant.id,
        instanceId: active.row.id,
        contactId,
        recipientId: (contact as any)?.external_id ?? '',
        text,
      });
      queryClient.invalidateQueries({ queryKey: ['messages', contactId, tenant.id] });
      queryClient.invalidateQueries({ queryKey: ['conversations', tenant.id] });

      if (!res.ok) {
        toast.error(res.error);
        if (res.reason === 'outside_window') {
          queryClient.invalidateQueries({ queryKey: ['instagram-window', contactId] });
        }
        return; // o texto fica no campo para o atendente decidir
      }
      if (res.warning && res.warning !== 'sem_message_id') toast.warning(res.warning);
      setMessage('');
      resetTextareaHeight();
    } catch (e) {
      logger.error('[ChatWindow] envio pelo Instagram falhou', {
        error: e instanceof Error ? e.message : String(e),
      });
      toast.error('Erro ao enviar pelo Instagram.');
    } finally {
      setIsSending(false);
      refocusComposer();
    }
  };

  const handleSendMessage = async () => {
    if (!contactId || isSending || !tenant?.id) return;
    if (!message.trim() && !pendingFile) return;
    if (isInstagram) {
      await handleSendInstagram();
      return;
    }
    if (!active) {
      toast.error('Nenhuma instância de WhatsApp disponível.');
      return;
    }
    if (!active.adapter.isReadyToSend()) {
      toast.error(`A instância "${active.row.name}" não está conectada.`);
      return;
    }
    // Contato sem telefone: até a fatia 1 do Instagram isso era impossível
    // (contacts.phone era NOT NULL). Agora é possível, e sem esta guarda o
    // envio sairia com destinatário vazio — o provedor devolveria um erro
    // genérico e a mensagem ficaria "pending" para sempre na tela.
    if (!phoneOf(contact)) {
      toast.error(SEM_ENDERECO);
      return;
    }
    if (outsideMetaWindow && !pendingFile && message.trim()) {
      toast.warning('Fora da janela de 24h da Meta: esta conversa exige envio de template aprovado para iniciar.');
    }

    setIsSending(true);
    const text = message.trim();

    try {
      if (pendingFile) {
        try {
          await sendMediaFile(pendingFile, text);
        } catch (e) {
          const err = e instanceof Error ? e.message : String(e);
          toast.error(`Falha no upload da mídia: ${err}`);
        }
      } else if (text) {
        // Envio otimista: grava já como "pending" para a mensagem aparecer na
        // hora (relógio), sem esperar o round-trip até a Meta. Depois atualiza
        // para o status real e guarda o wamid (p/ o webhook avançar delivered/read).
        const pending = await sendMessageMutation.mutateAsync({
          contact_id: contactId,
          whatsapp_instance_id: active.row.id,
          content: text,
          direction: 'outbound',
          message_type: 'text',
          status: 'pending',
          is_from_bot: false,
        } as any);

        const providerResult = await active.adapter.sendText(phoneOf(contact), text, {
          quotedMessageId: replyTo?.id,
          linkPreview: true,
        });
        const status =
          providerResult?.status === 'sent' || providerResult?.status === 'pending' ? 'sent' : 'failed';
        if (status === 'failed') {
          toast.error(`Mensagem não foi enviada: ${providerResult?.error || 'Erro desconhecido.'}`);
        }

        const pendingId = (pending as any)?.id;
        if (pendingId) {
          await supabase
            .from('messages')
            .update({ status, evolution_message_id: providerResult?.providerMessageId ?? null })
            .eq('id', pendingId);
          queryClient.invalidateQueries({ queryKey: ['messages', contactId, tenant.id] });
          queryClient.invalidateQueries({ queryKey: ['conversations', tenant.id] });
        }
      }

      setMessage('');
      resetTextareaHeight();
      setPendingFile(null);
      if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
      setPendingFilePreview(null);
      setReplyTo(null);
    } catch (e) {
      if (e instanceof WhatsAppAdapterError) {
        toast.error(`[${e.code}] ${e.message}`);
      } else {
        toast.error('Erro ao enviar mensagem.');
      }
    } finally {
      setIsSending(false);
      refocusComposer();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Persiste na thread a linha do template enviado. O envio em si acontece dentro
  // do SendTemplateDialog (via adapter.sendTemplate); aqui só gravamos o registro
  // local para aparecer na conversa — useSendMessage.onSuccess invalida a query.
  const handleTemplateSent = async (summary: string) => {
    if (!contactId || !active) return;
    try {
      await sendMessageMutation.mutateAsync({
        contact_id: contactId,
        whatsapp_instance_id: active.row.id,
        content: summary,
        direction: 'outbound',
        message_type: 'text',
        status: 'sent',
        is_from_bot: false,
      } as any);
    } catch {
      // A mensagem já foi enviada pela Meta; falha só ao registrar localmente.
      toast.warning('Template enviado, mas não foi possível registrar na conversa.');
    }
  };

  const resetTextareaHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  /**
   * Mantém o cursor no campo de mensagem depois do envio, para o usuário emendar
   * a próxima mensagem sem pegar o mouse.
   *
   * Pelo Enter o campo nunca perde o foco (durante o envio ele fica `readOnly`,
   * não `disabled`) e este método não faz nada. Pelo botão Enviar o foco está no
   * botão — que ainda some da tela quando o texto é limpo — então aqui devolvemos
   * o foco ao campo. No celular não devolvemos: abriria o teclado sem pedido.
   */
  const refocusComposer = () => {
    const el = textareaRef.current;
    if (!el) return;
    if (document.activeElement === el) return;
    if (isCoarsePointer()) return;
    el.focus();
  };

  const autoGrow = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };

  // Indicador de digitação (best-effort, throttled a 3s)
  const handleTypingChange = (val: string) => {
    // Typing "/" into an empty composer opens the quick replies popover.
    if (shouldOpenQuickReplies(val, message)) {
      setQuickRepliesOpen(true);
      return;
    }
    setMessage(val);
    requestAnimationFrame(autoGrow);
    if (!active || !contact?.phone || isInstagram) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 3000) {
      lastTypingSentRef.current = now;
      active.adapter.setTyping(contact.phone, true).catch(() => {});
    }
    if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
    typingTimerRef.current = window.setTimeout(() => {
      active.adapter.setTyping(contact?.phone || '', false).catch(() => {});
    }, 3000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendMessage();
  };

  // `content` já chega com as variáveis trocadas (a troca acontece no popover,
  // que é quem tem o contato). Preenche o campo e devolve o foco — nunca envia.
  const handleQuickReplySelect = (content: string) => {
    setMessage((prev) => (prev ? `${prev} ${content}` : content));
    requestAnimationFrame(() => {
      autoGrow();
      textareaRef.current?.focus();
    });
  };

  const handleSaveAsQuickReply = (content: string) => {
    setQuickReplyDraft(content);
    setSaveQuickReplyOpen(true);
  };

  const handleEmojiSelect = (emoji: string) => {
    setMessage((prev) => prev + emoji);
    setShowEmojiPicker(false);
    requestAnimationFrame(autoGrow);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    if (file.type.startsWith('image/')) {
      setPendingFilePreview(URL.createObjectURL(file));
    } else {
      setPendingFilePreview(null);
    }
  };

  const handleAttachClick = () => fileInputRef.current?.click();

  const commonEmojis = ['😀', '😂', '😍', '🤔', '👍', '👎', '❤️', '🔥', '💯', '🎉', '😢', '😡', '🙏', '👏', '💪'];
  const hasText = message.trim().length > 0;
  // Instagram: sem áudio — o botão Enviar fica sempre no lugar.
  const showAudioButton = !isInstagram && !hasText && !pendingFile;
  const seenLabel = lastSeenLabel((contact as any)?.last_interaction_at);

  if (conversationLoading || messagesLoading) {
    return (
      <div className="flex flex-col h-full bg-card">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Skeleton className="w-10 h-10 rounded-full" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-16" />
            </div>
          </div>
          <Skeleton className="w-8 h-8" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <Skeleton className="h-12 w-48" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Chat column */}
      <div className="flex flex-col flex-1 min-w-0 bg-card">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 px-3 py-2 sm:p-4 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            {onBack && (
              <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1 flex-shrink-0" onClick={onBack} aria-label="Voltar">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            )}
            <Avatar className="w-9 h-9 sm:w-10 sm:h-10 flex-shrink-0">
              {(contact as any)?.avatar_url && <AvatarImage src={(contact as any).avatar_url} alt={headerName} />}
              <AvatarFallback>
                {isInstagram
                  ? initialsOf(headerName)
                  : contact?.name ? contact.name.split(' ').map((n) => n?.[0] ?? '').join('').toUpperCase().slice(0, 2) : 'C'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{headerName}</h3>
              {isContactTyping ? (
                <span className="flex items-center gap-1 text-xs text-accent">
                  digitando
                  <span className="flex gap-0.5">
                    <span className="typing-dot w-1 h-1 rounded-full bg-accent" />
                    <span className="typing-dot w-1 h-1 rounded-full bg-accent" />
                    <span className="typing-dot w-1 h-1 rounded-full bg-accent" />
                  </span>
                </span>
              ) : (
                <div className="flex items-center gap-2">
                  {isInstagram ? (
                    igHandleLine && (
                      <span className="text-xs sm:text-sm text-muted-foreground truncate">{igHandleLine}</span>
                    )
                  ) : (
                    <span className="text-xs sm:text-sm text-muted-foreground truncate">
                      {formatPhoneBR(contact?.phone)}
                    </span>
                  )}
                  {(contact as any)?.stage?.name && (
                    <Badge variant="outline" className="text-xs">{(contact as any).stage.name}</Badge>
                  )}
                  {active && (
                    <Badge variant="secondary" className="text-xs">
                      {providerLabel(active.adapter.type)}
                    </Badge>
                  )}
                  {/* Só existe enquanto há sessão ativa de bot neste contato:
                      sem sessão, nada é montado (nem selo cinza). */}
                  {botSession && <BotSessionBadge botName={botName} size="md" />}
                </div>
              )}
              {!isContactTyping && seenLabel && (
                <span className="text-[11px] text-muted-foreground/80">{seenLabel}</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* Responsável pela conversa: assumir / transferir. Some enquanto a
                migração 20260913000001 não roda (a query volta sem a coluna). */}
            <ConversationOwnerControl
              conversationId={conversationId}
              assignedProfileId={(conversation as any)?.assigned_profile_id}
            />

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => onSearchOpenChange?.(!searchOpen)}
                  aria-label="Buscar na conversa"
                >
                  <Search className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">Buscar na conversa (Ctrl+Shift+F)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9"
                  onClick={() => onPanelOpenChange?.(!panelOpen)}
                  aria-label={panelOpen ? 'Fechar painel do contato' : 'Abrir painel do contato'}
                >
                  {panelOpen ? <PanelRightClose className="w-5 h-5" /> : <PanelRightOpen className="w-5 h-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">
                {panelOpen ? 'Fechar detalhes' : 'Detalhes do contato'}
              </TooltipContent>
            </Tooltip>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Mais opções">
                  <MoreVertical className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleEditContact}>
                  <Edit className="w-4 h-4 mr-2" />
                  Editar Contato
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleMarkUnread}>
                  <EyeOff className="w-4 h-4 mr-2" />
                  Marcar como não lida
                </DropdownMenuItem>
                {capabilities?.archive && (
                  <DropdownMenuItem onClick={handleArchive}>
                    <Archive className="w-4 h-4 mr-2" />
                    {(conversation as any)?.is_archived ? 'Desarquivar' : 'Arquivar conversa'}
                  </DropdownMenuItem>
                )}
                {capabilities?.fetchHistory && (
                  <DropdownMenuItem
                    onClick={() => {
                      if (contact?.phone && contactId) {
                        toast.info('Buscando histórico...');
                        syncConversation(contact.phone, contactId)
                          .then((res: any) => {
                            if (res.newMessages > 0) {
                              toast.success(`Baixou ${res.newMessages} novas mensagens.`);
                            } else if (res.error) {
                              toast.error(`Vazio: ${res.error}`, { duration: 8000 });
                            } else {
                              toast.info('A conversa já está atualizada.');
                            }
                          })
                          .catch(() => toast.error('Falha ao sincronizar histórico.'));
                      }
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Puxar Histórico
                  </DropdownMenuItem>
                )}
                {active?.adapter.type === 'official' && (
                  <DropdownMenuItem
                    onClick={() => setTemplateDialogOpen(true)}
                    disabled={!contactId}
                  >
                    <MessageCircle className="w-4 h-4 mr-2" />
                    Enviar template
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsTagDialogOpen(true)} disabled={!contactId}>
                  <Tag className="w-4 h-4 mr-2" />
                  Etiquetar
                </DropdownMenuItem>
                {/* Desabilitado (não escondido) sem sessão ativa: é o padrão dos
                    itens que dependem do estado da conversa (`disabled={!contactId}`
                    em "Etiquetar"), e quem atende aprende que a ação existe.
                    Esconder é para capacidade que o provider não tem. */}
                <DropdownMenuItem
                  onClick={() => setIsEndSessionOpen(true)}
                  disabled={!contactId || !botSession}
                  className="text-destructive focus:text-destructive"
                >
                  <SquareX className="w-4 h-4 mr-2" />
                  {botSession && botName
                    ? `Encerrar sessão do bot "${botName}"`
                    : 'Encerrar sessão do bot'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* In-conversation search bar */}
        {searchOpen && (
          <>
            <ChatSearchBar
              term={searchTerm}
              onTermChange={setSearchTerm}
              matchCount={matchIds.length}
              activeIndex={activeMatchIndex}
              onPrev={() => setActiveMatchIndex((i) => (matchIds.length ? (i - 1 + matchIds.length) % matchIds.length : 0))}
              onNext={() => setActiveMatchIndex((i) => (matchIds.length ? (i + 1) % matchIds.length : 0))}
              onClose={() => {
                onSearchOpenChange?.(false);
                setSearchTerm('');
              }}
            />
            {hasMoreServerMatches && (
              <p className="text-[11px] text-muted-foreground bg-muted/40 px-4 py-1 border-b border-border">
                Há mais resultados no histórico ainda não carregado. Role para cima para carregá-los.
              </p>
            )}
          </>
        )}

        {/* Aviso de capacidade do provider */}
        {active && !active.adapter.isReadyToSend() && (
          <Alert variant="destructive" className="rounded-none border-x-0">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription>
              {isInstagram
                ? `A conexão do Instagram "${active.row.name}" não está ativa. Nada é enviado até ela voltar.`
                : `Instância "${active.row.name}" está ${active.row.status}. Reconecte antes de enviar.`}
            </AlertDescription>
          </Alert>
        )}
        {outsideMetaWindow && (
          <Alert className="rounded-none border-x-0 border-warning/30 bg-warning/10 text-warning">
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-xs flex items-center justify-between gap-2">
              <span>
                Cloud API da Meta: o cliente não envia mensagem há mais de 24h. Para iniciar conversa,
                é necessário usar um <strong>template aprovado</strong>.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 h-7"
                onClick={() => setTemplateDialogOpen(true)}
                disabled={!contactId || !active?.adapter.isReadyToSend()}
              >
                Enviar template
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {active?.adapter.type === 'official' &&
          (active.row.profile_name === 'Test Number' ||
            active.row.phone_number?.startsWith('+1 555-052')) && (
            <Alert className="rounded-none border-x-0 border-warning/30 bg-warning/10 text-warning">
              <AlertCircle className="w-4 h-4" />
              <AlertDescription className="text-xs">
                Esta instância está usando o <strong>número de teste gratuito</strong> da Meta
                (+1 555-052-9071). Só envia mensagens para destinatários cadastrados na
                "Recipient list" do painel Meta (developers.facebook.com → seu app → WhatsApp →
                API Setup → Manage phone number list). Para produção, registre um número real
                na WABA.
              </AlertDescription>
            </Alert>
          )}
        {!capabilities?.fetchHistory && !isInstagram && (
          <p className="text-[11px] text-muted-foreground bg-muted/40 px-4 py-1 border-b border-border">
            Este provider não suporta puxar histórico: apenas mensagens recebidas via webhook aparecem aqui.
          </p>
        )}

        {/* Messages */}
        <ScrollArea className="flex-1 p-4 chat-bg-pattern">
          <div className="space-y-3">
            {messagesQuery.hasNextPage && (
              <div ref={loadMoreRef} className="text-center text-xs text-muted-foreground py-2">
                {messagesQuery.isFetchingNextPage ? 'Carregando...' : 'Role para cima para mais mensagens'}
              </div>
            )}
            {renderable.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">Nenhuma mensagem ainda</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Envie a primeira mensagem para iniciar a conversa
                </p>
              </div>
            ) : (
              renderable.map((msg) => (
                <div
                  key={msg.id}
                  ref={(el) => {
                    messageRefs.current[msg.id] = el;
                  }}
                >
                  <MessageBubble
                    message={msg}
                    onReply={isInstagram ? undefined : setReplyTo}
                    searchTerm={searchOpen ? searchTerm : undefined}
                    isActiveMatch={activeMatchId === msg.id}
                    onSaveAsQuickReply={handleSaveAsQuickReply}
                  />
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Pre-send preview / reply banner */}
        {(pendingFile || replyTo) && (
          <div className="border-t border-border bg-muted/40 px-4 py-2 flex items-center gap-3">
            {replyTo && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground">Respondendo:</span>
                <span className="text-xs truncate">{replyTo.content || `[${replyTo.message_type}]`}</span>
                <Button variant="ghost" size="sm" onClick={() => setReplyTo(null)}>
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
            {pendingFile && (
              <div className="flex items-center gap-2 flex-1 min-w-0">
                {pendingFilePreview ? (
                  <img src={pendingFilePreview} className="w-10 h-10 rounded object-cover" alt="preview" />
                ) : pendingFile.type.startsWith('audio/') ? (
                  <ImageIcon className="w-5 h-5" />
                ) : (
                  <FileTextIcon className="w-5 h-5" />
                )}
                <span className="text-xs truncate">{pendingFile.name}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (pendingFilePreview) URL.revokeObjectURL(pendingFilePreview);
                    setPendingFile(null);
                    setPendingFilePreview(null);
                  }}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Instagram: por que não dá para responder (sem botão: não há como reabrir) */}
        {igBlockedReason && (
          <Alert
            className="rounded-none border-x-0 border-warning/30 bg-warning/10 text-warning"
            data-testid="instagram-composer-blocked"
          >
            <AlertCircle className="w-4 h-4" />
            <AlertDescription className="text-xs">{igBlockedReason}</AlertDescription>
          </Alert>
        )}

        {/* Input */}
        <div className="p-4 border-t border-border flex-shrink-0">
          {isInstagram && igBytes > INSTAGRAM_TEXT_WARN_BYTES && (
            <p
              className={igTooLong ? 'mb-2 text-xs text-destructive' : 'mb-2 text-xs text-muted-foreground'}
              data-testid="instagram-byte-counter"
              role={igTooLong ? 'alert' : undefined}
            >
              {igTooLong
                ? INSTAGRAM_COMPOSER_TEXT.tooLong(igBytes)
                : igBytes + ' de ' + INSTAGRAM_TEXT_MAX_BYTES + ' bytes'}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleFileSelect}
            accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
          />

          {showEmojiPicker && (
            <div className="emoji-picker mb-2 p-2 border border-border rounded-lg bg-background">
              <div className="grid grid-cols-8 gap-1">
                {commonEmojis.map((emoji, index) => (
                  <Button
                    key={index}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-lg hover:bg-muted"
                    onClick={() => handleEmojiSelect(emoji)}
                  >
                    {emoji}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* The AudioRecorder keeps a stable `key` so its live MediaRecorder survives
              the idle→recording transition (siblings are hidden while recording). */}
          <form onSubmit={handleSend} className="flex items-end gap-2">
            {!isRecording && (
              <>
                {!isInstagram && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button type="button" variant="ghost" size="sm" onClick={handleAttachClick} aria-label="Anexar arquivo">
                        <Paperclip className="w-5 h-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">Anexar arquivo</TooltipContent>
                  </Tooltip>
                )}

                <QuickRepliesPopover
                  open={quickRepliesOpen}
                  onOpenChange={setQuickRepliesOpen}
                  onSelect={handleQuickReplySelect}
                  contact={contact}
                  disabled={isSending}
                />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setShowEmojiPicker(!showEmojiPicker)} aria-label="Adicionar emoji">
                      <Smile className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="text-xs">Emoji</TooltipContent>
                </Tooltip>

                <Textarea
                  ref={textareaRef}
                  value={message}
                  onChange={(e) => handleTypingChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isInstagram
                      ? INSTAGRAM_COMPOSER_TEXT.placeholder
                      : pendingFile
                        ? 'Adicionar legenda (opcional)...'
                        : 'Digite sua mensagem...'
                  }
                  rows={1}
                  className={`flex-1 min-h-[40px] resize-none py-2 ${isSending ? 'opacity-70' : ''}`}
                  style={{ maxHeight: MAX_TEXTAREA_HEIGHT }}
                  /* `readOnly`, e não `disabled`: elemento desabilitado perde o foco
                     e não o recupera sozinho ao ser reabilitado. Bloqueia a digitação
                     do mesmo jeito, e o envio segue barrado pelo guarda de `isSending`
                     em handleSendMessage. */
                  readOnly={isSending}
                  aria-busy={isSending}
                  /* Instagram travado (janela fechada, sem conexão, conexão vencida):
                     aqui sim disabled — não é um estado passageiro de envio. */
                  disabled={isInstagram && !!igBlockedReason}
                />
              </>
            )}

            {!isRecording && !showAudioButton && (
              <Button
                type="submit"
                size="sm"
                disabled={(!message.trim() && !pendingFile) || isSending || igSendDisabled}
                aria-label="Enviar"
              >
                {isSending ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            )}

            {(showAudioButton || isRecording) && (
              <AudioRecorder
                key="audio-recorder"
                onSend={handleSendAudio}
                onRecordingChange={setIsRecording}
                disabled={isSending}
              />
            )}
          </form>
        </div>
      </div>

      {/* Contact info side panel (animated on desktop, Sheet on mobile) */}
      <ContactPanel
        open={panelOpen}
        onOpenChange={(o) => onPanelOpenChange?.(o)}
        conversationId={conversationId}
        contactId={contactId}
        contact={contact}
        isLoading={conversationLoading}
      />

      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Contato</DialogTitle>
            <DialogDescription>Atualize as informações do contato abaixo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-2 md:gap-4">
              <Label htmlFor="name" className="md:text-right">Nome</Label>
              <Input id="name" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="md:col-span-3" />
            </div>
            {!isInstagram && (
              <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-2 md:gap-4">
                <Label htmlFor="phone" className="md:text-right">Telefone</Label>
                <Input id="phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="md:col-span-3" />
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-2 md:gap-4">
              <Label htmlFor="lead_source" className="md:text-right">Fonte</Label>
              <Select value={editForm.lead_source_id} onValueChange={(value) => setEditForm({ ...editForm, lead_source_id: value })}>
                <SelectTrigger className="md:col-span-3">
                  <SelectValue placeholder="Selecione uma fonte" />
                </SelectTrigger>
                <SelectContent>
                  {leadSources.map((source: any) => (
                    <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 items-center gap-2 md:gap-4">
              <Label htmlFor="stage" className="md:text-right">Etapa</Label>
              <Select value={editForm.current_stage_id} onValueChange={(value) => setEditForm({ ...editForm, current_stage_id: value })}>
                <SelectTrigger className="md:col-span-3">
                  <SelectValue placeholder="Selecione uma etapa" />
                </SelectTrigger>
                <SelectContent>
                  {funnelStages.map((stage: any) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>Cancelar</Button>
            <Button type="button" onClick={handleSaveContact} disabled={updateContactMutation.isPending}>
              {updateContactMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {contactId && (
        <LeadTagsDialog
          open={isTagDialogOpen}
          onOpenChange={setIsTagDialogOpen}
          contactId={contactId}
          currentTagIds={contactTagIds}
        />
      )}

      {contactId && active?.adapter.type === 'official' && (
        <SendTemplateDialog
          open={templateDialogOpen}
          onOpenChange={setTemplateDialogOpen}
          adapter={active.adapter}
          toPhone={phoneOf(contact)}
          onSent={handleTemplateSent}
        />
      )}

      <SaveQuickReplyDialog
        open={saveQuickReplyOpen}
        onOpenChange={setSaveQuickReplyOpen}
        initialContent={quickReplyDraft}
      />

      <Dialog open={isEndSessionOpen} onOpenChange={setIsEndSessionOpen}>
        <DialogContent className="sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Encerrar sessão do bot</DialogTitle>
            <DialogDescription>
              {botName
                ? `O chatbot "${botName}" está conduzindo esta conversa. `
                : 'Um chatbot está conduzindo esta conversa. '}
              Encerrar a sessão faz o bot parar de responder este contato. A partir daqui é
              você quem atende. Ele só volta a agir se uma nova mensagem disparar um gatilho.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsEndSessionOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleEndChatbotSession}
              disabled={endChatbotSessionMutation.isPending}
            >
              {endChatbotSessionMutation.isPending ? 'Encerrando...' : 'Encerrar sessão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

/** Small helper so the text-send path reads cleanly. */
/**
 * Mensagem única para "não dá para enviar: o contato não tem endereço neste
 * canal". Desde a fatia 1 do Instagram, `contacts.phone` pode ser nulo.
 */
const SEM_ENDERECO = 'Este contato não tem número de WhatsApp para receber a mensagem.';

function phoneOf(contact: { phone?: string | null } | null | undefined): string {
  return contact?.phone || '';
}
