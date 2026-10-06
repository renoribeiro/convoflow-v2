import { supabase } from '@/integrations/supabase/client';

export interface MetaSetupRequest {
  instance_id: string;
  mode: 'create' | 'verify';
  access_token?: string;
  graph_api_version?: string;
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
    return { ok: false, error: error.message };
  }
  if (!data) {
    return { ok: false, error: 'Resposta vazia da função whatsapp-meta-setup' };
  }
  return data;
};
