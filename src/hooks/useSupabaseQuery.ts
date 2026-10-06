import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';

/**
 * Tabelas que NÃO devem ser filtradas por tenant_id automaticamente.
 * Inclui tabelas globais (tenants, affiliates), tabela de perfis (filtrada
 * via auth.uid()), e views administrativas.
 */
const TENANT_AGNOSTIC_TABLES = new Set([
  'profiles',
  'tenants',
  'affiliates',
  'admin_users_view',
]);

interface QueryFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: any;
}

interface UseSupabaseQueryOptions {
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
  /**
   * Suprime o toast de erro. Use para queries de fundo (métricas, contadores)
   * onde uma falha não-crítica não deve interromper a UI. Default: false.
   */
  silent?: boolean;
}

export function useSupabaseQuery(options: UseSupabaseQueryOptions) {
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
    silent = false,
  } = options;

  const { tenant } = useTenant();
  const { toast } = useToast();

  // Combinar filtros de ambas as propriedades
  const allFilters = [...filter, ...filters];

  const isTenantAgnostic = TENANT_AGNOSTIC_TABLES.has(table);
  // Defense-in-depth: nunca rodar query tenant-scoped sem tenant carregado.
  // Antes do hardening, o filtro tenant era silenciosamente pulado nesse caso
  // — o que tornava possível um superadmin/account_manager sem tenant ler
  // toda a tabela. Agora a query fica desabilitada explicitamente.
  const queryEnabled = enabled && (isTenantAgnostic || !!tenant?.id);

  // Cache deve ser particionado por tenant. Para queries de tabelas tenant-scoped,
  // sempre anexamos tenant?.id ao queryKey customizado — do contrário dados do
  // tenant A vazariam pelo cache do TanStack Query para o tenant B no próximo
  // login (mesmo com RLS correto, o cache do cliente carrega os dados antigos).
  const finalQueryKey = queryKey
    ? (isTenantAgnostic ? queryKey : [...queryKey, tenant?.id])
    : [table, select, allFilters, order || orderBy, limit, tenant?.id];

  return useQuery({
    queryKey: finalQueryKey,
    queryFn: async () => {
      try {
        let query = supabase.from(table).select(select);

        if (!isTenantAgnostic) {
          if (!tenant?.id) {
            // Não deve ocorrer porque enabled bloqueia; aqui é só defense-in-depth.
            logger.warn(`useSupabaseQuery(${table}) chamada sem tenant — bloqueada.`);
            throw new Error(`tenant_id é obrigatório para consultar ${table}`);
          }
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

        // Aplicar ordenação (priorizar 'order' sobre 'orderBy')
        if (order) {
          query = query.order(order.column, { ascending: order.ascending ?? true });
        } else if (orderBy) {
          // Suportar tanto array quanto objeto único
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
          console.error(`Erro na query da tabela ${table}:`, error);
          throw error;
        }

        return data || [];
      } catch (error) {
        logger.error(`Erro ao executar query na tabela ${table}`, { error });
        if (!silent) {
          toast({
            title: 'Erro ao carregar dados',
            description: `Falha ao carregar dados da tabela ${table}`,
            variant: 'destructive',
          });
        }
        throw error;
      }
    },
    enabled: queryEnabled,
    refetchInterval,
    staleTime,
  });
}

// Hook simplificado para queries básicas
export function useSupabaseTable(tableName: string, options?: Partial<UseSupabaseQueryOptions>) {
  return useSupabaseQuery({
    table: tableName,
    ...options,
  });
}

// Hook para buscar um único registro
export function useSupabaseQuerySingle(options: UseSupabaseQueryOptions) {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const isTenantAgnostic = TENANT_AGNOSTIC_TABLES.has(options.table);
  const queryEnabled = (options.enabled ?? true) && (isTenantAgnostic || !!tenant?.id);

  return useQuery({
    queryKey: [options.table, 'single', options.filters, tenant?.id],
    queryFn: async () => {
      let query = supabase.from(options.table).select(options.select || '*');

      if (!isTenantAgnostic) {
        if (!tenant?.id) {
          logger.warn(`useSupabaseQuerySingle(${options.table}) chamada sem tenant — bloqueada.`);
          throw new Error(`tenant_id é obrigatório para consultar ${options.table}`);
        }
        query = query.eq('tenant_id', tenant.id);
      }

      // Aplicar filtros
      if (options.filters) {
        options.filters.forEach(({ column, operator, value }) => {
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
      }

      const { data, error } = await query.single();

      if (error) {
        toast({
          title: 'Erro ao buscar registro',
          description: error.message,
          variant: 'destructive',
        });
        throw error;
      }

      return data;
    },
    enabled: queryEnabled,
  });
}

// Hook para contar registros
export function useSupabaseCount(
  table: string,
  filters?: QueryFilter[],
  options?: { enabled?: boolean; refetchInterval?: number; staleTime?: number; silent?: boolean }
) {
  const { tenant } = useTenant();
  const { toast } = useToast();

  const isTenantAgnostic = TENANT_AGNOSTIC_TABLES.has(table);

  return useQuery({
    queryKey: ['count', table, filters, tenant?.id],
    queryFn: async () => {
      let query = supabase
        .from(table)
        .select('*', { count: 'exact', head: true });

      if (!isTenantAgnostic) {
        if (!tenant?.id) {
          logger.warn(`useSupabaseCount(${table}) chamada sem tenant — bloqueada.`);
          throw new Error(`tenant_id é obrigatório para consultar ${table}`);
        }
        query = query.eq('tenant_id', tenant.id);
      }

      // Aplicar filtros adicionais
      if (filters) {
        filters.forEach(({ column, operator, value }) => {
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
      }

      const { count, error } = await query;

      if (error) {
        logger.error(`Erro ao contar registros na tabela ${table}`, { error });
        if (!options?.silent) {
          toast({
            title: 'Erro ao contar registros',
            description: error.message,
            variant: 'destructive',
          });
        }
        throw error;
      }

      return count || 0;
    },
    enabled: (options?.enabled ?? true) && (isTenantAgnostic || !!tenant?.id),
    refetchInterval: options?.refetchInterval,
    staleTime: options?.staleTime,
  });
}