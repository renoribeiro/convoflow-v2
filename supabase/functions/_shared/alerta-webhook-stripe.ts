// =============================================================================
// alerta-webhook-stripe (núcleo) — o aviso ao superadmin quando o webhook falha
// =============================================================================
// Sessão 4 do cadastro pelo site (migração 20261110000001). O stripe-webhook
// chama avisarFalhaDoWebhook quando responde erro: segredo ausente, assinatura
// que não confere, ou falha ao gravar a assinatura ou a cobrança.
//
//   1. public.alerta_falha_webhook_stripe põe o aviso no sino de todo
//      superadmin ativo, no máximo um a cada 30 minutos (devolve false dentro
//      da janela: nada a fazer);
//   2. quando o sino avisou, manda UM email aos superadmins pelo Resend
//      (RESEND_API_KEY e REPORT_FROM_EMAIL, os mesmos dos relatórios).
//
// Nunca lança e nunca muda a resposta do webhook: o Stripe continua recebendo
// o mesmo 400/500 e reenvia como sempre. O aviso não leva cliente, valor nem id.
//
// Sem Deno aqui: o Vitest testa (src/lib/billing/alertaWebhookStripe.test.ts).
// =============================================================================

export type TipoDeFalhaDoWebhook = 'sem_segredo' | 'assinatura' | 'processamento';

export interface FalhaDoWebhook {
  tipo: TipoDeFalhaDoWebhook;
  /** Tipo do evento do Stripe (ex.: invoice.paid), quando já se sabe. */
  evento?: string | null;
}

export type ResultadoDoAviso = 'avisado' | 'avisado_sem_email' | 'ja_avisado' | 'erro';

export interface DepsDoAviso {
  rpc(fn: string, args?: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
  getEnv(name: string): string | undefined;
  enviar(opts: { apiKey: string; from: string; to: string[]; subject: string; html: string }): Promise<unknown>;
  log(nivel: 'info' | 'warn' | 'error', msg: string): void;
}

export const LINK_DO_FATURAMENTO = 'https://www.convoflow.com.br/dashboard/admin?tab=billing';
const LINK_DOS_WEBHOOKS = 'https://dashboard.stripe.com/workbench/webhooks';

/** Só letras, números, ponto e sublinhado: o tipo de evento do Stripe e nada mais. */
export function eventoLimpo(evento: string | null | undefined): string | null {
  const t = (evento ?? '').trim();
  return /^[a-z0-9_.]{1,80}$/i.test(t) ? t : null;
}

/** O assunto e o corpo do email. */
export function montarAvisoDoWebhook(falha: FalhaDoWebhook): { subject: string; html: string } {
  const evento = eventoLimpo(falha.evento);
  const oQue: Record<TipoDeFalhaDoWebhook, string> = {
    sem_segredo:
      'O servidor está sem o segredo do webhook do Stripe (STRIPE_WEBHOOK_SECRET). Nenhum pagamento, teste ou cancelamento está sendo registrado.',
    assinatura:
      'Chegou ao webhook um aviso com assinatura que não confere. Pode ser alguém de fora testando o endereço. Se repetir, o segredo do webhook no Supabase não é o do endpoint do Stripe, e nenhum pagamento está sendo registrado.',
    processamento: `Um aviso do Stripe${evento ? ` (${evento})` : ''} chegou mas não foi gravado. O Stripe tenta de novo sozinho por até 3 dias. Se repetir, uma Conta pode ficar com a assinatura, o teste ou a cobrança desatualizados.`,
  };
  const subject =
    falha.tipo === 'processamento' ? 'ConvoFlow: um aviso do Stripe não foi gravado' : 'ConvoFlow: o webhook do Stripe está recusando avisos';
  const html = [
    '<p>Olá,</p>',
    `<p>${oQue[falha.tipo]}</p>`,
    '<p>Onde olhar: no Stripe, em Workbench › Webhooks, as entregas com erro do endpoint ',
    '<code>…/functions/v1/stripe-webhook</code>; no Supabase, o log da função stripe-webhook.</p>',
    `<p><a href="${LINK_DO_FATURAMENTO}">Ver o faturamento no ConvoFlow</a> · <a href="${LINK_DOS_WEBHOOKS}">Webhooks no Stripe</a></p>`,
    '<p>Este aviso sai no máximo uma vez a cada 30 minutos.</p>',
  ].join('');
  return { subject, html };
}

/** Avisa o superadmin. Nunca lança. */
export async function avisarFalhaDoWebhook(deps: DepsDoAviso, falha: FalhaDoWebhook): Promise<ResultadoDoAviso> {
  try {
    const { data, error } = await deps.rpc('alerta_falha_webhook_stripe', {
      p_tipo: falha.tipo,
      p_evento: eventoLimpo(falha.evento),
    });
    if (error) {
      deps.log('error', 'aviso de falha do webhook: o sino não gravou');
      return 'erro';
    }
    if (data !== true) return 'ja_avisado';

    const apiKey = deps.getEnv('RESEND_API_KEY');
    const from = deps.getEnv('REPORT_FROM_EMAIL');
    if (!apiKey || !from) {
      deps.log('warn', 'aviso de falha do webhook: sem RESEND_API_KEY ou REPORT_FROM_EMAIL; só o sino avisou');
      return 'avisado_sem_email';
    }
    const { data: emails, error: emailsError } = await deps.rpc('emails_dos_superadmins');
    const to = ((emails ?? []) as unknown[]).filter((e): e is string => typeof e === 'string' && e.includes('@'));
    if (emailsError || to.length === 0) {
      deps.log('warn', 'aviso de falha do webhook: sem superadmin com email; só o sino avisou');
      return 'avisado_sem_email';
    }
    const { subject, html } = montarAvisoDoWebhook(falha);
    await deps.enviar({ apiKey, from, to, subject, html });
    deps.log('info', `aviso de falha do webhook enviado (${falha.tipo})`);
    return 'avisado';
  } catch (e) {
    deps.log('error', `aviso de falha do webhook falhou: ${e instanceof Error ? e.message.slice(0, 200) : String(e)}`);
    return 'erro';
  }
}
