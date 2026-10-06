import { z } from 'zod';

// Common validation schemas
export const CommonSchemas = {
  // UUID validation
  uuid: z.string().uuid('ID inválido'),
  
  // Phone number validation (international format)
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Formato de telefone inválido')
    .transform(phone => phone.replace(/\D/g, '')),
  
  // Email validation
  email: z.string()
    .email('Email inválido')
    .optional()
    .or(z.literal('')),
  
  // Name validation (supports international characters)
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres')
    .regex(/^[\p{L}\p{N}\s\-\.]+$/u, 'Nome contém caracteres inválidos'),
  
  // Text content validation
  textContent: z.string()
    .min(1, 'Conteúdo é obrigatório')
    .max(4096, 'Conteúdo deve ter no máximo 4096 caracteres'),
  
  // URL validation
  url: z.string()
    .url('URL inválida')
    .optional(),
  
  // Status enums
  contactStatus: z.enum(['active', 'blocked', 'archived'], {
    errorMap: () => ({ message: 'Status de contato inválido' })
  }),
  
  instanceStatus: z.enum(['connected', 'disconnected', 'connecting', 'error'], {
    errorMap: () => ({ message: 'Status de instância inválido' })
  }),
  
  campaignStatus: z.enum(['draft', 'scheduled', 'running', 'paused', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Status de campanha inválido' })
  }),
  
  // Custom fields validation
  customFields: z.record(z.any()).optional(),
  
  // Date validation
  dateTime: z.string().datetime('Data/hora inválida').optional(),
  
  // Pagination
  pagination: z.object({
    page: z.number().min(1, 'Página deve ser maior que 0'),
    pageSize: z.number().min(1, 'Tamanho da página deve ser maior que 0').max(100, 'Tamanho máximo da página é 100')
  }).optional(),
  
  // Search query
  searchQuery: z.string().max(255, 'Busca muito longa').optional(),
  
  // Tags
  tags: z.array(z.string().min(1).max(50)).optional()
};

// Base entity schema
export const BaseEntitySchema = z.object({
  id: CommonSchemas.uuid.optional(),
  tenant_id: CommonSchemas.uuid,
  created_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional()
});

export type BaseEntity = z.infer<typeof BaseEntitySchema>;