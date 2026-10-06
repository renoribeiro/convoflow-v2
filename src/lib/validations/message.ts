import { z } from 'zod';
import { CommonSchemas, BaseEntitySchema } from './common';

// Message type enum
export const MessageTypeSchema = z.enum(['text', 'image', 'audio', 'video', 'document', 'location', 'contact'], {
  errorMap: () => ({ message: 'Tipo de mensagem inválido' })
});

// Message validation schema
export const MessageSchema = z.object({
  content: CommonSchemas.textContent,
  contact_id: CommonSchemas.uuid,
  whatsapp_instance_id: CommonSchemas.uuid,
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,
  is_from_contact: z.boolean().default(false),
  metadata: z.record(z.any()).optional(),
  sent_at: CommonSchemas.dateTime,
  delivered_at: CommonSchemas.dateTime,
  read_at: CommonSchemas.dateTime
}).merge(BaseEntitySchema.omit({ id: true, created_at: true, updated_at: true }));

// Message creation schema
export const MessageCreateSchema = MessageSchema.omit({
  sent_at: true,
  delivered_at: true,
  read_at: true
});

// Message send schema (for manual sending)
export const MessageSendSchema = z.object({
  content: CommonSchemas.textContent,
  contact_id: CommonSchemas.uuid,
  whatsapp_instance_id: CommonSchemas.uuid,
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,
  tenant_id: CommonSchemas.uuid
});

// Bulk message send schema
export const BulkMessageSendSchema = z.object({
  content: CommonSchemas.textContent,
  contact_ids: z.array(CommonSchemas.uuid)
    .min(1, 'Pelo menos um contato deve ser selecionado')
    .max(100, 'Máximo 100 contatos por envio'),
  whatsapp_instance_id: CommonSchemas.uuid,
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,
  tenant_id: CommonSchemas.uuid,
  schedule_at: CommonSchemas.dateTime
});

// Message filter schema
export const MessageFilterSchema = z.object({
  contact_id: CommonSchemas.uuid.optional(),
  whatsapp_instance_id: CommonSchemas.uuid.optional(),
  message_type: MessageTypeSchema.optional(),
  is_from_contact: z.boolean().optional(),
  search: CommonSchemas.searchQuery,
  sent_after: CommonSchemas.dateTime,
  sent_before: CommonSchemas.dateTime,
  has_media: z.boolean().optional(),
  pagination: CommonSchemas.pagination
});

// Message template schema
export const MessageTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  content: CommonSchemas.textContent,
  category: z.string().min(1, 'Categoria é obrigatória').max(50, 'Categoria muito longa'),
  variables: z.array(z.string()).optional(),
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,
  is_active: z.boolean().default(true),
  tenant_id: CommonSchemas.uuid
});

// Message template update schema
export const MessageTemplateUpdateSchema = MessageTemplateSchema.partial().required({ tenant_id: true });

// Message webhook payload schema
export const MessageWebhookSchema = z.object({
  event: z.enum(['message.received', 'message.sent', 'message.delivered', 'message.read']),
  instance: z.string(),
  data: z.object({
    key: z.object({
      remoteJid: z.string(),
      fromMe: z.boolean(),
      id: z.string()
    }),
    message: z.record(z.any()),
    messageTimestamp: z.number(),
    status: z.string().optional()
  })
});

// Message statistics schema
export const MessageStatsSchema = z.object({
  tenant_id: CommonSchemas.uuid,
  period: z.enum(['day', 'week', 'month', 'year']),
  start_date: CommonSchemas.dateTime,
  end_date: CommonSchemas.dateTime,
  contact_id: CommonSchemas.uuid.optional(),
  whatsapp_instance_id: CommonSchemas.uuid.optional()
});

// Type exports
export type MessageFormData = z.infer<typeof MessageSchema>;
export type MessageCreateData = z.infer<typeof MessageCreateSchema>;
export type MessageSendData = z.infer<typeof MessageSendSchema>;
export type BulkMessageSendData = z.infer<typeof BulkMessageSendSchema>;
export type MessageFilterData = z.infer<typeof MessageFilterSchema>;
export type MessageTemplateData = z.infer<typeof MessageTemplateSchema>;
export type MessageTemplateUpdateData = z.infer<typeof MessageTemplateUpdateSchema>;
export type MessageWebhookData = z.infer<typeof MessageWebhookSchema>;
export type MessageStatsData = z.infer<typeof MessageStatsSchema>;
export type MessageType = z.infer<typeof MessageTypeSchema>;

// Validation functions
export const validateMessage = (data: unknown) => {
  return MessageSchema.safeParse(data);
};

export const validateMessageCreate = (data: unknown) => {
  return MessageCreateSchema.safeParse(data);
};

export const validateMessageSend = (data: unknown) => {
  return MessageSendSchema.safeParse(data);
};

export const validateBulkMessageSend = (data: unknown) => {
  return BulkMessageSendSchema.safeParse(data);
};

export const validateMessageFilter = (data: unknown) => {
  return MessageFilterSchema.safeParse(data);
};

export const validateMessageTemplate = (data: unknown) => {
  return MessageTemplateSchema.safeParse(data);
};

export const validateMessageTemplateUpdate = (data: unknown) => {
  return MessageTemplateUpdateSchema.safeParse(data);
};

export const validateMessageWebhook = (data: unknown) => {
  return MessageWebhookSchema.safeParse(data);
};

export const validateMessageStats = (data: unknown) => {
  return MessageStatsSchema.safeParse(data);
};