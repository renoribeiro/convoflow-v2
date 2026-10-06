import { z } from 'zod';

/**
 * Discriminated-union schema for the "Nova Instância" wizard.
 *
 * Each branch corresponds to one of the supported WhatsApp API providers.
 * Use `newInstanceSchema.safeParse(input)` at form submit time before calling
 * the provider-specific hook.
 */

const nameField = z
  .string()
  .trim()
  .min(3, 'Nome deve ter pelo menos 3 caracteres')
  .max(50, 'Nome muito longo');

/**
 * Regra do nome exibido de uma instância — a MESMA da criação, exportada para
 * o "Renomear" não inventar outra. O nome é só rótulo: a identidade da
 * instância é `instance_key`, que nunca muda depois de criada (é ela que o
 * servidor Evolution e os webhooks conhecem).
 */
export const instanceNameSchema = nameField;

const officialSchema = z.object({
  provider: z.literal('official'),
  name: nameField,
  phoneNumberId: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/, 'Phone Number ID deve conter apenas dígitos'),
  wabaId: z
    .string()
    .trim()
    .regex(/^\d{6,30}$/, 'WABA ID deve conter apenas dígitos'),
  accessToken: z
    .string()
    .trim()
    .min(40, 'Access Token muito curto'),
  graphApiVersion: z
    .string()
    .regex(/^v\d{1,2}\.\d{1,2}$/, 'Versão da Graph API inválida')
    .optional(),
});

const wahaSchema = z.object({
  provider: z.literal('waha'),
  name: nameField,
  serverUrl: z.string().trim().url('URL do servidor WAHA inválida'),
  apiKey: z.string().trim().optional(),
  sessionName: z
    .string()
    .trim()
    .min(1, 'Nome da sessão é obrigatório')
    .max(50, 'Nome da sessão muito longo')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use apenas letras, números, _ e -'),
});

const evolutionSchema = z.object({
  provider: z.literal('evolution'),
  name: nameField,
  instance_key: z
    .string()
    .trim()
    .min(3, 'Chave da instância deve ter pelo menos 3 caracteres')
    .max(100, 'Chave muito longa')
    .regex(/^[A-Za-z0-9_-]+$/, 'Use apenas letras, números, _ e -'),
  // Sem serverUrl/apiKey de propósito: o servidor Evolution é da plataforma, e
  // a chave global dele é chave-mestra de TODAS as instâncias — inclusive as de
  // outros clientes. Ela vive como secret na edge function `evolution-provision`
  // e nunca chega ao navegador. O que chega é a chave da instância criada.
  enableWebhookAutomation: z.boolean().default(true),
  retryAttempts: z.number().int().min(1).max(10).default(3),
  retryDelay: z.number().int().min(1000).max(10000).default(2000),
});

export const newInstanceSchema = z.discriminatedUnion('provider', [
  officialSchema,
  wahaSchema,
  evolutionSchema,
]);

export type NewInstanceInput = z.infer<typeof newInstanceSchema>;
export type OfficialInstanceInput = z.infer<typeof officialSchema>;
export type WahaInstanceInput = z.infer<typeof wahaSchema>;
export type EvolutionInstanceInput = z.infer<typeof evolutionSchema>;

/**
 * `instagram` existe no tipo desde a fatia 1 do Instagram, para que o banco
 * (CHECK de whatsapp_instances.provider) e o front falem a mesma língua. Ele
 * NÃO aparece em nenhuma tela: o seletor de provedor em ProviderSelector.tsx
 * tem a própria lista escrita à mão e não passa por aqui, e nenhuma instância
 * de Instagram é criada enquanto a fatia 2 não existir.
 */
export type ProviderType = 'official' | 'waha' | 'evolution' | 'instagram';

export const PROVIDER_LABELS: Record<ProviderType, string> = {
  official: 'API Oficial',
  waha: 'WAHA',
  evolution: 'Evolution',
  instagram: 'Instagram',
};

export const validateNewInstance = (data: unknown) => newInstanceSchema.safeParse(data);
