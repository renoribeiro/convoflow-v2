/**
 * As colunas de `whatsapp_instances` que a tela pode ler sem levar segredo.
 *
 * Por quê: a policy de leitura da tabela deixa todo membro da Loja ler a linha
 * inteira, e a linha carregava o servidor e a chave do Evolution e do WAHA
 * (`evolution_api_url`, `evolution_api_key` e `connection_config.baseUrl` /
 * `apiKey`). Com a chave, dá para desconectar o número ou mandar mensagem por
 * fora do ConvoFlow. Levantamento e plano: docs/RUNBOOK_segredos_das_instancias.md.
 *
 * `connection_config` é misto: para Meta e Instagram ele guarda só ids que a
 * tela usa (número, conta do WhatsApp Business, @ e validade do Instagram); para
 * Evolution e WAHA guardava a chave. Por isso ele não entra inteiro: entram só
 * as chaves da lista abaixo, uma a uma, e `rebuildSafeInstanceRow` remonta o
 * objeto do lado de cá.
 */

/** Chaves de `connection_config` que não são segredo. Nada além delas. */
export const SAFE_CONNECTION_CONFIG_KEYS = [
  'phoneNumberId',
  'wabaId',
  'graphApiVersion',
  'igAccountId',
  'igUsername',
  'tokenExpiresAt',
  'tokenIssuedAt',
  'renewal',
  'sessionName',
  'engine',
] as const;

export type SafeConnectionConfigKey = (typeof SAFE_CONNECTION_CONFIG_KEYS)[number];

const SAFE_PLAIN_COLUMNS = [
  'id',
  'tenant_id',
  'name',
  'instance_key',
  'phone_number',
  'status',
  'provider',
  'profile_name',
  'profile_picture_url',
  'is_active',
  'last_connected_at',
  'created_at',
  'updated_at',
  'assigned_profile_id',
  'webhook_url',
  'webhook_configured',
] as const;

const aliasOf = (key: SafeConnectionConfigKey) => `cfg_${key}`;

/**
 * O `select` do PostgREST: colunas comuns mais cada chave segura de
 * `connection_config` com apelido (`cfg_igUsername:connection_config->igUsername`).
 * `->` devolve o valor JSON como está (número, texto ou objeto).
 */
export const SAFE_INSTANCE_SELECT = [
  ...SAFE_PLAIN_COLUMNS,
  ...SAFE_CONNECTION_CONFIG_KEYS.map((k) => `${aliasOf(k)}:connection_config->${k}`),
].join(', ');

export interface SafeInstanceRow {
  id: string;
  tenant_id: string;
  name: string;
  instance_key: string;
  phone_number: string | null;
  status: string | null;
  provider: string | null;
  profile_name: string | null;
  profile_picture_url: string | null;
  is_active: boolean | null;
  last_connected_at: string | null;
  created_at: string;
  updated_at: string;
  assigned_profile_id: string | null;
  /** Endereço de entrega no ConvoFlow (não é segredo). */
  webhook_url: string | null;
  webhook_configured: boolean | null;
  /** Só as chaves de SAFE_CONNECTION_CONFIG_KEYS que vieram preenchidas. */
  connection_config: Partial<Record<SafeConnectionConfigKey, unknown>>;
}

/**
 * Monta a linha que a tela usa a partir do que o `SAFE_INSTANCE_SELECT`
 * devolve. Se vier um `connection_config` inteiro (cache antigo, teste), dele
 * também só passam as chaves seguras.
 */
export function rebuildSafeInstanceRow(raw: Record<string, unknown>): SafeInstanceRow {
  const full =
    raw.connection_config && typeof raw.connection_config === 'object' && !Array.isArray(raw.connection_config)
      ? (raw.connection_config as Record<string, unknown>)
      : {};
  const connection_config: Partial<Record<SafeConnectionConfigKey, unknown>> = {};
  for (const key of SAFE_CONNECTION_CONFIG_KEYS) {
    const value = raw[aliasOf(key)] ?? full[key];
    if (value !== null && value !== undefined) connection_config[key] = value;
  }
  const row: Record<string, unknown> = { connection_config };
  for (const col of SAFE_PLAIN_COLUMNS) row[col] = raw[col] ?? null;
  return row as unknown as SafeInstanceRow;
}
