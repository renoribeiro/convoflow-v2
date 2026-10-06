// =============================================================================
// instance-delete-cleanup.ts — o que acontece NO PROVEDOR quando uma instância
// é excluída do ConvoFlow
// =============================================================================
// Regra pura, zero I/O (mesma convenção de `instance-access.ts`), para o Vitest
// testar sem Deno. A edge function `delete-whatsapp-instance` chama a RPC
// `delete_whatsapp_instance` (que decide e apaga no banco, numa transação) e
// SÓ DEPOIS executa o plano que esta função devolve. A ordem é de propósito:
// se a RPC recusar (histórico, permissão), nada é tocado no provedor; se o
// provedor falhar, a instância já saiu do ConvoFlow e a resposta diz isso.
//
// Por provedor (endpoints conforme os SKILL.md de cada API):
//
//   evolution  .agent/skills/evolution-v2/SKILL.md §2.7 e §2.8
//              DELETE {BASE}/instance/logout/{INSTANCE}   apikey: GLOBAL_KEY
//              DELETE {BASE}/instance/delete/{INSTANCE}   apikey: GLOBAL_KEY
//              A Evolution recusa apagar instância conectada ("needs to be
//              disconnected"), por isso o logout vem antes — e o resultado
//              dele é ignorado (instância já desconectada responde erro).
//              A chave global vive só na edge function (ver evolution-provision).
//
//   waha       .agent/skills/waha/SKILL.md §2.7
//              DELETE {BASE}/api/sessions/{SESSION}       X-Api-Key: API_KEY
//              O servidor é do cliente: URL e chave vêm de connection_config.
//
//   official   NADA é chamado na Meta. O número continua registrado na Meta
//              e o app continua inscrito na WABA; o que some é o vínculo
//              aqui (linha + token no Vault). Desfazer isso na Meta é gesto
//              da fatia de Embedded Signup, não desta.
// =============================================================================

export interface CleanupRequest {
  method: 'DELETE';
  url: string;
  headers: Record<string, string>;
  /** Passo cujo erro NÃO conta como falha (ex.: logout de instância já fora). */
  optional: boolean;
  label: string;
}

export type CleanupPlan =
  | { kind: 'requests'; provider: 'evolution' | 'waha'; requests: CleanupRequest[] }
  | { kind: 'not_applicable'; provider: 'official' }
  | { kind: 'skipped'; provider: 'evolution' | 'waha' | 'unknown'; why: string };

export interface CleanupEnv {
  evolutionBaseUrl?: string | null;
  evolutionGlobalKey?: string | null;
}

const trimSlash = (u: string) => u.replace(/\/+$/, '');

export function planProviderCleanup(
  provider: string | null | undefined,
  instanceKey: string,
  connectionConfig: Record<string, unknown> | null | undefined,
  env: CleanupEnv,
): CleanupPlan {
  const p = provider || 'evolution';

  if (p === 'official') return { kind: 'not_applicable', provider: 'official' };

  if (p === 'evolution') {
    const base = (env.evolutionBaseUrl || '').trim();
    const key = (env.evolutionGlobalKey || '').trim();
    if (!base || !key) {
      return {
        kind: 'skipped',
        provider: 'evolution',
        why: 'EVOLUTION_API_URL / EVOLUTION_GLOBAL_KEY ausentes na edge function.',
      };
    }
    const name = encodeURIComponent(instanceKey);
    const headers = { apikey: key };
    return {
      kind: 'requests',
      provider: 'evolution',
      requests: [
        { method: 'DELETE', url: `${trimSlash(base)}/instance/logout/${name}`, headers, optional: true, label: 'logout' },
        { method: 'DELETE', url: `${trimSlash(base)}/instance/delete/${name}`, headers, optional: false, label: 'delete' },
      ],
    };
  }

  if (p === 'waha') {
    const base = String(connectionConfig?.baseUrl || '').trim();
    const apiKey = String(connectionConfig?.apiKey || '').trim();
    const session = String(connectionConfig?.sessionName || instanceKey).trim();
    if (!base || !session) {
      return { kind: 'skipped', provider: 'waha', why: 'connection_config sem baseUrl/sessionName.' };
    }
    return {
      kind: 'requests',
      provider: 'waha',
      requests: [
        {
          method: 'DELETE',
          url: `${trimSlash(base)}/api/sessions/${encodeURIComponent(session)}`,
          headers: apiKey ? { 'X-Api-Key': apiKey } : {},
          optional: false,
          label: 'delete-session',
        },
      ],
    };
  }

  return { kind: 'skipped', provider: 'unknown', why: `provider desconhecido: ${p}` };
}

export type CleanupOutcome = 'removed' | 'not_found' | 'failed' | 'not_applicable' | 'skipped';

/**
 * Traduz o status HTTP do passo obrigatório em resultado. 404 = já não
 * existia no provedor: para quem está excluindo, é o mesmo que removido.
 */
export function cleanupOutcomeFromStatus(status: number): CleanupOutcome {
  if (status === 404) return 'not_found';
  if (status >= 200 && status < 300) return 'removed';
  return 'failed';
}
