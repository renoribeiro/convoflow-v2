import { supabase } from '@/integrations/supabase/client';
import { corpoDaEdgeFunction } from '@/lib/edgeFunctionError';

/**
 * Estado, QR, desconectar e chave de um número Evolution ou WAHA, pedidos ao
 * SERVIDOR (edge function `whatsapp-instance-action`).
 *
 * A tela não lê mais a chave nem o endereço do servidor do número: quem fala
 * com o Evolution e com o WAHA é o servidor, com a chave guardada no cofre.
 * Daqui só voltam o estado, a imagem do QR (ou o código de pareamento) e se há
 * chave salva. Plano: docs/RUNBOOK_segredos_das_instancias.md.
 */

export type InstanceActionName = 'status' | 'connect' | 'disconnect' | 'credential' | 'replace_key';

export interface InstanceActionResult {
  ok: boolean;
  /** Motivo da recusa (ex.: 'no_credentials', 'forbidden', 'provider_auth'). */
  reason?: string;
  /** Frase em pt-BR para a tela. */
  error?: string;
  /** status/disconnect: o estado gravado. */
  status?: string;
  changed?: boolean;
  /** connect: 'open' | 'connected' | 'qrcode' | 'connecting'. */
  state?: string;
  qr?: string | null;
  pairing_code?: string | null;
  credential_configured?: boolean;
}

const FALHA_DE_REDE = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';

export async function instanceAction(
  instanceId: string,
  action: InstanceActionName,
  extra: { api_key?: string } = {},
): Promise<InstanceActionResult> {
  let res: { data: unknown; error: unknown } | undefined;
  try {
    res = await supabase.functions.invoke('whatsapp-instance-action', {
      body: { instance_id: instanceId, action, ...extra },
    });
  } catch {
    return { ok: false, error: FALHA_DE_REDE };
  }
  if (!res) return { ok: false, error: FALHA_DE_REDE };
  if (res.error) {
    // Recusa vem como 4xx/5xx: o motivo e a frase estão no corpo.
    const body = await corpoDaEdgeFunction(res.error);
    return {
      ok: false,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
      error: typeof body?.error === 'string' ? body.error : FALHA_DE_REDE,
      credential_configured: typeof body?.credential_configured === 'boolean' ? body.credential_configured : undefined,
    };
  }
  const data = (res.data ?? {}) as InstanceActionResult;
  return { ...data, ok: data.ok === true };
}

/** O número está conectado, no vocabulário do Evolution ou do WAHA. */
export const isConnectedState = (s: string | null | undefined) => s === 'open' || s === 'connected';

/** Ações de servidor valem só para Evolution e WAHA. */
export const hasServerActions = (provider: string | null | undefined) =>
  !provider || provider === 'evolution' || provider === 'waha';
