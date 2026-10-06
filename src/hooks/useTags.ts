import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

interface TagInput {
  name: string;
  color: string;
}

/**
 * CRUD de etiquetas (labels estilo WhatsApp).
 *
 * Usa o cliente Supabase autenticado diretamente — e NÃO o useSupabaseMutation —
 * porque aquele hook injeta tenant_id automaticamente, o que quebra em tabelas
 * sem essa coluna (contact_tags). A RLS de `tags` é FOR ALL USING (tenant_id =
 * get_current_user_tenant_id()), então as operações abaixo respeitam a Conta.
 *
 * A listagem filtra pela Conta/Loja ATIVA (`tenant.id`), e não confia só no
 * RLS: desde 20260909000001 um gerente lê as etiquetas da própria Conta E das
 * Lojas filhas, então sem o filtro o modal "Etiquetar lead" mostrava as duas
 * listas juntas — "Cliente" duas vezes, uma delas invisível para a equipe da
 * Loja (medido em 2026-09-17). O queryKey leva o tenant para o cache não
 * vazar entre Lojas ao trocar no seletor.
 */
export function useTags() {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  const list = useQuery({
    queryKey: ['tags', tenant?.id],
    enabled: !!tenant?.id,
    queryFn: async (): Promise<Tag[]> => {
      const { data, error } = await supabase
        .from('tags')
        .select('id, name, color')
        .eq('tenant_id', tenant!.id)
        .order('name', { ascending: true });

      if (error) throw error;
      return (data as Tag[]) ?? [];
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tags'] });
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const createTag = useMutation({
    mutationFn: async ({ name, color }: TagInput): Promise<Tag> => {
      if (!tenant?.id) throw new Error('Conta não carregada');
      const { data, error } = await supabase
        .from('tags')
        .insert({ name: name.trim(), color, tenant_id: tenant.id })
        .select('id, name, color')
        .single();

      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Etiqueta criada com sucesso!');
    },
    onError: (error) => {
      logger.error('Erro ao criar etiqueta', { error });
      toast.error('Erro ao criar etiqueta');
    },
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, name, color }: TagInput & { id: string }): Promise<Tag> => {
      const { data, error } = await supabase
        .from('tags')
        .update({ name: name.trim(), color })
        .eq('id', id)
        .select('id, name, color')
        .single();

      if (error) throw error;
      return data as Tag;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Etiqueta atualizada!');
    },
    onError: (error) => {
      logger.error('Erro ao atualizar etiqueta', { error });
      toast.error('Erro ao atualizar etiqueta');
    },
  });

  const deleteTag = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      // contact_tags cai por ON DELETE CASCADE.
      const { error } = await supabase.from('tags').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success('Etiqueta excluída.');
    },
    onError: (error) => {
      logger.error('Erro ao excluir etiqueta', { error });
      toast.error('Erro ao excluir etiqueta');
    },
  });

  return {
    tags: list.data ?? [],
    isLoading: list.isLoading,
    error: list.error,
    createTag,
    updateTag,
    deleteTag,
  };
}
