
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { Badge } from '@/components/ui/badge';
import { TagBadge } from '@/components/etiquetas/TagBadge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { TableSkeleton, Skeleton } from '@/components/shared/Skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MoreHorizontal, MessageCircle, Edit, Trash2, AlertCircle, Users } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { Link } from 'react-router-dom';
import React, { useState, useMemo } from 'react';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { Pagination } from '@/components/shared/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { logger } from '@/lib/logger';
import { ChannelLogo } from '@/components/conversations/ChannelLogo';
import { CHANNEL_LABEL } from '@/lib/conversations/channel';
import { contactDisplayName } from '@/lib/instagram/contactProfile';
import {
  contactChannel,
  contactIdentifier,
  contactMatchesSearch,
  type ContactChannelFilter,
} from '@/lib/contacts/identity';

interface Contact {
  id: string;
  name: string | null;
  /** Nulo no Instagram — a linha de identificação usa o @ (ver contactIdentifier). */
  phone: string | null;
  channel?: string | null;
  username?: string | null;
  email?: string;
  current_stage_id?: string;
  lead_source_id?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  is_blocked?: boolean;
  opt_in_mass_message?: boolean | null;
  opt_out_mass_message?: boolean | null;
  stage?: {
    name: string;
    color: string;
  };
  lead_source?: {
    name: string;
  };
  conversations?: {
    last_message_at: string;
  }[];
  contact_tags?: {
    tag_id: string;
    tags?: {
      id: string;
      name: string;
      color: string;
    };
  }[];
}

interface ContactsTableProps {
  filters: {
    search: string;
    stage: string;
    source: string;
    tags: string[];
  };
  whatsappInstanceId?: string | null;
  /** Canal: filtrado no servidor e parte da chave do cache. */
  channel?: ContactChannelFilter;
  onEdit: (id: string) => void;
}




export const ContactsTable = ({ filters, whatsappInstanceId, channel = 'all', onEdit }: ContactsTableProps) => {
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    contactId: string | null;
    contactName: string;
  }>({ isOpen: false, contactId: null, contactName: '' });
  // Construir query dinâmica baseada nos filtros
  const buildQuery = () => {
    const query = {
      select: `
        *,
        stage:funnel_stages!contacts_current_stage_id_fkey (
          name,
          color
        ),
        lead_source:lead_sources!contacts_lead_source_id_fkey (
          name
        ),
        conversations (
          last_message_at
        ),
        contact_tags (
          tag_id,
          tags (
            id,
            name,
            color
          )
        )
      `,
      orderBy: [{ column: 'created_at', ascending: false }]
    };

    // Aplicar filtros
    const filters_array = [];

    // Filtro de estágio
    if (filters.stage && filters.stage !== 'all' && filters.stage !== '') {
      filters_array.push({
        column: 'current_stage_id',
        operator: 'eq',
        value: filters.stage
      });
    }

    // Filtro de fonte
    if (filters.source && filters.source !== 'all' && filters.source !== '') {
      filters_array.push({
        column: 'lead_source_id',
        operator: 'eq',
        value: filters.source
      });
    }

    // Filtro por instância (escopo per-instance — contatos são separados por instância)
    if (whatsappInstanceId) {
      filters_array.push({
        column: 'whatsapp_instance_id',
        operator: 'eq',
        value: whatsappInstanceId
      });
    }

    // Filtro de canal — no servidor. Contato nunca é juntado entre canais: a
    // mesma pessoa no WhatsApp e no Instagram são duas linhas.
    if (channel !== 'all') {
      filters_array.push({
        column: 'channel',
        operator: 'eq',
        value: channel
      });
    }

    return { ...query, filter: filters_array };
  };

  const { data: allContactsRaw = [], isLoading, error } = useSupabaseQuery({
    table: 'contacts',
    queryKey: ['contacts', filters.stage, filters.source, filters.tags, whatsappInstanceId ?? 'all', channel],
    ...buildQuery()
  });

  // `useSupabaseQuery` devolve um tipo genérico que não conhece o `select` com
  // joins acima, então todo acesso a campo caía em `GenericStringError`. A
  // interface `Contact` deste arquivo é o contrato real da consulta.
  const allContacts = allContactsRaw as unknown as Contact[];

  // Aplicar filtros de busca e tags no lado do cliente
  const filteredContacts = useMemo(() => {
    let filteredContacts = allContacts;
    
    // Filtro por tags
    if (filters.tags && filters.tags.length > 0) {
      filteredContacts = filteredContacts.filter(contact => {
        const contactTagIds = contact.contact_tags?.map(ct => ct.tags?.id) || [];
        return filters.tags.some(tagId => contactTagIds.includes(tagId));
      });
    }
    
    // Filtro de busca
    if (!filters.search || !filters.search.trim()) {
      return filteredContacts;
    }
    
    // Nome, telefone, e-mail e @ do Instagram (com ou sem o "@").
    return filteredContacts.filter(contact => contactMatchesSearch(contact, filters.search));
  }, [allContacts, filters.search, filters.tags]);

  // Configurar paginação
  const pagination = usePagination({
    totalItems: filteredContacts.length,
    initialItemsPerPage: 10
  });

  // Aplicar paginação aos contatos filtrados
  const paginatedContacts = useMemo(() => {
    const startIndex = pagination.startIndex;
    const endIndex = startIndex + pagination.itemsPerPage;
    return filteredContacts.slice(startIndex, endIndex);
  }, [filteredContacts, pagination.startIndex, pagination.itemsPerPage]);

  const deleteMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'delete',
    invalidateQueries: [['contacts']],
    successMessage: 'Contato excluído com sucesso!',
    errorMessage: 'Erro ao excluir contato. Tente novamente.'
  });

  const consentMutation = useSupabaseMutation({
    table: 'contacts',
    operation: 'update',
    invalidateQueries: [['contacts']],
    successMessage: 'Consentimento atualizado!',
    errorMessage: 'Erro ao atualizar consentimento.',
  });

  const handleToggleOptIn = async (contactId: string, current: boolean | null | undefined) => {
    try {
      await consentMutation.mutateAsync({
        data: { opt_in_mass_message: !current },
        options: { filter: { column: 'id', operator: 'eq', value: contactId } },
      });
    } catch (err) {
      logger.error('Erro ao alterar opt-in do contato', { contactId, error: (err as Error).message });
    }
  };

  const handleToggleOptOut = async (contactId: string, current: boolean | null | undefined) => {
    try {
      await consentMutation.mutateAsync({
        data: { opt_out_mass_message: !current },
        options: { filter: { column: 'id', operator: 'eq', value: contactId } },
      });
    } catch (err) {
      logger.error('Erro ao alterar opt-out do contato', { contactId, error: (err as Error).message });
    }
  };

  const handleDeleteClick = (contactId: string, contactName: string) => {
    setDeleteConfirmation({
      isOpen: true,
      contactId,
      contactName
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.contactId) return;

    try {
      logger.info('Iniciando exclusão de contato', {
        category: 'contact_management',
        action: 'delete_contact',
        contactId: deleteConfirmation.contactId,
        contactName: deleteConfirmation.contactName
      });

      await deleteMutation.mutateAsync({
        data: {},
        options: {
          filter: { column: 'id', operator: 'eq', value: deleteConfirmation.contactId }
        }
      });

      logger.info('Contato excluído com sucesso', {
        category: 'contact_management',
        action: 'delete_contact',
        contactId: deleteConfirmation.contactId,
        contactName: deleteConfirmation.contactName,
        status: 'success'
      });

      setDeleteConfirmation({ isOpen: false, contactId: null, contactName: '' });
    } catch (error) {
      logger.error('Erro ao excluir contato', {
        category: 'contact_management',
        action: 'delete_contact',
        contactId: deleteConfirmation.contactId,
        contactName: deleteConfirmation.contactName,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, contactId: null, contactName: '' });
  };

  const displayName = (contact: Contact) => contactDisplayName(contact, contactChannel(contact));

  const renderContato = (contact: Contact, showSourceInline: boolean) => (
    <div className="flex items-center gap-3">
      <Avatar className="w-8 h-8">
        <AvatarFallback>
          {(contact.name?.trim()
            ? contact.name.trim().split(' ').map(n => n[0]).join('').slice(0, 2)
            : '?'
          ).slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="font-medium text-foreground flex items-center gap-1.5">
          <span title={CHANNEL_LABEL[contactChannel(contact)]} className="flex-shrink-0">
            <ChannelLogo channel={contactChannel(contact)} className="h-3.5 w-3.5" />
            <span className="sr-only">{CHANNEL_LABEL[contactChannel(contact)]}: </span>
          </span>
          <span className="min-w-0">{displayName(contact)}</span>
        </p>
        <p className="text-sm text-muted-foreground whitespace-nowrap">{contactIdentifier(contact)}</p>
        {contact.email && (
          <p className="text-xs text-muted-foreground break-all">{contact.email}</p>
        )}
        {/* Enquanto a coluna Fonte está escondida (abaixo de 2xl), a fonte mora aqui. */}
        {showSourceInline && contact.lead_source?.name && (
          <p className="text-xs text-muted-foreground 2xl:hidden">Fonte: {contact.lead_source.name}</p>
        )}
      </div>
    </div>
  );

  const renderConsentimento = (contact: Contact) => (
    <div className="flex flex-col gap-1">
      {contact.is_blocked ? (
        <Badge variant="secondary" className="bg-red-100 text-red-800 w-fit">
          Bloqueado
        </Badge>
      ) : contact.opt_in_mass_message ? (
        <button
          type="button"
          title="Clique para remover opt-in"
          onClick={() => handleToggleOptIn(contact.id, contact.opt_in_mass_message)}
          disabled={consentMutation.isPending}
          className="w-fit"
        >
          <Badge className="bg-green-100 text-green-800 hover:bg-green-200 cursor-pointer w-fit">
            Opt-in
          </Badge>
        </button>
      ) : contact.opt_out_mass_message ? (
        <button
          type="button"
          title="Clique para remover opt-out"
          onClick={() => handleToggleOptOut(contact.id, contact.opt_out_mass_message)}
          disabled={consentMutation.isPending}
          className="w-fit"
        >
          <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200 cursor-pointer w-fit">
            Opt-out
          </Badge>
        </button>
      ) : (
        <div className="flex flex-wrap gap-1">
          <button
            type="button"
            title="Marcar como opt-in"
            onClick={() => handleToggleOptIn(contact.id, false)}
            disabled={consentMutation.isPending}
          >
            <Badge variant="outline" className="hover:bg-green-50 cursor-pointer text-xs">
              + Opt-in
            </Badge>
          </button>
          <button
            type="button"
            title="Marcar como opt-out"
            onClick={() => handleToggleOptOut(contact.id, false)}
            disabled={consentMutation.isPending}
          >
            <Badge variant="outline" className="hover:bg-yellow-50 cursor-pointer text-xs">
              Opt-out
            </Badge>
          </button>
        </div>
      )}
    </div>
  );

  const contactColumns: ResponsiveColumn<Contact>[] = [
    {
      key: 'contato',
      header: 'Contato',
      card: 'title',
      cell: (contact) => renderContato(contact, true),
      cardCell: (contact) => renderContato(contact, false),
    },
    {
      key: 'estagio',
      header: 'Estágio',
      card: 'badge',
      cell: (contact) =>
        contact.stage ? (
          <Badge
            style={{
              backgroundColor: `${contact.stage.color}20`,
              color: contact.stage.color,
              borderColor: contact.stage.color
            }}
            variant="outline"
          >
            {contact.stage.name}
          </Badge>
        ) : (
          <Badge variant="secondary">Sem estágio</Badge>
        ),
    },
    {
      key: 'fonte',
      header: 'Fonte',
      hideBelow: '2xl',
      cell: (contact) =>
        contact.lead_source?.name ? (
          <Badge variant="outline" className="max-w-[220px] truncate" title={contact.lead_source.name}>
            {contact.lead_source.name}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-sm">-</span>
        ),
    },
    {
      key: 'etiquetas',
      header: 'Etiquetas',
      card: 'badge',
      cell: (contact) => (
        <div className="flex flex-wrap gap-1">
          {contact.contact_tags && contact.contact_tags.length > 0 ? (
            contact.contact_tags.map((contactTag) => (
              contactTag.tags && (
                <TagBadge
                  key={contactTag.tag_id}
                  name={contactTag.tags.name}
                  color={contactTag.tags.color}
                />
              )
            ))
          ) : (
            <span className="text-muted-foreground text-sm">-</span>
          )}
        </div>
      ),
    },
    {
      // Fica sempre visível na tabela: é o único lugar onde o consentimento
      // se marca/desmarca. O que some abaixo de 2xl é informação (Fonte,
      // Última Interação), nunca um controle.
      key: 'consentimento',
      header: 'Consentimento',
      cardFull: true,
      cell: renderConsentimento,
    },
    {
      key: 'ultima',
      header: 'Última Interação',
      hideBelow: '2xl',
      cell: (contact) =>
        contact.conversations && contact.conversations.length > 0 && contact.conversations[0].last_message_at ? (
          <span className="text-sm text-muted-foreground">
            {formatDistanceToNow(new Date(contact.conversations[0].last_message_at), {
              locale: ptBR,
              addSuffix: true
            })}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Nunca</span>
        ),
    },
  ];

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-lg">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Contatos</h3>
              <Skeleton className="h-4 w-32 mt-1" />
            </div>
          </div>
          <TableSkeleton />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-card border border-border rounded-lg">
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Erro ao carregar contatos. Tente novamente.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-lg">
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-foreground">Contatos</h3>
            <p className="text-sm text-muted-foreground">{filteredContacts.length} contatos encontrados</p>
          </div>
        </div>

        {filteredContacts.length === 0 ? (
          <div className="text-center py-12">
            <Users className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhum contato encontrado</p>
            <p className="text-sm text-muted-foreground mt-1">
              {filters.search || filters.stage || filters.source || channel !== 'all'
                ? 'Tente ajustar os filtros de busca'
                : 'Adicione seu primeiro contato para começar'}
            </p>
          </div>
        ) : (
          // Uma coluna, dois modos (ver ResponsiveTable). No cartão: nome/telefone
          // lideram, etapa e etiquetas vêm como chips, fonte e última interação
          // como campos, e o consentimento — que tem botões — ocupa a linha toda.
          // Na tabela, Fonte e Última Interação somem abaixo de 2xl (1536px):
          // com a coluna de filtros ao lado, sete colunas não cabem a 1280 (a
          // tabela ficava 182px mais larga que o cartão). A fonte continua
          // visível, embaixo do nome, enquanto a coluna dela está escondida;
          // Consentimento nunca some, porque é um controle.
          <ResponsiveTable
            ariaLabel="Contatos"
            rows={paginatedContacts}
            rowKey={(contact) => contact.id}
            columns={contactColumns}
            actions={(contact) => (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-8 w-8 p-0" aria-label={`Ações de ${contact.name?.trim() || (contactChannel(contact) === 'instagram' ? displayName(contact) : 'contato sem nome')}`}>
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`/dashboard/conversations?contact=${contact.id}`}>
                      <MessageCircle className="mr-2 h-4 w-4" />
                      Conversar
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(contact.id)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleDeleteClick(contact.id, displayName(contact))}
                    className="text-red-600"
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          />
        )}
        
        {/* Paginação */}
        {filteredContacts.length > 0 && (
          <div className="mt-4 border-t pt-4">
            <Pagination
              currentPage={pagination.currentPage}
              totalPages={pagination.totalPages}
              totalItems={filteredContacts.length}
              itemsPerPage={pagination.itemsPerPage}
              onPageChange={pagination.goToPage}
              onItemsPerPageChange={pagination.setItemsPerPage}
              showItemsPerPage={true}
              itemsPerPageOptions={[5, 10, 20, 50]}
            />
          </div>
        )}
      </div>
      
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Excluir Contato"
        description={`Tem certeza que deseja excluir o contato "${deleteConfirmation.contactName}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        icon={<Trash2 className="h-5 w-5 text-red-500" />}
      />
    </div>
  );
};
