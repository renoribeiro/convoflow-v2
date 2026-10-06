import { z } from 'zod';
import { CommonSchemas, BaseEntitySchema } from './common';
import { MessageTypeSchema } from './message';

// Chatbot trigger type enum
export const TriggerTypeSchema = z.enum(['keyword', 'welcome', 'fallback', 'schedule', 'funnel_stage', 'tag'], {
  errorMap: () => ({ message: 'Tipo de trigger inválido' })
});

// Chatbot action type enum
export const ActionTypeSchema = z.enum(['send_message', 'transfer_to_human', 'add_tag', 'remove_tag', 'change_funnel_stage', 'schedule_followup', 'webhook'], {
  errorMap: () => ({ message: 'Tipo de ação inválido' })
});

// Chatbot condition schema
export const ChatbotConditionSchema = z.object({
  field: z.string().min(1, 'Campo é obrigatório'),
  operator: z.enum(['equals', 'contains', 'starts_with', 'ends_with', 'regex', 'greater_than', 'less_than', 'in', 'not_in'], {
    errorMap: () => ({ message: 'Operador inválido' })
  }),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
  case_sensitive: z.boolean().default(false)
});

// Chatbot action schema
export const ChatbotActionSchema = z.object({
  type: ActionTypeSchema,
  parameters: z.record(z.any()),
  delay_seconds: z.number().min(0).max(3600).default(0),
  conditions: z.array(ChatbotConditionSchema).optional()
});

// Chatbot trigger schema
export const ChatbotTriggerSchema = z.object({
  type: TriggerTypeSchema,
  keywords: z.array(z.string().min(1).max(100)).optional(),
  conditions: z.array(ChatbotConditionSchema).optional(),
  priority: z.number().min(1).max(100).default(50),
  is_active: z.boolean().default(true),
  schedule: z.object({
    days_of_week: z.array(z.number().min(0).max(6)).optional(),
    start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    timezone: z.string().default('America/Sao_Paulo')
  }).optional()
});

// Chatbot flow step schema
export const ChatbotFlowStepSchema = z.object({
  id: z.string().min(1, 'ID do passo é obrigatório'),
  name: z.string().min(1, 'Nome do passo é obrigatório').max(100, 'Nome muito longo'),
  message_content: CommonSchemas.textContent.optional(),
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,
  actions: z.array(ChatbotActionSchema),
  next_steps: z.array(z.object({
    step_id: z.string(),
    conditions: z.array(ChatbotConditionSchema).optional(),
    is_default: z.boolean().default(false)
  })).optional(),
  wait_for_response: z.boolean().default(false),
  timeout_seconds: z.number().min(0).max(86400).default(300),
  timeout_step_id: z.string().optional()
});

// Chatbot validation schema
export const ChatbotSchema = z.object({
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),
  
  description: z.string()
    .max(500, 'Descrição deve ter no máximo 500 caracteres')
    .optional(),
  
  whatsapp_instance_id: CommonSchemas.uuid,
  
  triggers: z.array(ChatbotTriggerSchema)
    .min(1, 'Pelo menos um trigger é obrigatório'),
  
  flow_steps: z.array(ChatbotFlowStepSchema)
    .min(1, 'Pelo menos um passo é obrigatório'),
  
  initial_step_id: z.string().min(1, 'Passo inicial é obrigatório'),
  
  is_active: z.boolean().default(true),
  
  settings: z.object({
    max_interactions_per_contact: z.number().min(1).max(100).default(10),
    cooldown_minutes: z.number().min(0).max(1440).default(60),
    enable_fallback: z.boolean().default(true),
    fallback_message: z.string().max(500).optional(),
    transfer_to_human_keywords: z.array(z.string()).optional(),
    business_hours_only: z.boolean().default(false),
    business_hours_start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).default('09:00'),
    business_hours_end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).default('18:00'),
    timezone: z.string().default('America/Sao_Paulo')
  }).optional(),
  
  statistics: z.object({
    total_interactions: z.number().min(0).default(0),
    successful_completions: z.number().min(0).default(0),
    fallback_triggers: z.number().min(0).default(0),
    human_transfers: z.number().min(0).default(0),
    average_completion_time: z.number().min(0).default(0)
  }).optional()
}).merge(BaseEntitySchema.omit({ id: true, created_at: true, updated_at: true }));

// Chatbot creation schema
export const ChatbotCreateSchema = ChatbotSchema.omit({
  statistics: true
});

// Chatbot update schema
export const ChatbotUpdateSchema = ChatbotSchema.partial().required({ tenant_id: true });

// Chatbot filter schema
export const ChatbotFilterSchema = z.object({
  search: CommonSchemas.searchQuery,
  whatsapp_instance_id: CommonSchemas.uuid.optional(),
  is_active: z.boolean().optional(),
  trigger_type: TriggerTypeSchema.optional(),
  created_after: CommonSchemas.dateTime,
  created_before: CommonSchemas.dateTime,
  pagination: CommonSchemas.pagination
});

// Chatbot test schema
export const ChatbotTestSchema = z.object({
  chatbot_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  test_message: z.string().min(1, 'Mensagem de teste é obrigatória').max(500),
  contact_id: CommonSchemas.uuid.optional(),
  simulate_contact_data: z.record(z.any()).optional()
});

// Chatbot analytics schema
export const ChatbotAnalyticsSchema = z.object({
  chatbot_id: CommonSchemas.uuid.optional(),
  tenant_id: CommonSchemas.uuid,
  period: z.enum(['day', 'week', 'month', 'year']),
  start_date: CommonSchemas.dateTime,
  end_date: CommonSchemas.dateTime,
  group_by: z.enum(['day', 'week', 'month', 'chatbot', 'trigger', 'step']).optional()
});

// Chatbot template schema
export const ChatbotTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  category: z.string().min(1, 'Categoria é obrigatória').max(50, 'Categoria muito longa'),
  triggers: z.array(ChatbotTriggerSchema),
  flow_steps: z.array(ChatbotFlowStepSchema),
  initial_step_id: z.string(),
  default_settings: ChatbotSchema.shape.settings,
  is_public: z.boolean().default(false),
  tenant_id: CommonSchemas.uuid
});

// Chatbot duplicate schema
export const ChatbotDuplicateSchema = z.object({
  chatbot_id: CommonSchemas.uuid,
  new_name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  tenant_id: CommonSchemas.uuid,
  copy_statistics: z.boolean().default(false)
});

// Type exports
export type ChatbotFormData = z.infer<typeof ChatbotSchema>;
export type ChatbotCreateData = z.infer<typeof ChatbotCreateSchema>;
export type ChatbotUpdateData = z.infer<typeof ChatbotUpdateSchema>;
export type ChatbotFilterData = z.infer<typeof ChatbotFilterSchema>;
export type ChatbotTestData = z.infer<typeof ChatbotTestSchema>;
export type ChatbotAnalyticsData = z.infer<typeof ChatbotAnalyticsSchema>;
export type ChatbotTemplateData = z.infer<typeof ChatbotTemplateSchema>;
export type ChatbotDuplicateData = z.infer<typeof ChatbotDuplicateSchema>;
export type ChatbotTrigger = z.infer<typeof ChatbotTriggerSchema>;
export type ChatbotAction = z.infer<typeof ChatbotActionSchema>;
export type ChatbotFlowStep = z.infer<typeof ChatbotFlowStepSchema>;
export type ChatbotCondition = z.infer<typeof ChatbotConditionSchema>;
export type TriggerType = z.infer<typeof TriggerTypeSchema>;
export type ActionType = z.infer<typeof ActionTypeSchema>;

// Validation functions
export const validateChatbot = (data: unknown) => {
  return ChatbotSchema.safeParse(data);
};

export const validateChatbotCreate = (data: unknown) => {
  return ChatbotCreateSchema.safeParse(data);
};

export const validateChatbotUpdate = (data: unknown) => {
  return ChatbotUpdateSchema.safeParse(data);
};

export const validateChatbotFilter = (data: unknown) => {
  return ChatbotFilterSchema.safeParse(data);
};

export const validateChatbotTest = (data: unknown) => {
  return ChatbotTestSchema.safeParse(data);
};

export const validateChatbotAnalytics = (data: unknown) => {
  return ChatbotAnalyticsSchema.safeParse(data);
};

export const validateChatbotTemplate = (data: unknown) => {
  return ChatbotTemplateSchema.safeParse(data);
};

export const validateChatbotDuplicate = (data: unknown) => {
  return ChatbotDuplicateSchema.safeParse(data);
};