import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { callMetaSetup } from '@/services/metaApi';
import type { OfficialInstanceInput } from '@/lib/validations/whatsappInstance';

type CreateMetaInstanceInput = OfficialInstanceInput;

interface UseMetaApiReturn {
  loading: boolean;
  createInstance: (input: CreateMetaInstanceInput, tenantId?: string) => Promise<void>;
  verifyConnection: (instanceId: string) => Promise<{ ok: boolean; error?: string }>;
}

export const useMetaApi = (): UseMetaApiReturn => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  /**
   * Formulário manual (app próprio na Meta). Desde o lote 6b (2026-10-29) o
   * navegador não grava a linha: manda tudo para `whatsapp-meta-setup`
   * (modo `create_manual`), que confere a Loja, valida a chave na Meta e só
   * então salva, na Loja aberta no topo. Antes a linha nascia aqui, na Conta
   * do perfil, e era apagada se a Meta recusasse.
   */
  const createInstance = async (input: CreateMetaInstanceInput, tenantId?: string) => {
    setLoading(true);
    try {
      const setupResult = await callMetaSetup({
        mode: 'create_manual',
        ...(tenantId ? { tenant_id: tenantId } : {}),
        name: input.name,
        phone_number_id: input.phoneNumberId,
        waba_id: input.wabaId,
        access_token: input.accessToken,
        graph_api_version: input.graphApiVersion,
      });

      if (!setupResult.ok) {
        throw new Error(setupResult.error || 'Não foi possível validar os dados na Meta.');
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });

      toast({
        title: 'Sucesso',
        description: setupResult.phoneNumberDisplay
          ? `Número da API Oficial conectado (${setupResult.phoneNumberDisplay}).`
          : 'Número da API Oficial conectado.',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro desconhecido';
      logger.error('useMetaApi.createInstance falhou', { message });
      toast({ title: 'Não deu certo', description: message, variant: 'destructive' });
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
