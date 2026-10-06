import { z } from 'zod';
import { CommonSchemas, BaseEntitySchema } from './common';

// Contact validation schema
export const ContactSchema = z.object({
  name: CommonSchemas.name,
  phone: CommonSchemas.phone,
  email: CommonSchemas.email,
  current_stage_id: CommonSchemas.uuid,
  lead_source_id: CommonSchemas.uuid,
  status: CommonSchemas.contactStatus.default('active'),
  custom_fields: CommonSchemas.customFields,
  last_interaction: CommonSchemas.dateTime
}).merge(BaseEntitySchema.omit({ id: true, created_at: true, updated_at: true }));

// Contact update schema (all fields optional except tenant_id)
export const ContactUpdateSchema = ContactSchema.partial().required({ tenant_id: true });

// Contact creation schema
export const ContactCreateSchema = ContactSchema.omit({ last_interaction: true });

// Contact filter schema
export const ContactFilterSchema = z.object({
  search: CommonSchemas.searchQuery,
  current_stage_id: CommonSchemas.uuid.optional(),
  lead_source_id: CommonSchemas.uuid.optional(),
  status: CommonSchemas.contactStatus.optional(),
  tags: CommonSchemas.tags,
  created_after: CommonSchemas.dateTime,
  created_before: CommonSchemas.dateTime,
  last_interaction_after: CommonSchemas.dateTime,
  last_interaction_before: CommonSchemas.dateTime,
  pagination: CommonSchemas.pagination
});

// Contact import schema
export const ContactImportSchema = z.object({
  contacts: z.array(ContactCreateSchema).min(1, 'Pelo menos um contato é obrigatório').max(1000, 'Máximo 1000 contatos por importação'),
  tenant_id: CommonSchemas.uuid,
  default_current_stage_id: CommonSchemas.uuid,
  default_lead_source_id: CommonSchemas.uuid,
  skip_duplicates: z.boolean().default(true)
});

// Contact bulk update schema
export const ContactBulkUpdateSchema = z.object({
  contact_ids: z.array(CommonSchemas.uuid).min(1, 'Pelo menos um contato deve ser selecionado').max(100, 'Máximo 100 contatos por operação'),
  updates: z.object({
    current_stage_id: CommonSchemas.uuid.optional(),
    lead_source_id: CommonSchemas.uuid.optional(),
    status: CommonSchemas.contactStatus.optional(),
    tags: z.object({
      add: CommonSchemas.tags,
      remove: CommonSchemas.tags
    }).optional()
  }),
  tenant_id: CommonSchemas.uuid
});

// Contact export schema
export const ContactExportSchema = z.object({
  filters: ContactFilterSchema.omit({ pagination: true }).optional(),
  format: z.enum(['csv', 'xlsx', 'json'], {
    errorMap: () => ({ message: 'Formato de exportação inválido' })
  }),
  fields: z.array(z.string()).optional(),
  tenant_id: CommonSchemas.uuid
});

// Formulário de contato (ContactModal). Valida só o que a pessoa digita: a
// Conta vem da sessão no insert e o id filtra o update, então não há tenant_id
// aqui — exigi-lo foi o que impediu o formulário de salvar qualquer contato de
// 2025-08-18 até a correção. O nome não passa por filtro de caracteres: nomes
// reais do WhatsApp e do Instagram têm emoji, "|" e acento combinante.
const optionalId = z.string().uuid('ID inválido').optional().or(z.literal(''));

export const ContactFormSchema = z.object({
  name: z.string().trim().max(255, 'Nome deve ter no máximo 255 caracteres'),
  phone: z.preprocess(
    (v) => (typeof v === 'string' ? v.replace(/\D/g, '') : v),
    z.string()
      .min(1, 'Telefone é obrigatório')
      .regex(/^[1-9]\d{7,14}$/, 'Telefone inválido: use DDI + DDD + número'),
  ),
  email: z.string().trim().email('Email inválido').optional().or(z.literal('')),
  current_stage_id: optionalId,
  lead_source_id: optionalId,
  notes: z.string().optional(),
});

/**
 * O formulário por canal. WhatsApp exige telefone. Instagram não tem telefone
 * (o contato é identificado pelo IGSID em external_id) e o formulário nem
 * mostra o campo — o @ aparece só para leitura.
 */
export const contactFormSchemaFor = (channel: 'whatsapp' | 'instagram') =>
  channel === 'instagram' ? ContactFormSchema.omit({ phone: true }) : ContactFormSchema;

export type ContactFormValues = {
  name: string;
  phone: string;
  email: string;
  current_stage_id: string;
  lead_source_id: string;
  notes: string;
};

const blankToNull = (v: string | undefined | null): string | null => {
  const t = (v ?? '').trim();
  return t === '' ? null : t;
};

/**
 * O que vai para `contacts` a partir do formulário. Campo em branco vira NULL,
 * nunca string vazia: `''` em coluna opcional é dado falso (e em `phone`
 * colide na chave única antiga `tenant_id, phone, whatsapp_instance_id`:
 * dois contatos do Instagram da mesma conta com phone '' não cabem juntos).
 *
 * Instagram: o payload NÃO leva `phone` (nem `username`, que é do servidor) —
 * o que está no banco fica como está, NULL.
 */
export function buildContactPayload(values: ContactFormValues, channel: 'whatsapp' | 'instagram' = 'whatsapp') {
  const common = {
    name: blankToNull(values.name),
    email: blankToNull(values.email),
    current_stage_id: blankToNull(values.current_stage_id),
    lead_source_id: blankToNull(values.lead_source_id),
    notes: blankToNull(values.notes),
  };
  if (channel === 'instagram') return common;
  return { ...common, phone: values.phone.replace(/\D/g, '') };
}

// Type exports
export type ContactFormData = z.infer<typeof ContactSchema>;
export type ContactCreateData = z.infer<typeof ContactCreateSchema>;
export type ContactUpdateData = z.infer<typeof ContactUpdateSchema>;
export type ContactFilterData = z.infer<typeof ContactFilterSchema>;
export type ContactImportData = z.infer<typeof ContactImportSchema>;
export type ContactBulkUpdateData = z.infer<typeof ContactBulkUpdateSchema>;
export type ContactExportData = z.infer<typeof ContactExportSchema>;

// Validation functions
export const validateContact = (data: unknown) => {
  return ContactSchema.safeParse(data);
};

export const validateContactCreate = (data: unknown) => {
  return ContactCreateSchema.safeParse(data);
};

export const validateContactUpdate = (data: unknown) => {
  return ContactUpdateSchema.safeParse(data);
};

export const validateContactFilter = (data: unknown) => {
  return ContactFilterSchema.safeParse(data);
};

export const validateContactImport = (data: unknown) => {
  return ContactImportSchema.safeParse(data);
};

export const validateContactBulkUpdate = (data: unknown) => {
  return ContactBulkUpdateSchema.safeParse(data);
};

export const validateContactExport = (data: unknown) => {
  return ContactExportSchema.safeParse(data);
};