import { z } from 'zod';
import { CommonSchemas, BaseEntitySchema } from './common';
import { MessageTypeSchema } from './message';

// Campaign base schema (ZodObject — used for deriving sub-schemas)
const CampaignBaseSchema = z.object({
  name: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome deve ter no máximo 100 caracteres'),

  message_content: CommonSchemas.textContent,

  target_criteria: z.object({
    funnel_stages: z.array(CommonSchemas.uuid).optional(),
    tags: z.array(z.string().min(1).max(50)).optional(),
    lead_sources: z.array(CommonSchemas.uuid).optional(),
    contact_ids: z.array(CommonSchemas.uuid).optional(),
    exclude_contact_ids: z.array(CommonSchemas.uuid).optional(),
    created_after: CommonSchemas.dateTime,
    created_before: CommonSchemas.dateTime,
    last_interaction_after: CommonSchemas.dateTime,
    last_interaction_before: CommonSchemas.dateTime
  }),

  whatsapp_instance_id: CommonSchemas.uuid,
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,

  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'], {
    errorMap: () => ({ message: 'Status de campanha inválido' }),
  }).default('draft'),

  scheduled_at: CommonSchemas.dateTime,
  started_at: CommonSchemas.dateTime,
  completed_at: CommonSchemas.dateTime,

  settings: z.object({
    send_interval_seconds: z.number()
      .min(1, 'Intervalo deve ser pelo menos 1 segundo')
      .max(3600, 'Intervalo máximo é 1 hora')
      .default(5),

    max_daily_sends: z.number()
      .min(1, 'Mínimo 1 envio por dia')
      .max(10000, 'Máximo 10.000 envios por dia')
      .default(1000),

    retry_failed: z.boolean().default(true),
    max_retries: z.number().min(0).max(5).default(3),

    respect_business_hours: z.boolean().default(true),
    business_hours_start: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido').default('09:00'),
    business_hours_end: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Formato de hora inválido').default('18:00'),

    timezone: z.string().default('America/Sao_Paulo')
  }).optional(),

  statistics: z.object({
    total_targets: z.number().min(0).default(0),
    sent_count: z.number().min(0).default(0),
    delivered_count: z.number().min(0).default(0),
    read_count: z.number().min(0).default(0),
    failed_count: z.number().min(0).default(0),
    response_count: z.number().min(0).default(0)
  }).optional(),

  require_opt_in: z.boolean().default(false),
  is_template: z.boolean().default(false),
  template_name: z.string().max(512, 'Nome do template muito longo').optional(),
  template_language: z.string().default('pt_BR'),
  template_params: z.array(z.string().max(1024)).optional(),
}).merge(BaseEntitySchema.omit({ id: true, created_at: true, updated_at: true }));

// Campaign validation schema (with cross-field refinements)
export const CampaignSchema = CampaignBaseSchema.superRefine((data, ctx) => {
  if (data.is_template && !data.template_name?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Nome do template é obrigatório quando tipo de envio é Template',
      path: ['template_name'],
    });
  }
});

// Campaign creation schema
export const CampaignCreateSchema = CampaignBaseSchema.omit({
  status: true,
  started_at: true,
  completed_at: true,
  statistics: true
});

// Campaign update schema
export const CampaignUpdateSchema = CampaignBaseSchema.partial().required({ tenant_id: true });

// Campaign filter schema
export const CampaignFilterSchema = z.object({
  search: CommonSchemas.searchQuery,
  status: CommonSchemas.campaignStatus.optional(),
  whatsapp_instance_id: CommonSchemas.uuid.optional(),
  created_after: CommonSchemas.dateTime,
  created_before: CommonSchemas.dateTime,
  scheduled_after: CommonSchemas.dateTime,
  scheduled_before: CommonSchemas.dateTime,
  pagination: CommonSchemas.pagination
});

// Campaign execution schema
export const CampaignExecutionSchema = z.object({
  campaign_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  force_start: z.boolean().default(false),
  test_mode: z.boolean().default(false),
  test_contacts: z.array(CommonSchemas.uuid).optional()
});

// Campaign pause/resume schema
export const CampaignControlSchema = z.object({
  campaign_id: CommonSchemas.uuid,
  tenant_id: CommonSchemas.uuid,
  action: z.enum(['pause', 'resume', 'cancel'], {
    errorMap: () => ({ message: 'Ação inválida' })
  }),
  reason: z.string().max(255).optional()
});

// Campaign analytics schema
export const CampaignAnalyticsSchema = z.object({
  campaign_id: CommonSchemas.uuid.optional(),
  tenant_id: CommonSchemas.uuid,
  period: z.enum(['day', 'week', 'month', 'year']),
  start_date: CommonSchemas.dateTime,
  end_date: CommonSchemas.dateTime,
  group_by: z.enum(['day', 'week', 'month', 'campaign', 'instance']).optional()
});

// Campaign template schema
export const CampaignTemplateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  description: z.string().max(500, 'Descrição muito longa').optional(),
  message_content: CommonSchemas.textContent,
  message_type: MessageTypeSchema.default('text'),
  media_url: CommonSchemas.url,
  default_settings: CampaignBaseSchema.shape.settings,
  category: z.string().min(1, 'Categoria é obrigatória').max(50, 'Categoria muito longa'),
  is_active: z.boolean().default(true),
  tenant_id: CommonSchemas.uuid
});

// Campaign duplicate schema
export const CampaignDuplicateSchema = z.object({
  campaign_id: CommonSchemas.uuid,
  new_name: z.string().min(1, 'Nome é obrigatório').max(100, 'Nome muito longo'),
  tenant_id: CommonSchemas.uuid,
  copy_settings: z.boolean().default(true),
  copy_targets: z.boolean().default(false)
});

// Type exports
export type CampaignFormData = z.infer<typeof CampaignSchema>;
export type CampaignCreateData = z.infer<typeof CampaignCreateSchema>;
export type CampaignUpdateData = z.infer<typeof CampaignUpdateSchema>;
export type CampaignFilterData = z.infer<typeof CampaignFilterSchema>;
export type CampaignExecutionData = z.infer<typeof CampaignExecutionSchema>;
export type CampaignControlData = z.infer<typeof CampaignControlSchema>;
export type CampaignAnalyticsData = z.infer<typeof CampaignAnalyticsSchema>;
export type CampaignTemplateData = z.infer<typeof CampaignTemplateSchema>;
export type CampaignDuplicateData = z.infer<typeof CampaignDuplicateSchema>;

// Validation functions
export const validateCampaign = (data: unknown) => {
  return CampaignSchema.safeParse(data);
};

export const validateCampaignCreate = (data: unknown) => {
  return CampaignCreateSchema.safeParse(data);
};

export const validateCampaignUpdate = (data: unknown) => {
  return CampaignUpdateSchema.safeParse(data);
};

export const validateCampaignFilter = (data: unknown) => {
  return CampaignFilterSchema.safeParse(data);
};

export const validateCampaignExecution = (data: unknown) => {
  return CampaignExecutionSchema.safeParse(data);
};

export const validateCampaignControl = (data: unknown) => {
  return CampaignControlSchema.safeParse(data);
};

export const validateCampaignAnalytics = (data: unknown) => {
  return CampaignAnalyticsSchema.safeParse(data);
};

export const validateCampaignTemplate = (data: unknown) => {
  return CampaignTemplateSchema.safeParse(data);
};

export const validateCampaignDuplicate = (data: unknown) => {
  return CampaignDuplicateSchema.safeParse(data);
};