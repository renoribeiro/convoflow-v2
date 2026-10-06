// =============================================================================
// report-scheduler — decide o que está vencido, garante execução única e envia.
// =============================================================================
// Separado da edge function de propósito: aqui não há `Deno`, `serve` nem
// import por URL, então esta lógica é testável pelo Vitest
// (src/lib/reports/reportScheduler.test.ts). A edge function
// process-report-dispatch é só a casca que injeta cliente, secrets e relógio.
//
// ── COMO A EXECUÇÃO ÚNICA É GARANTIDA ────────────────────────────────────────
// Antes de montar qualquer relatório, a agenda é RECLAMADA por um UPDATE
// condicional (compare-and-swap):
//
//     UPDATE report_schedules
//        SET last_run = agora
//      WHERE id = :id AND is_active AND last_run É EXATAMENTE o valor que li
//
// O Postgres serializa os dois UPDATE na mesma linha: o primeiro troca o
// last_run, o segundo não encontra mais a condição e volta com zero linhas.
// Quem recebe zero linhas desiste em silêncio. Duas invocações sobrepostas (dois
// ticks do cron, um retry do pg_net) portanto NÃO enviam o mesmo relatório duas
// vezes — sem tabela de lock, sem coluna nova, sem migração.
//
// Consequência aceita: como o last_run é gravado ANTES do envio, um envio que
// falhe não é repetido dentro da mesma janela. A escolha é deliberada — repetir
// depois de uma falha tardia (Resend já aceitou, resposta se perdeu) mandaria o
// relatório duas vezes, que é pior que atrasar para a próxima ocorrência. A
// falha nunca some: vira linha em report_executions com status 'failed'.
// =============================================================================

import {
  DEFAULT_LOOKBACK_MINUTES,
  DEFAULT_TIME_ZONE,
  frequencyFromCron,
  isDue,
  nextRunAfter,
} from './cron-expression.ts';
import {
  buildReportPayload,
  EMAIL_RE,
  type ReportDb,
  type SendEmailArgs,
} from './report-core.ts';

export interface ReportScheduleRow {
  id: string;
  tenant_id: string;
  name?: string | null;
  cron_expression: string;
  recipients?: unknown;
  parameters?: Record<string, unknown> | null;
  is_active?: boolean;
  last_run?: string | null;
  next_run?: string | null;
}

export type ScheduleRunStatus =
  | 'sent'
  | 'failed'
  | 'skipped_not_due'
  | 'skipped_claimed_elsewhere'
  | 'skipped_invalid_cron';

export interface ScheduleRunResult {
  scheduleId: string;
  tenantId: string;
  status: ScheduleRunStatus;
  recipients?: string[];
  error?: string;
}

export interface SchedulerLogger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
}

export interface RunDueSchedulesOptions {
  db: ReportDb;
  /** Transporte de e-mail já configurado com os secrets. Injetável para teste. */
  sendEmail: (args: SendEmailArgs) => Promise<void>;
  now?: Date;
  timeZone?: string;
  lookbackMinutes?: number;
  maxSchedules?: number;
  logger?: SchedulerLogger;
}

export interface RunDueSchedulesResult {
  considered: number;
  due: number;
  sent: number;
  failed: number;
  skipped: number;
  results: ScheduleRunResult[];
}

const SILENT_LOGGER: SchedulerLogger = { info: () => {}, warn: () => {}, error: () => {} };

/** Destinatários vêm de jsonb: array, string separada por vírgula, ou lixo. */
export function normalizeRecipients(raw: unknown): string[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,;\n]/)
      : [];
  const emails = list
    .map((r) => (typeof r === 'string' ? r.trim() : ''))
    .filter((r) => EMAIL_RE.test(r));
  return [...new Set(emails)];
}

/**
 * Período de dados do relatório agendado.
 *
 * A tela grava `dateRange` desde esta versão. Para agenda antiga (ou gravada
 * fora da tela) o período segue a frequência, que é o que qualquer um espera:
 * relatório semanal fala dos últimos 7 dias.
 */
export function resolveDateRange(
  parameters: Record<string, unknown> | null | undefined,
  cronExpression: string,
): string {
  const explicit = parameters?.dateRange;
  if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();

  const frequency =
    typeof parameters?.frequency === 'string'
      ? (parameters.frequency as string)
      : frequencyFromCron(cronExpression);

  if (frequency === 'daily') return '1day';
  if (frequency === 'monthly') return '30days';
  return '7days';
}

/**
 * Reclama a agenda para esta execução. Ver o cabeçalho do arquivo: é este
 * UPDATE condicional que impede envio duplicado.
 */
async function claimSchedule(
  db: ReportDb,
  schedule: ReportScheduleRow,
  nowIso: string,
): Promise<boolean> {
  let query = db
    .from('report_schedules')
    .update({ last_run: nowIso, updated_at: nowIso })
    .eq('id', schedule.id)
    .eq('is_active', true);

  // `.eq(col, null)` não expressa IS NULL no PostgREST — precisa de `.is()`.
  query = schedule.last_run
    ? query.eq('last_run', schedule.last_run)
    : query.is('last_run', null);

  const { data, error } = await query.select('id');
  if (error) throw new Error(`Falha ao reclamar a agenda: ${error.message ?? error}`);
  return Array.isArray(data) && data.length > 0;
}

async function stampNextRun(
  db: ReportDb,
  scheduleId: string,
  nextRun: Date | null,
  logger: SchedulerLogger,
): Promise<void> {
  try {
    await db
      .from('report_schedules')
      .update({ next_run: nextRun ? nextRun.toISOString() : null, updated_at: new Date().toISOString() })
      .eq('id', scheduleId);
  } catch (err) {
    // next_run é só exibição: não vale derrubar uma execução bem-sucedida.
    logger.warn('Falha ao gravar next_run', { scheduleId, error: String(err) });
  }
}

async function recordExecution(
  db: ReportDb,
  logger: SchedulerLogger,
  row: {
    tenantId: string;
    status: 'success' | 'failed';
    executionTime: number;
    errorMessage?: string;
    parameters: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.from('report_executions').insert({
      tenant_id: row.tenantId,
      template_id: null,
      // Envio agendado não tem usuário humano por trás.
      executed_by: null,
      status: row.status,
      execution_time: row.executionTime,
      error_message: row.errorMessage ? row.errorMessage.slice(0, 500) : null,
      parameters: row.parameters,
      executed_at: new Date().toISOString(),
    });
  } catch (err) {
    // Último recurso: se nem o registro da falha entra, ao menos grita no log.
    logger.error('Falha ao registrar report_execution', {
      tenantId: row.tenantId,
      status: row.status,
      error: String(err),
    });
  }
}

/**
 * Roda todas as agendas vencidas. Percorre TODAS as Contas com service role —
 * cada relatório é montado com o tenant_id da própria agenda, nunca com um
 * tenant herdado do laço anterior.
 *
 * Uma agenda que falha não interrompe as outras: cada iteração tem o próprio
 * try/catch e a falha vira linha em report_executions.
 */
export async function runDueSchedules(
  options: RunDueSchedulesOptions,
): Promise<RunDueSchedulesResult> {
  const {
    db,
    sendEmail,
    now = new Date(),
    timeZone = DEFAULT_TIME_ZONE,
    lookbackMinutes = DEFAULT_LOOKBACK_MINUTES,
    maxSchedules = 200,
    logger = SILENT_LOGGER,
  } = options;

  const result: RunDueSchedulesResult = {
    considered: 0, due: 0, sent: 0, failed: 0, skipped: 0, results: [],
  };

  const { data: schedules, error } = await db
    .from('report_schedules')
    .select('id, tenant_id, name, cron_expression, recipients, parameters, is_active, last_run, next_run')
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(maxSchedules);

  if (error) throw new Error(`Falha ao ler report_schedules: ${error.message ?? error}`);

  const rows = (schedules ?? []) as ReportScheduleRow[];
  result.considered = rows.length;

  for (const schedule of rows) {
    const push = (r: ScheduleRunResult) => {
      result.results.push(r);
      if (r.status === 'sent') result.sent++;
      else if (r.status === 'failed') result.failed++;
      else result.skipped++;
    };

    try {
      if (!schedule.cron_expression || !schedule.tenant_id) {
        logger.warn('Agenda sem cron_expression ou tenant_id', { scheduleId: schedule.id });
        push({ scheduleId: schedule.id, tenantId: schedule.tenant_id, status: 'skipped_invalid_cron' });
        continue;
      }

      const due = isDue({
        expression: schedule.cron_expression,
        now,
        lastRun: schedule.last_run ? new Date(schedule.last_run) : null,
        lookbackMinutes,
        timeZone,
      });

      if (!due) {
        push({ scheduleId: schedule.id, tenantId: schedule.tenant_id, status: 'skipped_not_due' });
        continue;
      }

      result.due++;

      const claimed = await claimSchedule(db, schedule, now.toISOString());
      if (!claimed) {
        // Outra invocação pegou esta agenda primeiro. Não é erro.
        logger.info('Agenda já reclamada por outra execução', { scheduleId: schedule.id });
        push({ scheduleId: schedule.id, tenantId: schedule.tenant_id, status: 'skipped_claimed_elsewhere' });
        continue;
      }

      const startedAt = Date.now();
      const dateRange = resolveDateRange(schedule.parameters, schedule.cron_expression);
      const reportType = typeof schedule.parameters?.reportType === 'string'
        ? (schedule.parameters.reportType as string)
        : 'general';
      const format = typeof schedule.parameters?.format === 'string'
        ? (schedule.parameters.format as string)
        : undefined;
      const recipients = normalizeRecipients(schedule.recipients);

      try {
        if (recipients.length === 0) {
          throw new Error('A agenda não tem nenhum destinatário de e-mail válido.');
        }

        // tenant_id vem SEMPRE da agenda desta iteração.
        const payload = await buildReportPayload(db, {
          tenantId: schedule.tenant_id,
          name: schedule.name ?? undefined,
          type: reportType,
          dateRange,
          format,
        });

        await sendEmail({
          to: recipients,
          subject: payload.subject,
          html: payload.html,
          attachments: payload.attachments,
        });

        await stampNextRun(db, schedule.id, nextRunAfter(schedule.cron_expression, now, timeZone), logger);

        await recordExecution(db, logger, {
          tenantId: schedule.tenant_id,
          status: 'success',
          executionTime: Date.now() - startedAt,
          parameters: {
            trigger: 'schedule',
            scheduleId: schedule.id,
            scheduleName: schedule.name ?? null,
            name: payload.name,
            type: reportType,
            format: format ?? null,
            filters: { dateRange },
            delivery: { email: true, whatsapp: false, recipients },
            recipients,
            delivered: [{ channel: 'email', to: recipients }],
            warnings: [],
            result: payload.metrics,
          },
        });

        logger.info('Relatório agendado enviado', {
          scheduleId: schedule.id,
          tenantId: schedule.tenant_id,
          recipients: recipients.length,
        });
        push({ scheduleId: schedule.id, tenantId: schedule.tenant_id, status: 'sent', recipients });
      } catch (sendErr) {
        const message = sendErr instanceof Error ? sendErr.message : String(sendErr);

        // A falha PRECISA aparecer: é exatamente o silêncio que este módulo veio
        // consertar. Registra antes de seguir para a próxima agenda.
        await recordExecution(db, logger, {
          tenantId: schedule.tenant_id,
          status: 'failed',
          executionTime: Date.now() - startedAt,
          errorMessage: message,
          parameters: {
            trigger: 'schedule',
            scheduleId: schedule.id,
            scheduleName: schedule.name ?? null,
            type: reportType,
            format: format ?? null,
            filters: { dateRange },
            delivery: { email: true, whatsapp: false, recipients },
            recipients,
          },
        });

        await stampNextRun(db, schedule.id, nextRunAfter(schedule.cron_expression, now, timeZone), logger);

        logger.error('Falha ao enviar relatório agendado', {
          scheduleId: schedule.id,
          tenantId: schedule.tenant_id,
          error: message,
        });
        push({ scheduleId: schedule.id, tenantId: schedule.tenant_id, status: 'failed', error: message });
      }
    } catch (outerErr) {
      // Erro fora do envio (leitura, claim). Uma agenda quebrada não derruba o tick.
      const message = outerErr instanceof Error ? outerErr.message : String(outerErr);
      logger.error('Erro inesperado ao processar agenda', { scheduleId: schedule.id, error: message });
      push({ scheduleId: schedule.id, tenantId: schedule.tenant_id, status: 'failed', error: message });
    }
  }

  return result;
}
