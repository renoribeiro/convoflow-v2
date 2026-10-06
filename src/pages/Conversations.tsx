import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConversationsList } from '@/components/conversations/ConversationsList';
import { ChatWindow } from '@/components/conversations/ChatWindow';
import {
  ConversationFiltersModal,
  DEFAULT_FILTER_STATE,
  countActiveFilters,
  type ConversationsFilterState,
} from '@/components/conversations/ConversationFiltersModal';
import { QuickFilterPills } from '@/components/conversations/QuickFilterPills';
import { TagFilterChips } from '@/components/conversations/TagFilterChips';
import { OwnerFilterChips } from '@/components/conversations/OwnerFilterChips';
import { ChannelSwitch } from '@/components/conversations/ChannelSwitch';
import { contactDisplayName } from '@/lib/instagram/contactProfile';
import {
  asChannel,
  CONVERSATIONS_PAGE_DESCRIPTION,
  otherChannel,
  UNNAMED_CONTACT,
  type ConversationChannel,
} from '@/lib/conversations/channel';
import {
  isAdminOnlyFilter,
  mergeServerTotals,
  QUICK_FILTERS,
  reconcileAttendantChoice,
  reconcilePillChoice,
  resolveQuickFilterScope,
  type QuickFilterCounts,
  type QuickFilterType,
} from '@/components/conversations/quickFilters';
import { useIneligibleOwners } from '@/hooks/useConversationRotation';
import {
  useConversationByContact,
  useConversationsCount,
  useCreateConversation,
} from '@/hooks/useConversations';
import { useSlaConfig } from '@/hooks/useSlaConfig';
import { useTenant } from '@/contexts/TenantContext';
import { EtiquetasManagerSheet } from '@/components/etiquetas/EtiquetasManagerSheet';
import { Search, Filter, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useNotifications } from '@/hooks/useNotifications';
import { useGlobalMessageListener } from '@/hooks/useRealtimeMessages';
import { useConversationShortcuts } from '@/hooks/useConversationShortcuts';
import { XL_BREAKPOINT, useIsBelowXl, useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useContactHasConversation } from '@/hooks/useContactHasConversation';
import { toast } from 'sonner';

const CONTACT_PANEL_STORAGE_KEY = 'convoflow:contact-panel-open';
/** Último canal aberto na chave (conveniência por navegador). */
const CHANNEL_STORAGE_KEY = 'convoflow:conversations-channel';

const readStoredChannel = (): ConversationChannel => {
  try {
    return asChannel(localStorage.getItem(CHANNEL_STORAGE_KEY));
  } catch {
    return 'whatsapp';
  }
};

/** Uma frase só para o deep link que aponta para conversa fora do alcance. */
export const CONVERSATION_UNAVAILABLE_MESSAGE =
  'Esta conversa não está disponível para você: ela está com outra pessoa da Loja.';

/** `?quick=` só aceita uma pílula que existe; qualquer outra coisa vira "Todas". */
const readQuickFilterParam = (value: string | null): QuickFilterType =>
  value && QUICK_FILTERS.some((f) => f.id === value) ? (value as QuickFilterType) : 'todas';

export default function Conversations() {
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [showEtiquetas, setShowEtiquetas] = useState(false);
  // Busca compacta do mobile: fica como lupa e expande em campo ao toque.
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [filters, setFilters] = useState<ConversationsFilterState>(DEFAULT_FILTER_STATE);
  // Etiqueta e responsável são da Loja: ao trocar de Loja no seletor, os
  // marcados não existem na nova e o filtro devolveria lista vazia sem
  // explicação. Só esses dois são limpos — não lidas, arquivadas e período
  // valem em qualquer Loja.
  const { tenant, profile } = useTenant();
  // O "eu" da pílula "Minhas" — profiles.id, o mesmo que assigned_profile_id guarda.
  const viewerProfileId = profile?.id ?? null;
  const tenantIdAnterior = useRef(tenant?.id);
  useEffect(() => {
    if (tenantIdAnterior.current === tenant?.id) return;
    tenantIdAnterior.current = tenant?.id;
    setFilters((prev) =>
      prev.tagIds.length > 0 || prev.assignedProfileIds.length > 0
        ? { ...prev, tagIds: [], assignedProfileIds: [] }
        : prev,
    );
  }, [tenant?.id]);
  // Pílulas de filtro rápido (seleção única) + contagens vindas da lista.
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>(() =>
    // Deep link da aba Escala: /dashboard/conversations?quick=responsavel-indisponivel
    readQuickFilterParam(new URLSearchParams(window.location.search).get('quick')),
  );
  const [quickFilterCounts, setQuickFilterCounts] = useState<QuickFilterCounts>({});
  const [activeInstanceId, setActiveInstanceId] = useState<string | null>(null);
  // --- Chave WhatsApp / Instagram ---
  // Sem conta de Instagram na Loja a chave não aparece e tudo é WhatsApp — a
  // tela fica exatamente como era. Quem sabe se há Instagram é a lista (é ela
  // que carrega as instâncias) e avisa por onChannelsChange.
  const [storedChannel, setStoredChannel] = useState<ConversationChannel>(readStoredChannel);
  const [hasInstagram, setHasInstagram] = useState(false);
  const channel: ConversationChannel = hasInstagram ? storedChannel : 'whatsapp';
  const channelRef = useRef(channel);
  channelRef.current = channel;
  const [searchParams] = useSearchParams();
  const { notifyNewMessage } = useNotifications();
  const isMobile = useIsMobile();
  const { enabled: slaEnabled } = useSlaConfig();
  // "Responsável indisponível" só existe para quem administra a Loja.
  const { canManage: canSeeIneligible } = useIneligibleOwners();

  // A pílula "Não respondidas" só existe com a sinalização de SLA ligada. Se a
  // Loja desligar com ela ativa, volta para "Todas" em vez de deixar um filtro
  // invisível recortando a lista. Idem para a pílula do gestor num cargo que
  // não a tem.
  const effectiveQuickFilter: QuickFilterType =
    (quickFilter === 'nao-respondidas' && !slaEnabled) ||
    (isAdminOnlyFilter(quickFilter) && !canSeeIneligible)
      ? 'todas'
      : quickFilter;

  // In-conversation search + contact panel are lifted here so the keyboard
  // shortcut hook can drive the ESC priority chain.
  const [isChatSearchOpen, setIsChatSearchOpen] = useState(false);
  // Abaixo de xl o painel é um drawer por cima do chat (ver ContactPanel), e
  // a preferência salva vale só para o layout de colunas: numa tela estreita
  // ele nasce fechado, senão quem deixou aberto no computador abria o celular
  // com o chat coberto. A checagem é na largura da janela no mount, e não no
  // hook, porque o hook só responde depois do primeiro render.
  const isBelowXl = useIsBelowXl();
  const [isContactPanelOpen, setIsContactPanelOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    if (window.innerWidth < XL_BREAKPOINT) return false;
    return localStorage.getItem(CONTACT_PANEL_STORAGE_KEY) === 'true';
  });

  const listSearchRef = useRef<HTMLInputElement>(null);
  const [itemIds, setItemIds] = useState<string[]>([]);

  const contactId = searchParams.get('contact');
  const { data: conversationByContact, isLoading: isLoadingConversation } = useConversationByContact(contactId || '');
  const createConversationMutation = useCreateConversation();
  // Só consultado quando a conversa NÃO veio: distingue "não existe" de
  // "existe mas o RLS esconde de mim" (visibilidade por atendente, migração
  // 20260914000001). Sem isto a tela criava outra e levava chave duplicada.
  const {
    data: hiddenConversationExists,
    isLoading: isCheckingHidden,
  } = useContactHasConversation(contactId, !!contactId && !isLoadingConversation && !conversationByContact);
  const unavailableWarnedFor = useRef<string | null>(null);

  // Só o layout de colunas grava a preferência; abrir o drawer no celular não
  // muda o que a pessoa vai encontrar ao voltar ao computador. Olha a janela,
  // não o hook: no primeiro render o hook ainda diz `false` e o efeito
  // gravaria "false" por cima do "true" salvo no computador.
  useEffect(() => {
    if (window.innerWidth < XL_BREAKPOINT) return;
    localStorage.setItem(CONTACT_PANEL_STORAGE_KEY, String(isContactPanelOpen));
  }, [isContactPanelOpen]);

  // Estreitou a janela com o painel aberto ao lado? Fecha, para ele não
  // reaparecer como drawer cobrindo o chat.
  useEffect(() => {
    if (isBelowXl) setIsContactPanelOpen(false);
  }, [isBelowXl]);

  useEffect(() => {
    try {
      localStorage.setItem(CHANNEL_STORAGE_KEY, storedChannel);
    } catch {
      /* navegador sem armazenamento: a chave só não é lembrada */
    }
  }, [storedChannel]);

  // Trocar de canal troca de lista: a instância escolhida e a conversa aberta
  // são do outro canal, e as contagens derivadas eram da lista anterior.
  const changeChannel = useCallback((next: ConversationChannel) => {
    setStoredChannel(next);
    setActiveInstanceId(null);
    setSelectedConversation(null);
    setQuickFilterCounts({});
  }, []);

  const handleChannelsChange = useCallback((info: { hasInstagram: boolean }) => {
    setHasInstagram(info.hasInstagram);
  }, []);

  // A conversa aberta é de outro canal (link direto, "Conversar" em Contatos,
  // notificação)? A chave vai para o canal dela, sem fechar a conversa.
  const handleConversationChannel = useCallback((detected: ConversationChannel) => {
    if (detected === channelRef.current) return;
    setStoredChannel(detected);
    setActiveInstanceId(null);
    setQuickFilterCounts({});
  }, []);

  // Reset transient chat state whenever the active conversation changes.
  useEffect(() => {
    setIsChatSearchOpen(false);
  }, [selectedConversation]);

  const handleNewInboundMessage = useCallback(
    async (message: {
      contactId: string;
      content: string;
      direction: string;
      messageType: string;
    }) => {
      let contactName = 'Novo contato';
      let contactPhone = '';
      try {
        const { data: contact } = await supabase
          .from('contacts')
          .select('name, phone, channel, username')
          .eq('id', message.contactId)
          .limit(1)
          .maybeSingle();
        if (contact) {
          const c = contact as {
            name: string | null;
            phone: string | null;
            channel?: string | null;
            username?: string | null;
          };
          contactName =
            c.channel === 'instagram'
              ? contactDisplayName(c, 'instagram')
              : c.name || c.phone || 'Contato';
          contactPhone = c.phone || '';
        }
      } catch {
        /* fallback */
      }

      let preview = message.content;
      if (message.messageType === 'image') preview = '📷 Imagem';
      else if (message.messageType === 'audio') preview = '🎤 Áudio';
      else if (message.messageType === 'video') preview = '📹 Vídeo';
      else if (message.messageType === 'document') preview = '📄 Documento';
      else if (message.messageType === 'sticker') preview = '🖼️ Figurinha';
      else if (message.messageType === 'location') preview = '📍 Localização';

      notifyNewMessage({ contactName, messagePreview: preview || 'Nova mensagem', contactPhone });
    },
    [notifyNewMessage],
  );

  useGlobalMessageListener(handleNewInboundMessage);

  useEffect(() => {
    if (!contactId) return;
    if (selectedConversation) return;

    if (conversationByContact) {
      setSelectedConversation(conversationByContact.id);
      return;
    }

    if (isLoadingConversation || isCheckingHidden) return;

    // Existe, mas não é minha: avisa uma vez e NÃO tenta criar nada.
    if (hiddenConversationExists) {
      if (unavailableWarnedFor.current !== contactId) {
        unavailableWarnedFor.current = contactId;
        toast.warning(CONVERSATION_UNAVAILABLE_MESSAGE);
      }
      return;
    }

    if (hiddenConversationExists === false && !createConversationMutation.isPending) {
      createConversationMutation.mutate(contactId, {
        onSuccess: (conversationId) => {
          setSelectedConversation((prev) => prev ?? conversationId);
        },
      });
    }
  }, [contactId, conversationByContact, isLoadingConversation, isCheckingHidden, hiddenConversationExists, createConversationMutation.isPending, selectedConversation]); // eslint-disable-line react-hooks/exhaustive-deps

  const navigateList = useCallback(
    (direction: 'up' | 'down') => {
      if (!itemIds.length) return;
      const idx = selectedConversation ? itemIds.indexOf(selectedConversation) : -1;
      let nextIdx = direction === 'down' ? idx + 1 : idx - 1;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= itemIds.length) nextIdx = itemIds.length - 1;
      const nextId = itemIds[nextIdx];
      if (nextId) {
        setSelectedConversation(nextId);
        document.querySelector(`[data-conversation-id="${nextId}"]`)?.scrollIntoView({ block: 'nearest' });
      }
    },
    [itemIds, selectedConversation],
  );

  useConversationShortcuts({
    enabled: !isMobile,
    isSearchOpen: isChatSearchOpen,
    isPanelOpen: isContactPanelOpen,
    hasSelection: !!selectedConversation,
    closeSearch: () => setIsChatSearchOpen(false),
    closePanel: () => setIsContactPanelOpen(false),
    deselect: () => setSelectedConversation(null),
    focusListSearch: () => listSearchRef.current?.focus(),
    openChatSearch: () => {
      if (selectedConversation) setIsChatSearchOpen(true);
    },
    openNewConversation: () => {
      (document.querySelector('[data-new-conversation]') as HTMLElement | null)?.click();
    },
    navigateList,
  });

  const openMobileSearch = useCallback(() => {
    setMobileSearchOpen(true);
    // O campo só existe no DOM depois do estado virar — foca no frame seguinte.
    requestAnimationFrame(() => listSearchRef.current?.focus());
  }, []);

  const activeFilterCount = countActiveFilters(filters);

  const removeTagFilter = useCallback((tagId: string) => {
    setFilters((prev) => ({ ...prev, tagIds: prev.tagIds.filter((id) => id !== tagId) }));
  }, []);

  const removeOwnerFilter = useCallback((profileId: string) => {
    setFilters((prev) => ({
      ...prev,
      assignedProfileIds: prev.assignedProfileIds.filter((id) => id !== profileId),
    }));
  }, []);

  // Exclusão mútua entre o filtro por atendente (modal) e as pílulas "Minhas"
  // / "Sem responsável": os três escrevem a mesma coluna, e "Minhas" + "Maria"
  // seria uma lista vazia sem explicação. A regra é pura (quickFilters.ts);
  // aqui só se aplica o resultado aos dois estados.
  const selectQuickFilter = useCallback(
    (next: QuickFilterType) => {
      setQuickFilter(next);
      setFilters((prev) => {
        const r = reconcilePillChoice(next, prev.assignedProfileIds);
        return r.assignedProfileIds === prev.assignedProfileIds
          ? prev
          : { ...prev, assignedProfileIds: r.assignedProfileIds };
      });
    },
    [],
  );
  const handleFiltersChange = useCallback((next: ConversationsFilterState) => {
    setFilters(next);
    setQuickFilter((current) => reconcileAttendantChoice(next.assignedProfileIds, current).quickFilter);
  }, []);

  // A pílula ativa vira filtro de servidor quando existe coluna para ela; o que
  // ela não cobre continua vindo do modal "Filtros". "Arquivadas" sobrescreve o
  // modal; "Minhas" e "Sem responsável" sobrescrevem só o responsável — as
  // duas coisas convivem sem se anular.
  const modalScope = useMemo(
    () => ({
      hasUnread: filters.hasUnread,
      isArchived: filters.isArchived,
      assignedProfileIds: filters.assignedProfileIds,
    }),
    [filters.hasUnread, filters.isArchived, filters.assignedProfileIds],
  );
  const quickScope = useMemo(
    () => resolveQuickFilterScope(effectiveQuickFilter, modalScope, viewerProfileId),
    [effectiveQuickFilter, modalScope, viewerProfileId],
  );

  // A lista publica só as contagens que o recorte carregado consegue cobrir —
  // as demais mantêm o último valor conhecido em vez de zerar.
  const handleQuickFilterCounts = useCallback((counts: QuickFilterCounts) => {
    setQuickFilterCounts((prev) => ({ ...prev, ...counts }));
  }, []);

  // --- Totais de servidor das pílulas de coluna real ---
  //
  // Uma contagem por pílula, cada uma com o recorte que ELA aplicaria se fosse
  // clicada — é isso que faz o selo responder "qual o tamanho dessa fila" em
  // vez de "quantas cabem na página". O recorte sai do mesmo
  // `resolveQuickFilterScope` que a lista usa, então selo e lista nunca contam
  // universos diferentes.
  //
  // Só aqui dá para montar isso: a `ConversationsList` recebe o recorte já
  // resolvido e não tem como recuperar o que veio do modal "Filtros".
  //
  // O responsável entra pelo `modalScope`, não por aqui: é o único filtro do
  // modal que uma pílula sobrescreve ("Minhas" e "Sem responsável" limpam os
  // atendentes ao serem clicadas), e `resolveQuickFilterScope` é quem sabe
  // disso. Para as outras pílulas ele passa intacto, como as etiquetas.
  const filtrosDeServidor = {
    searchQuery,
    whatsappInstanceId: activeInstanceId ?? undefined,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    tagIds: filters.tagIds,
    // O canal da chave entra em TODA contagem, pelo mesmo applyConversationScope
    // da lista: pílula e lista contam o mesmo canal.
    channel,
  };

  // Selo do outro canal: conversas aguardando resposta lá, número exato do
  // servidor (a regra da pílula "Aguardando"), sem os filtros desta lista —
  // é "quanto espera do outro lado", não um recorte. Só existe com Instagram.
  const aguardandoNoOutroCanal = useConversationsCount({
    channel: otherChannel(channel),
    isArchived: false,
    awaitingReply: true,
    enabled: hasInstagram,
  });

  const totalTodas = useConversationsCount({
    ...filtrosDeServidor,
    ...resolveQuickFilterScope('todas', modalScope, viewerProfileId),
  });
  // Sem perfil carregado não existe "eu": a contagem nem é pedida, e a pílula
  // fica com o piso do conjunto carregado (zero, pelo predicado de cliente).
  const totalMinhas = useConversationsCount({
    ...filtrosDeServidor,
    ...resolveQuickFilterScope('minhas', modalScope, viewerProfileId),
    enabled: !!viewerProfileId,
  });
  const totalSemResponsavel = useConversationsCount({
    ...filtrosDeServidor,
    ...resolveQuickFilterScope('sem-responsavel', modalScope, viewerProfileId),
  });
  const totalNaoLidas = useConversationsCount({
    ...filtrosDeServidor,
    ...resolveQuickFilterScope('nao-lidas', modalScope, viewerProfileId),
  });
  const totalArquivadas = useConversationsCount({
    ...filtrosDeServidor,
    ...resolveQuickFilterScope('arquivadas', modalScope, viewerProfileId),
  });

  // Total do servidor vence a contagem do conjunto carregado; onde ele ainda
  // não chegou, o piso continua valendo (e aparece marcado como piso).
  const countsComTotais = useMemo(
    () =>
      mergeServerTotals(quickFilterCounts, {
        todas: totalTodas.data,
        minhas: totalMinhas.data,
        'sem-responsavel': totalSemResponsavel.data,
        'nao-lidas': totalNaoLidas.data,
        arquivadas: totalArquivadas.data,
      }),
    [
      quickFilterCounts,
      totalTodas.data,
      totalMinhas.data,
      totalSemResponsavel.data,
      totalNaoLidas.data,
      totalArquivadas.data,
    ],
  );

  const temSelosAcimaDasPilulas = filters.tagIds.length > 0 || filters.assignedProfileIds.length > 0;

  const list = (
    <div className="flex h-full min-h-0 flex-col">
      {hasInstagram && (
        <ChannelSwitch
          value={channel}
          onChange={changeChannel}
          awaitingInOther={aguardandoNoOutroCanal.data}
          className={cn('flex-shrink-0', isMobile ? 'mx-0 mt-1' : 'mx-4 mt-4')}
        />
      )}
      <TagFilterChips
        tagIds={filters.tagIds}
        onRemove={removeTagFilter}
        className={cn('flex-shrink-0 pb-2', isMobile ? 'px-0 pt-1' : 'px-4 pt-4')}
      />
      <OwnerFilterChips
        assignedProfileIds={filters.assignedProfileIds}
        onRemove={removeOwnerFilter}
        className={cn(
          'flex-shrink-0 pb-2',
          isMobile ? 'px-0 pt-1' : 'px-4',
          !isMobile && filters.tagIds.length === 0 && 'pt-4',
        )}
      />
      <QuickFilterPills
        value={effectiveQuickFilter}
        onChange={selectQuickFilter}
        counts={countsComTotais}
        slaEnabled={slaEnabled}
        canSeeIneligible={canSeeIneligible}
        className={cn(
          'flex-shrink-0 pb-3',
          isMobile ? 'px-0' : 'px-4',
          // Com selos (etiqueta ou responsável) em cima, o respiro já veio deles.
          !isMobile && !temSelosAcimaDasPilulas && 'pt-4',
        )}
      />
      <div className="min-h-0 flex-1">
        <ConversationsList
          searchQuery={searchQuery}
          selectedId={selectedConversation}
          onSelect={setSelectedConversation}
          hasUnread={quickScope.hasUnread}
          isArchived={quickScope.isArchived}
          quickFilter={effectiveQuickFilter}
          onCountsChange={handleQuickFilterCounts}
          dateFrom={filters.dateFrom}
          dateTo={filters.dateTo}
          tagIds={filters.tagIds}
          assignedProfileIds={quickScope.assignedProfileIds ?? []}
          unassignedOnly={quickScope.unassignedOnly ?? false}
          whatsappInstanceId={activeInstanceId}
          onInstanceChange={setActiveInstanceId}
          onItemsChange={setItemIds}
          channel={channel}
          onChannelsChange={handleChannelsChange}
        />
      </div>
    </div>
  );

  // No celular, conversa aberta ocupa a tela inteira: o cabeçalho da página não
  // ajuda a conversar e custa ~230px de altura. `dvh` em vez de `vh` porque no
  // navegador do celular a barra de endereço entra na conta.
  const chatEmTelaCheia = isMobile && !!selectedConversation;

  return (
    <div className="flex flex-col h-[calc(100dvh-80px)] -m-6">
      <div
        className={cn(
          'px-6 py-4 bg-background border-b border-border flex-shrink-0',
          chatEmTelaCheia && 'hidden',
        )}
      >
        <PageHeader
          title="Conversas"
          helpKey="page:conversations"
          description={CONVERSATIONS_PAGE_DESCRIPTION[channel]}
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Conversas' },
          ]}
          actions={
            <div className="flex items-center gap-2">
              {/* Mobile: lupa que expande o campo. Desktop (lg+): campo sempre visível. */}
              {!mobileSearchOpen && (
                <Button
                  variant="outline"
                  size="icon"
                  className="lg:hidden h-9 w-9 flex-shrink-0"
                  onClick={openMobileSearch}
                  aria-label="Buscar conversas"
                >
                  <Search className="w-4 h-4" />
                </Button>
              )}

              <div className={cn('relative lg:block', mobileSearchOpen ? 'block' : 'hidden')}>
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Input
                      ref={listSearchRef}
                      placeholder="Buscar conversas..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      // Campo vazio ao perder o foco volta a ser lupa (só no mobile).
                      onBlur={() => {
                        if (!searchQuery) setMobileSearchOpen(false);
                      }}
                      className="pl-10 w-40 sm:w-56 lg:w-64"
                    />
                  </TooltipTrigger>
                  {!isMobile && <TooltipContent className="text-xs">Buscar conversas (Ctrl+K)</TooltipContent>}
                </Tooltip>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="px-2 lg:px-3 flex-shrink-0"
                onClick={() => setShowFilters(true)}
                aria-label="Filtros"
              >
                <Filter className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline">Filtros</span>
                {activeFilterCount > 0 && (
                  <Badge variant="secondary" className="ml-1 lg:ml-2 h-5 px-1.5 text-[10px]">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="px-2 lg:px-3 flex-shrink-0"
                onClick={() => setShowEtiquetas(true)}
                aria-label="Etiquetas"
              >
                <Tag className="w-4 h-4 lg:mr-2" />
                <span className="hidden lg:inline">Etiquetas</span>
              </Button>
            </div>
          }
        />
      </div>

      {isMobile ? (
        // Mobile: show ONLY the list OR the chat (never both).
        <div className={cn('flex-1 overflow-hidden min-h-0', chatEmTelaCheia ? 'p-0' : 'p-4')}>
          {selectedConversation ? (
            <div
              className={cn(
                'h-full overflow-hidden',
                // Sem moldura na tela cheia — a conversa encosta nas bordas.
                !chatEmTelaCheia && 'border border-border rounded-lg',
              )}
            >
              <ChatWindow
                conversationId={selectedConversation}
                onBack={() => setSelectedConversation(null)}
                searchOpen={isChatSearchOpen}
                onSearchOpenChange={setIsChatSearchOpen}
                panelOpen={isContactPanelOpen}
                onPanelOpenChange={setIsContactPanelOpen}
                onChannelDetected={handleConversationChannel}
              />
            </div>
          ) : (
            <div className="h-full">{list}</div>
          )}
        </div>
      ) : (
        // Desktop: list + chat (+ contact panel rendered inside ChatWindow).
        // Superfície contínua: sem molduras nem respiro entre as colunas — a
        // separação é uma divisória só, como num cliente de mensagens.
        <div className="flex flex-1 overflow-hidden min-h-0">
          <div className="w-80 flex-shrink-0 h-full border-r border-border">{list}</div>

          <div className="flex-1 h-full overflow-hidden">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={selectedConversation ?? 'empty'}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 60 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="h-full"
              >
                <ChatWindow
                  conversationId={selectedConversation || undefined}
                  searchOpen={isChatSearchOpen}
                  onSearchOpenChange={setIsChatSearchOpen}
                  panelOpen={isContactPanelOpen}
                  onPanelOpenChange={setIsContactPanelOpen}
                  onChannelDetected={handleConversationChannel}
                />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      )}

      <ConversationFiltersModal
        isOpen={showFilters}
        onClose={() => setShowFilters(false)}
        value={filters}
        onChange={handleFiltersChange}
      />

      <EtiquetasManagerSheet open={showEtiquetas} onOpenChange={setShowEtiquetas} />
    </div>
  );
}
