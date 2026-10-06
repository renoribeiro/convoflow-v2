import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ConversationSkeleton } from '@/components/shared/Skeleton';
import { format, isToday, isYesterday, differenceInMinutes, differenceInHours } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useConversations, getAllConversations } from '@/hooks/useConversations';
import { useInView } from 'react-intersection-observer';
import { AlertCircle, ChevronDown, ChevronRight, RefreshCw, Users } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { NewConversationModal } from './NewConversationModal';
import { ConversationViewToggle } from './ConversationViewToggle';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRealtimeConversations } from '@/hooks/useRealtimeMessages';
import { useChatHistorySync } from '@/hooks/useChatHistorySync';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';
import { ALL_INSTANCES_VALUE, InstanceSelector } from './InstanceSelector';
import { contactDisplayName } from '@/lib/instagram/contactProfile';
import { useInstagramContactProfiles } from '@/hooks/useInstagramContactProfiles';
import {
  asChannel,
  hasInstagramInstance,
  initialsOf,
  INSTANCE_SELECTOR_ALL_LABEL,
  instancesOfChannel,
  SLA_CRITICAL_HINT_BY_CHANNEL,
  UNNAMED_CONTACT,
  type ConversationChannel,
} from '@/lib/conversations/channel';
import { pickMessagePreview } from './MessageBubble';
import { MessageStatusIcon } from './MessageStatusIcon';
import { TagBadge } from '@/components/etiquetas/TagBadge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  ATTENDANCE_GROUP_META,
  DEFAULT_COLLAPSED_GROUPS,
  groupByAttendance,
  type AttendanceGroup,
} from './conversationGroups';
import {
  applyQuickFilter,
  buildQuickFilterCounts,
  type QuickFilterCounts,
  type QuickFilterType,
} from './quickFilters';
import { resolveSlaLevel } from './slaLevels';
import { SlaIndicator } from './SlaIndicator';
import { SlaMuteButton } from './SlaMuteButton';
import { useSlaConfig } from '@/hooks/useSlaConfig';
import { useSlaMutedConversations } from '@/hooks/useSlaMute';
import { useTenant } from '@/contexts/TenantContext';
import { useIneligibleOwners } from '@/hooks/useConversationRotation';
import { useTeamMemberLookup } from '@/hooks/useTeamDirectory';
import { OwnerChip } from './OwnerChip';
import { useActiveBotSessions } from '@/hooks/useChatbotSessions';
import { BotSessionBadge } from './BotSessionBadge';

interface ConversationsListProps {
  searchQuery: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  hasUnread?: boolean;
  isArchived?: boolean;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  /** Etiquetas do contato (qualquer uma). Recorte de servidor, como o período. */
  tagIds?: string[];
  /**
   * Responsáveis (qualquer um). Recorte de servidor: é o filtro por atendente
   * do modal ou, na pílula "Minhas", o próprio perfil de quem olha.
   */
  assignedProfileIds?: string[];
  /** Só sem responsável — a pílula "Sem responsável", já traduzida. */
  unassignedOnly?: boolean;
  /**
   * Pílula de filtro rápido ativa. As pílulas que viram coluna real já chegam
   * aqui traduzidas em `hasUnread`/`isArchived`/`assignedProfileIds`/
   * `unassignedOnly`; esta prop serve só para o recorte derivado
   * ("Aguardando" / "Em atendimento" / "Responsável indisponível"), que é
   * feito no cliente.
   */
  quickFilter?: QuickFilterType;
  /** Devolve ao pai as contagens conhecidas do conjunto carregado. */
  onCountsChange?: (counts: QuickFilterCounts) => void;
  /**
   * Quando definido, lista apenas conversas vinculadas a essa instância.
   * 'all' (ou undefined) lista todas as instâncias da tenant.
   */
  whatsappInstanceId?: string | null;
  onInstanceChange?: (id: string | null) => void;
  /** Permite que o pai (atalhos de teclado) controle qual item está em foco. */
  onItemsChange?: (ids: string[]) => void;
  /**
   * Canal aberto na chave WhatsApp/Instagram. A lista, o seletor de instância
   * e os botões só do WhatsApp seguem ele. Ausente = os dois canais juntos (o
   * comportamento de antes da chave).
   */
  channel?: ConversationChannel;
  /**
   * Avisa o pai se a Loja tem conta de Instagram — é a lista que já carrega as
   * instâncias, e sem Instagram a chave nem aparece.
   */
  onChannelsChange?: (info: { hasInstagram: boolean }) => void;
}

/** "Online" se houve interação nos últimos 5 minutos. */
const PRESENCE_THRESHOLD_MIN = 5;

/** Serve de tooltip e de nome acessível do botão de sincronizar. */
const SYNC_LABEL = 'Sincronizar conversas recentes (Evolution/WAHA)';

/** Preferências de visualização da lista (por usuário, por navegador). */
const GROUP_BY_ATTENDANCE_KEY = 'convoflow:conversations-group-by-attendance';
const COLLAPSED_GROUPS_KEY = 'convoflow:conversations-collapsed-groups';

function readGroupByPreference(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(GROUP_BY_ATTENDANCE_KEY) === 'true';
}

function readCollapsedGroups(): Set<AttendanceGroup> {
  if (typeof window === 'undefined') return new Set(DEFAULT_COLLAPSED_GROUPS);
  const raw = localStorage.getItem(COLLAPSED_GROUPS_KEY);
  if (raw === null) return new Set(DEFAULT_COLLAPSED_GROUPS);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed as AttendanceGroup[]) : new Set();
  } catch {
    return new Set(DEFAULT_COLLAPSED_GROUPS);
  }
}

/** Timestamp relativo compacto: "agora", "5min", "2h", "ontem", "23/06". */
function compactTimestamp(dateStr: string | null | undefined): string {
  // conversations.last_message_at e nullable no banco, mas useConversations
  // declara `string`. Sem esta guarda, uma linha sem data faz o format() do
  // date-fns lancar RangeError e derrubar a lista INTEIRA de conversas —
  // nao so a linha. Melhor a linha sair sem horario.
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return '';
  const mins = differenceInMinutes(new Date(), date);
  if (mins < 1) return 'agora';
  if (mins < 60) return `${mins}min`;
  if (isToday(date)) return `${differenceInHours(new Date(), date)}h`;
  if (isYesterday(date)) return 'ontem';
  return format(date, 'dd/MM', { locale: ptBR });
}

export const ConversationsList = ({
  searchQuery,
  selectedId,
  onSelect,
  hasUnread = false,
  isArchived = false,
  dateFrom = null,
  dateTo = null,
  tagIds,
  assignedProfileIds,
  unassignedOnly = false,
  quickFilter = 'todas',
  onCountsChange,
  whatsappInstanceId,
  onInstanceChange,
  onItemsChange,
  channel,
  onChannelsChange,
}: ConversationsListProps) => {
  const { instances } = useWhatsAppInstancesWithAdapter();
  // O seletor mostra só as instâncias do canal aberto.
  const channelInstances = useMemo(
    () => (channel ? instancesOfChannel(instances, channel) : instances),
    [instances, channel],
  );
  const hasInstagram = hasInstagramInstance(instances);
  const lastHasInstagram = useRef<boolean | null>(null);
  useEffect(() => {
    if (lastHasInstagram.current === hasInstagram) return;
    lastHasInstagram.current = hasInstagram;
    onChannelsChange?.({ hasInstagram });
  }, [hasInstagram, onChannelsChange]);
  const isInstagramSide = channel === 'instagram';

  // Responsável por conversa: "Minhas" precisa saber quem sou eu, e o chip
  // precisa do diretório para trocar profiles.id por nome e avatar.
  // "Responsável indisponível" (só gestor/gerente) precisa da lista de quem
  // está suspenso/excluído/fora da Loja/em 0 % — a RPC devolve vazio para
  // quem não administra, e aí a chave nem entra no contexto.
  const { profile } = useTenant();
  const ineligible = useIneligibleOwners();
  const ownership = useMemo(
    () => ({
      viewerProfileId: profile?.id ?? null,
      ineligibleOwnerIds: ineligible.canManage ? ineligible.ownerIds : undefined,
    }),
    [profile?.id, ineligible.canManage, ineligible.ownerIds],
  );
  const lookupMember = useTeamMemberLookup();

  // Sinalização de conversas não respondidas: opt-in por Loja. Desligada, nada
  // abaixo roda — nem a query do mapa de silenciadas.
  const { enabled: slaEnabled, thresholds: slaThresholds } = useSlaConfig();
  const { data: slaMutedMap } = useSlaMutedConversations(slaEnabled);
  // Sessões ativas de chatbot da Loja: UMA query (mapa contact_id → sessões),
  // compartilhada com o cabeçalho do chat. Não entra no select da lista.
  const { data: botSessionsMap } = useActiveBotSessions();
  const slaConfig = useMemo(
    () => ({ enabled: slaEnabled, thresholds: slaThresholds }),
    [slaEnabled, slaThresholds],
  );

  const conversationsQuery = useConversations({
    pageSize: 20,
    searchQuery,
    isArchived,
    enabled: true,
    whatsappInstanceId: whatsappInstanceId ?? undefined,
    hasUnread,
    dateFrom,
    dateTo,
    tagIds,
    assignedProfileIds,
    unassignedOnly,
    channel,
  });

  // Memoize so the flattened array keeps a stable identity between renders
  // (otherwise the derived list + onItemsChange effect would fire every render).
  const conversations = useMemo(
    () => getAllConversations(conversationsQuery),
    [conversationsQuery.data], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const isLoading = conversationsQuery.isLoading;
  const error = conversationsQuery.error;

  // Nome e @ dos clientes do Instagram: pedidos sob demanda para quem aparece
  // na lista (nunca no recebimento). Uma vez por contato; a lista recarrega
  // quando a resposta chega.
  const profileContacts = useMemo(
    () => conversations.map((conv: any) => conv.contacts ?? null),
    [conversations],
  );
  useInstagramContactProfiles({
    contacts: profileContacts,
    instances,
    enabled: channel === 'instagram',
    onUpdated: () => {
      void conversationsQuery.refetch();
    },
  });

  const { isSyncing, syncAllChats } = useChatHistorySync();

  useRealtimeConversations();

  const { ref: loadMoreRef, inView } = useInView({
    threshold: 0,
    rootMargin: '100px 0px 0px 0px',
  });

  useEffect(() => {
    if (inView && conversationsQuery.hasNextPage && !conversationsQuery.isFetchingNextPage) {
      conversationsQuery.fetchNextPage();
    }
  }, [inView, conversationsQuery.hasNextPage, conversationsQuery.isFetchingNextPage]);

  const filteredConversations = useMemo(
    () =>
      conversations.map((conv: any) => {
        const isGroup =
          typeof conv?.contacts?.phone === 'string' && conv.contacts.phone.endsWith('@g.us');
        const lastDirection = conv.last_message?.direction ?? 'inbound';
        const lastStatus = conv.last_message?.status ?? null;
        const messagePreview = conv.last_message
          ? pickMessagePreview({
              id: 'preview',
              content: conv.last_message.content ?? null,
              created_at: conv.last_message_at,
              direction: lastDirection,
              status: lastStatus ?? 'sent',
              message_type: conv.last_message.message_type ?? 'text',
              media_url: null,
            })
          : 'Nenhuma mensagem';
        const rowChannel = asChannel(conv.channel ?? conv.contacts?.channel);
        return {
          id: conv.id,
          contact_id: conv.contact_id,
          channel: rowChannel,
          contact_name: contactDisplayName(conv.contacts, rowChannel),
          contact_phone: conv.contacts?.phone || '',
          contact_avatar: (conv.contacts as any)?.avatar_url ?? null,
          last_interaction_at: (conv.contacts as any)?.last_interaction_at ?? null,
          last_message: messagePreview,
          last_message_at: conv.last_message_at,
          last_message_direction: lastDirection as 'inbound' | 'outbound',
          last_message_status: lastStatus,
          // Vem de uma query própria, não do select da lista (ver useSlaMute).
          sla_muted_at: slaMutedMap?.[conv.id] ?? null,
          // Idem: mapa de sessões ativas de bot (ver useChatbotSessions).
          has_bot_session: (botSessionsMap?.[conv.contact_id]?.length ?? 0) > 0,
          // Responsável (migração 20260913000001). `undefined` = coluna ainda
          // não existe no banco; o chip mostra "Sem responsável" mesmo assim.
          assigned_profile_id: (conv.assigned_profile_id as string | null | undefined) ?? null,
          unread_count: conv.unread_count,
          is_group: isGroup,
          contact_source: conv.contacts?.lead_sources?.name || null,
          contact_current_stage: (conv.contacts as any)?.funnel_stages?.name || conv.contacts?.stage?.name || null,
          tags: (conv.contacts?.contact_tags ?? [])
            .map((ct: any) => ct.tags)
            .filter(Boolean) as Array<{ id: string; name: string; color: string }>,
        };
      }),
    [conversations, slaMutedMap, botSessionsMap],
  );

  // --- Filtros rápidos (pílulas) ---
  // As contagens saem do que já foi carregado, sem query extra. Só as chaves
  // que o recorte de servidor atual consegue cobrir são publicadas; o pai
  // mantém o último valor conhecido das demais.
  // `hasNextPage` falso = a última página chegou, então o conjunto carregado É
  // a fila inteira e até as contagens derivadas viram exatas. Enquanto for
  // verdadeiro elas saem marcadas como piso e a pílula mostra "12+".
  const allLoaded = !conversationsQuery.hasNextPage;
  const countsPatch = useMemo(
    () =>
      buildQuickFilterCounts(
        filteredConversations,
        { hasUnread, isArchived, assignedProfileIds, unassignedOnly },
        undefined,
        slaConfig,
        allLoaded,
        ownership,
      ),
    [filteredConversations, hasUnread, isArchived, assignedProfileIds, unassignedOnly, slaConfig, allLoaded, ownership],
  );

  const lastCountsSignature = useRef<string>('');
  useEffect(() => {
    // Trocar de pílula muda a query: enquanto a primeira página não chega o
    // conjunto está vazio, e publicar isso faria as pílulas piscarem zero.
    if (isLoading) return;
    const signature = JSON.stringify(countsPatch);
    if (signature !== lastCountsSignature.current) {
      lastCountsSignature.current = signature;
      onCountsChange?.(countsPatch);
    }
  }, [countsPatch, isLoading, onCountsChange]);

  // "Aguardando"/"Em atendimento" não existem como coluna — recorte no cliente,
  // reaproveitando a regra de `conversationGroups.ts`.
  const visibleConversations = useMemo(
    () => applyQuickFilter(filteredConversations, quickFilter, undefined, slaConfig, ownership),
    [filteredConversations, quickFilter, slaConfig, ownership],
  );

  // --- Agrupamento por nível de atendimento (opt-in, persistido no navegador) ---
  const [groupByAttendanceEnabled, setGroupByAttendanceEnabled] = useState(readGroupByPreference);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<AttendanceGroup>>(readCollapsedGroups);

  useEffect(() => {
    localStorage.setItem(GROUP_BY_ATTENDANCE_KEY, String(groupByAttendanceEnabled));
  }, [groupByAttendanceEnabled]);

  useEffect(() => {
    localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...collapsedGroups]));
  }, [collapsedGroups]);

  const toggleGroup = (group: AttendanceGroup) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group);
      else next.add(group);
      return next;
    });
  };

  const attendanceBuckets = useMemo(
    () => (groupByAttendanceEnabled ? groupByAttendance(visibleConversations) : []),
    [groupByAttendanceEnabled, visibleConversations],
  );

  // Ids na ordem em que aparecem na tela — itens dentro de grupos recolhidos
  // ficam de fora para que a navegação por teclado não pule para o invisível.
  const visibleIds = useMemo(() => {
    if (!groupByAttendanceEnabled) return visibleConversations.map((c) => c.id);
    return attendanceBuckets
      .filter((bucket) => !collapsedGroups.has(bucket.group))
      .flatMap((bucket) => bucket.items.map((c) => c.id));
  }, [groupByAttendanceEnabled, attendanceBuckets, collapsedGroups, visibleConversations]);

  // Publish the ordered ids so keyboard navigation in the parent can move between
  // items — only when the set actually changes (avoids re-render cascades).
  const lastIdsSignature = useRef<string>('');
  useEffect(() => {
    const ids = visibleIds;
    const signature = ids.join('|');
    if (signature !== lastIdsSignature.current) {
      lastIdsSignature.current = signature;
      onItemsChange?.(ids);
    }
  }, [visibleIds, onItemsChange]);

  // Flash a non-selected conversation briefly when a new message arrives.
  const prevTimestamps = useRef<Record<string, string>>({});
  const [flashing, setFlashing] = useState<Set<string>>(new Set());
  useEffect(() => {
    const next: Record<string, string> = {};
    const newlyFlashing: string[] = [];
    filteredConversations.forEach((c) => {
      next[c.id] = c.last_message_at;
      const prev = prevTimestamps.current[c.id];
      if (prev && prev !== c.last_message_at && c.id !== selectedId) {
        newlyFlashing.push(c.id);
      }
    });
    const isFirstRun = Object.keys(prevTimestamps.current).length === 0;
    prevTimestamps.current = next;
    if (!isFirstRun && newlyFlashing.length) {
      setFlashing((prev) => new Set([...prev, ...newlyFlashing]));
      newlyFlashing.forEach((id) => {
        window.setTimeout(() => {
          setFlashing((prev) => {
            const n = new Set(prev);
            n.delete(id);
            return n;
          });
        }, 600);
      });
    }
  }, [filteredConversations, selectedId]);

  const renderConversation = (conversation: (typeof filteredConversations)[number]) => {
    const hasUnreadMsgs = conversation.unread_count > 0;
    const isSelected = selectedId === conversation.id;
    const isFlashing = flashing.has(conversation.id);
    const isOnline =
      conversation.last_interaction_at &&
      differenceInMinutes(new Date(), new Date(conversation.last_interaction_at)) < PRESENCE_THRESHOLD_MIN;
    const isNewLead = !conversation.contact_current_stage;
    // Com o SLA desligado nada disto aparece: nível fixo em 'ok' e sem botão.
    const slaLevel = slaEnabled ? resolveSlaLevel(conversation, slaThresholds) : 'ok';
    const isSlaMuted = slaEnabled && !!conversation.sla_muted_at;
    // Silenciada resolve sempre 'ok' — o botão continua à mão para reverter.
    const showSlaMuteButton = slaEnabled && (slaLevel !== 'ok' || isSlaMuted);
    return (
      <div
        key={conversation.id}
        data-conversation-id={conversation.id}
        className={`relative cursor-pointer rounded-lg border-b border-border/50 p-3 ${
          isSelected
            ? 'bg-primary/20 border-l-[3px] border-l-primary transition-all duration-150'
            : hasUnreadMsgs
              ? `bg-[hsl(var(--unread-bg))] border-l-4 border-l-[hsl(var(--unread-strong))] hover:bg-[hsl(var(--unread-bg-hover))] shadow-[inset_0_0_0_1px_hsl(var(--unread-strong)/0.18)] transition-colors duration-100 ${isFlashing ? 'animate-flash-highlight' : ''}`
              : `hover:bg-accent/[0.08] transition-colors duration-100 ${isFlashing ? 'animate-flash-highlight' : ''}`
        }`}
        onClick={() => onSelect(conversation.id)}
      >
        <div className="flex items-start gap-3">
          <div className="relative">
            <Avatar className="w-10 h-10">
              {conversation.contact_avatar && (
                <AvatarImage src={conversation.contact_avatar} alt={conversation.contact_name} />
              )}
              <AvatarFallback>
                {conversation.is_group ? (
                  <Users className="w-4 h-4" />
                ) : conversation.channel === 'instagram' ? (
                  initialsOf(conversation.contact_name)
                ) : (
                  conversation.contact_name.split(' ').map((n: string) => n[0] ?? '').join('').toUpperCase().slice(0, 2)
                )}
              </AvatarFallback>
            </Avatar>
            {/* Presence indicator */}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border-2 border-card ${
                isOnline ? 'bg-success' : 'bg-muted-foreground/40'
              }`}
              aria-hidden
            />
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className={`truncate flex items-center gap-1 text-sm text-foreground ${hasUnreadMsgs && !isSelected ? 'font-bold' : isSelected ? 'font-semibold' : 'font-medium'}`}>
                {conversation.is_group && <Users className="w-3 h-3 text-muted-foreground" />}
                {conversation.contact_name}
              </p>
              <span className={`text-xs flex-shrink-0 ${hasUnreadMsgs && !isSelected ? 'text-[hsl(var(--unread-strong))] font-semibold' : 'text-muted-foreground'}`}>
                {compactTimestamp(conversation.last_message_at)}
              </span>
            </div>

            <div className={`flex items-center gap-1 mb-2 min-w-0 ${hasUnreadMsgs && !isSelected ? 'text-foreground' : 'text-muted-foreground'}`}>
              {conversation.last_message_direction === 'outbound' && (
                <span className="flex-shrink-0">
                  <MessageStatusIcon status={(conversation.last_message_status as any) ?? 'sent'} />
                </span>
              )}
              <p className={`text-sm truncate ${hasUnreadMsgs && !isSelected ? 'font-semibold' : ''}`}>
                {conversation.last_message}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-1 min-w-0 flex-wrap items-center">
                <OwnerChip
                  member={lookupMember(conversation.assigned_profile_id)}
                  assignedProfileId={conversation.assigned_profile_id}
                  size="sm"
                />
                <SlaIndicator
                  level={slaLevel}
                  lastMessageAt={conversation.last_message_at}
                  criticalHint={SLA_CRITICAL_HINT_BY_CHANNEL[conversation.channel]}
                />
                {conversation.has_bot_session && <BotSessionBadge botName={null} size="sm" />}
                {isNewLead && (
                  <Badge variant="outline" className="border-0 bg-accent/15 text-accent text-[10px] font-medium px-1.5">
                    Novo Lead
                  </Badge>
                )}
                {conversation.contact_source && (
                  <Badge variant="secondary" className="text-xs truncate max-w-[80px]">
                    {conversation.contact_source}
                  </Badge>
                )}
                {conversation.contact_current_stage && (
                  <Badge variant="outline" className="text-xs truncate max-w-[80px]">
                    {conversation.contact_current_stage}
                  </Badge>
                )}
                {conversation.tags.slice(0, 2).map((tag) => (
                  <TagBadge key={tag.id} name={tag.name} color={tag.color} />
                ))}
                {conversation.tags.length > 2 && (
                  <Badge variant="outline" className="text-xs">
                    +{conversation.tags.length - 2}
                  </Badge>
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-1">
                {hasUnreadMsgs && (
                  <span className="flex h-5 min-w-5 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--unread-strong))] px-1.5 text-[11px] font-bold text-[hsl(var(--unread-on-strong))] shadow-sm">
                    {conversation.unread_count}
                  </span>
                )}
                {showSlaMuteButton && (
                  <SlaMuteButton conversationId={conversation.id} isMuted={isSlaMuted} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg h-full p-4">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Erro ao carregar conversas. Tente novamente.</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    // A moldura só existe no celular, onde a lista é um cartão solto. De `md`
    // para cima ela faz parte da superfície contínua e quem separa é a divisória.
    <div className="bg-card border border-border rounded-lg md:border-0 md:rounded-none h-full flex flex-col">
      <div className="p-4 border-b border-border flex-shrink-0 space-y-3">
        {/* Título + sincronizar numa linha; "Nova Conversa" ganha a linha de
            baixo. Na coluna de 320px eles não cabiam lado a lado e o botão era
            cortado. O seletor de exibição desceu para a linha da contagem. */}
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-semibold text-foreground truncate">Conversas Ativas</h3>
          {/* Sincronizar e "Nova Conversa" são do WhatsApp: o Instagram não tem
              histórico para puxar e não deixa começar conversa — só responder
              quem escreveu nas últimas 24 horas. */}
          {!isInstagramSide && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                  aria-label={SYNC_LABEL}
                  onClick={() => syncAllChats(whatsappInstanceId ?? null)}
                  disabled={isSyncing}
                >
                  <RefreshCw className={`h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
                </Button>
              </TooltipTrigger>
              <TooltipContent className="text-xs">{SYNC_LABEL}</TooltipContent>
            </Tooltip>
          )}
        </div>

        {!isInstagramSide && (
          <NewConversationModal onConversationCreated={() => { /* lista invalidada via realtime */ }} />
        )}

        {channelInstances.length > 0 && (
          <InstanceSelector
            instances={channelInstances}
            selectedId={whatsappInstanceId ?? null}
            allLabel={INSTANCE_SELECTOR_ALL_LABEL[channel ?? 'whatsapp']}
            onChange={(id) => onInstanceChange?.(id === ALL_INSTANCES_VALUE ? null : id)}
          />
        )}

        {/* A contagem sozinha deixava a linha quase vazia — é onde o seletor de
            exibição cabe sem apertar o cabeçalho. */}
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground truncate">
            {isLoading ? 'Carregando...' : `${visibleConversations.length} conversas`}
          </p>
          <ConversationViewToggle
            grouped={groupByAttendanceEnabled}
            onChange={setGroupByAttendanceEnabled}
          />
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <ConversationSkeleton key={i} />
              ))}
            </div>
          ) : visibleConversations.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-muted-foreground">Nenhuma conversa encontrada</p>
            </div>
          ) : !groupByAttendanceEnabled ? (
            visibleConversations.map(renderConversation)
          ) : (
            attendanceBuckets.map(({ group, items }) => {
              const meta = ATTENDANCE_GROUP_META[group];
              const isCollapsed = collapsedGroups.has(group);
              return (
                <section key={group} className="mb-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => toggleGroup(group)}
                        aria-expanded={!isCollapsed}
                        className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-md bg-card/95 px-2 py-1.5 text-left backdrop-blur-sm transition-colors hover:bg-accent/[0.08]"
                      >
                        {isCollapsed ? (
                          <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
                        )}
                        <span className={`h-2 w-2 flex-shrink-0 rounded-full ${meta.dotClass}`} aria-hidden />
                        <span className="flex-1 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {meta.label}
                        </span>
                        <Badge variant="secondary" className="h-5 flex-shrink-0 px-1.5 text-[10px]">
                          {items.length}
                        </Badge>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">{meta.hint}</TooltipContent>
                  </Tooltip>
                  {!isCollapsed && <div>{items.map(renderConversation)}</div>}
                </section>
              );
            })
          )}

          {conversationsQuery.hasNextPage && (
            <div ref={loadMoreRef} className="flex justify-center py-4">
              {conversationsQuery.isFetchingNextPage ? (
                <div className="text-sm text-muted-foreground">Carregando mais conversas...</div>
              ) : (
                <div className="text-sm text-muted-foreground/60">Role para carregar mais</div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
};
