import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { colunasPadrao } from '@/lib/db/colunasFechadas';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { logger } from '@/lib/logger';
import { z } from 'zod';

// A tabela chega por parâmetro (string): com o tipo de todas as tabelas, o
// genérico do supabase-js passa da profundidade que o TypeScript aguenta
// (TS2589). Aqui o tipo da tabela não ajuda em nada.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const deTabela = (table: string) => (supabase as any).from(table);
// Sem `*` em tabela de colunas fechadas (src/lib/db/colunasFechadas.ts).

interface UseEnhancedSupabaseMutationOptions {
  table: string;
  operation: 'insert' | 'update' | 'delete' | 'upsert';
  invalidateQueries?: string[][];
  successMessage?: string;
  errorMessage?: string;
  onSuccess?: (data: any) => void;
  onError?: (error: any) => void;
  // Opções de tratamento de erro aprimoradas
  retryCount?: number;
  retryDelay?: number;
  showErrorToast?: boolean;
  showSuccessToast?: boolean;
  customErrorHandler?: (error: SupabaseError) => boolean; // retorna true se o erro foi tratado
  // Validação de dados
  inputSchema?: z.ZodSchema;
  outputSchema?: z.ZodSchema;
  // Logging
  enableLogging?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
  // Confirmação
  requireConfirmation?: boolean;
  confirmationMessage?: string;
}

interface MutationFilter {
  column: string;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike' | 'in' | 'is';
  value: any;
}

interface MutationOptions {
  filter?: MutationFilter;
  skipValidation?: boolean;
  skipLogging?: boolean;
}

interface SupabaseError extends Error {
  code?: string;
  details?: string;
  hint?: string;
}

// Função para categorizar erros do Supabase em mutações
function categorizeSupabaseMutationError(error: SupabaseError): {
  category: 'network' | 'permission' | 'validation' | 'conflict' | 'server' | 'unknown';
  isRetryable: boolean;
  userMessage: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
} {
  const code = error.code;
  const message = error.message?.toLowerCase() || '';

  // Erros de rede
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return {
      category: 'network',
      isRetryable: true,
      userMessage: 'Problema de conexão. Tentando novamente...',
      severity: 'medium'
    };
  }

  // Erros de permissão
  if (code === '42501' || message.includes('permission') || message.includes('access denied')) {
    return {
      category: 'permission',
      isRetryable: false,
      userMessage: 'Você não tem permissão para isso. Peça ao Gestor da Loja.',
      severity: 'high'
    };
  }

  // Erros de validação/constraint
  if (code === '23505') {
    return {
      category: 'conflict',
      isRetryable: false,
      userMessage: 'Já existe um cadastro igual a este. Confira os dados e tente de novo.',
      severity: 'medium'
    };
  }

  if (code === '23503') {
    return {
      category: 'validation',
      isRetryable: false,
      userMessage: 'Este item está ligado a outros dados e não pode ser alterado assim.',
      severity: 'medium'
    };
  }

  if (code === '23514' || message.includes('check constraint')) {
    return {
      category: 'validation',
      isRetryable: false,
      userMessage: 'Algum campo está vazio ou num formato que não vale. Confira os dados.',
      severity: 'medium'
    };
  }

  // Erros do servidor
  if (code?.startsWith('5') || message.includes('internal server error')) {
    return {
      category: 'server',
      isRetryable: true,
      userMessage: 'O servidor falhou. Tentando de novo...',
      severity: 'high'
    };
  }

  return {
    category: 'unknown',
    isRetryable: false,
    userMessage: 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.',
    severity: 'medium'
  };
}

// Função para sanitizar dados sensíveis no log
function sanitizeDataForLogging(data: any): any {
  if (!data || typeof data !== 'object') return data;
  
  const sensitiveFields = ['password', 'token', 'secret', 'key', 'api_key', 'access_token'];
  const sanitized = { ...data };
  
  Object.keys(sanitized).forEach(key => {
    if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
      sanitized[key] = '[REDACTED]';
    }
  });
  
  return sanitized;
}

export function useEnhancedSupabaseMutation(options: UseEnhancedSupabaseMutationOptions) {
  const {
    table,
    operation,
    invalidateQueries = [],
    successMessage,
    errorMessage,
    onSuccess,
    onError,
    retryCount = 2,
    retryDelay = 1000,
    showErrorToast = true,
    showSuccessToast = true,
    customErrorHandler,
    inputSchema,
    outputSchema,
    enableLogging = true,
    logLevel = 'info',
    requireConfirmation = false,
    confirmationMessage
  } = options;

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { tenant } = useTenant();

  const mutationOptions: UseMutationOptions = {
    mutationFn: async ({ data, options: mutationOptions }: { data: any; options?: MutationOptions }) => {
      const startTime = Date.now();
      const operationId = `${operation}_${table}_${Date.now()}`;

      try {
        // Validar dados de entrada se schema fornecido
        if (inputSchema && !mutationOptions?.skipValidation) {
          try {
            data = inputSchema.parse(data);
          } catch (validationError) {
            logger.error('Erro de validação de entrada', {
              table,
              operation,
              error: validationError,
              data: sanitizeDataForLogging(data)
            });
            throw new Error('Dados de entrada inválidos');
          }
        }

        // Confirmação se necessária
        if (requireConfirmation) {
          const message = confirmationMessage || `Tem certeza que deseja ${operation === 'delete' ? 'excluir' : 'salvar'} este registro?`;
          const confirmed = window.confirm(message);
          if (!confirmed) {
            throw new Error('Operação cancelada pelo usuário');
          }
        }

        if (enableLogging && !mutationOptions?.skipLogging) {
          logger.info(`Iniciando mutação ${operation}`, {
            table,
            operation,
            operationId,
            tenant_id: tenant?.id,
            dataSize: Array.isArray(data) ? data.length : 1,
            timestamp: new Date().toISOString()
          });
        }

        let query;

        switch (operation) {
          case 'insert': {
            // Adicionar tenant_id automaticamente se não for a tabela profiles, tenants ou affiliates
            let insertData = data;
            if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates') {
              insertData = Array.isArray(data)
                ? data.map(item => ({ ...item, tenant_id: tenant.id }))
                : { ...data, tenant_id: tenant.id };
            }
            query = deTabela(table).insert(insertData).select(colunasPadrao(table));
            break;
          }

          case 'update':
            query = deTabela(table).update(data).select(colunasPadrao(table));
            if (mutationOptions?.filter) {
              const { column, operator, value } = mutationOptions.filter;
              query = query[operator](column, value);
            }
            break;

          case 'delete':
            query = deTabela(table).delete().select(colunasPadrao(table));
            if (mutationOptions?.filter) {
              const { column, operator, value } = mutationOptions.filter;
              query = query[operator](column, value);
            }
            break;

          case 'upsert': {
            // Adicionar tenant_id automaticamente se não for a tabela profiles, tenants ou affiliates
            let upsertData = data;
            if (tenant?.id && table !== 'profiles' && table !== 'tenants' && table !== 'affiliates') {
              upsertData = Array.isArray(data)
                ? data.map(item => ({ ...item, tenant_id: tenant.id }))
                : { ...data, tenant_id: tenant.id };
            }
            query = deTabela(table).upsert(upsertData).select(colunasPadrao(table));
            break;
          }

          default:
            throw new Error(`Operação não suportada: ${operation}`);
        }

        const { data: result, error } = await query;

        if (error) {
          throw error;
        }

        // Validar dados de saída se schema fornecido
        let validatedResult = result;
        if (outputSchema && !mutationOptions?.skipValidation) {
          try {
            validatedResult = outputSchema.parse(result);
          } catch (validationError) {
            logger.error('Erro de validação de saída', {
              table,
              operation,
              operationId,
              error: validationError,
              result
            });
            throw new Error('Dados de resposta inválidos');
          }
        }

        const duration = Date.now() - startTime;

        if (enableLogging && !mutationOptions?.skipLogging) {
          logger.info(`Mutação ${operation} concluída com sucesso`, {
            table,
            operation,
            operationId,
            recordCount: Array.isArray(validatedResult) ? validatedResult.length : 1,
            duration,
            timestamp: new Date().toISOString()
          });
        }

        return validatedResult;
      } catch (error) {
        const duration = Date.now() - startTime;
        const supabaseError = error as SupabaseError;
        const errorInfo = categorizeSupabaseMutationError(supabaseError);

        // Log detalhado do erro
        logger.error(`Erro na mutação ${operation}`, {
          table,
          operation,
          operationId,
          error: {
            message: supabaseError.message,
            code: supabaseError.code,
            details: supabaseError.details,
            hint: supabaseError.hint,
            category: errorInfo.category,
            severity: errorInfo.severity,
            isRetryable: errorInfo.isRetryable
          },
          data: sanitizeDataForLogging(data),
          tenant_id: tenant?.id,
          duration,
          timestamp: new Date().toISOString()
        });

        throw supabaseError;
      }
    },
    onSuccess: (data) => {
      // Invalidar queries relacionadas
      invalidateQueries.forEach((queryKey) => {
        queryClient.invalidateQueries({ queryKey });
      });

      // Mostrar mensagem de sucesso
      if (showSuccessToast && successMessage) {
        toast({
          title: successMessage,
        });
      }

      // Callback personalizado
      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: (error) => {
      const supabaseError = error as SupabaseError;
      const errorInfo = categorizeSupabaseMutationError(supabaseError);
      
      // Tentar handler customizado primeiro
      let errorHandled = false;
      if (customErrorHandler) {
        errorHandled = customErrorHandler(supabaseError);
      }

      // Mostrar toast de erro se não foi tratado pelo handler customizado
      if (!errorHandled && showErrorToast) {
        const message = errorMessage || errorInfo.userMessage;
        toast({
          title: 'Não foi possível salvar',
          description: message,
          variant: "destructive",
        });
      }

      // Callback personalizado
      if (onError) {
        onError(supabaseError);
      }
    },
    retry: (failureCount, error) => {
      const supabaseError = error as SupabaseError;
      const errorInfo = categorizeSupabaseMutationError(supabaseError);
      
      // Só tentar novamente se o erro for retryable e não exceder o limite
      return errorInfo.isRetryable && failureCount < retryCount;
    },
    retryDelay: (attemptIndex) => Math.min(retryDelay * Math.pow(2, attemptIndex), 30000),
  };

  return useMutation(mutationOptions);
}

// Hooks simplificados para operações comuns
export function useEnhancedSupabaseInsert(
  tableName: string, 
  options?: Partial<UseEnhancedSupabaseMutationOptions>
) {
  return useEnhancedSupabaseMutation({
    table: tableName,
    operation: 'insert',
    successMessage: 'Registro criado com sucesso',
    ...options,
  });
}

export function useEnhancedSupabaseUpdate(
  tableName: string, 
  options?: Partial<UseEnhancedSupabaseMutationOptions>
) {
  return useEnhancedSupabaseMutation({
    table: tableName,
    operation: 'update',
    successMessage: 'Registro atualizado com sucesso',
    ...options,
  });
}

export function useEnhancedSupabaseDelete(
  tableName: string, 
  options?: Partial<UseEnhancedSupabaseMutationOptions>
) {
  return useEnhancedSupabaseMutation({
    table: tableName,
    operation: 'delete',
    successMessage: 'Registro excluído com sucesso',
    requireConfirmation: true,
    confirmationMessage: 'Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita.',
    ...options,
  });
}

export function useEnhancedSupabaseUpsert(
  tableName: string, 
  options?: Partial<UseEnhancedSupabaseMutationOptions>
) {
  return useEnhancedSupabaseMutation({
    table: tableName,
    operation: 'upsert',
    successMessage: 'Registro salvo com sucesso',
    ...options,
  });
}

// Hook para operações em lote com tratamento especial
export function useEnhancedSupabaseBatch(
  tableName: string,
  operation: 'insert' | 'update' | 'delete' | 'upsert',
  options?: Partial<UseEnhancedSupabaseMutationOptions>
) {
  return useEnhancedSupabaseMutation({
    table: tableName,
    operation,
    successMessage: `Operação em lote concluída com sucesso`,
    enableLogging: true,
    retryCount: 1, // Menos tentativas para operações em lote
    ...options,
  });
}