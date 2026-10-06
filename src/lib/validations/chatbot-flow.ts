import { z } from 'zod';

/**
 * Zod schemas for the visual flow builder. Applied at form-submit and before
 * persisting nodes/triggers. Mirrors src/types/chatbot-flow.types.ts.
 */

// ---------------------------------------------------------------------------
// Node data schemas
// ---------------------------------------------------------------------------
export const StartNodeDataSchema = z.object({
  label: z.string().max(60).optional(),
});

export const SendTextNodeDataSchema = z.object({
  message: z.string().min(1, 'A mensagem é obrigatória').max(4096, 'Mensagem muito longa'),
  delay_seconds: z.number().int().min(0).max(300).optional().default(0),
});

export const AskQuestionNodeDataSchema = z.object({
  message: z.string().min(1, 'A pergunta é obrigatória').max(4096),
  save_to_variable: z
    .string()
    .min(1, 'Informe o nome da variável')
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Use letras, números e _ (começando por letra)'),
  validation: z.enum(['none', 'email', 'phone', 'number']).default('none'),
});

export const ShowOptionsOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1, 'Rótulo obrigatório').max(60),
  value: z.string().min(1).max(60),
});

export const ShowOptionsNodeDataSchema = z.object({
  message: z.string().min(1, 'A mensagem do menu é obrigatória').max(4096),
  options: z
    .array(ShowOptionsOptionSchema)
    .min(1, 'Adicione pelo menos uma opção')
    .max(10, 'Máximo de 10 opções'),
});

export const ConditionNodeDataSchema = z
  .object({
    variable: z.string().min(1, 'Selecione uma variável').max(50),
    operator: z.enum(['contains', 'equals', 'not_empty', 'empty']),
    value: z.string().max(500).optional(),
  })
  .refine(
    (d) => d.operator === 'not_empty' || d.operator === 'empty' || !!d.value,
    { message: 'Informe o valor para comparar', path: ['value'] }
  );

export const TransferAgentNodeDataSchema = z
  .object({
    message: z.string().max(4096).optional(),
    assign_to: z.enum(['any', 'specific_user']).default('any'),
    user_id: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.assign_to !== 'specific_user' || !!d.user_id, {
    message: 'Selecione o atendente',
    path: ['user_id'],
  });

export const SetVariableNodeDataSchema = z.object({
  variable_name: z
    .string()
    .min(1, 'Informe o nome da variável')
    .max(50)
    .regex(/^[a-zA-Z][a-zA-Z0-9_]*$/, 'Use letras, números e _ (começando por letra)'),
  value: z.string().max(500),
});

export const UpdateContactNodeDataSchema = z.object({
  field: z.enum(['name', 'email', 'phone', 'tag']),
  value: z.string().min(1, 'Informe o valor').max(500),
});

export const MoveFunnelNodeDataSchema = z.object({
  stage_id: z.string().uuid('Selecione uma etapa'),
});

export const EndFlowNodeDataSchema = z.object({
  message: z.string().max(4096).optional(),
  silent: z.boolean().optional().default(false),
});

/** Validate a node's data by its type. Returns a zod SafeParseReturn. */
export function validateNodeData(type: string, data: unknown) {
  switch (type) {
    case 'start':
      return StartNodeDataSchema.safeParse(data);
    case 'send_text':
      return SendTextNodeDataSchema.safeParse(data);
    case 'ask_question':
      return AskQuestionNodeDataSchema.safeParse(data);
    case 'show_options':
      return ShowOptionsNodeDataSchema.safeParse(data);
    case 'condition':
      return ConditionNodeDataSchema.safeParse(data);
    case 'transfer_agent':
      return TransferAgentNodeDataSchema.safeParse(data);
    case 'set_variable':
      return SetVariableNodeDataSchema.safeParse(data);
    case 'update_contact':
      return UpdateContactNodeDataSchema.safeParse(data);
    case 'move_funnel':
      return MoveFunnelNodeDataSchema.safeParse(data);
    case 'end_flow':
      return EndFlowNodeDataSchema.safeParse(data);
    default:
      return z.object({}).safeParse(data);
  }
}

// ---------------------------------------------------------------------------
// Trigger schemas
// ---------------------------------------------------------------------------
export const KeywordTriggerValueSchema = z.object({
  keywords: z.array(z.string().min(1).max(100)).min(1, 'Adicione ao menos uma palavra-chave'),
});
export const FirstContactTriggerValueSchema = z.object({});
export const OutOfHoursTriggerValueSchema = z.object({
  timezone: z.string().max(60).optional(),
});
export const NoAgentReplyTriggerValueSchema = z.object({
  minutes: z.number().int().min(1, 'Mínimo de 1 minuto').max(1440),
});
export const FunnelStageTriggerValueSchema = z.object({
  stage_id: z.string().uuid('Selecione uma etapa'),
});

export function validateTriggerValue(type: string, value: unknown) {
  switch (type) {
    case 'keyword':
      return KeywordTriggerValueSchema.safeParse(value);
    case 'first_contact':
      return FirstContactTriggerValueSchema.safeParse(value);
    case 'out_of_hours':
      return OutOfHoursTriggerValueSchema.safeParse(value);
    case 'no_agent_reply':
      return NoAgentReplyTriggerValueSchema.safeParse(value);
    case 'funnel_stage':
      return FunnelStageTriggerValueSchema.safeParse(value);
    default:
      return z.object({}).safeParse(value);
  }
}

// ---------------------------------------------------------------------------
// Initial-creation form
// ---------------------------------------------------------------------------
export const ChatbotFlowCreateSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  description: z.string().max(500).optional(),
  whatsapp_instance_id: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(0).max(100).default(0),
  triggers: z
    .array(
      z.object({
        trigger_type: z.enum([
          'keyword',
          'first_contact',
          'out_of_hours',
          'no_agent_reply',
          'funnel_stage',
        ]),
        trigger_value: z.record(z.any()).default({}),
        is_active: z.boolean().default(true),
      })
    )
    .min(1, 'Selecione pelo menos um gatilho'),
});

export type ChatbotFlowCreateData = z.infer<typeof ChatbotFlowCreateSchema>;
