import { supabase } from '@/integrations/supabase/client';

export type AcaoNfseAdmin =
  | { acao: 'baixar'; nota_id: string; tipo: 'pdf' | 'xml' }
  | { acao: 'reemitir'; charge_id: string }
  | { acao: 'cancelar'; nota_id: string };

/** Chama a função nfse-admin; erro volta como Error com a mensagem em pt-BR do servidor. */
export async function chamarNfseAdmin<T>(corpo: AcaoNfseAdmin): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nfse-admin', { body: corpo });
  if (error) {
    let mensagem = 'Não foi possível concluir a ação. Tente de novo.';
    try {
      const resposta = (error as { context?: Response }).context;
      const corpoErro = resposta ? await resposta.json() : null;
      if (corpoErro && typeof corpoErro.error === 'string') mensagem = corpoErro.error;
    } catch {
      // corpo ilegível: fica a mensagem padrão
    }
    throw new Error(mensagem);
  }
  if (data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string') {
    throw new Error((data as { error: string }).error);
  }
  return data as T;
}
