// Shared validation utilities for Supabase Edge Functions

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Basic validation schemas
export const ValidationSchemas = {
  phoneNumber: {
    pattern: /^\+?[1-9]\d{1,14}$/,
    message: 'Invalid phone number format'
  },
  instanceName: {
    pattern: /^[a-zA-Z0-9_-]{1,50}$/,
    message: 'Invalid instance name'
  },
  tenantId: {
    pattern: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    message: 'Invalid tenant ID format'
  },
  messageContent: {
    maxLength: 4096,
    message: 'Message content too long'
  }
};

// Validation functions
export function validatePhoneNumber(phone: string): ValidationResult<string> {
  if (!phone || typeof phone !== 'string') {
    return { success: false, error: 'Phone number is required' };
  }
  
  const cleaned = phone.replace(/\s+/g, '').replace(/[()\-]/g, '');
  
  if (!ValidationSchemas.phoneNumber.pattern.test(cleaned)) {
    return { success: false, error: ValidationSchemas.phoneNumber.message };
  }
  
  return { success: true, data: cleaned };
}

export function validateInstanceName(name: string): ValidationResult<string> {
  if (!name || typeof name !== 'string') {
    return { success: false, error: 'Instance name is required' };
  }
  
  if (!ValidationSchemas.instanceName.pattern.test(name)) {
    return { success: false, error: ValidationSchemas.instanceName.message };
  }
  
  return { success: true, data: name };
}

export function validateTenantId(tenantId: string): ValidationResult<string> {
  if (!tenantId || typeof tenantId !== 'string') {
    return { success: false, error: 'Tenant ID is required' };
  }
  
  if (!ValidationSchemas.tenantId.pattern.test(tenantId)) {
    return { success: false, error: ValidationSchemas.tenantId.message };
  }
  
  return { success: true, data: tenantId };
}

export function validateMessageContent(content: string): ValidationResult<string> {
  if (!content || typeof content !== 'string') {
    return { success: false, error: 'Message content is required' };
  }
  
  if (content.length > ValidationSchemas.messageContent.maxLength) {
    return { success: false, error: ValidationSchemas.messageContent.message };
  }
  
  // Basic sanitization - remove potential script tags and dangerous patterns
  const sanitized = content
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+\s*=/gi, '');
  
  return { success: true, data: sanitized };
}

// Sanitization utilities
export class DataSanitizer {
  static sanitizeForLog(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }
    
    const sensitiveKeys = ['apikey', 'password', 'token', 'secret', 'key'];
    const sanitized = { ...data };
    
    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '***';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitizeForLog(sanitized[key]);
      }
    }
    
    return sanitized;
  }
  
  static sanitizePhoneNumber(phone: string): string {
    return phone.replace(/[^+\d]/g, '');
  }
}

// Error handling utilities
export class SecureError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  
  constructor(message: string, code: string = 'VALIDATION_ERROR', statusCode: number = 400) {
    super(message);
    this.name = 'SecureError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Resposta de erro em JSON.
 *
 * `requestOrigin` NAO e opcional por preguica -- passe sempre. Sem ele a
 * resposta sai com o CORS estatico, que devolve a PRIMEIRA origem da lista
 * (https://convoflow.com.br). Se a pessoa esta no dominio com www, o navegador
 * ve a origem trocada, BLOQUEIA a leitura do corpo, e o supabase-js reporta
 * "Failed to send a request to the Edge Function" -- engolindo a mensagem em
 * pt-BR que estava dentro. Foi assim que um 403 "Esta loja nao pertence a sua
 * conta." virou meia hora de caca ao tesouro em 2026-08-18.
 */
export function createErrorResponse(
  error: SecureError | Error,
  requestId?: string,
  requestOrigin?: string | null,
): Response {
  const isSecureError = error instanceof SecureError;
  const statusCode = isSecureError ? error.statusCode : 500;
  const code = isSecureError ? error.code : 'INTERNAL_ERROR';
  
  const responseBody = {
    error: {
      message: error.message,
      code,
      requestId
    }
  };
  
  return new Response(JSON.stringify(responseBody), {
    status: statusCode,
    headers: {
      'Content-Type': 'application/json',
      ...buildCorsHeaders(requestOrigin)
    }
  });
}

// CORS headers — restrito a origens específicas em produção
const ALLOWED_ORIGINS = [
  'https://convoflow.com.br',
  'https://www.convoflow.com.br',
  'https://convoflow.vercel.app',
  'https://www.convoflow.vercel.app',
];

const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function getCorsOrigin(requestOrigin?: string | null): string {
  // Em desenvolvimento, permitir qualquer origem
  const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV') || 'production';
  if (env === 'development' || env === 'local') {
    return requestOrigin || '*';
  }

  // Sempre permitir localhost / 127.0.0.1 (qualquer porta) — dev local
  if (requestOrigin && LOCALHOST_PATTERN.test(requestOrigin)) {
    return requestOrigin;
  }

  // Adicionar origens customizadas do env
  const customOrigin = Deno.env.get('CORS_ALLOWED_ORIGIN');
  if (customOrigin) {
    ALLOWED_ORIGINS.push(...customOrigin.split(',').map(o => o.trim()));
  }

  // Em produção, verificar se a origem está permitida
  if (requestOrigin && ALLOWED_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Fallback para a origem principal
  return ALLOWED_ORIGINS[0];
}

/**
 * Métodos liberados no preflight.
 *
 * DELETE entrou em 2026-08-13. Sem ele, o navegador manda o OPTIONS, vê que
 * DELETE não está na lista e ABORTA a requisição antes de sair — o front recebe
 * um "Failed to fetch" seco, sem status e sem corpo. Era isso que impedia
 * excluir usuário pelo painel (admin-create-user aceita DELETE desde sempre; a
 * chamada é que nunca chegava). PUT/PATCH entram junto para não repetir a
 * novela quando alguém adicionar uma rota dessas.
 */
const ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';

export function buildCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': ALLOWED_METHODS,
  };
}

// Fallback estático para compatibilidade (usa a origem principal)
export const corsHeaders = {
  'Access-Control-Allow-Origin': getCorsOrigin(),
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': ALLOWED_METHODS
};