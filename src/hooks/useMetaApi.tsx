import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { callMetaSetup } from '@/services/metaApi';
import type { OfficialInstanceInput } from '@/lib/validations/whatsappInstance';

type CreateMetaInstanceInput = OfficialInstanceInput;

interface UseMetaApiReturn {
  loading: boolean;
  createInstance: (input: CreateMetaInstanceInput) => Promise<void>;
  verifyConnection: (instanceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useMetaApi = (): UseMetaApiReturn => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createInstance = async (input: CreateMetaInstanceInput) => {
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

      const connectionConfig = {
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        graphApiVersion: input.graphApiVersion || 'v20.0',
      };

      const { data: inserted, error: insertError } = await supabase
        .from('whatsapp_instances')
        .insert({
          tenant_id: profile.tenant_id,
          name: input.name,
          instance_key: input.phoneNumberId,
          provider: 'official',
          status: 'connecting',
          connection_config: connectionConfig,
        })
        .select('id')
        .single();

      if (insertError || !inserted) {
        logger.error('Erro ao inserir instância Meta', { error: insertError });
        throw new Error(insertError?.message || 'Falha ao salvar instância');
      }

      const setupResult = await callMetaSetup({
        instance_id: inserted.id,
        mode: 'create',
        access_token: input.accessToken,
        graph_api_version: input.graphApiVersion,
      });

      if (!setupResult.ok) {
        // Rollback: remove the instance row so the user can retry without dupes
        await supabase.from('whatsapp_instances').delete().eq('id', inserted.id);
        throw new Error(setupResult.error || 'Falha ao validar credenciais Meta');
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Sucesso',
        description: setupResult.phoneNumberDisplay
          ? `Instância Meta conectada (${setupResult.phoneNumberDisplay}).`
          : 'Instância Meta conectada com sucesso.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('useMetaApi.createInstance falhou', { message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const verifyConnection = async (instanceId: string) => {
    setLoading(true);
    try {
      const result = await callMetaSetup({ instance_id: instanceId, mode: 'verify' });
      if (!result.ok) {
        toast({
          title: 'Falha na verificação',
          description: result.error || 'Não foi possível validar a conexão Meta',
          variant: 'destructive',
        });
        return { ok: false, error: result.error };
      }
      toast({
        title: 'Conexão Meta válida',
        description: result.phoneNumberDisplay
          ? `Número verificado: ${result.phoneNumberDisplay}`
          : 'Token e Phone Number ID validados.',
      });
      return { ok: true };
    } finally {
      setLoading(false);
    }
  };

  return { loading, createInstance, verifyConnection };
};
