import { useInfiniteQuery, useMutation, useQueryClient, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import { AWAITING_REPLY_FILTER, type ConversationChannel } from '@/lib/conversations/channel';
import { invalidateConversationCounts } from '@/lib/conversations/countKeys';

interface Contact {
  id: string;
  name: string;
  phone: string;
  /** whatsapp | instagram. Ausente só em dado antigo sem a coluna. */
  channel?: string;
  /** Instagram: o @ (sem "@") e o estado da busca do perfil (fatia 4a). */
  username?: string | null;
  profile_status?: string | null;
  profile_checked_at?: string | null;
  whatsapp_instance_id?: string | null;
  lead_source_id?: string;
  current_stage_id?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  stage?: {
    name: string;
  };
  lead_sources?: {
    name: string;
  };
  contact_tags?: Array<{
    tag_id: string;
    tags: {
      id: string;
      name: string;
      color: string;
    } | null;
  }>;
}

interface Conversation {
  id: string;
  contact_id: string;
  /** whatsapp | instagram (conversations.channel). */
  channel?: string;
  last_message_at: string;
  unread_count: number;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  tenant_id: string;
  contacts: Contact;
  /**
   * Prévia da última mensagem. `undefined` = conversa sem mensagem nenhuma.
   *
   * Contrato inalterado para quem lê (ConversationsList). Só o `created_at` que
   * o código antigo carregava saiu: a lista sempre usou `last_message_at` da
   * própria conversa para o horário, e nunca leu esse campo.
   */
  last_message?: {
    content: string | null;
    direction: 'inbound' | 'outbound';
    message_type: string;
    status?: string | null;
  };
  /**
   * Responsável pela conversa (profiles.id). `null` = ninguém assumiu ainda.
   * `undefined` só acontece enquanto a migração 20260913000001 não rodou —
   * a lista segue funcionando, sem o chip de responsável.
   */
  assigned_profile_id?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
}

interface ConversationsPage {
  data: Conversation[];
  nextCursor?: string;
  hasMore: boolean;
}

/**
 * Colunas desnormalizadas da última mensagem, mantidas pela trigger
 * `update_conversation_on_message` (AFTER INSERT em `messages`).
 *
 * Antes disto a lista buscava a última mensagem de CADA conversa em uma query
 * separada — 1 + 20 idas ao servidor por página, repetidas a cada 10s pelo
 * polling. Lendo as quatro colunas junto com a conversa, a página inteira volta
 * a ser 1 query.
 */
const LAST_MESSAGE_COLUMNS = `last_message_content,
          last_message_direction,
          last_message_status,
          last_message_type,
          `;

/** Linha crua da conversa; as colunas novas podem não existir ainda no banco. */
interface LastMessageColumns {
  last_message_content?: string | null;
  last_message_direction?: string | null;
  last_message_status?: string | null;
  last_message_type?: string | null;
}

/**
 * Responsável pela conversa (migração 20260913000001). Mesmo tratamento das
 * colunas de prévia: pedidas junto com a linha, e a query repete sem elas se o
 * banco ainda não as tiver.
 */
export const ASSIGNMENT_COLUMNS = `assigned_profile_id,
          assigned_at,
          assigned_by,
          `;

type ConversationRow = Omit<Conversation, 'last_message'> & LastMessageColumns;

/**
 * Traduz a direção vinda do banco para o vocabulário do front.
 *
 * O banco aceita 'incoming' como sinônimo histórico de 'inbound' (a trigger
 * sempre casou `IN ('inbound','incoming')`), mas aqui a união é
 * 'inbound' | 'outbound' e TODO leitor testa `!== 'inbound'` — agrupamento por
 * atendimento, nível de SLA, pílulas de filtro e o ícone de confirmação. Um
 * 'incoming' sem normalizar seria lido como mensagem NOSSA e a conversa sairia
 * da fila de trabalho sem ninguém perceber.
 *
 * Espelha o CASE da trigger: qualquer valor que não seja entrada conta como
 * saída. Vazio/ausente significa "conversa sem mensagem".
 */
export const normalizeLastMessageDirection = (
  value: unknown,
): 'inbound' | 'outbound' | null => {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value === 'inbound' || value === 'incoming' ? 'inbound' : 'outbound';
};

/**
 * Monta `last_message` a partir das colunas desnormalizadas.
 *
 * Devolve `undefined` quando a conversa não tem mensagem — é o mesmo valor que
 * o código antigo produzia quando a busca não achava nada. A lista mostra
 * "Nenhuma mensagem" e, por aplicar `?? 'inbound'` na direção, mantém a conversa
 * no grupo "Aguardando".
 *
 * A direção é a sentinela de "existe mensagem": a trigger e o backfill sempre a
 * preenchem, enquanto conteúdo, status e tipo podem ser nulos legitimamente
 * (mídia sem legenda, por exemplo).
 */
export const mapLastMessage = (
  row: LastMessageColumns | null | undefined,
): Conversation['last_message'] => {
  const direction = normalizeLastMessageDirection(row?.last_message_direction);
  if (!direction) return undefined;

  return {
    content: row?.last_message_content ?? null,
    direction,
    message_type: row?.last_message_type ?? 'text',
    status: row?.last_message_status ?? null,
  };
};

/**
 * As migrações deste projeto são aplicadas à mão, então o frontend pode subir
 * antes do SQL. Sem tratamento, pedir colunas inexistentes faz o PostgREST
 * responder 42703 e a lista INTEIRA some da tela.
 *
 * Detectando o caso, repetimos a query sem as colunas novas: a lista aparece
 * sem prévia até a migração rodar, em vez de quebrar.
 */
export type SupabaseQueryError = { code?: string | null; message?: string | null } | null;

export const isMissingLastMessageColumnsError = (
  error: SupabaseQueryError | undefined,
): boolean => {
  if (!error) return false;
  if (error.code === '42703') return true;
  return /last_message_(content|direction|status|type)/.test(error.message ?? '');
};

/**
 * Colunas de responsável ausentes (migração 20260913000001 ainda não rodou).
 *
 * Testada ANTES de `isMissingLastMessageColumnsError`, que aceita qualquer
 * 42703: se a ordem fosse a inversa, um 42703 causado por `assigned_*` faria a
 * lista desistir da prévia — que existe — e continuar quebrada por causa das
 * colunas de responsável. Aqui a mensagem do PostgREST nomeia a coluna
 * ("column conversations.assigned_profile_id does not exist"), então dá para
 * ser específico.
 */
export const isMissingAssignmentColumnsError = (
  error: SupabaseQueryError | undefined,
): boolean => {
  if (!error) return false;
  return /assigned_(profile_id|at|by)/.test(error.message ?? '');
};

/** Vira false na primeira resposta 42703 e não tenta de novo nesta sessão. */
let lastMessageColumnsAvailable = true;
/** Idem para as colunas de responsável. */
let assignmentColumnsAvailable = true;

/**
 * Último instante do dia escolhido, no fuso do navegador.
 *
 * O DatePicker devolve o dia à meia-noite local. Usar esse valor direto num
 * `lte` deixava o dia "Até" inteiro de fora: "até 20/09" virava "até 20/09
 * 00:00", e nada daquele dia entrava. O `toISOString()` de quem chama converte
 * para UTC — é o mesmo relógio que `last_message_at` usa.
 */
export const endOfLocalDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);

/**
 * Alias do segundo embed de `contact_tags` — o que faz o join do filtro.
 *
 * Um embed com `!inner` recorta o pai, mas também recorta a si mesmo: a lista
 * receberia só as etiquetas que casaram com o filtro, e o cartão da conversa
 * mostraria uma etiqueta em vez de todas. Por isso a relação entra duas vezes
 * no select: `contact_tags` (sem filtro, para exibir) e este alias (com
 * `!inner`, para filtrar). O filtro aponta para o alias, e o cartão continua
 * lendo `contact_tags`.
 */
export const TAG_FILTER_EMBED = 'etiquetas_filtro';

/**
 * Recorte de servidor comum à lista e à contagem. Tudo que a lista filtra, a
 * pílula conta: ter as duas coisas numa função só é o que impede lista e
 * contagem de contarem universos diferentes.
 */
export interface ConversationScope {
  isArchived: boolean;
  hasUnread: boolean;
  /** Texto de busca já sem espaços nas pontas; vazio = sem busca. */
  term: string;
  whatsappInstanceId?: string;
  dateFrom: Date | null;
  dateTo: Date | null;
  /** Etiquetas do contato: QUALQUER uma delas (OR). Vazio = sem filtro. */
  tagIds: string[];
  /**
   * Responsáveis (profiles.id): QUALQUER um deles (OR). Vazio = sem filtro.
   * É o filtro por atendente do modal e também a pílula "Minhas" (o próprio
   * perfil, sozinho na lista).
   */
  assignedProfileIds: string[];
  /** Só conversas sem responsável (`assigned_profile_id IS NULL`) — a pílula "Sem responsável". */
  unassignedOnly: boolean;
  /**
   * Canal da chave WhatsApp/Instagram. Ausente = os dois canais (o comportamento
   * de antes da chave). A tela de Conversas SEMPRE manda: é aqui, e não em cada
   * chamador, que o canal entra — por isso a lista e cada contagem recortam o
   * mesmo canal por construção.
   */
  channel?: ConversationChannel;
  /**
   * Só as que aguardam resposta: a regra da pílula "Aguardando", no servidor
   * (ver AWAITING_REPLY_FILTER). É o selo do outro canal.
   */
  awaitingReply?: boolean;
}

/**
 * `contacts` vira join interno sempre que um filtro mora no embed — a busca
 * (o `.or()` em nome/telefone) ou as etiquetas. O PostgREST só descarta a
 * linha-pai por causa de um filtro no embed quando o join é `!inner`; sem a
 * dica o filtro recortava apenas o embed e a lista inteira voltava. Fora
 * disso o embed continua LEFT, para não sumir com conversas cujo contato não
 * veio junto.
 */
export const contactsEmbedFor = (scope: Pick<ConversationScope, 'term' | 'tagIds'>): string =>
  scope.term || scope.tagIds.length > 0 ? 'contacts!inner' : 'contacts';

/** Trecho de select do embed de filtro por etiqueta (vazio sem filtro). */
export const tagFilterEmbedFor = (tagIds: string[]): string =>
  tagIds.length > 0 ? `${TAG_FILTER_EMBED}:contact_tags!inner (tag_id)` : '';

/**
 * Mínimo que os filtros abaixo precisam do builder do Supabase. Declarado à
 * mão (em vez do tipo do PostgREST) porque o caminho de embed
 * (`contacts.etiquetas_filtro.tag_id`) não é coluna de `conversations`.
 */
export interface ScopeQuery<T> {
  eq(column: string, value: unknown): T;
  gt(column: string, value: unknown): T;
  gte(column: string, value: unknown): T;
  lte(column: string, value: unknown): T;
  in(column: string, values: unknown[]): T;
  /** `IS NULL` — `in` nunca casa NULL, e "Sem responsável" é exatamente isso. */
  is(column: string, value: null | boolean): T;
  or(filters: string, options?: { referencedTable?: string }): T;
}

/**
 * Aplica o recorte à query — a mesma sequência para a lista e para a contagem.
 * Não entram aqui: tenant, ordenação, limite e cursor, que são da lista.
 */
export const applyConversationScope = <T extends ScopeQuery<T>>(
  query: T,
  scope: ConversationScope,
): T => {
  let q = query.eq('is_archived', scope.isArchived);

  // Canal: coluna da própria conversa, indexada junto com tenant e arquivada
  // (idx_conversations_tenant_channel_archived_last_message).
  if (scope.channel) {
    q = q.eq('channel', scope.channel);
  }

  // Only filter by instance if explicitly specified
  if (scope.whatsappInstanceId) {
    q = q.eq('whatsapp_instance_id', scope.whatsappInstanceId);
  }

  // Aplicar filtro de busca — o `.or()` vai no recurso embutido (`contacts`)
  // e, com o join inner, recorta as conversas. O valor vai entre aspas porque
  // nome e telefone podem conter vírgula e parênteses, que são separadores na
  // gramática de filtros do PostgREST.
  if (scope.term) {
    const escaped = scope.term.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if (scope.channel === 'instagram') {
      // Instagram: cliente não tem telefone; tem nome e @. "@ana" procura o @
      // sem a arroba (ela não é gravada) e o nome com o texto como veio.
      const semArroba = escaped.replace(/^@+/, '');
      q = q.or(`name.ilike."%${escaped}%",username.ilike."%${semArroba}%"`, {
        referencedTable: 'contacts',
      });
    } else {
      q = q.or(`name.ilike."%${escaped}%",phone.ilike."%${escaped}%"`, {
        referencedTable: 'contacts',
      });
    }
  }

  // Etiquetas: filtro no caminho do alias (ver TAG_FILTER_EMBED). `in` = a
  // conversa entra se o contato tiver QUALQUER uma das etiquetas; o PostgREST
  // agrega o embed em JSON, então um contato com duas etiquetas casando continua
  // sendo uma conversa só.
  if (scope.tagIds.length > 0) {
    q = q.in(`contacts.${TAG_FILTER_EMBED}.tag_id`, scope.tagIds);
  }

  // Responsável: coluna da própria conversa, então nada de embed nem `!inner`.
  // `in` = QUALQUER um dos escolhidos (uma conversa tem um responsável só, e
  // "todos ao mesmo tempo" seria sempre vazio). "Sem responsável" é `is null`
  // porque `in` não casa NULL. A tela nunca liga os dois juntos (ver
  // reconcile* em quickFilters.ts); se ligasse, o resultado seria vazio.
  if (scope.assignedProfileIds.length > 0) {
    q = q.in('assigned_profile_id', scope.assignedProfileIds);
  }
  if (scope.unassignedOnly) {
    q = q.is('assigned_profile_id', null);
  }

  if (scope.hasUnread) {
    q = q.gt('unread_count', 0);
  }
  if (scope.dateFrom) {
    q = q.gte('last_message_at', scope.dateFrom.toISOString());
  }
  if (scope.dateTo) {
    q = q.lte('last_message_at', endOfLocalDay(scope.dateTo).toISOString());
  }
  // Aguardando resposta: colunas da própria conversa, então `.or()` sem embed.
  if (scope.awaitingReply) {
    q = q.or(AWAITING_REPLY_FILTER);
  }

  return q;
};

// Contagens: ver src/lib/conversations/countKeys.ts (re-exportado aqui).
export { invalidateConversationCounts };

interface UseConversationsOptions {
  pageSize?: number;
  searchQuery?: string;
  isArchived?: boolean;
  enabled?: boolean;
  whatsappInstanceId?: string;
  /** Quando true, traz apenas conversas com unread_count > 0. */
  hasUnread?: boolean;
  /** Filtro por janela de tempo (last_message_at). `dateTo` inclui o dia inteiro. */
  dateFrom?: Date | null;
  dateTo?: Date | null;
  /** Etiquetas do contato (qualquer uma). Vazio = sem filtro. */
  tagIds?: string[];
  /** Responsáveis (qualquer um). Vazio = sem filtro. */
  assignedProfileIds?: string[];
  /** Só conversas sem responsável. */
  unassignedOnly?: boolean;
  /** Canal da chave. Ausente = os dois. */
  channel?: ConversationChannel;
}

// Hook para buscar conversas com paginação infinita
export const useConversations = ({
  pageSize = 20,
  searchQuery = '',
  isArchived = false,
  enabled = true,
  whatsappInstanceId,
  hasUnread = false,
  dateFrom = null,
  dateTo = null,
  tagIds = [],
  assignedProfileIds = [],
  unassignedOnly = false,
  channel,
}: UseConversationsOptions = {}) => {
  const { tenant } = useTenant();

  return useInfiniteQuery({
    queryKey: [
      'conversations',
      tenant?.id,
      whatsappInstanceId,
      searchQuery,
      isArchived,
      pageSize,
      hasUnread,
      dateFrom?.toISOString() ?? null,
      dateTo?.toISOString() ?? null,
      tagIds,
      assignedProfileIds,
      unassignedOnly,
      channel ?? null,
    ],
    queryFn: async ({ pageParam = null }) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const scope: ConversationScope = {
        isArchived,
        hasUnread,
        term: searchQuery.trim(),
        whatsappInstanceId,
        dateFrom,
        dateTo,
        tagIds,
        assignedProfileIds,
        unassignedOnly,
        channel,
      };
      const contactsEmbed = contactsEmbedFor(scope);
      // Segundo embed de contact_tags, só com filtro de etiqueta ligado. O de
      // exibição (`contact_tags`, logo abaixo dele) não muda — é dele que o
      // cartão lê todas as etiquetas do contato.
      const tagFilterEmbed = tagFilterEmbedFor(tagIds);

      // Uma única query monta a página inteira, prévia incluída. `comPrevia`
      // existe só para o caso da migração ainda não ter rodado (ver
      // `isMissingLastMessageColumnsError`).
      const executarQuery = async (
        comPrevia: boolean,
        comResponsavel: boolean,
      ): Promise<{ data: ConversationRow[] | null; error: SupabaseQueryError }> => {
        let query = supabase
          .from('conversations')
          .select(`
            id,
            contact_id,
            channel,
            last_message_at,
            unread_count,
            is_archived,
            created_at,
            updated_at,
            tenant_id,
            ${comPrevia ? LAST_MESSAGE_COLUMNS : ''}${comResponsavel ? ASSIGNMENT_COLUMNS : ''}${contactsEmbed} (
              id,
              name,
              phone,
              channel,
              username,
              profile_status,
              profile_checked_at,
              whatsapp_instance_id,
              avatar_url,
              lead_source_id,
              current_stage_id,
              last_interaction_at,
              created_at,
              updated_at,
              tenant_id,
              stage:funnel_stages!contacts_current_stage_id_fkey (
                name
              ),
              lead_sources:lead_source_id (
                name
              ),
              ${tagFilterEmbed ? `${tagFilterEmbed},` : ''}
              contact_tags (
                tag_id,
                tags (
                  id,
                  name,
                  color
                )
              )
            )
          `)
          .eq('tenant_id', tenant.id)
          .order('last_message_at', { ascending: false })
          .limit(pageSize);

        // O recorte é o mesmo da contagem (ver applyConversationScope).
        query = applyConversationScope(query, scope);

        // Aplicar cursor para paginação
        if (pageParam) {
          query = query.lt('last_message_at', pageParam);
        }

        const { data, error } = await query;
        return {
          data: data as unknown as ConversationRow[] | null,
          error: error as SupabaseQueryError,
        };
      };

      let { data, error } = await executarQuery(
        lastMessageColumnsAvailable,
        assignmentColumnsAvailable,
      );

      // Migração ainda não aplicada: repete sem as colunas novas para a lista
      // aparecer sem prévia (ou sem responsável), em vez de sumir inteira da
      // tela. Dois grupos de colunas opcionais, no máximo duas repetições — o
      // de responsável é testado primeiro (ver isMissingAssignmentColumnsError).
      for (let tentativa = 0; error && tentativa < 2; tentativa += 1) {
        if (assignmentColumnsAvailable && isMissingAssignmentColumnsError(error)) {
          assignmentColumnsAvailable = false;
          logger.warn(
            'Colunas de responsável ausentes em conversations. A lista segue sem responsável até a migração 20260913000001 ser aplicada.',
            { code: error.code },
          );
        } else if (lastMessageColumnsAvailable && isMissingLastMessageColumnsError(error)) {
          lastMessageColumnsAvailable = false;
          logger.warn(
            'Colunas de prévia da última mensagem ausentes em conversations. A lista segue sem prévia até a migração ser aplicada.',
            { code: error.code },
          );
        } else {
          break;
        }
        ({ data, error } = await executarQuery(
          lastMessageColumnsAvailable,
          assignmentColumnsAvailable,
        ));
      }

      if (error) {
        throw error;
      }

      const conversations = data || [];
      const hasMore = conversations.length === pageSize;
      const nextCursor = hasMore && conversations.length > 0
        ? conversations[conversations.length - 1].last_message_at
        : undefined;

      // A prévia vem desnormalizada na própria linha da conversa: nenhuma query
      // extra por conversa. Sem as colunas (migração pendente) `mapLastMessage`
      // devolve undefined e a lista mostra "Nenhuma mensagem".
      const conversationsWithMessages = conversations.map((conv) => ({
        ...conv,
        last_message: mapLastMessage(conv),
      }));

      return {
        data: conversationsWithMessages,
        nextCursor,
        hasMore
      } as ConversationsPage;
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && !!tenant?.id,
    staleTime: 1000 * 15, // 15 segundos
    gcTime: 1000 * 60 * 15, // 15 minutos
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    /**
     * Polling como fallback do Realtime — que hoje NÃO entrega nada (a
     * publicação `supabase_realtime` está vazia em produção, medido 2026-08-28).
     * Enquanto isso não mudar, este intervalo É o mecanismo de entrega.
     *
     * Duas coisas acontecem aqui.
     *
     * 1) A base subiu de 10s para 30s. Medido: uma aba aberta gerava ~66s de
     *    tempo de banco POR HORA — cerca de 7,5x a carga total do banco inteiro
     *    naquele momento. A lista sozinha era ~80% disso.
     *
     * 2) O intervalo cresce junto com o número de páginas carregadas. O
     *    TanStack refaz TODAS as páginas em cada refetch: com 3 páginas
     *    abertas, um tick de 30s custava 3 requisições, e o custo por hora
     *    triplicava só porque a pessoa rolou a lista.
     *
     *    Escalando o intervalo pelo número de páginas, o CUSTO POR HORA fica
     *    constante: 1 página = 1 req/30s; 3 páginas = 3 reqs/90s. A mesma
     *    vazão, independente de quanto rolaram.
     *
     * Por que escalar o intervalo em vez de limitar as páginas com `maxPages`:
     * `maxPages` faz o TanStack DESCARTAR a página mais antiga ao carregar uma
     * nova. Como a ConversationsList achata todas as páginas e renderiza o
     * conjunto inteiro (`getAllConversations`), descartar a primeira faria as
     * conversas do topo sumirem e o scroll pular no meio do uso. Escalar o
     * intervalo não perde nenhuma página.
     *
     * Efeito na atualidade da lista: quem rolou 3 páginas vê a lista se
     * atualizar a cada 90s em vez de 30s. Na prática isso não esconde novidade,
     * porque a ordenação é `last_message_at DESC` — mensagem nova sempre entra
     * na PÁGINA 1, que continua no ciclo mais curto sempre que ela é a única
     * carregada. Quem rolou fundo está olhando conversa velha, onde não há
     * novidade a perder. Além disso, as três pílulas de contagem seguem em 30s
     * (elas não têm páginas) e qualquer ação da pessoa invalida na hora.
     *
     * Nota: o TanStack não dispara `refetchInterval` com a aba fora de foco
     * (`refetchIntervalInBackground` é `false` por padrão), então aba de fundo
     * já não custa nada.
     */
    refetchInterval: (query) => {
      const paginasCarregadas = query.state.data?.pages.length ?? 1;
      return 1000 * 30 * Math.max(1, paginasCarregadas);
    },
    initialPageParam: null
  });
};

/** Recorte de servidor de uma contagem — as mesmas colunas que a lista filtra. */
export interface UseConversationsCountOptions {
  searchQuery?: string;
  isArchived?: boolean;
  hasUnread?: boolean;
  whatsappInstanceId?: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  tagIds?: string[];
  assignedProfileIds?: string[];
  unassignedOnly?: boolean;
  /** Canal da chave. Ausente = os dois. */
  channel?: ConversationChannel;
  /** Só as que aguardam resposta (o selo do outro canal). */
  awaitingReply?: boolean;
  enabled?: boolean;
}

/**
 * Total de conversas que casam com um recorte — o tamanho da fila, não da página.
 *
 * A lista é paginada por cursor e recarrega sozinha a cada 10s. Numa fila
 * filtrada ("Não lidas"), isso faz o fim da lista se refazer por baixo enquanto
 * a pessoa trabalha, e é impossível distinguir de mensagem nova chegando: some
 * uma conversa lida, entra outra que estava fora da página. Sem um total, não
 * existe fundo visível.
 *
 * `head: true` traz só o cabeçalho `Content-Range` — nenhuma linha viaja, então
 * a contagem custa muito menos que uma página. `count: 'exact'` conta a tabela
 * inteira sob RLS, e não apenas o que já foi carregado.
 *
 * Os filtros aqui espelham exatamente os de `useConversations`, MENOS o cursor
 * de paginação — é essa ausência que transforma "a página" em "a fila".
 */
export const useConversationsCount = ({
  searchQuery = '',
  isArchived = false,
  hasUnread = false,
  whatsappInstanceId,
  dateFrom = null,
  dateTo = null,
  tagIds = [],
  assignedProfileIds = [],
  unassignedOnly = false,
  channel,
  awaitingReply = false,
  enabled = true,
}: UseConversationsCountOptions = {}) => {
  const { tenant } = useTenant();

  return useQuery({
    // Primeiro segmento 'conversations' de propósito: cai no nível "realtime" do
    // createQueryClient e, mais importante, as invalidações que já existem
    // (`['conversations']` ao ler, arquivar ou apagar) alcançam a contagem por
    // prefixo. É o que faz o número cair na hora em que ela lê uma conversa.
    queryKey: [
      'conversations',
      'total',
      tenant?.id,
      whatsappInstanceId,
      searchQuery,
      isArchived,
      hasUnread,
      dateFrom?.toISOString() ?? null,
      dateTo?.toISOString() ?? null,
      tagIds,
      assignedProfileIds,
      unassignedOnly,
      channel ?? null,
      awaitingReply,
    ],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const scope: ConversationScope = {
        isArchived,
        hasUnread,
        term: searchQuery.trim(),
        whatsappInstanceId,
        dateFrom,
        dateTo,
        tagIds,
        assignedProfileIds,
        unassignedOnly,
        channel,
        awaitingReply,
      };

      // Mesmo `!inner` da lista: sem ele o `.or()` e o filtro de etiqueta
      // recortariam apenas o recurso embutido e a contagem viria com a Loja
      // inteira. A contagem não exibe etiquetas, então só o embed de filtro
      // entra aqui.
      const contactsEmbed = contactsEmbedFor(scope);
      const tagFilterEmbed = tagFilterEmbedFor(tagIds);
      const select =
        contactsEmbed === 'contacts!inner'
          ? `id, contacts!inner(id${tagFilterEmbed ? `, ${tagFilterEmbed}` : ''})`
          : 'id';

      let query = supabase
        .from('conversations')
        .select(select, {
          count: 'exact',
          head: true,
        })
        .eq('tenant_id', tenant.id);

      // O recorte é o mesmo da lista (ver applyConversationScope).
      query = applyConversationScope(query, scope);

      const { count, error } = await query;
      if (error) {
        throw error;
      }
      return count ?? 0;
    },
    enabled: enabled && !!tenant?.id,
    staleTime: 1000 * 15,
    // Mais espaçado que os 10s da lista de propósito: são cinco contagens em
    // paralelo (uma por pílula de servidor) e elas já são invalidadas na hora
    // por qualquer ação da pessoa. O intervalo só cobre o que chega de fora.
    refetchInterval: 1000 * 30,
    refetchOnWindowFocus: true,
  });
};

/**
 * Linha que `useConversation` devolve. Declarada à mão porque o select tem
 * interpolação (colunas opcionais de responsável) e o parser de tipos do
 * PostgREST não lê template com `${}` — sem isto o tipo vira ParserError e o
 * ChatWindow perde `contacts`, `unread_count` etc.
 */
export interface ConversationDetail {
  id: string;
  contact_id: string;
  whatsapp_instance_id: string | null;
  channel?: string | null;
  last_message_at: string | null;
  unread_count: number | null;
  is_archived: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  tenant_id: string;
  /** Ausentes enquanto a migração 20260913000001 não roda. */
  assigned_profile_id?: string | null;
  assigned_at?: string | null;
  assigned_by?: string | null;
  contacts: {
    id: string;
    name: string | null;
    phone: string;
    channel?: string | null;
    external_id?: string | null;
    username?: string | null;
    profile_status?: string | null;
    profile_checked_at?: string | null;
    whatsapp_instance_id?: string | null;
    email: string | null;
    avatar_url: string | null;
    notes: string | null;
    custom_fields: unknown;
    lead_source_id: string | null;
    current_stage_id: string | null;
    last_interaction_at: string | null;
    created_at: string;
    updated_at: string;
    tenant_id: string;
    stage: { name: string; color: string | null } | null;
    lead_sources: { name: string } | null;
    contact_tags: Array<{
      tag_id: string;
      tags: { id: string; name: string; color: string | null } | null;
    }>;
  } | null;
}

// Hook para buscar uma conversa específica
export const useConversation = (conversationId: string) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['conversation', conversationId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !conversationId) {
        throw new Error('Tenant ID and Conversation ID are required');
      }

      // Mesmo cuidado da lista: as colunas de responsável são opcionais até a
      // migração 20260913000001 rodar. Sem isto, abrir a conversa quebraria.
      const buscar = (comResponsavel: boolean) =>
        supabase
          .from('conversations')
          .select(`
          id,
          contact_id,
          whatsapp_instance_id,
          channel,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at,
          tenant_id,
          ${comResponsavel ? ASSIGNMENT_COLUMNS : ''}contacts (
            id,
            name,
            phone,
            channel,
            external_id,
            username,
            profile_status,
            profile_checked_at,
            whatsapp_instance_id,
            email,
            avatar_url,
            notes,
            custom_fields,
            lead_source_id,
            current_stage_id,
            last_interaction_at,
            created_at,
            updated_at,
            tenant_id,
            stage:funnel_stages!contacts_current_stage_id_fkey (
              name,
              color
            ),
            lead_sources:lead_source_id (
              name
            ),
            contact_tags (
              tag_id,
              tags (
                id,
                name,
                color
              )
            )
          )
        `)
          .eq('id', conversationId)
          .eq('tenant_id', tenant.id)
          .limit(1)
          .maybeSingle();

      let { data, error } = await buscar(assignmentColumnsAvailable);

      if (
        error &&
        assignmentColumnsAvailable &&
        isMissingAssignmentColumnsError(error as SupabaseQueryError)
      ) {
        assignmentColumnsAvailable = false;
        logger.warn(
          'Colunas de responsável ausentes em conversations. A conversa abre sem responsável até a migração 20260913000001 ser aplicada.',
          { code: (error as SupabaseQueryError)?.code },
        );
        ({ data, error } = await buscar(false));
      }

      if (error) {
        throw error;
      }

      return data as unknown as ConversationDetail | null;
    },
    enabled: !!tenant?.id && !!conversationId,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos
  });
};

// Hook para marcar conversa como lida
export const useMarkConversationAsRead = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { error } = await supabase
        .from('conversations')
        .update({ 
          unread_count: 0,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (error) {
        throw error;
      }

      return conversationId;
    },
    onSuccess: (conversationId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversation', conversationId, tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['recent-conversations', tenant?.id] 
      });
      // "Não lidas", "Aguardando" do outro canal etc.: na hora, não em 30 s.
      invalidateConversationCounts(queryClient);
    },
    onError: (error) => {
      console.error('Error marking conversation as read:', error);
    },
  });
};

// Hook para arquivar/desarquivar conversa
export const useArchiveConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ conversationId, isArchived }: { conversationId: string; isArchived: boolean }) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const { error } = await supabase
        .from('conversations')
        .update({ 
          is_archived: isArchived,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (error) {
        throw error;
      }

      return { conversationId, isArchived };
    },
    onSuccess: ({ conversationId, isArchived }) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
      invalidateConversationCounts(queryClient);
      queryClient.invalidateQueries({ 
        queryKey: ['conversation', conversationId, tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['recent-conversations', tenant?.id] 
      });
      
      toast({
        title: isArchived ? 'Conversa arquivada' : 'Conversa desarquivada',
        description: `A conversa foi ${isArchived ? 'arquivada' : 'desarquivada'} com sucesso.`,
      });
    },
    onError: (error) => {
      console.error('Error archiving conversation:', error);
      toast({
        title: 'Erro ao arquivar conversa',
        description: 'Ocorreu um erro ao arquivar a conversa. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

// Hook para deletar conversa
export const useDeleteConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (conversationId: string) => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      // Primeiro buscar a conversa para pegar o contact_id real
      const { data: conversation, error: fetchError } = await supabase
        .from('conversations')
        .select('contact_id')
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      if (conversation?.contact_id) {
        // Deletar todas as mensagens vinculadas a este contato
        const { error: messagesError } = await supabase
          .from('messages')
          .delete()
          .eq('contact_id', conversation.contact_id)
          .eq('tenant_id', tenant.id);

        if (messagesError) {
          throw messagesError;
        }
      }

      // Depois deletar a conversa
      const { error: conversationError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)
        .eq('tenant_id', tenant.id);

      if (conversationError) {
        throw conversationError;
      }

      return conversationId;
    },
    onSuccess: (conversationId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations'] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['messages'] 
      });
      
      toast({
        title: 'Conversa deletada',
        description: 'A conversa e todas as mensagens foram removidas com sucesso.',
      });
    },
    onError: (error) => {
      console.error('Error deleting conversation:', error);
      toast({
        title: 'Erro ao deletar conversa',
        description: 'Ocorreu um erro ao deletar a conversa. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

// Hook para buscar conversa por contact_id
export const useConversationByContact = (contactId: string) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['conversation-by-contact', contactId, tenant?.id],
    queryFn: async () => {
      if (!tenant?.id || !contactId) {
        return null;
      }

      let query = supabase
        .from('conversations')
        .select(`
          id,
          contact_id,
          last_message_at,
          unread_count,
          is_archived,
          created_at,
          updated_at,
          tenant_id,
          contacts (
            id,
            name,
            phone,
            lead_source_id,
            current_stage_id,
            created_at,
            updated_at,
            tenant_id,
            stage:funnel_stages!contacts_current_stage_id_fkey (
              name
            ),
            lead_sources:lead_source_id (
              name
            ),
            contact_tags (
              tag_id,
              tags (
                id,
                name,
                color
              )
            )
          )
        `)
        .eq('contact_id', contactId)
        .eq('tenant_id', tenant.id)
        .eq('is_archived', false);

      const { data, error } = await query
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return data;
    },
    enabled: !!tenant?.id && !!contactId,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos
  });
};

// Hook para estatísticas de conversas
export const useConversationStats = () => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['conversation-stats', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) {
        throw new Error('Tenant ID is required');
      }

      const baseQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id);



      const unreadQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gt('unread_count', 0);
        


      const archivedQuery = supabase
        .from('conversations')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('is_archived', true);



      // Buscar estatísticas básicas
      const [totalResult, unreadResult, archivedResult] = await Promise.all([
        baseQuery,
        unreadQuery,
        archivedQuery
      ]);

      return {
        total: totalResult.count || 0,
        unread: unreadResult.count || 0,
        archived: archivedResult.count || 0,
        active: (totalResult.count || 0) - (archivedResult.count || 0)
      };
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 60 * 5, // 5 minutos
    gcTime: 1000 * 60 * 30, // 30 minutos
  });
};

// Função utilitária para obter todas as conversas de todas as páginas
export const getAllConversations = (conversationsQuery: ReturnType<typeof useConversations>) => {
  return conversationsQuery.data?.pages.flatMap(page => page.data) || [];
};

// Função utilitária para filtrar conversas não lidas
export const getUnreadConversations = (conversations: Conversation[]) => {
  return conversations.filter(conv => conv.unread_count > 0);
};

// Função utilitária para agrupar conversas por status
export const groupConversationsByStatus = (conversations: Conversation[]) => {
  return {
    unread: conversations.filter(conv => conv.unread_count > 0),
    read: conversations.filter(conv => conv.unread_count === 0 && !conv.is_archived),
    archived: conversations.filter(conv => conv.is_archived)
  };
};

// Hook para criar uma nova conversa
export const useCreateConversation = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async (contactId: string) => {
      if (!tenant?.id || !contactId) {
        throw new Error('Tenant ID and Contact ID are required');
      }

      // Verificar se já existe uma conversa para este contato
      const { data: existingConversation } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenant.id)
        .eq('is_archived', false)
        .limit(1)
        .maybeSingle();

      if (existingConversation) {
        return existingConversation.id;
      }

      // Buscar dados do contato
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .select('whatsapp_instance_id')
        .eq('id', contactId)
        .eq('tenant_id', tenant.id)
        .limit(1)
        .maybeSingle();

      if (contactError) {
        throw contactError;
      }

      // Criar nova conversa
      const { data: newConversation, error } = await supabase
        .from('conversations')
        .insert({
          tenant_id: tenant.id,
          contact_id: contactId,
          whatsapp_instance_id: contact.whatsapp_instance_id,
          last_message_at: new Date().toISOString(),
          unread_count: 0,
          is_archived: false
        })
        .select('id')
        .limit(1)
        .maybeSingle();

      if (error) {
        throw error;
      }

      return newConversation.id;
    },
    onSuccess: (conversationId) => {
      // Invalidar queries relacionadas
      queryClient.invalidateQueries({ 
        queryKey: ['conversations', tenant?.id] 
      });
      queryClient.invalidateQueries({ 
        queryKey: ['conversation-by-contact'] 
      });
    },
    onError: (error) => {
      console.error('Error creating conversation:', error);
      toast({
        title: 'Erro ao criar conversa',
        description: 'Ocorreu um erro ao criar a conversa. Tente novamente.',
        variant: 'destructive',
      });
    },
  });
};

export type { Conversation, Contact, ConversationsPage, UseConversationsOptions };