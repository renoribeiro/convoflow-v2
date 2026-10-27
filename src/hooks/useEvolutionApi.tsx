import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';

export interface CreateInstanceOptions {
  enableWebhookAutomation?: boolean;
  retryAttempts?: number;
  retryDelay?: number;
  /** Nome legível digitado pelo usuário. Sem ele, a linha nasce com a chave técnica no lugar do nome. */
  displayName?: string;
}

interface UseEvolutionApiReturn {
  loading: boolean;
  createInstance: (name: string, webhookUrl?: string, options?: CreateInstanceOptions) => Promise<any>;
}

/**
 * Cria um número Evolution pelo SERVIDOR (edge function `evolution-provision`).
 *
 * É o que sobrou do antigo cliente do Evolution no navegador. Até a sessão 3
 * do docs/RUNBOOK_segredos_das_instancias.md (2026-10-26) este hook montava um
 * serviço com a chave GLOBAL do servidor Evolution (lida de
 * `tenants.settings.evolutionApi` ou de `VITE_EVOLUTION_*`), que enxerga as
 * instâncias de todos os clientes. Ele não era mais usado por ninguém e saiu,
 * junto com o histórico pelo navegador e o store do Evolution. Estado, QR,
 * desconectar e envio também vão pelo servidor (instanceActions.ts e
 * ServerSendAdapter). A chave da instância criada fica no cofre; nada dela
 * volta para cá.
 */
export const useEvolutionApi = (): UseEvolutionApiReturn => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createInstance = async (name: string, _webhookUrl?: string, options?: CreateInstanceOptions) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('evolution-provision', {
        body: {
          instance_key: name,
          name: options?.displayName?.trim() || name,
          enableWebhookAutomation: options?.enableWebhookAutomation ?? true,
          retryAttempts: options?.retryAttempts,
          retryDelay: options?.retryDelay,
        },
      });

      // `functions.invoke` devolve a frase genérica "non-2xx status code" e
      // esconde o texto real no corpo da resposta. O helper da casa abre esse
      // corpo — sem ele o usuário volta a ver erro que não explica nada.
      if (error) {
        throw new Error(await mensagemDaEdgeFunction(error, 'Não foi possível conectar o número. Tente de novo em instantes.'));
      }
      if (data && data.ok === false) {
        throw new Error(data.error || 'Não foi possível conectar o número. Tente de novo em instantes.');
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Número criado',
        description: data?.webhook_configured
          ? 'Agora leia o QR Code com o celular do número.'
          : 'Agora leia o QR Code com o celular do número. Se as mensagens não entrarem, fale com o suporte do ConvoFlow.',
      });

      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Não foi possível conectar o número.';
      logger.error('[useEvolutionApi] Erro ao criar instância', { error: errorMessage });
      toast({
        title: 'Número não conectado',
        description: errorMessage,
        variant: 'destructive',
      });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { loading, createInstance };
};
