import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';
import type { WahaInstanceInput } from '@/lib/validations/whatsappInstance';

interface UseWahaApiReturn {
  loading: boolean;
  createInstance: (input: WahaInstanceInput) => Promise<void>;
}

/**
 * Faz handshake mínimo contra o servidor WAHA antes de salvar a instância:
 *  1. Pinga /api/health para garantir que a URL responde.
 *  2. POST /api/sessions (idempotente) para criar/atualizar a sessão com o
 *     webhook do Supabase já configurado.
 * Ver `.agent/skills/waha/SKILL.md` §2.3 e §11.
 */
async function provisionWahaSession(params: {
  baseUrl: string;
  apiKey: string;
  sessionName: string;
  webhookUrl: string;
}): Promise<void> {
  const { baseUrl, apiKey, sessionName, webhookUrl } = params;

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (apiKey) authHeaders['X-Api-Key'] = apiKey;

  const healthRes = await fetch(`${baseUrl}/api/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  }).catch((e) => {
    throw new Error(`Não foi possível alcançar o servidor WAHA: ${e?.message || e}`);
  });
  if (!healthRes.ok) {
    throw new Error(`Servidor WAHA respondeu ${healthRes.status} em /api/health.`);
  }

  const sessionRes = await fetch(`${baseUrl}/api/sessions`, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      name: sessionName,
      start: true,
      config: {
        webhooks: [
          {
            url: webhookUrl,
            events: ['message', 'message.ack', 'session.status'],
            retries: { delaySeconds: 2, attempts: 5 },
          },
        ],
      },
    }),
  });

  // 200/201 = criada; 409/422 = pode já existir — tentamos PUT para atualizar.
  if (sessionRes.ok) return;

  if (sessionRes.status === 409 || sessionRes.status === 422) {
    const updateRes = await fetch(
      `${baseUrl}/api/sessions/${encodeURIComponent(sessionName)}`,
      {
        method: 'PUT',
        headers: authHeaders,
        body: JSON.stringify({
          config: {
            webhooks: [
              {
                url: webhookUrl,
                events: ['message', 'message.ack', 'session.status'],
                retries: { delaySeconds: 2, attempts: 5 },
              },
            ],
          },
        }),
      },
    );
    if (!updateRes.ok) {
      const text = await updateRes.text().catch(() => '');
      throw new Error(`Falha ao atualizar sessão WAHA (${updateRes.status}): ${text}`);
    }
    return;
  }

  if (sessionRes.status === 401 || sessionRes.status === 403) {
    throw new Error('API Key WAHA inválida. Verifique o cabeçalho X-Api-Key.');
  }

  const text = await sessionRes.text().catch(() => '');
  throw new Error(`Falha ao criar sessão WAHA (${sessionRes.status}): ${text}`);
}

export const useWahaApi = (): UseWahaApiReturn => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createInstance = async (input: WahaInstanceInput) => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');

      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();
      if (!profile?.tenant_id) throw new Error('Conta do usuário não encontrada');

      const baseUrl = input.serverUrl.replace(/\/+$/, '');
      const apiKey = input.apiKey || '';
      const sessionName = input.sessionName;
      const webhookUrl = `${env.get('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/waha-webhook`;

      try {
        await provisionWahaSession({ baseUrl, apiKey, sessionName, webhookUrl });
      } catch (provErr) {
        logger.warn('Falha ao provisionar sessão WAHA remotamente', {
          message: provErr instanceof Error ? provErr.message : provErr,
        });
        toast({
          title: 'Atenção',
          description:
            'A instância foi salva, mas não consegui criar/atualizar a sessão no servidor WAHA automaticamente. ' +
            'Faça isso manualmente pelo painel WAHA.',
        });
      }

      const connectionConfig = {
        baseUrl,
        apiKey,
        sessionName,
        webhookUrl,
      };

      const { error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({
          tenant_id: profile.tenant_id,
          name: input.name,
          instance_key: sessionName,
          provider: 'waha',
          status: 'disconnected',
          // @ts-expect-error generated types may not yet include connection_config
          connection_config: connectionConfig,
        });

      if (insertError) {
        logger.error('Erro ao inserir instância WAHA', { error: insertError });
        throw new Error(insertError.message);
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Instância WAHA criada',
        description:
          'Sessão configurada com o webhook do Supabase. Faça o pareamento no painel WAHA (Swagger /docs).',
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
