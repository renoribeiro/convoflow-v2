// =============================================================================
// report-limits — freio do envio de relatório pela tela (send-report)
// =============================================================================
// Item 14, lote 6 (LOW): qualquer usuário logado mandava e-mail (Resend, com a
// marca ConvoFlow) e WhatsApp (número do sistema) para QUALQUER destinatário,
// quantos quisesse e quantas vezes quisesse. O destinatário continua livre —
// mandar o relatório para o chefe ou para o cliente é o uso normal —, mas com
// teto por envio, teto por hora e nome do relatório curto (o nome vai no
// assunto e no corpo).
//
// Uso real medido em 2026-09-30: no máximo 1 destinatário por envio e 2 envios
// por pessoa por hora. Os tetos ficam bem acima disso.
//
// Regra pura, zero I/O (mesma convenção de instance-access.ts), para o Vitest.
// =============================================================================

export const MAX_RECIPIENTS_PER_CHANNEL = 10;
export const MAX_SENDS_PER_HOUR = 20;
export const MAX_REPORT_NAME_LENGTH = 120;

export type ReportLimitViolation =
  | { code: 'TOO_MANY_EMAILS'; message: string }
  | { code: 'TOO_MANY_PHONES'; message: string }
  | { code: 'NAME_TOO_LONG'; message: string }
  | { code: 'RATE_LIMITED'; message: string };

export function checkReportLimits(input: {
  emails: readonly string[];
  phones: readonly string[];
  name: string | null | undefined;
  sentLastHour: number;
}): ReportLimitViolation | null {
  if (input.emails.length > MAX_RECIPIENTS_PER_CHANNEL) {
    return {
      code: 'TOO_MANY_EMAILS',
      message: `Envie para no máximo ${MAX_RECIPIENTS_PER_CHANNEL} e-mails de cada vez.`,
    };
  }
  if (input.phones.length > MAX_RECIPIENTS_PER_CHANNEL) {
    return {
      code: 'TOO_MANY_PHONES',
      message: `Envie para no máximo ${MAX_RECIPIENTS_PER_CHANNEL} números de WhatsApp de cada vez.`,
    };
  }
  if ((input.name ?? '').length > MAX_REPORT_NAME_LENGTH) {
    return {
      code: 'NAME_TOO_LONG',
      message: `O nome do relatório pode ter no máximo ${MAX_REPORT_NAME_LENGTH} caracteres.`,
    };
  }
  if (input.sentLastHour >= MAX_SENDS_PER_HOUR) {
    return {
      code: 'RATE_LIMITED',
      message: `Você já enviou ${MAX_SENDS_PER_HOUR} relatórios na última hora. Tente de novo mais tarde.`,
    };
  }
  return null;
}
