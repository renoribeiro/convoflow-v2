/**
 * Validações Zod do módulo Follow-up (PT-BR), aplicadas no submit dos formulários.
 */
import { z } from 'zod';

export const followupModeEnum = z.enum(['manual', 'scheduled', 'sequence']);
export const followupTypeEnum = z.enum([
  'call', 'email', 'whatsapp', 'meeting', 'visit', 'task', 'other',
]);
export const followupPriorityEnum = z.enum(['high', 'medium', 'low']);
export const recurringTypeEnum = z.enum(['daily', 'weekly', 'monthly', 'custom']);

/** Formulário de criação/edição de follow-up (cobre os 3 modos). */
export const followupFormSchema = z
  .object({
    mode: followupModeEnum.default('manual'),
    contact_id: z.string().uuid('Selecione um contato'),
    task: z.string().trim().min(1, 'Descreva a tarefa do follow-up').max(500),
    type: followupTypeEnum.default('whatsapp'),
    priority: followupPriorityEnum.default('medium'),
    due_date: z.string().min(1, 'Informe a data/hora'),
    notes: z.string().max(2000).optional().nullable(),
    assigned_to: z.string().uuid().optional().nullable(),
    tags: z.array(z.string()).optional().default([]),
    whatsapp_instance_id: z.string().uuid().optional().nullable(),

    // Modo AGENDADO
    scheduled_at: z.string().optional().nullable(),
    message_body: z.string().max(4096).optional().nullable(),
    template_name: z.string().optional().nullable(),
    template_language: z.string().optional().nullable(),
    template_params: z.array(z.string()).optional().nullable(),

    // Modo SEQUÊNCIA
    sequence_id: z.string().uuid().optional().nullable(),

    // Recorrência
    recurring: z.boolean().optional().default(false),
    recurring_type: recurringTypeEnum.optional().nullable(),
    recurring_interval: z.number().int().positive().optional().nullable(),
    recurring_count: z.number().int().min(0).optional().nullable(),
    recurring_end_date: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'scheduled') {
      if (!data.scheduled_at) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Defina a data/hora de envio',
          path: ['scheduled_at'],
        });
      }
      const hasFreeForm = !!data.message_body?.trim();
      const hasTemplate = !!data.template_name?.trim();
      if (!hasFreeForm && !hasTemplate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Escreva a mensagem ou selecione um template aprovado',
          path: ['message_body'],
        });
      }
    }
    if (data.mode === 'sequence' && !data.sequence_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Selecione a sequência',
        path: ['sequence_id'],
      });
    }
    if (data.recurring) {
      if (!data.recurring_type) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Escolha o padrão de recorrência',
          path: ['recurring_type'],
        });
      }
      if (data.recurring_type === 'custom' && !data.recurring_interval) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Informe o intervalo (a cada N dias)',
          path: ['recurring_interval'],
        });
      }
    }
  });

export type FollowupFormValues = z.infer<typeof followupFormSchema>;

/** Passo de uma sequência. */
export const sequenceStepSchema = z
  .object({
    action_type: z.enum(['whatsapp', 'manual_task']),
    delay_amount: z.number().int().min(0, 'Intervalo inválido'),
    delay_unit: z.enum(['minutes', 'hours', 'days']).default('days'),
    message_body: z.string().max(4096).optional().nullable(),
    template_name: z.string().optional().nullable(),
    template_language: z.string().optional().nullable(),
    template_params: z.array(z.string()).optional().nullable(),
    task_title: z.string().max(500).optional().nullable(),
    task_priority: followupPriorityEnum.optional().default('medium'),
  })
  .superRefine((data, ctx) => {
    if (data.action_type === 'whatsapp') {
      const hasFreeForm = !!data.message_body?.trim();
      const hasTemplate = !!data.template_name?.trim();
      if (!hasFreeForm && !hasTemplate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Passo WhatsApp precisa de mensagem ou template',
          path: ['message_body'],
        });
      }
    }
    if (data.action_type === 'manual_task' && !data.task_title?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Descreva a tarefa manual',
        path: ['task_title'],
      });
    }
  });

export const sequenceFormSchema = z.object({
  name: z.string().trim().min(1, 'Dê um nome à sequência').max(150),
  description: z.string().max(1000).optional().nullable(),
  is_active: z.boolean().default(true),
  stop_on_reply: z.boolean().default(true),
  steps: z.array(sequenceStepSchema).min(1, 'Adicione pelo menos um passo'),
});

export type SequenceFormValues = z.infer<typeof sequenceFormSchema>;
