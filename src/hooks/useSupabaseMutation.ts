import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';

interface UseSupabaseMutationOptions {
  table: string;
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  invalidateQueries?: string[][];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: any, variables?: any, context?: any) => void;
  onError?: (error: any, variables?: any, context?: any) => void;
}

interface MutationFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: any;
}

interface MutationOptions {
  filter?: MutationFilter;
}

export function useSupabaseMutation(options: UseSupabaseMutationOptions) {
  const { 
    table, 
    operation, 
    invalidateQueries = [], 
    successMessage, 
    errorMessage,
    onSuccess,
    onError 
  } = options;
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({ data, options: mutationOptions }: { data: any; options?: MutationOptions }) => {
      let query;

      switch (operation) {
        case 'insert':
          // Adicionar tenant_id automaticamente se não for a tabela profiles, tenants ou affiliates
          let insertData = data;
          if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates') {
            insertData = Array.isArray(data) 
              ? data.map(item => ({ ...item, tenant_id: tenant.id }))
              : { ...data, tenant_id: tenant.id };
          }
          query = supabase.from(table).insert(insertData);
          break;
        case 'update':
          query = supabase.from(table).update(data).select();
          if (mutationOptions?.filter) {
            const { column, operator, value } = mutationOptions.filter;
            switch (operator) {
              case 'eq':
                query = query.eq(column, value);
                break;
              case 'neq':
                query = query.neq(column, value);
                break;
              case 'gt':
                query = query.gt(column, value);
                break;
              case 'gte':
                query = query.gte(column, value);
                break;
              case 'lt':
                query = query.lt(column, value);
                break;
              case 'lte':
                query = query.lte(column, value);
                break;
              case 'like':
                query = query.like(column, value);
                break;
              case 'ilike':
                query = query.ilike(column, value);
                break;
              case 'in':
                query = query.in(column, value);
                break;
              case 'is':
                query = query.is(column, value);
                break;
            }
          }
          break;
        case 'delete':
          query = supabase.from(table).delete();
          if (mutationOptions?.filter) {
            const { column, operator, value } = mutationOptions.filter;
            switch (operator) {
              case 'eq':
                query = query.eq(column, value);
                break;
              case 'neq':
                query = query.neq(column, value);
                break;
              case 'gt':
                query = query.gt(column, value);
                break;
              case 'gte':
                query = query.gte(column, value);
                break;
              case 'lt':
                query = query.lt(column, value);
                break;
              case 'lte':
                query = query.lte(column, value);
                break;
              case 'like':
                query = query.like(column, value);
                break;
              case 'ilike':
                query = query.ilike(column, value);
                break;
              case 'in':
                query = query.in(column, value);
                break;
              case 'is':
                query = query.is(column, value);
                break;
            }
          }
          break;
        case 'upsert':
          // Adicionar tenant_id automaticamente se não for a tabela profiles, tenants ou affiliates
          let upsertData = data;
          if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates') {
            upsertData = Array.isArray(data) 
              ? data.map(item => ({ ...item, tenant_id: tenant.id }))
              : { ...data, tenant_id: tenant.id };
          }
          query = supabase.from(table).upsert(upsertData);
          break;
        default:
          throw new Error(`Operação não suportada: ${operation}`);
      }

      const { data: result, error } = await query;

      if (error) {
        throw error;
      }

      return result;
    },
    onSuccess: (data, variables, context) => {
      // Invalidar queries relacionadas
      invalidateQueries.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });

      // Mostrar mensagem de sucesso
      if (successMessage) {
        toast({
          title: "Sucesso",
          description: successMessage,
        });
      }

      // Callback personalizado
      if (onSuccess) {
        onSuccess(data, variables, context);
      }
    },
    onError: (error, variables, context) => {
      // Mostrar mensagem de erro
      const message = errorMessage || error?.message || error?.details || 'Ocorreu um erro inesperado';
      toast({
        title: "Erro na Mutação",
        description: `${message} (Tabela: ${table})`,
        variant: "destructive",
      });

      // Callback personalizado
      if (onError) {
        onError(error, variables, context);
      }

      console.error('Erro na mutação:', error);
    },
  });
}

// Hook simplificado para operações comuns
export function useSupabaseInsert(tableName: string, options?: Partial<UseSupabaseMutationOptions>) {
  return useSupabaseMutation({
    table: tableName,
    operation: 'insert',
    ...options,
  });
}

export function useSupabaseUpdate(tableName: string, options?: Partial<UseSupabaseMutationOptions>) {
  return useSupabaseMutation({
    table: tableName,
    operation: 'update',
    ...options,
  });
}

export function useSupabaseDelete(tableName: string, options?: Partial<UseSupabaseMutationOptions>) {
  return useSupabaseMutation({
    table: tableName,
    operation: 'delete',
    ...options,
  });
}