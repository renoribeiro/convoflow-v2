import { supabase } from '@/integrations/supabase/client';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';

export interface MetaSetupRequest {
  /** create/verify: a linha que já existe. create_manual: não vai (a linha nasce no servidor). */
  instance_id?: string;
  mode: 'create' | 'verify' | 'create_manual';
  access_token?: string;
  graph_api_version?: string;
  /** create_manual: a Loja aberta no topo, conferida no servidor (connect-target.ts). */
  tenant_id?: string;
  name?: string;
  phone_number_id?: string;
  waba_id?: string;
}


export interface MetaSetupResponse {
  ok: boolean;
  error?: string;
  phoneNumberDisplay?: string;
  verifiedName?: string;
}

/**
 * Calls the whatsapp-meta-setup Edge Function.
 *
 * In create mode: stores the access token in Supabase Vault, validates it
 * against the Phone Number ID, and subscribes the App to the WABA.
 *
 * In verify mode: re-runs the validation only.
 */
export const callMetaSetup = async (
  request: MetaSetupRequest,
): Promise<MetaSetupResponse> => {
  const { data, error } = await supabase.functions.invoke<MetaSetupResponse>(
    'whatsapp-meta-setup',
    { body: request },
  );

  if (error) {
    // O corpo traz a frase em português do servidor (Loja errada, número já
    // conectado, Meta recusou); `error.message` é só "non-2xx status code".
    return { ok: false, error: await mensagemDaEdgeFunction(error, 'Não foi possível falar com a Meta agora. Tente de novo em instantes.') };
  }
  if (!data) {
    return { ok: false, error: 'Resposta vazia da função whatsapp-meta-setup' };
  }
  return data;
};
