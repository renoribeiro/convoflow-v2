// =============================================================================
// subscriptionView — o que a tela de Assinatura diz sobre a assinatura da Conta
// =============================================================================
// Puro (sem React), para o texto de cada status ficar preso em teste. Quem lê o
// estado é a linha de `tenants`, que o stripe-webhook mantém igual à assinatura
// do Stripe (ver supabase/functions/_shared/subscription-state.ts).
//
// Isto DESCREVE o estado de uma assinatura que existe — "você está no teste até
// tal dia". Não é o lugar de anunciar o teste grátis como vantagem: isso é a
// página de vendas e os Termos (entrega 4 do teste grátis).
// =============================================================================

import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { subscriptionUnlocks } from '@/lib/access/tenantAccess';
import { PLAN_NAME, PLAN_PRICE_LABEL, SUPORTE_EMAIL } from '@/lib/billing/checkout';

export interface SubscriptionRow {
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  subscription_will_cancel?: boolean | null;
  subscription_cancel_at?: string | null;
}

export type BadgeTone = 'ativo' | 'teste' | 'pendente' | 'nenhum';

export interface SubscriptionAlert {
  tone: 'destructive' | 'default';
  title: string;
  description: string;
}

export interface SubscriptionView {
  /** A Conta tem assinatura (ativa, em teste ou com pagamento pendente). */
  hasSubscription: boolean;
  badge: { tone: BadgeTone; label: string } | null;
  title: string;
  description: string;
  alert: SubscriptionAlert | null;
}

function data(isoOrNull: string | null | undefined): string | null {
  if (!isoOrNull) return null;
  const d = new Date(isoOrNull);
  return Number.isNaN(d.getTime()) ? null : format(d, 'dd/MM/yyyy', { locale: ptBR });
}

export function describeSubscription(row: SubscriptionRow): SubscriptionView {
  const status = row.subscription_status ?? null;
  const hasSubscription = subscriptionUnlocks(status);
  const fimDoTeste = data(row.trial_ends_at);
  const cancelaEm = row.subscription_will_cancel ? data(row.subscription_cancel_at) : null;

  // ------------------------------------------------------------ teste grátis
  if (status === 'trialing') {
    if (cancelaEm) {
      return {
        hasSubscription,
        badge: { tone: 'teste', label: 'EM TESTE' },
        title: PLAN_NAME,
        description: `Você está no teste grátis${fimDoTeste ? ` até ${fimDoTeste}` : ''}.`,
        alert: {
          tone: 'default',
          title: 'Cancelamento agendado',
          description: `Nada será cobrado. O sistema continua liberado até ${cancelaEm}, quando o teste termina e a assinatura é encerrada. Mudou de ideia? Clique em "Desfazer cancelamento" antes dessa data.`,
        },
      };
    }
    return {
      hasSubscription,
      badge: { tone: 'teste', label: 'EM TESTE' },
      title: PLAN_NAME,
      description: `Você está no teste grátis${fimDoTeste ? ` até ${fimDoTeste}` : ''}.`,
      alert: {
        tone: 'default',
        title: fimDoTeste ? `Teste grátis até ${fimDoTeste}` : 'Teste grátis',
        description: `Nada foi cobrado ainda. No fim do teste, o cartão cadastrado no checkout é cobrado em ${PLAN_PRICE_LABEL}/mês.`,
      },
    };
  }

  // ------------------------------------------------------ pagamento pendente
  if (status === 'past_due') {
    return {
      hasSubscription,
      badge: { tone: 'pendente', label: 'PAGAMENTO PENDENTE' },
      title: PLAN_NAME,
      description: 'A última cobrança não passou no cartão.',
      alert: {
        tone: 'destructive',
        title: 'Atualize o cartão para não perder o acesso',
        description:
          'Não conseguimos cobrar o seu cartão. O sistema continua liberado enquanto o Stripe tenta cobrar de novo, mas, se todas as tentativas falharem, a Conta inteira é bloqueada. ' +
          `Clique em "Atualizar cartão" e cadastre um cartão válido para as próximas tentativas de cobrança. Não é o Gerente da Conta, ou o botão não abriu? Fale com ${SUPORTE_EMAIL}.`,
      },
    };
  }

  // ---------------------------------------------------------------- ativa
  if (status === 'active') {
    return {
      hasSubscription,
      badge: { tone: 'ativo', label: 'ATIVO' },
      title: PLAN_NAME,
      description: 'Sua assinatura está ativa. Aproveite todos os recursos!',
      alert: cancelaEm
        ? {
          tone: 'default',
          title: 'Cancelamento agendado',
          description: `O sistema continua liberado até ${cancelaEm}, fim do período já pago. Não há novas cobranças. Mudou de ideia? Clique em "Desfazer cancelamento" antes dessa data.`,
        }
        : null,
    };
  }

  // ------------------------------------------------------- sem assinatura
  const motivo =
    status === 'unpaid'
      ? 'A assinatura foi suspensa porque o pagamento não foi concluído.'
      : status === 'canceled'
        ? 'A assinatura foi cancelada.'
        : 'Você ainda não tem uma assinatura ativa.';
  return {
    hasSubscription,
    badge: null,
    title: 'Sem assinatura ativa',
    description: 'Assine para desbloquear todos os recursos.',
    alert: { tone: 'destructive', title: 'Nenhuma assinatura', description: motivo },
  };
}

// =============================================================================
// Selo de acesso na lista de usuários do superadmin
// =============================================================================
// Antes era "Pago" só para 'active', e uma Conta em teste grátis aparecia como
// "Bloqueado" — em vermelho, com o sistema aberto para ela. A ordem é a mesma
// da trava (assinatura antes de liberação manual).

export type AccessLabelTone = 'pago' | 'teste' | 'pendente' | 'manual' | 'bloqueado';

export interface AccessLabel {
  tone: AccessLabelTone;
  label: string;
  /** Linha de apoio (ex.: cancelamento agendado). */
  note: string | null;
}

export function adminAccessLabel(
  row: (SubscriptionRow & { manual_access_granted?: boolean | null }) | null | undefined,
): AccessLabel {
  const status = row?.subscription_status ?? null;
  const cancelaEm = row?.subscription_will_cancel ? data(row.subscription_cancel_at) : null;
  const note = cancelaEm ? `cancela em ${cancelaEm}` : null;

  if (status === 'active') return { tone: 'pago', label: 'Pago', note };
  if (status === 'trialing') {
    const fim = data(row?.trial_ends_at);
    return { tone: 'teste', label: fim ? `Em teste até ${fim}` : 'Em teste', note };
  }
  if (status === 'past_due') return { tone: 'pendente', label: 'Pagamento pendente', note };
  if (row?.manual_access_granted) return { tone: 'manual', label: 'Manual (Liberado)', note: null };
  return { tone: 'bloqueado', label: 'Bloqueado', note: null };
}
