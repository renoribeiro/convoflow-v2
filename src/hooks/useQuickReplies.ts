/**
 * Respostas rápidas da Loja — leitura e escrita num lugar só.
 *
 * Três telas consomem isto e precisam concordar: o popover do compositor
 * (`QuickRepliesPopover`), a aba de Configurações (`QuickRepliesSettings`) e o
 * diálogo de salvar uma mensagem já enviada (`SaveQuickReplyDialog`). Ter uma
 * chave de cache só é o que faz uma resposta criada em qualquer um dos três
 * aparecer imediatamente nos outros dois.
 *
 * Isolamento por Conta:
 *   - leitura  — `useSupabaseQuery` anexa `.eq('tenant_id', tenant.id)` sozinho
 *                e particiona a chave de cache por Conta;
 *   - escrita  — `tenant_id` explícito aqui;
 *   - servidor — as policies `quick_replies_tenant_all` /
 *                `quick_replies_superadmin_all` decidem de verdade. O filtro do
 *                cliente é conveniência e cache, não é a trava.
 *
 * Autoria (`created_by`, `created_by_name`, `updated_by`, `updated_by_name`) é
 * carimbada pelo gatilho `stamp_quick_reply_authorship` no banco. Não mande
 * esses campos daqui: o gatilho sobrescreve, de propósito.
 */
import { useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';

export interface QuickReply {
  id: string;
  name: string;
  content: string;
  created_by_name: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Campos que a tela envia. O resto é do banco. */
export interface QuickReplyDraft {
  name: string;
  content: string;
}

const SELECT = 'id, name, content, created_by_name, updated_by_name, created_at, updated_at';

/** Código do PostgreSQL para violação de UNIQUE (tenant_id, name). */
const UNIQUE_VIOLATION = '23505';

/** Erro do Postgres traduzido para o que o usuário precisa fazer a respeito. */
function traduzirErro(error: unknown): Error {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === UNIQUE_VIOLATION) {
    return new Error('Já existe uma resposta rápida com esse nome nesta Loja.');
  }
  if (e?.code === '23514') {
    return new Error('Nome e mensagem não podem ficar em branco.');
  }
  return new Error(e?.message || 'Não foi possível salvar. Tente novamente.');
}

export function useQuickReplies() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  const {
    data = [],
    isLoading,
    error,
  } = useSupabaseQuery({
    table: 'quick_replies',
    queryKey: [QUERY_KEYS.QUICK_REPLIES],
    select: SELECT,
    order: { column: 'name', ascending: true },
  });

  // Via `unknown` porque `useSupabaseQuery` recebe o nome da tabela como string
  // solta: o PostgREST não consegue inferir a linha e devolve o tipo largo de
  // erro do supabase-js. É o mesmo motivo por que `funnelStages` do
  // AutomationBuilder também precisa de asserção. Quem garante o formato é o
  // SELECT logo acima.
  const quickReplies = data as unknown as QuickReply[];

  /**
   * Invalida a lista em TODAS as telas. A chave real carrega o id da Conta no
   * fim (`useSupabaseQuery` particiona por Conta), então invalidamos pelo
   * prefixo — é o que alcança as duas variações.
   */
  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.QUICK_REPLIES] });
  }, [queryClient]);

  const criar = useMutation({
    mutationFn: async (draft: QuickReplyDraft): Promise<QuickReply> => {
      if (!tenant?.id) throw new Error('Conta não carregada. Recarregue a página.');
      const { data: row, error: err } = await supabase
        .from('quick_replies')
        .insert({
          tenant_id: tenant.id,
          name: draft.name.trim(),
          content: draft.content.trim(),
        })
        .select(SELECT)
        .single();
      if (err) {
        logger.warn('quick_replies: falha ao criar', { code: err.code });
        throw traduzirErro(err);
      }
      return row as QuickReply;
    },
    onSuccess: invalidar,
  });

  const atualizar = useMutation({
    mutationFn: async ({ id, ...draft }: QuickReplyDraft & { id: string }): Promise<QuickReply> => {
      if (!tenant?.id) throw new Error('Conta não carregada. Recarregue a página.');
      const { data: row, error: err } = await supabase
        .from('quick_replies')
        .update({ name: draft.name.trim(), content: draft.content.trim() })
        .eq('id', id)
        // Redundante com o RLS, e proposital: o filtro impede que um id de
        // outra Conta chegue a ser tentado.
        .eq('tenant_id', tenant.id)
        .select(SELECT)
        .single();
      if (err) {
        logger.warn('quick_replies: falha ao atualizar', { code: err.code });
        throw traduzirErro(err);
      }
      return row as QuickReply;
    },
    onSuccess: invalidar,
  });

  const remover = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!tenant?.id) throw new Error('Conta não carregada. Recarregue a página.');
      const { error: err } = await supabase
        .from('quick_replies')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tenant.id);
      if (err) {
        logger.warn('quick_replies: falha ao remover', { code: err.code });
        throw traduzirErro(err);
      }
    },
    onSuccess: invalidar,
  });

  return useMemo(
    () => ({
      quickReplies,
      isLoading,
      error,
      criar,
      atualizar,
      remover,
      invalidar,
    }),
    [quickReplies, isLoading, error, criar, atualizar, remover, invalidar],
  );
}
