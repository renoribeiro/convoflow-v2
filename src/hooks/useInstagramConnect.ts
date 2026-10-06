import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';
import type { InstagramConnectSuccess } from '@/lib/instagram/connectFlow';

/**
 * Fatia 4b do Instagram: a tela fala com o servidor por aqui.
 *
 *   enabled    `instagram_connect_enabled(Loja)` — a chave do superadmin, o
 *              cargo e o alcance, decididos no banco. Qualquer erro = false:
 *              o botão some em vez de aparecer e falhar.
 *   start      pede à edge function a URL de autorização e leva o navegador
 *              para o Instagram.
 *   complete   conclui na volta, com a sessão de quem está logado.
 *   setActive  desliga / religa (`set_instagram_account_active`).
 *
 * As RPCs novas ainda não estão nos tipos gerados — cast local, como em
 * SystemSettings com system_settings.
 */

type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null } | undefined>;
const rpc = (fn: string, args: Record<string, unknown>) => (supabase.rpc as unknown as Rpc)(fn, args);

export type InstagramServerResult =
  | ({ ok: true } & InstagramConnectSuccess)
  | { ok: false; reason: string; message: string };

export function useInstagramConnectEnabled(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ['instagram-connect-enabled', tenantId],
    enabled: !!tenantId,
    queryFn: async (): Promise<boolean> => {
      try {
        const res = await rpc('instagram_connect_enabled', { p_tenant_id: tenantId });
        if (!res || res.error) return false;
        return res.data === true;
      } catch {
        return false;
      }
    },
  });
}

async function invoke(body: Record<string, unknown>, fallback: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('instagram-connect', { body });
  if (error) return { ok: false, reason: 'server', message: await mensagemDaEdgeFunction(error, fallback) };
  return (data ?? { ok: false, reason: 'server', message: fallback }) as Record<string, unknown>;
}

/**
 * Leva o navegador ao Instagram. Só volta (com a recusa) se o servidor não
 * deixou começar; no caminho feliz a página sai daqui.
 */
export async function startInstagramConnect(p: {
  tenantId: string | null;
  instanceId: string | null;
}): Promise<{ ok: false; message: string } | { ok: true }> {
  const r = await invoke(
    { action: 'start', tenantId: p.tenantId, instanceId: p.instanceId },
    'Não foi possível iniciar a conexão com o Instagram.',
  );
  if (r.ok !== true || typeof r.url !== 'string') {
    return { ok: false, message: String(r.message ?? 'Não foi possível iniciar a conexão com o Instagram.') };
  }
  window.location.assign(r.url);
  return { ok: true };
}

export async function completeInstagramConnect(code: string, state: string): Promise<InstagramServerResult> {
  const r = await invoke({ action: 'complete', code, state }, 'Não foi possível concluir a conexão com o Instagram.');
  if (r.ok === true) return r as unknown as InstagramServerResult;
  return { ok: false, reason: String(r.reason ?? 'unknown'), message: String(r.message ?? 'Não foi possível concluir a conexão com o Instagram.') };
}

export async function setInstagramAccountActive(
  instanceId: string,
  active: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await rpc('set_instagram_account_active', { p_instance_id: instanceId, p_active: active });
    if (!res || res.error) return { ok: false, message: res?.error?.message ?? 'Não foi possível alterar a conta.' };
    const d = (res.data ?? {}) as Record<string, unknown>;
    if (d.ok === true) return { ok: true };
    return { ok: false, message: String(d.message ?? 'Não foi possível alterar a conta.') };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Não foi possível alterar a conta.' };
  }
}

export async function setInstagramConnectEnabled(
  tenantId: string,
  enabled: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const res = await rpc('set_instagram_connect_enabled', { p_tenant_id: tenantId, p_enabled: enabled });
    if (!res || res.error) return { ok: false, message: res?.error?.message ?? 'Não foi possível salvar.' };
    const d = (res.data ?? {}) as Record<string, unknown>;
    if (d.ok === true) return { ok: true };
    return { ok: false, message: String(d.message ?? 'Não foi possível salvar.') };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Não foi possível salvar.' };
  }
}
