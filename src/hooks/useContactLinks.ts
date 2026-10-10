import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import { invalidateConversationCounts } from '@/lib/conversations/countKeys';
import {
  buildLinkIndex,
  linkRefusalMessage,
  type ContactLink,
  type ContactLinkIndex,
  type LinkChoices,
} from '@/lib/contacts/links';

/**
 * Vínculo à mão WhatsApp ↔ Instagram (migração 20261009000001).
 *
 * Tudo passa por RPC: a tabela `contact_links` é fechada para o navegador
 * (nem leitura). Quem decide se a pessoa pode vincular — contacts.manage e ver
 * as DUAS conversas — é o servidor; a tela só esconde o botão de quem não tem
 * contacts.manage.
 *
 * Falha na leitura vira lista vazia: a tela segue como antes do vínculo
 * (cada contato sozinho), sem quebrar.
 */

export interface LinkCandidate {
  contact_id: string;
  channel: string;
  name: string | null;
  phone: string | null;
  username: string | null;
  avatar_url: string | null;
}

/** Recusa de negócio do servidor (`{ ok: false, reason }`). */
export class ContactLinkRefusedError extends Error {
  constructor(public readonly reason: string) {
    super(linkRefusalMessage(reason));
    this.name = 'ContactLinkRefusedError';
  }
}

type RpcResult = { ok?: boolean; reason?: string } | null;

export const useContactLinks = () => {
  const { tenant } = useTenant();
  return useQuery({
    queryKey: [QUERY_KEYS.CONTACT_LINKS, tenant?.id],
    queryFn: async (): Promise<ContactLink[]> => {
      if (!tenant?.id) return [];
      const { data, error } = await supabase.rpc('contact_links_list', { p_tenant_id: tenant.id });
      if (error) {
        logger.warn('Vínculos de contato indisponíveis; cada contato aparece sozinho.', { code: error.code });
        return [];
      }
      return (data ?? []) as ContactLink[];
    },
    enabled: !!tenant?.id,
    staleTime: 1000 * 60 * 5,
  });
};

export const useContactLinkIndex = (): ContactLinkIndex => {
  const { data } = useContactLinks();
  return useMemo(() => buildLinkIndex(data ?? []), [data]);
};

/**
 * A busca do seletor. Só busca com 2+ caracteres digitados: o servidor nunca
 * sugere ninguém, e a tela também não.
 */
export const useLinkCandidates = (contactId: string | null | undefined, search: string) => {
  const term = search.trim();
  return useQuery({
    queryKey: [QUERY_KEYS.CONTACT_LINKS, 'candidates', contactId, term],
    queryFn: async (): Promise<LinkCandidate[]> => {
      const { data, error } = await supabase.rpc('contact_link_candidates', {
        p_contact_id: contactId as string,
        p_search: term,
      });
      if (error) throw new Error(error.message);
      return (data ?? []) as LinkCandidate[];
    },
    enabled: !!contactId && term.length >= 2,
    staleTime: 1000 * 30,
  });
};

const invalidateAfterLinkChange = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONTACT_LINKS] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONTACTS] });
  queryClient.invalidateQueries({ queryKey: ['conversation'] });
  queryClient.invalidateQueries({ queryKey: ['contact-link-counterpart'] });
  queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.CONVERSATIONS] });
  invalidateConversationCounts(queryClient);
};

export const useLinkContacts = () => {
  const queryClient = useQueryClient();
  return useMutation<
    { link_id: string; changed: string[] },
    Error,
    { whatsappContactId: string; instagramContactId: string; choices: LinkChoices }
  >({
    mutationFn: async ({ whatsappContactId, instagramContactId, choices }) => {
      const { data, error } = await supabase.rpc('contact_link_create', {
        p_whatsapp_contact_id: whatsappContactId,
        p_instagram_contact_id: instagramContactId,
        // LinkChoices é uma interface (sem assinatura de índice); o formato é JSON puro.
        p_choices: choices as unknown as Json,
      });
      if (error) throw new Error(error.message);
      const result = data as RpcResult & { link_id?: string; changed?: string[] };
      if (!result?.ok) throw new ContactLinkRefusedError(result?.reason ?? 'unknown');
      return { link_id: result.link_id ?? '', changed: result.changed ?? [] };
    },
    onSuccess: () => {
      invalidateAfterLinkChange(queryClient);
      toast.success('Contatos vinculados.');
    },
    onError: (error) => {
      if (error instanceof ContactLinkRefusedError) {
        // A tela pode estar velha (alguém vinculou antes): refaz a leitura.
        invalidateAfterLinkChange(queryClient);
        toast.error(error.message);
        return;
      }
      logger.error('Erro ao vincular contatos', undefined, error);
      toast.error('Não foi possível vincular. Tente novamente.');
    },
  });
};

export const useUnlinkContact = () => {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { contactId: string }>({
    mutationFn: async ({ contactId }) => {
      const { data, error } = await supabase.rpc('contact_link_remove', { p_contact_id: contactId });
      if (error) throw new Error(error.message);
      const result = data as RpcResult;
      if (!result?.ok) throw new ContactLinkRefusedError(result?.reason ?? 'unknown');
    },
    onSuccess: () => {
      invalidateAfterLinkChange(queryClient);
      toast.success('Vínculo desfeito. Os dois contatos voltaram a ser independentes.');
    },
    onError: (error) => {
      if (error instanceof ContactLinkRefusedError) {
        invalidateAfterLinkChange(queryClient);
        toast.error(error.message);
        return;
      }
      logger.error('Erro ao desvincular contatos', undefined, error);
      toast.error('Não foi possível desfazer o vínculo. Tente novamente.');
    },
  });
};
