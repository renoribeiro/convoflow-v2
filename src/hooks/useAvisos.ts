/**
 * Dados da aba Configurações › Avisos para sistemas (webhooks de saída).
 *
 * De quais Lojas a pessoa cuida dos avisos:
 *   gerente     → todas as Lojas da Conta dele (o banco deixa criar, editar e
 *                 apagar nelas desde 20261116000001; nunca na de outra Conta).
 *                 A Conta não tem número e não recebe nada: não entra.
 *   superadmin  → dentro de uma Conta, as Lojas dela; dentro de uma Loja, ela.
 *   gestor      → a própria Loja.
 *
 * Não usa useSupabaseMutation: ele troca o tenant_id pela Loja aberta no topo,
 * e o Gerente cria numa Loja escolhida na própria tela (ou em todas).
 * Escrita barrada pelo RLS volta sem erro e sem linha (lote 6d): toda escrita
 * pede `.select('id')` e trata zero linha como "nada foi gravado".
 */
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { useMyStores } from '@/hooks/useMyStores';
import { corpoDaEdgeFunction } from '@/lib/edgeFunctionError';
import type { EntregaDoAviso, ResultadoDoTeste } from '@/lib/webhooks';

export type { ResultadoDoTeste };

export interface AvisoParaSistema {
  id: string;
  tenant_id: string;
  name: string;
  url: string;
  events: string[];
  is_active: boolean;
  secret: string | null;
  created_at: string;
}

export interface LojaDoAviso {
  id: string;
  name: string;
}

export interface DadosDoAviso {
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  is_active: boolean;
}

const CHAVE = 'webhooks';
const NADA_GRAVADO = 'Nada foi gravado. Recarregue a página e confira se você ainda cuida desta Loja.';
const FALHA_DE_REDE = 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';

/** As Lojas cujos avisos a pessoa vê e mexe, e se ela escolhe a Loja no formulário. */
export function useLojasDosAvisos() {
  const { tenant } = useTenant();
  const role = useRole();
  const ehConta = (tenant as { kind?: string | null } | null)?.kind === 'account';
  const superadminNaConta = role === 'superadmin' && ehConta;
  const { stores, isLoading } = useMyStores({ superadminAccountId: superadminNaConta ? tenant?.id ?? null : null });

  return useMemo(() => {
    const escolhe = role === 'gerente' || superadminNaConta;
    const lojas: LojaDoAviso[] = escolhe
      ? stores.map((s) => ({ id: s.id, name: s.name }))
      : tenant
        ? [{ id: tenant.id, name: tenant.name }]
        : [];
    const lojaAberta = tenant && lojas.some((l) => l.id === tenant.id) ? tenant.id : null;
    return { lojas, escolhe, lojaAberta, carregando: escolhe && isLoading };
  }, [role, superadminNaConta, stores, tenant, isLoading]);
}

export function useAvisos(lojas: LojaDoAviso[]) {
  const ids = lojas.map((l) => l.id).sort();
  return useQuery({
    queryKey: [CHAVE, 'lista', ...ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<AvisoParaSistema[]> => {
      const { data, error } = await supabase
        .from('webhooks')
        .select('id, tenant_id, name, url, events, is_active, secret, created_at')
        .in('tenant_id', ids)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AvisoParaSistema[];
    },
  });
}

/** As últimas entregas de um aviso (só busca quando a lista está aberta). */
export function useEntregasDoAviso(avisoId: string, aberto: boolean) {
  return useQuery({
    queryKey: [CHAVE, 'entregas', avisoId],
    enabled: aberto,
    // Com envio na fila (um Reenviar, por exemplo), confere de novo a cada 5 s
    // até ele sair: a pessoa vê o "Aceito" sem recarregar.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((e) => e.status === 'pending' || e.status === 'processing') ? 5000 : false,
    queryFn: async (): Promise<EntregaDoAviso[]> => {
      const { data, error } = await supabase
        .from('webhook_deliveries')
        .select('id, created_at, event_type, status, attempts, max_attempts, response_status, error_message, teste')
        .eq('webhook_id', avisoId)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []) as EntregaDoAviso[];
    },
  });
}

export function useMexerNosAvisos() {
  const queryClient = useQueryClient();
  const recarregar = () => queryClient.invalidateQueries({ queryKey: [CHAVE] });

  const criar = useMutation({
    mutationFn: async ({ lojas, dados }: { lojas: string[]; dados: DadosDoAviso }) => {
      const linhas = lojas.map((tenant_id) => ({ ...dados, tenant_id }));
      const { data, error } = await supabase.from('webhooks').insert(linhas).select('id');
      if (error) throw error;
      if ((data ?? []).length !== linhas.length) throw new Error(NADA_GRAVADO);
      return data;
    },
    onSuccess: recarregar,
  });

  const salvar = useMutation({
    mutationFn: async ({ id, dados }: { id: string; dados: DadosDoAviso }) => {
      const { data, error } = await supabase.from('webhooks').update(dados).eq('id', id).select('id');
      if (error) throw error;
      if ((data ?? []).length === 0) throw new Error(NADA_GRAVADO);
      return data;
    },
    onSuccess: recarregar,
  });

  const remover = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.from('webhooks').delete().eq('id', id).select('id');
      if (error) throw error;
      if ((data ?? []).length === 0) throw new Error(NADA_GRAVADO);
      return data;
    },
    onSuccess: recarregar,
  });

  const testar = useMutation({
    mutationFn: async (id: string): Promise<ResultadoDoTeste> => {
      let res: { data: unknown; error: unknown } | undefined;
      try {
        res = await supabase.functions.invoke('webhook-teste', { body: { webhook_id: id } });
      } catch {
        return { ok: false, error: FALHA_DE_REDE };
      }
      if (!res) return { ok: false, error: FALHA_DE_REDE };
      if (res.error) {
        const body = await corpoDaEdgeFunction(res.error);
        return { ok: false, error: typeof body?.error === 'string' ? body.error : FALHA_DE_REDE };
      }
      const data = (res.data ?? {}) as ResultadoDoTeste;
      return { ...data, ok: data.ok === true };
    },
    onSuccess: (_r, id) => queryClient.invalidateQueries({ queryKey: [CHAVE, 'entregas', id] }),
  });

  // Reenviar um envio que falhou (reenviar_entrega, 20261116000002): volta para
  // a fila com as 5 tentativas zeradas; o dispatcher manda com as regras de
  // sempre. A recusa vem com a frase pronta.
  const reenviar = useMutation({
    mutationFn: async ({ entregaId }: { entregaId: string; avisoId: string }): Promise<{ ok: boolean; mensagem?: string }> => {
      const { data, error } = await supabase.rpc('reenviar_entrega', { p_entrega: entregaId });
      if (error) throw error;
      const r = (data ?? {}) as { ok?: boolean; mensagem?: string };
      return { ok: r.ok === true, mensagem: typeof r.mensagem === 'string' ? r.mensagem : undefined };
    },
    onSuccess: (_r, { avisoId }) => queryClient.invalidateQueries({ queryKey: [CHAVE, 'entregas', avisoId] }),
  });

  return { criar, salvar, remover, testar, reenviar };
}
