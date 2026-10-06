import { createEvolutionApiService, EvolutionApiService } from '@/services/evolutionApi';
import { supabase } from '@/integrations/supabase/client';

/**
 * Monta um EvolutionApiService a partir das credenciais DA INSTÂNCIA.
 *
 * Existe porque o `service` global do `useEvolutionApi` é um beco sem saída: ele
 * só nasce de `tenants.settings.evolutionApi` ou das env vars
 * `VITE_EVOLUTION_API_*`, e em produção nenhuma das duas fontes existe — nenhuma
 * Conta tem esse settings e as variáveis não estão na Vercel. Resultado: o
 * serviço global é sempre nulo, e todo botão que dependia dele (QR, Desconectar,
 * Atualizar status) falhava — dois deles em silêncio.
 *
 * A credencial certa é a da própria instância, gravada pela edge function
 * `evolution-provision` em `connection_config`. Ela é escopada: enxerga aquela
 * instância e responde 401 nas outras. A chave global do servidor nunca chega
 * ao navegador.
 */

export interface EvolutionCredentialSource {
  connection_config?: Record<string, unknown> | null;
  /** Colunas antigas, anteriores ao connection_config. Ainda em uso por linhas velhas. */
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
}

export const SEM_CREDENCIAL =
  'Esta instância não tem servidor e chave salvos. Ela foi criada antes da configuração atual. ' +
  'Remova e crie de novo para que o ConvoFlow guarde as credenciais dela.';

/** Extrai baseUrl/apiKey de uma linha de `whatsapp_instances`, ou null. */
export function evolutionCredentialsFrom(
  row: EvolutionCredentialSource | null | undefined,
): { baseUrl: string; apiKey: string } | null {
  if (!row) return null;
  const cfg = (row.connection_config as { baseUrl?: string; apiKey?: string } | null) || {};
  const baseUrl = cfg.baseUrl || row.evolution_api_url || '';
  const apiKey = cfg.apiKey || row.evolution_api_key || '';
  return baseUrl && apiKey ? { baseUrl, apiKey } : null;
}

/**
 * Versão síncrona, para quem já tem a linha em mãos (a lista de instâncias vem
 * com `select: '*'`). Evita uma consulta por instância no polling de 30s.
 */
export function evolutionServiceForRow(row: EvolutionCredentialSource): EvolutionApiService {
  const creds = evolutionCredentialsFrom(row);
  if (!creds) throw new Error(SEM_CREDENCIAL);
  return createEvolutionApiService(creds.baseUrl, creds.apiKey);
}

/** Versão assíncrona, para quem só tem a chave (ex.: logo depois de criar). */
export async function evolutionServiceForInstanceKey(
  instanceKey: string,
): Promise<EvolutionApiService> {
  const { data, error } = await supabase
    .from('whatsapp_instances')
    .select('connection_config, evolution_api_url, evolution_api_key')
    .eq('instance_key', instanceKey)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível ler a instância: ${error.message}`);
  if (!data) throw new Error('Instância não encontrada nesta Conta.');

  return evolutionServiceForRow(data as EvolutionCredentialSource);
}
