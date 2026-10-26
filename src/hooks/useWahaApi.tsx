import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { corpoDaEdgeFunction } from '@/lib/edgeFunctionError';
import type { WahaInstanceInput } from '@/lib/validations/whatsappInstance';

interface UseWahaApiReturn {
  loading: boolean;
  createInstance: (input: WahaInstanceInput) => Promise<void>;
}

/**
 * Cadastra um número WAHA pelo SERVIDOR (edge function `waha-provision`).
 *
 * Até 2026-10-26 o navegador falava direto com o servidor WAHA do cliente e
 * gravava endereço e chave na linha da instância, que todo membro da Loja lê.
 * Agora o servidor confere o endereço (recusa rede interna), cria a sessão com
 * uma senha de entrega só deste número e guarda endereço, chave e senha no
 * cofre. A tela manda os campos uma vez e não recebe nenhum deles de volta.
 * Regra: supabase/functions/_shared/waha-provision.ts.
 */
export const useWahaApi = (): UseWahaApiReturn => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createInstance = async (input: WahaInstanceInput) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('waha-provision', {
        body: {
          name: input.name,
          server_url: input.serverUrl,
          api_key: input.apiKey || undefined,
          session_name: input.sessionName,
        },
      });

      if (error) {
        const body = await corpoDaEdgeFunction(error);
        throw new Error(typeof body?.error === 'string' ? body.error : 'Não foi possível cadastrar o número WAHA.');
      }
      if (!data?.ok) {
        throw new Error(data?.error || 'Não foi possível cadastrar o número WAHA.');
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Instância WAHA criada',
        description:
          'A sessão foi criada no seu servidor WAHA com o endereço de entrega do ConvoFlow. Agora clique no QR Code do número para conectar.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('useWahaApi.createInstance falhou', { message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, createInstance };
};
