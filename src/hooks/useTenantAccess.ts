import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant, useRole } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { logger } from '@/lib/logger';
import {
  normalizeAccessDecision,
  resolveTenantAccess,
  type AccessDecision,
  type AccessSource,
} from '@/lib/access/tenantAccess';

export type { AccessSource };

export interface TenantAccess {
  /** Ainda carregando o tenant/role/acesso — não decida nada ainda. */
  loading: boolean;
  /** Conta tem acesso liberado (pago, manual, ou perfil com bypass). */
  unlocked: boolean;
  /** Conta deve ver o paywall (já carregou e não tem acesso). */
  locked: boolean;
  /** De onde vem o acesso. */
  source: AccessSource;
}

const CARREGANDO: TenantAccess = {
  loading: true,
  unlocked: false,
  locked: false,
  source: 'locked',
};

const BYPASS: TenantAccess = {
  loading: false,
  unlocked: true,
  locked: false,
  source: 'bypass',
};

const decidido = (d: AccessDecision): TenantAccess => ({
  loading: false,
  unlocked: d.unlocked,
  locked: !d.unlocked,
  source: d.source,
});

/**
 * Decide se o usuário atual pode usar o sistema (paywall).
 *
 * Regras:
 *   - superadmin: sempre liberado (bypass), sem consulta. É quem opera a
 *     plataforma; trancá-lo trancaria também quem conserta o bloqueio.
 *   - gerente: NÃO tem mais bypass (mudança de 2026-08-19). O acesso dele vem
 *     da própria Conta, avaliada como a de qualquer um. Ele é o único cargo que
 *     pode resolver o pagamento, e é a PaywallScreen que carrega esse caminho —
 *     ver o comentário lá.
 *   - gestor/atendente: o acesso vem da CONTA. Como o tenant deles é uma Loja e
 *     o RLS de `tenants` não deixa uma Loja ler a Conta pai, quem responde é a
 *     função `public.tenant_access_state` (migração 20260818000001), que sobe
 *     para o pai e devolve só dois valores: liberado e por quê.
 *   - Loja órfã (sem `parent_tenant_id`) responde por si mesma. Nenhuma existe
 *     em produção desde 2026-08-20 (`docs/remover_lojas_orfas.sql`), mas a
 *     regra continua: o schema permite criar uma, e sem este caminho ela
 *     nasceria trancada sem ter como ser liberada.
 *
 * QUAL LINHA É PERGUNTADA. Para o gerente é sempre a PRÓPRIA Conta
 * (`profile.tenant_id`), nunca a Loja que ele esteja visitando pelo seletor:
 * quem assina é a Conta, e a Loja herda dela. Isso também deixa a chave de
 * cache estável enquanto ele troca de Loja — trocar de Loja não refaz a
 * consulta de acesso, porque a resposta é a mesma.
 *
 * DEGRADAÇÃO. Se a RPC falhar (função ainda não aplicada em produção, rede
 * caindo), o hook NÃO tranca ninguém: cai para a avaliação da linha que já está
 * carregada, que é exatamente o comportamento anterior a esta mudança. Sem
 * isso, subir o frontend antes de rodar o SQL colocaria todo mundo no paywall.
 *
 * `locked` NUNCA é verdadeiro enquanto a consulta está no ar — quem está
 * esperando resposta continua em `loading`, e o DashboardLayout mostra o
 * carregando em vez de piscar o paywall na cara de quem tem acesso.
 */
export function useTenantAccess(): TenantAccess {
  const role = useRole();
  const { tenant, profile, loading } = useTenant();
  const tenantId = tenant?.id ?? null;

  // Superadmin e SÓ ele. O gerente saiu daqui em 2026-08-19: ele passou a ser
  // avaliado como todo mundo, e ganhou em troca o caminho de pagamento dentro
  // da própria tela de bloqueio.
  const temBypass = role === 'superadmin';

  // Linha que responde pela cobrança deste usuário.
  const contaDeCobranca =
    role === 'gerente' ? ((profile?.tenant_id as string | null) ?? tenantId) : tenantId;

  const habilitada = !loading && role !== null && !temBypass && !!contaDeCobranca;

  // Primeiro segmento 'tenant' → faixa estática do cache (ver queryClient.ts).
  // A chave inclui a Conta de cobrança, então trocar de Loja pelo seletor já
  // busca o acesso certo sozinho, sem invalidação manual.
  const consulta = useQuery({
    queryKey: [QUERY_KEYS.TENANT, 'access-state', contaDeCobranca],
    enabled: habilitada,
    // Uma tentativa a mais cobre a queda de rede passageira. Além disso não
    // vale: os dois erros prováveis aqui — função ainda não aplicada e permissão
    // negada — são permanentes, e insistir só prolonga o tempo que a pessoa
    // passa olhando o carregando antes de cair na degradação.
    retry: 1,
    retryDelay: 400,
    queryFn: async (): Promise<AccessDecision> => {
      // Cast local: função nova, fora dos tipos gerados em types.ts.
      const { data, error } = await (supabase as any).rpc('tenant_access_state', {
        p_tenant_id: contaDeCobranca,
      });

      if (error) {
        logger.warn(
          '[useTenantAccess] tenant_access_state falhou; avaliando a linha carregada',
          { tenantId: contaDeCobranca, message: error.message },
        );
        throw error;
      }

      const linha = Array.isArray(data) ? data[0] : data;
      if (!linha) {
        throw new Error('tenant_access_state não devolveu nenhuma linha');
      }
      return normalizeAccessDecision(linha);
    },
  });

  if (loading || role === null) return CARREGANDO;
  if (temBypass) return BYPASS;

  // Sem tenant não há o que avaliar — mesma resposta de antes.
  if (!contaDeCobranca) return decidido({ unlocked: false, source: 'locked' });

  if (consulta.isError) {
    // Degradação: só sabemos avaliar a linha que está em mãos. Quando ela É a
    // linha de cobrança (o caso de todo gestor/atendente e do gerente na
    // própria Conta), avaliamos — `parent` é nulo de propósito.
    if (tenant && tenant.id === contaDeCobranca) {
      return decidido(resolveTenantAccess(tenant, null));
    }

    // Sobra um caso: gerente visitando uma Loja filha, com a linha da Conta
    // fora de alcance (o RLS não a entrega numa consulta comum). Não inventamos
    // bloqueio para quem, até esta mudança, sequer era consultado — o paywall é
    // uma trava comercial no cliente, não a fronteira de segurança. Quem nega
    // dado de verdade é o RLS, e ele não depende disto.
    return BYPASS;
  }

  if (consulta.data) return decidido(consulta.data);

  // Consulta no ar. Nunca `locked` aqui.
  return CARREGANDO;
}
