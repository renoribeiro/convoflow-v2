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

/**
 * Mensagens padrão do zod em português, para o que o esquema não diz. Campo que
 * ainda não existe (bloco recém-solto no desenho) saía "Required" no painel.
 * A mensagem escrita no esquema (`.min(1, '...')`) continua valendo antes desta.
 */
export const ERROS_EM_PORTUGUES: z.ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case z.ZodIssueCode.invalid_type:
      return { message: issue.received === 'undefined' || issue.received === 'null' ? 'Campo obrigatório' : 'Valor inválido' };
    case z.ZodIssueCode.too_small:
      if (issue.type === 'string') {
        return { message: Number(issue.minimum) <= 1 ? 'Campo obrigatório' : `Use pelo menos ${issue.minimum} caracteres` };
      }
      if (issue.type === 'array') return { message: `Adicione pelo menos ${issue.minimum}` };
      return { message: `O mínimo é ${issue.minimum}` };
    case z.ZodIssueCode.too_big:
      if (issue.type === 'string') return { message: `Use no máximo ${issue.maximum} caracteres` };
      if (issue.type === 'array') return { message: `No máximo ${issue.maximum}` };
      return { message: `O máximo é ${issue.maximum}` };
    case z.ZodIssueCode.invalid_enum_value:
      return { message: 'Escolha uma das opções' };
    case z.ZodIssueCode.invalid_string:
      return { message: issue.validation === 'uuid' ? 'Escolha um item da lista' : 'Formato inválido' };
    default:
      return { message: ctx.defaultError };
  }
};

const validar = (schema: z.ZodTypeAny, dados: unknown) => schema.safeParse(dados, { errorMap: ERROS_EM_PORTUGUES });

/** Validate a node's data by its type. Returns a zod SafeParseReturn. */
export function validateNodeData(type: string, data: unknown) {
  switch (type) {
    case 'start':
      return validar(StartNodeDataSchema, data);
    case 'send_text':
      return validar(SendTextNodeDataSchema, data);
    case 'ask_question':
      return validar(AskQuestionNodeDataSchema, data);
    case 'show_options':
      return validar(ShowOptionsNodeDataSchema, data);
    case 'condition':
      return validar(ConditionNodeDataSchema, data);
    case 'transfer_agent':
      return validar(TransferAgentNodeDataSchema, data);
    case 'set_variable':
      return validar(SetVariableNodeDataSchema, data);
    case 'update_contact':
      return validar(UpdateContactNodeDataSchema, data);
    case 'move_funnel':
      return validar(MoveFunnelNodeDataSchema, data);
    case 'end_flow':
      return validar(EndFlowNodeDataSchema, data);
    default:
      return validar(z.object({}), data);
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
      return validar(KeywordTriggerValueSchema, value);
    case 'first_contact':
      return validar(FirstContactTriggerValueSchema, value);
    case 'out_of_hours':
      return validar(OutOfHoursTriggerValueSchema, value);
    case 'no_agent_reply':
      return validar(NoAgentReplyTriggerValueSchema, value);
    case 'funnel_stage':
      return validar(FunnelStageTriggerValueSchema, value);
    default:
      return validar(z.object({}), value);
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
