// =============================================================================
// instance-credentials.ts — onde o SERVIDOR acha o endereço, a chave e a senha
// de entrega de um número Evolution ou WAHA
// =============================================================================
// Desde 2026-10-26 (migração 20261026000001) elas moram no cofre, lidas por
// get_instance_provider_credentials(uuid), e nunca na linha de
// whatsapp_instances, que todo membro da Loja lê. Plano e estado:
// docs/RUNBOOK_segredos_das_instancias.md.
//
// Ordem de leitura:
//   1. cofre (o que foi gravado pelo servidor);
//   2. a linha, SÓ para números antigos: `connection_config.apiKey` ou a coluna
//      `evolution_api_key`. Em 2026-10-26 nenhuma linha tinha isso preenchido;
//      o caminho fica até a sessão 3 fechar as colunas.
//
// O endereço do Evolution é sempre o do cofre ou o da plataforma
// (EVOLUTION_API_URL). NUNCA o da linha: o navegador consegue gravar a linha, e
// um endereço gravado lá faria o nosso servidor chamar onde ele quisesse. O do
// WAHA é do cliente por natureza; quem chama precisa passar por
// `safe-outbound-url.ts` antes de usá-lo.
//
// Regra pura + um carregador fino; sem imports de Deno (o Vitest importa).
// =============================================================================

export interface ProviderCredentials {
  baseUrl: string;
  apiKey: string;
  /** Só WAHA: a senha com que o servidor do cliente assina os eventos. */
  webhookSecret?: string;
}

export type CredentialSource = 'vault' | 'legacy_row' | 'none';

export interface CredentialRow {
  id?: string | null;
  provider?: string | null;
  instance_key?: string | null;
  connection_config?: unknown;
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
}

export interface CredentialEnv {
  /** EVOLUTION_API_URL: o servidor Evolution da plataforma. */
  evolutionBaseUrl?: string | null;
}

export interface ResolvedCredentials {
  source: CredentialSource;
  credentials: ProviderCredentials | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const trimSlash = (u: string) => u.replace(/\/+$/, '');

export function providerOf(row: CredentialRow): string {
  return row.provider || 'evolution';
}

/**
 * Decide as credenciais a partir do que veio do cofre (`stored`, o JSON da RPC
 * ou null) e da linha. Não faz I/O.
 */
export function resolveProviderCredentials(
  row: CredentialRow,
  stored: unknown,
  env: CredentialEnv,
): ResolvedCredentials {
  const provider = providerOf(row);
  const vault = obj(stored);
  const cfg = obj(row.connection_config);
  const platformEvolution = trimSlash(str(env.evolutionBaseUrl));

  if (provider === 'evolution') {
    const vaultKey = str(vault.apiKey);
    if (vaultKey) {
      const baseUrl = trimSlash(str(vault.baseUrl)) || platformEvolution;
      return baseUrl
        ? { source: 'vault', credentials: { baseUrl, apiKey: vaultKey } }
        : { source: 'none', credentials: null };
    }
    const legacyKey = str(cfg.apiKey) || str(row.evolution_api_key);
    if (legacyKey && platformEvolution) {
      return { source: 'legacy_row', credentials: { baseUrl: platformEvolution, apiKey: legacyKey } };
    }
    return { source: 'none', credentials: null };
  }

  if (provider === 'waha') {
    const vaultUrl = trimSlash(str(vault.baseUrl));
    if (vaultUrl) {
      const webhookSecret = str(vault.webhookSecret);
      return {
        source: 'vault',
        credentials: {
          baseUrl: vaultUrl,
          apiKey: str(vault.apiKey),
          ...(webhookSecret ? { webhookSecret } : {}),
        },
      };
    }
    const legacyUrl = trimSlash(str(cfg.baseUrl));
    if (legacyUrl) {
      return { source: 'legacy_row', credentials: { baseUrl: legacyUrl, apiKey: str(cfg.apiKey) } };
    }
    return { source: 'none', credentials: null };
  }

  return { source: 'none', credentials: null };
}

/** O mínimo de cliente Supabase que o carregador usa (service role). */
export interface RpcClient {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { message: string } | null }>;
}

/**
 * Lê o cofre e decide. Erro da RPC não derruba: cai para a linha (e quem
 * chama recebe `source: 'none'` se nada servir). O valor nunca é logado.
 */
export async function loadProviderCredentials(
  client: RpcClient,
  row: CredentialRow,
  env: CredentialEnv,
): Promise<ResolvedCredentials & { vaultError?: string }> {
  const provider = providerOf(row);
  if (provider !== 'evolution' && provider !== 'waha') return { source: 'none', credentials: null };
  let stored: unknown = null;
  let vaultError: string | undefined;
  if (row.id) {
    const { data, error } = await client.rpc('get_instance_provider_credentials', { p_instance_id: row.id });
    if (error) vaultError = error.message;
    else stored = data;
  }
  const resolved = resolveProviderCredentials(row, stored, env);
  return vaultError ? { ...resolved, vaultError } : resolved;
}

/**
 * O que vai para o cofre. Só as três chaves que a função do banco aceita, sem
 * campo vazio.
 */
export function credentialsForVault(c: { baseUrl?: string; apiKey?: string; webhookSecret?: string }): Record<string, string> {
  const out: Record<string, string> = {};
  const baseUrl = trimSlash(str(c.baseUrl));
  const apiKey = str(c.apiKey);
  const webhookSecret = str(c.webhookSecret);
  if (baseUrl) out.baseUrl = baseUrl;
  if (apiKey) out.apiKey = apiKey;
  if (webhookSecret) out.webhookSecret = webhookSecret;
  return out;
}
