// =============================================================================
// Cancelar / desfazer / trocar o cartão — o que a tela mostra e o que ela diz
// =============================================================================
// Puro (sem React), para o texto e as regras ficarem presos em teste
// (src/lib/billing/subscriptionActions.test.ts). Quem decide de verdade é a
// edge function manage-subscription: só o Gerente, só a própria Conta. Aqui é
// só o que aparece na tela.
// =============================================================================

export type CancelPhase = 'trial' | 'paid';

export interface SubscriptionActionInput {
  isGerente: boolean;
  status: string | null | undefined;
  willCancel: boolean | null | undefined;
}

export interface SubscriptionActions {
  /** Botão "Cancelar assinatura". */
  cancel: boolean;
  /** Botão "Desfazer cancelamento" — só com cancelamento agendado. */
  undo: boolean;
  /** Botão "Atualizar cartão" (portal do Stripe, só troca de cartão). */
  updateCard: boolean;
}

const NADA: SubscriptionActions = { cancel: false, undo: false, updateCard: false };

export function subscriptionActions(i: SubscriptionActionInput): SubscriptionActions {
  if (!i.isGerente) return NADA;
  const status = i.status ?? null;
  const agendado = i.willCancel === true;
  const viva = status === 'trialing' || status === 'active' || status === 'past_due';
  if (!viva) return NADA;
  return {
    // Com pagamento pendente não se agenda cancelamento pelo produto: a tela
    // manda atualizar o cartão (ou falar com o suporte).
    cancel: !agendado && (status === 'trialing' || status === 'active'),
    undo: agendado,
    // No teste com cancelamento agendado o cartão fica guardado sem uso; trocar
    // o cartão ali o tornaria padrão de novo (o servidor também recusa).
    updateCard: !(status === 'trialing' && agendado),
  };
}

/** "03/10/2026", no fuso de Brasília. */
export function dataCurta(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export interface CancelConfirmation {
  title: string;
  paragraphs: string[];
  confirmLabel: string;
  keepLabel: string;
}

/**
 * O texto da confirmação, diferente para o teste e para o período pago. Diz o
 * que acontece e em que data. Sem data (o Stripe não devolveu), não inventa:
 * fala "no fim do teste" / "no fim do período já pago".
 */
export function cancelConfirmation(phase: CancelPhase, endsAtIso: string | null | undefined): CancelConfirmation {
  const data = dataCurta(endsAtIso);

  if (phase === 'trial') {
    const quando = data ? `até ${data}, quando o teste termina` : 'até o fim do teste';
    const depois = data ? `Depois de ${data}` : 'Depois do fim do teste';
    const ate = data ? `Até ${data}` : 'Até o fim do teste';
    return {
      title: 'Cancelar o teste grátis?',
      paragraphs: [
        `Você continua usando o ConvoFlow ${quando}.`,
        'Nessa data a assinatura é encerrada e nada é cobrado no seu cartão. O cartão fica guardado, mas sem uso.',
        `${depois}, o sistema fica bloqueado para você e para todas as Lojas da Conta.`,
        `${ate}, dá para desfazer o cancelamento aqui mesmo.`,
      ],
      confirmLabel: 'Cancelar o teste',
      keepLabel: 'Manter o teste',
    };
  }

  const pagoAte = data ? `Você já pagou até ${data} e continua usando o ConvoFlow até essa data.` : 'Você continua usando o ConvoFlow até o fim do período já pago.';
  const depois = data ? `Depois de ${data}` : 'Depois do fim do período já pago';
  const ate = data ? `Até ${data}` : 'Até o fim do período já pago';
  return {
    title: 'Cancelar a assinatura?',
    paragraphs: [
      pagoAte,
      'Não haverá nova cobrança. Não há reembolso proporcional dos dias que faltam.',
      `${depois}, o sistema fica bloqueado para você e para todas as Lojas da Conta.`,
      `${ate}, dá para desfazer o cancelamento aqui mesmo.`,
    ],
    confirmLabel: 'Cancelar a assinatura',
    keepLabel: 'Manter a assinatura',
  };
}
