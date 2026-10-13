import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';
import { buscarCodigoIbge } from '@/lib/billing/cep';
import {
  dadosFiscaisCompletos,
  mensagemDoErroAoSalvar,
  normalizarDadosFiscais,
  type DadosFiscais,
  type FormularioDadosFiscais,
} from '@/lib/billing/dadosFiscais';

/**
 * "Dados para a nota fiscal" da Conta (tenant_billing_details, uma linha por
 * Conta). O RLS deixa o Gerente da Conta ler e gravar e o superadmin só ler;
 * para os outros a leitura volta vazia.
 *
 * PRIVACIDADE: o erro do banco nunca vai para console nem log — vira uma frase
 * da tela (mensagemDoErroAoSalvar). O gatilho do banco já escreve as mensagens
 * sem o documento.
 */
export const DADOS_FISCAIS_KEY = QUERY_KEYS.BILLING_DETAILS;

const COLUNAS =
  'tenant_id, person_type, tax_id, legal_name, cep, street, number, complement, district, city, city_ibge_code, state, invoice_email, created_at, updated_at, updated_by';

export function useDadosFiscais(contaId: string | null | undefined) {
  const consulta = useQuery({
    queryKey: [DADOS_FISCAIS_KEY, contaId],
    enabled: !!contaId,
    retry: false,
    queryFn: async (): Promise<DadosFiscais | null> => {
      const { data, error } = await supabase
        .from('tenant_billing_details')
        .select(COLUNAS)
        .eq('tenant_id', contaId as string)
        .maybeSingle();
      if (error) throw new Error('Não foi possível carregar os dados para a nota fiscal.');
      return (data as DadosFiscais | null) ?? null;
    },
  });
  const dados = consulta.data ?? null;
  return {
    dados,
    completos: dadosFiscaisCompletos(dados),
    carregando: !!contaId && consulta.isLoading,
    erro: consulta.error as Error | null,
  };
}

export class ErroAoSalvarDadosFiscais extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = 'ErroAoSalvarDadosFiscais';
  }
}

export function useSalvarDadosFiscais(contaId: string | null | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (form: FormularioDadosFiscais): Promise<DadosFiscais> => {
      if (!contaId) throw new ErroAoSalvarDadosFiscais('Conta não encontrada. Recarregue a página.');
      const linha = normalizarDadosFiscais(contaId, form);
      // Endereço digitado à mão (ou CEP sem o código da cidade): tenta o código
      // IBGE pela lista oficial antes de gravar. Se o IBGE não responder, grava
      // sem ele — a emissão resolve pela cidade e UF.
      if (!linha.city_ibge_code) {
        linha.city_ibge_code = await buscarCodigoIbge(linha.city, linha.state).catch(() => null);
      }
      const { data, error } = await supabase
        .from('tenant_billing_details')
        .upsert(linha, { onConflict: 'tenant_id' })
        .select(COLUNAS)
        .single();
      if (error) throw new ErroAoSalvarDadosFiscais(mensagemDoErroAoSalvar(error));
      return data as DadosFiscais;
    },
    onSuccess: (salvo) => {
      queryClient.setQueryData([DADOS_FISCAIS_KEY, contaId], salvo);
    },
  });
}
