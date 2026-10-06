import { useQuery, UseQueryOptions } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import { z } from 'zod';

interface QueryFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: any;
}

interface UseEnhancedSupabaseQueryOptions {
  table: string;
  queryKey?: any[];
  select?: string;
  filter?: QueryFilter[];
  filters?: QueryFilter[];
  order?: {
    column: string;
    ascending?: boolean;
  };
  orderBy?: {
    column: string;
    ascending?: boolean;
  }[];
  limit?: number;
  enabled?: boolean;
  refetchInterval?: number;
  staleTime?: number;
  // Opções de tratamento de erro aprimoradas
  retryCount?: number;
  retryDelay?: number;
  showErrorToast?: boolean;
  customErrorMessage?: string;
  onError?: (error: Error) => void;
  // Validação de dados
  schema?: z.ZodSchema;
  // Logging
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

interface SupabaseError extends Error {
  code?: string;
  details?: string;
  hint?: string;
}

// Função para categorizar erros do Supabase
function categorizeSupabaseError(error: SupabaseError): {
  category: 'network' | 'permission' | 'validation' | 'server' | 'unknown';
  isRetryable: boolean;
  userMessage: string;
} {
  const code = error.code;
  const message = error.message?.toLowerCase() || '';

  // Erros de rede
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return {
      category: 'network',
      isRetryable: true,
      userMessage: 'Problema de conexão. Tentando novamente...'
    };
  }

  // Erros de permissão
  if (code === '42501' || message.includes('permission') || message.includes('access denied')) {
    return {
      category: 'permission',
      isRetryable: false,
      userMessage: 'Você não tem permissão para acessar estes dados.'
    };
  }

  // Erros de validação
  if (code === '23505' || code === '23503' || message.includes('constraint')) {
    return {
      category: 'validation',
      isRetryable: false,
      userMessage: 'Dados inválidos fornecidos.'
    };
  }

  // Erros do servidor
  if (code?.startsWith('5') || message.includes('internal server error')) {
    return {
      category: 'server',
      isRetryable: true,
      userMessage: 'Erro interno do servidor. Tentando novamente...'
    };
  }

  return {
    category: 'unknown',
    isRetryable: true,
    userMessage: 'Erro inesperado. Tentando novamente...'
  };
}

export function useEnhancedSupabaseQuery(options: UseEnhancedSupabaseQueryOptions) {
  const {
    table,
    queryKey,
    select = '*',
    filter = [],
    filters = [],
    order,
    orderBy,
    limit,
    enabled = true,
    refetchInterval,
    staleTime,
    retryCount = 3,
    retryDelay = 1000,
    showErrorToast = true,
    customErrorMessage,
    onError,
    schema,
    enableLogging = true,
    logLevel = 'error'
  } = options;

  const { tenant } = useTenant();
  const { toast } = useToast();

  // Combinar filtros de ambas as propriedades
  const allFilters = [...filter, ...filters];

  const queryOptions: UseQueryOptions = {
    queryKey: queryKey || [table, select, allFilters, order || orderBy, limit, tenant?.id],
    queryFn: async () => {
      const startTime = Date.now();
      
      try {
        if (enableLogging) {
          logger.info('Iniciando query Supabase', {
            table,
            select,
            filters: allFilters,
            tenant_id: tenant?.id,
            timestamp: new Date().toISOString()
          });
        }

        let query = supabase.from(table).select(select);

        // Filtrar por tenant automaticamente se não for a tabela profiles, tenants ou affiliates
        if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates') {
          query = query.eq('tenant_id', tenant.id);
        }

        // Aplicar filtros
        allFilters.forEach(({ column, operator, value }) => {
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
        });

        // Aplicar ordenação
        if (order) {
          query = query.order(order.column, { ascending: order.ascending ?? true });
        } else if (orderBy) {
          const orderArray = Array.isArray(orderBy) ? orderBy : [orderBy];
          orderArray.forEach(orderItem => {
            query = query.order(orderItem.column, { ascending: orderItem.ascending ?? true });
          });
        }

        // Aplicar limite
        if (limit) {
          query = query.limit(limit);
        }

        const { data, error } = await query;

        if (error) {
          throw error;
        }

        // Validar dados se schema fornecido
        let validatedData = data || [];
        if (schema) {
          try {
            validatedData = schema.parse(data);
          } catch (validationError) {
            logger.error('Erro de validação de dados', {
              table,
              error: validationError,
              data
            });
            throw new Error('Dados recebidos não são válidos');
          }
        }

        const duration = Date.now() - startTime;
        
        if (enableLogging) {
          logger.info('Query Supabase concluída com sucesso', {
            table,
            recordCount: Array.isArray(validatedData) ? validatedData.length : 1,
            duration,
            timestamp: new Date().toISOString()
          });
        }

        return validatedData;
      } catch (error) {
        const duration = Date.now() - startTime;
        const supabaseError = error as SupabaseError;
        const errorInfo = categorizeSupabaseError(supabaseError);

        // Log detalhado do erro
        logger.error('Erro na query Supabase', {
          table,
          error: {
            message: supabaseError.message,
            code: supabaseError.code,
            details: supabaseError.details,
            hint: supabaseError.hint,
            category: errorInfo.category,
            isRetryable: errorInfo.isRetryable
          },
          query: {
            select,
            filters: allFilters,
            order: order || orderBy,
            limit
          },
          tenant_id: tenant?.id,
          duration,
          timestamp: new Date().toISOString()
        });

        // Mostrar toast de erro se habilitado
        if (showErrorToast) {
          const message = customErrorMessage || errorInfo.userMessage;
          toast({
            title: 'Erro ao carregar dados',
            description: message,
            variant: 'destructive',
          });
        }

        // Callback personalizado de erro
        if (onError) {
          onError(supabaseError);
        }

        throw supabaseError;
      }
    },
    enabled,
    refetchInterval,
    staleTime,
    retry: (failureCount, error) => {
      const supabaseError = error as SupabaseError;
      const errorInfo = categorizeSupabaseError(supabaseError);
      
      // Só tentar novamente se o erro for retryable e não exceder o limite
      return errorInfo.isRetryable && failureCount < retryCount;
    },
    retryDelay: (attemptIndex) => Math.min(retryDelay * Math.pow(2, attemptIndex), 30000),
  };

  return useQuery(queryOptions);
}

// Hook simplificado para queries básicas
export function useEnhancedSupabaseTable(
  tableName: string, 
  options?: Partial<UseEnhancedSupabaseQueryOptions>
) {
  return useEnhancedSupabaseQuery({
    table: tableName,
    ...options,
  });
}

// Hook para buscar um único registro com tratamento de erro aprimorado
export function useEnhancedSupabaseQuerySingle(
  options: UseEnhancedSupabaseQueryOptions
) {
  const { tenant } = useTenant();
  const { toast } = useToast();
  
  return useQuery({
    queryKey: [options.table, 'single', options.filters, tenant?.id],
    queryFn: async () => {
      try {
        let query = supabase.from(options.table).select(options.select || '*');
        
        // Filtrar por tenant automaticamente
        if (tenant?.id && options.table !== 'profiles' && options.table !== 'tenants' && options.table !== 'affiliates') {
          query = query.eq('tenant_id', tenant.id);
        }
        
        // Aplicar filtros
        if (options.filters) {
          options.filters.forEach(filter => {
            query = query[filter.operator](filter.column, filter.value);
          });
        }
        
        const { data, error } = await query.single();
        
        if (error) {
          throw error;
        }
        
        return data;
      } catch (error) {
        const supabaseError = error as SupabaseError;
        const errorInfo = categorizeSupabaseError(supabaseError);
        
        logger.error('Erro ao buscar registro único', {
          table: options.table,
          error: supabaseError,
          filters: options.filters
        });
        
        if (options.showErrorToast !== false) {
          toast({
            title: 'Erro ao buscar registro',
            description: errorInfo.userMessage,
            variant: 'destructive',
          });
        }
        
        throw supabaseError;
      }
    },
    enabled: options.enabled,
    retry: (failureCount, error) => {
      const supabaseError = error as SupabaseError;
      const errorInfo = categorizeSupabaseError(supabaseError);
      return errorInfo.isRetryable && failureCount < (options.retryCount || 3);
    },
  });
}

// Hook para contar registros com tratamento de erro aprimorado
export function useEnhancedSupabaseCount(
  table: string, 
  filters?: QueryFilter[],
  options?: Partial<UseEnhancedSupabaseQueryOptions>
) {
  const { tenant } = useTenant();
  
  return useQuery({
    queryKey: ['count', table, filters, tenant?.id],
    queryFn: async () => {
      try {
        let query = supabase
          .from(table)
          .select('*', { count: 'exact', head: true });
        
        // Filtrar por tenant automaticamente
        if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates') {
          query = query.eq('tenant_id', tenant.id);
        }
        
        // Aplicar filtros adicionais
        if (filters) {
          filters.forEach(filter => {
            query = query[filter.operator](filter.column, filter.value);
          });
        }
        
        const { count, error } = await query;
        
        if (error) {
          throw error;
        }
        
        return count || 0;
      } catch (error) {
        const supabaseError = error as SupabaseError;
        
        logger.error('Erro ao contar registros', {
          table,
          error: supabaseError,
          filters
        });
        
        throw supabaseError;
      }
    },
    retry: (failureCount, error) => {
      const supabaseError = error as SupabaseError;
      const errorInfo = categorizeSupabaseError(supabaseError);
      return errorInfo.isRetryable && failureCount < (options?.retryCount || 3);
    },
  });
}