import { z } from 'zod';
import { CommonSchemas, BaseEntitySchema } from './common';

// WhatsApp instance validation schema
export const InstanceSchema = z.object({
  name: z.string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(50, 'Nome deve ter no máximo 50 caracteres')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Nome pode conter apenas letras, números, _ e -'),
  
  instance_key: z.string()
    .min(3, 'Chave da instância deve ter pelo menos 3 caracteres')
    .max(100, 'Chave da instância muito longa')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Chave pode conter apenas letras, números, _ e -'),
  
  phone_number: CommonSchemas.phone.optional(),
  
  status: CommonSchemas.instanceStatus.default('disconnected'),
  
  is_active: z.boolean().default(true),
  
  qr_code: z.string().optional(),
  
  webhook_config: z.object({
    url: z.string().url('URL do webhook inválida'),
    events: z.array(z.enum([
      'messages.upsert',
      'messages.update',
      'connection.update',
      'presence.update',
      'qrcode.updated',
      'groups.upsert',
      'groups.update',
      'contacts.upsert',
      'contacts.update'
    ])).min(1, 'Pelo menos um evento deve ser selecionado'),
    enabled: z.boolean().default(true),
    retry_attempts: z.number().min(0).max(10).default(3),
    retry_delay: z.number().min(1000).max(60000).default(5000),
    headers: z.record(z.string()).optional(),
    auth_token: z.string().optional()
  }).optional(),
  
  settings: z.object({
    reject_calls: z.boolean().default(false),
    always_online: z.boolean().default(false),
    read_messages: z.boolean().default(false),
    read_status: z.boolean().default(true),
    sync_full_history: z.boolean().default(false),
    
    message_settings: z.object({
      delay_message: z.number().min(0).max(30000).default(1000),
      presence_online: z.boolean().default(true),
      presence_composing: z.boolean().default(true),
      presence_recording: z.boolean().default(false)
    }).optional(),
    
    proxy_settings: z.object({
      enabled: z.boolean().default(false),
      host: z.string().optional(),
      port: z.number().min(1).max(65535).optional(),
      protocol: z.enum(['http', 'https', 'socks4', 'socks5']).optional(),
      username: z.string().optional(),
      password: z.string().optional()
    }).optional(),
    
    browser_settings: z.object({
      client: z.string().default('ConvoFlow'),
      version: z.string().default('1.0.0'),
      browser: z.enum(['Chrome', 'Firefox', 'Safari', 'Edge']).default('Chrome')
    }).optional()
  }).optional(),
  
  last_seen: CommonSchemas.dateTime,
  
  connection_info: z.object({
    battery: z.number().min(0).max(100).optional(),
    connected: z.boolean().default(false),
    platform: z.string().optional(),
    pushname: z.string().optional(),
    version: z.string().optional()
  }).optional(),
  
  statistics: z.object({
    messages_sent: z.number().min(0).default(0),
    messages_received: z.number().min(0).default(0),
    uptime_hours: z.number().min(0).default(0),
    last_message_at: CommonSchemas.dateTime,
    connection_count: z.number().min(0).default(0),
    error_count: z.number().min(0).default(0)
  }).optional()
}).merge(BaseEntitySchema.omit({ id: true, created_at: true, updated_at: true }));

// Instance creation schema
export const InstanceCreateSchema = InstanceSchema.omit({
  status: true,
  qr_code: true,
  last_seen: true,
  connection_info: true,
  statistics: true
});

// Instance update schema
export const InstanceUpdateSchema = InstanceSchema.partial().required({ tenant_id: true });

// Instance filter schema
export const InstanceFilterSchema = z.object({
  search: CommonSchemas.searchQuery,
  status: CommonSchemas.instanceStatus.optional(),
  is_active: z.boolean().optional(),
  created_after: CommonSchemas.dateTime,
  created_before: CommonSchemas.dateTime,
  last_seen_after: CommonSchemas.dateTime,
  last_seen_before: CommonSchemas.dateTime,
  pagination: CommonSchemas.pagination
});

// Instance connection schema
export const InstanceConnectionSchema = z.object({
  instance_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  action: z.enum(['connect', 'disconnect', 'restart', 'logout'], {
    errorMap: () => ({ message: 'Ação inválida' })
  }),
  force: z.boolean().default(false)
});

// Instance webhook test schema
export const InstanceWebhookTestSchema = z.object({
  instance_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  event_type: z.enum([
    'messages.upsert',
    'connection.update',
    'qrcode.updated'
  ]),
  test_payload: z.record(z.any()).optional()
});

// Instance analytics schema
export const InstanceAnalyticsSchema = z.object({
  instance_id: CommonSchemas.uuid.optional(),
  tenant_id: CommonSchemas.uuid,
  period: z.enum(['day', 'week', 'month', 'year']),
  start_date: CommonSchemas.dateTime,
  end_date: CommonSchemas.dateTime,
  metrics: z.array(z.enum([
    'messages_sent',
    'messages_received',
    'uptime',
    'connections',
    'errors'
  ])).optional()
});

// Instance backup schema
export const InstanceBackupSchema = z.object({
  instance_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  include_messages: z.boolean().default(true),
  include_contacts: z.boolean().default(true),
  include_media: z.boolean().default(false),
  date_range: z.object({
    start_date: CommonSchemas.dateTime,
    end_date: CommonSchemas.dateTime
  }).optional()
});

// Instance restore schema
export const InstanceRestoreSchema = z.object({
  instance_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  backup_file: z.string().min(1, 'Arquivo de backup é obrigatório'),
  restore_messages: z.boolean().default(true),
  restore_contacts: z.boolean().default(true),
  restore_settings: z.boolean().default(true)
});

// Evolution API configuration schema
export const EvolutionApiConfigSchema = z.object({
  api_url: z.string().url('URL da API inválida'),
  api_key: z.string().min(10, 'Chave da API deve ter pelo menos 10 caracteres'),
  webhook_base_url: z.string().url('URL base do webhook inválida'),
  default_settings: InstanceSchema.shape.settings,
  tenant_id: CommonSchemas.uuid
});

// Type exports
export type InstanceFormData = z.infer<typeof InstanceSchema>;
export type InstanceCreateData = z.infer<typeof InstanceCreateSchema>;
export type InstanceUpdateData = z.infer<typeof InstanceUpdateSchema>;
export type InstanceFilterData = z.infer<typeof InstanceFilterSchema>;
export type InstanceConnectionData = z.infer<typeof InstanceConnectionSchema>;
export type InstanceWebhookTestData = z.infer<typeof InstanceWebhookTestSchema>;
export type InstanceAnalyticsData = z.infer<typeof InstanceAnalyticsSchema>;
export type InstanceBackupData = z.infer<typeof InstanceBackupSchema>;
export type InstanceRestoreData = z.infer<typeof InstanceRestoreSchema>;
export type EvolutionApiConfigData = z.infer<typeof EvolutionApiConfigSchema>;

// Validation functions
export const validateInstance = (data: unknown) => {
  return InstanceSchema.safeParse(data);
};

export const validateInstanceCreate = (data: unknown) => {
  return InstanceCreateSchema.safeParse(data);
};

export const validateInstanceUpdate = (data: unknown) => {
  return InstanceUpdateSchema.safeParse(data);
};

export const validateInstanceFilter = (data: unknown) => {
  return InstanceFilterSchema.safeParse(data);
};

export const validateInstanceConnection = (data: unknown) => {
  return InstanceConnectionSchema.safeParse(data);
};

export const validateInstanceWebhookTest = (data: unknown) => {
  return InstanceWebhookTestSchema.safeParse(data);
};

export const validateInstanceAnalytics = (data: unknown) => {
  return InstanceAnalyticsSchema.safeParse(data);
};

export const validateInstanceBackup = (data: unknown) => {
  return InstanceBackupSchema.safeParse(data);
};

export const validateInstanceRestore = (data: unknown) => {
  return InstanceRestoreSchema.safeParse(data);
};

export const validateEvolutionApiConfig = (data: unknown) => {
  return EvolutionApiConfigSchema.safeParse(data);
};