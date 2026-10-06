// =============================================================================
// report-core — montagem e envio do relatório, compartilhado por dois caminhos:
// =============================================================================
//   1. send-report (interativo)      — usuário logado clica "Enviar"; a função
//                                      autentica pelo JWT e chama estas peças.
//   2. process-report-dispatch (cron) — não existe usuário; o agendador chama as
//                                      mesmas peças com a service role.
//
// O que mora aqui é o que os dois precisam produzir IGUAL: as métricas, o HTML,
// o CSV e o envio pelo Resend. O que NÃO mora aqui é autenticação: cada caminho
// resolve o seu tenant_id do seu jeito e passa pronto. Esta é a fronteira que
// mantém o caminho interativo com a autenticação que ele sempre teve.
//
// ⚠️ ISOLAMENTO ENTRE CONTAS: todas as consultas de métrica recebem tenantId por
// parâmetro e filtram por ele. Como o agendador roda com service role (RLS não
// se aplica), este filtro explícito é a ÚNICA barreira entre os dados de uma
// Conta e a de outra. Não acrescente consulta aqui sem `.eq('tenant_id', ...)`.
// Coberto por src/lib/reports/reportScheduler.test.ts.
// =============================================================================

/**
 * Cliente de banco no formato mínimo que este módulo usa. Tipado
 * estruturalmente de propósito: assim o módulo não importa o supabase-js por
 * URL e continua carregável pelo Vitest, que roda os testes deste código.
 */
export interface ReportDb {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
  /**
   * Opcional: as métricas de atendimento vêm da RPC loja_conversation_metrics
   * (migração 20260921000001), que aceita o papel service_role. Um cliente sem
   * `rpc` (o dublê dos testes) só perde essas três linhas — o resto do
   * relatório sai igual.
   */
  // deno-lint-ignore no-explicit-any
  rpc?(fn: string, args: Record<string, unknown>): any;
}

export class SecureError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  constructor(message: string, code = 'VALIDATION_ERROR', statusCode = 400) {
    super(message);
    this.name = 'SecureError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TYPE_LABELS: Record<string, string> = {
  campaigns: 'Campanhas',
  conversations: 'Conversas',
  funnel: 'Funil de Vendas',
  general: 'Geral',
};

// ── Período ──────────────────────────────────────────────────────────────────

export function rangeToSince(dateRange?: string): { since: Date; label: string } {
  const now = new Date();
  const map: Record<string, { days: number; label: string }> = {
    today: { days: 1, label: 'Hoje' },
    '1day': { days: 1, label: 'Último dia' },
    '7days': { days: 7, label: 'Últimos 7 dias' },
    '14days': { days: 14, label: 'Últimos 14 dias' },
    '30days': { days: 30, label: 'Últimos 30 dias' },
    '90days': { days: 90, label: 'Últimos 90 dias' },
    '6months': { days: 180, label: 'Últimos 6 meses' },
    '1year': { days: 365, label: 'Último ano' },
  };
  const fallback = { days: 30, label: 'Últimos 30 dias' };
  const entry = map[dateRange ?? '30days'] ?? fallback;
  const since = new Date(now.getTime() - entry.days * 24 * 60 * 60 * 1000);
  return { since, label: entry.label };
}

// ── Métricas ─────────────────────────────────────────────────────────────────

export async function countIn(
  db: ReportDb,
  table: string,
  // deno-lint-ignore no-explicit-any
  apply: (q: any) => any,
): Promise<number> {
  try {
    let q = db.from(table).select('*', { count: 'exact', head: true });
    q = apply(q);
    const { count, error } = await q;
    if (error) return 0;
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function collectMetrics(db: ReportDb, tenantId: string, sinceIso: string) {
  const [
    contactsTotal, contactsNew, conversationsTotal, conversationsNew,
    conversationsArchived, messagesTotal, messagesSent, messagesReceived,
  ] = await Promise.all([
    countIn(db, 'contacts', (q) => q.eq('tenant_id', tenantId)),
    countIn(db, 'contacts', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(db, 'conversations', (q) => q.eq('tenant_id', tenantId)),
    countIn(db, 'conversations', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(db, 'conversations', (q) => q.eq('tenant_id', tenantId).eq('is_archived', true)),
    countIn(db, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso)),
    countIn(db, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso).in('direction', ['outbound', 'sent', 'out'])),
    countIn(db, 'messages', (q) => q.eq('tenant_id', tenantId).gte('created_at', sinceIso).in('direction', ['inbound', 'received', 'in'])),
  ]);

  let funnelStages: Array<{ name: string; count: number }> = [];
  try {
    const { data: stages } = await db
      .from('funnel_stages')
      .select('id, name, order')
      .eq('tenant_id', tenantId)
      .order('order', { ascending: true });
    if (stages && stages.length) {
      funnelStages = await Promise.all(
        // deno-lint-ignore no-explicit-any
        stages.map(async (s: any) => ({
          name: s.name as string,
          count: await countIn(db, 'contacts', (q) => q.eq('tenant_id', tenantId).eq('current_stage_id', s.id)),
        })),
      );
    }
  } catch { /* funil opcional */ }

  const attendance = await collectAttendance(db, tenantId, sinceIso);

  return {
    contactsTotal, contactsNew, conversationsTotal, conversationsNew,
    conversationsArchived, messagesTotal, messagesSent, messagesReceived, funnelStages,
    attendance,
  };
}

/**
 * Atendimento da Loja inteira, só o que é real (decisão de 2026-09-21): a
 * mediana da 1ª resposta de uma PESSOA nas conversas iniciadas no período,
 * quantas esperam uma pessoa AGORA e quantas do período ficaram sem resposta
 * humana. Nada por pessoa aqui — o destinatário do relatório é um e-mail
 * livre, e um atendente poderia receber os números dos colegas.
 *
 * `null` quando a RPC não está disponível (cliente sem `rpc`, função ausente,
 * chamador fora do alcance): o relatório escreve "—" em vez de zero falso.
 */
export interface AttendanceMetrics {
  /** Minutos; null sem conversa medida no período. */
  firstHumanReplyMedianMinutes: number | null;
  /** Quantas conversas entraram na mediana. */
  firstHumanReplyCount: number;
  waitingHumanNow: number;
  waitingHumanUnowned: number;
  noHumanReply: number;
  conversationsInPeriod: number;
}

export async function collectAttendance(
  db: ReportDb,
  tenantId: string,
  sinceIso: string,
): Promise<AttendanceMetrics | null> {
  if (typeof db.rpc !== 'function') return null;
  try {
    const { data, error } = await db.rpc('loja_conversation_metrics', {
      p_tenant_id: tenantId,
      p_from: sinceIso,
      p_to: null,
    });
    if (error) return null;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0));
    const median = row.median_first_human_minutes;
    return {
      firstHumanReplyMedianMinutes: median === null || median === undefined ? null : num(median),
      firstHumanReplyCount: num(row.n_first_human),
      waitingHumanNow: num(row.n_waiting_human),
      waitingHumanUnowned: num(row.n_waiting_human_unowned),
      noHumanReply: num(row.n_no_human_reply),
      conversationsInPeriod: num(row.n_conversations),
    };
  } catch {
    return null;
  }
}

/** "6 s", "12 min", "7 h 28 min", "2 d 3 h" — a mesma escala do Dashboard. */
export function formatMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const totalMin = Math.round(minutes);
  const hours = Math.floor(totalMin / 60);
  const rest = totalMin % 60;
  if (hours < 24) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
}

export type Metrics = Awaited<ReturnType<typeof collectMetrics>>;

// ── Renderização ─────────────────────────────────────────────────────────────

// Ícone branco da marca (PNG inline base64) para o cabeçalho escuro do e-mail.
export const BRAND_ICON = "data:image/png;base64,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";

// Paleta de marca ConvoFlow (e-mail transacional)
export const EMAIL = {
  bg: "#F9F9ED", // creme (fundo)
  ink: "#211E0B", // carvão (texto/fundo escuro)
  lime: "#DAE27C", // lima (destaque)
  olive: "#49511D", // oliva (apoio)
  muted: "#6E7156", // oliva-acinzentado (texto secundário)
  border: "#E6E6D2", // borda creme
  card: "#FFFFFF",
  font: '"NewBlack Typeface", -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

function metricCard(label: string, value: number | string): string {
  return `
    <td style="padding:8px;">
      <div style="background:${EMAIL.bg};border:1px solid ${EMAIL.border};border-radius:10px;padding:16px;text-align:center;">
        <div style="font-size:26px;font-weight:700;color:${EMAIL.ink};">${value}</div>
        <div style="font-size:12px;color:${EMAIL.muted};margin-top:4px;">${label}</div>
      </div>
    </td>`;
}

function attendanceHtml(a: AttendanceMetrics | null): string {
  if (!a) {
    return `<p style="font-size:13px;color:${EMAIL.muted};margin:0;">Números de atendimento indisponíveis para esta Conta.</p>`;
  }
  const median = a.firstHumanReplyCount > 0
    ? `${formatMinutes(a.firstHumanReplyMedianMinutes)} <span style="color:${EMAIL.muted};">(na metade das ${a.firstHumanReplyCount} conversas iniciadas no período, alguém do time respondeu em até isso; não conta bot nem campanha)</span>`
    : `— <span style="color:${EMAIL.muted};">(nenhuma conversa do período teve resposta de pessoa)</span>`;
  const waiting = a.waitingHumanUnowned > 0
    ? `${a.waitingHumanNow} <span style="color:${EMAIL.muted};">(${a.waitingHumanUnowned} sem responsável)</span>`
    : `${a.waitingHumanNow}`;
  return `
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid ${EMAIL.border};border-radius:8px;overflow:hidden;font-size:13px;">
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.olive};">1ª resposta de uma pessoa (mediana)</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600;color:${EMAIL.ink};">${median}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.olive};">Esperando uma pessoa agora</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600;color:${EMAIL.ink};">${waiting}</td>
        </tr>
        <tr>
          <td style="padding:8px 12px;color:${EMAIL.olive};">Sem resposta de pessoa (conversas do período)</td>
          <td style="padding:8px 12px;text-align:right;font-weight:600;color:${EMAIL.ink};">${a.noHumanReply} de ${a.conversationsInPeriod}</td>
        </tr>
      </table>`;
}

export function renderHtml(opts: { name: string; typeLabel: string; periodLabel: string; generatedAt: string; m: Metrics }): string {
  const { name, typeLabel, periodLabel, generatedAt, m } = opts;
  const funnelRows = m.funnelStages.length
    ? m.funnelStages.map((s) => `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.olive};">${s.name}</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};text-align:right;font-weight:600;color:${EMAIL.ink};">${s.count}</td>
        </tr>`).join('')
    : `<tr><td colspan="2" style="padding:12px;color:${EMAIL.muted};">Sem estágios de funil configurados.</td></tr>`;
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${EMAIL.bg};font-family:${EMAIL.font};">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:${EMAIL.ink};border-radius:12px 12px 0 0;padding:24px;display:flex;align-items:center;gap:12px;">
      <img src="${BRAND_ICON}" alt="ConvoFlow" width="36" height="36" style="display:inline-block;vertical-align:middle;" />
      <div>
        <div style="color:${EMAIL.bg};font-size:20px;font-weight:700;">ConvoFlow · Relatório</div>
        <div style="color:${EMAIL.lime};font-size:13px;margin-top:4px;">${typeLabel} · ${periodLabel}</div>
      </div>
    </div>
    <div style="background:${EMAIL.card};border:1px solid ${EMAIL.border};border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <h1 style="font-size:18px;color:${EMAIL.ink};margin:0 0 4px;">${name}</h1>
      <p style="font-size:13px;color:${EMAIL.muted};margin:0 0 20px;">Gerado em ${generatedAt}</p>
      <table role="presentation" width="100%" style="border-collapse:collapse;">
        <tr>${metricCard('Contatos (total)', m.contactsTotal)}${metricCard('Novos contatos', m.contactsNew)}</tr>
        <tr>${metricCard('Conversas (total)', m.conversationsTotal)}${metricCard('Novas conversas', m.conversationsNew)}</tr>
        <tr>${metricCard('Msgs enviadas', m.messagesSent)}${metricCard('Msgs recebidas', m.messagesReceived)}</tr>
      </table>
      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Resumo de mensagens</h2>
      <p style="font-size:13px;color:${EMAIL.olive};margin:0;">Total de mensagens no período: <strong>${m.messagesTotal}</strong> &middot; Conversas arquivadas: <strong>${m.conversationsArchived}</strong></p>
      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Atendimento (Loja inteira)</h2>
      ${attendanceHtml(m.attendance)}
      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Leads por estágio do funil</h2>
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid ${EMAIL.border};border-radius:8px;overflow:hidden;">${funnelRows}</table>
      <p style="font-size:12px;color:${EMAIL.muted};margin:24px 0 0;border-top:1px solid ${EMAIL.border};padding-top:16px;">Este relatório foi gerado automaticamente pelo ConvoFlow com base nos dados reais da sua conta.</p>
    </div>
  </div>
</body></html>`;
}

export function renderCsv(m: Metrics): string {
  const rows: Array<[string, string | number]> = [
    ['Métrica', 'Valor'],
    ['Contatos (total)', m.contactsTotal],
    ['Novos contatos', m.contactsNew],
    ['Conversas (total)', m.conversationsTotal],
    ['Novas conversas', m.conversationsNew],
    ['Conversas arquivadas', m.conversationsArchived],
    ['Mensagens no período', m.messagesTotal],
    ['Mensagens enviadas', m.messagesSent],
    ['Mensagens recebidas', m.messagesReceived],
    ...m.funnelStages.map((s) => [`Funil: ${s.name}`, s.count] as [string, number]),
    ...(m.attendance
      ? ([
          ['1ª resposta de uma pessoa (mediana, min)', m.attendance.firstHumanReplyMedianMinutes === null ? '' : Math.round(m.attendance.firstHumanReplyMedianMinutes * 10) / 10],
          ['Conversas na mediana', m.attendance.firstHumanReplyCount],
          ['Esperando uma pessoa agora', m.attendance.waitingHumanNow],
          ['Esperando uma pessoa agora (sem responsável)', m.attendance.waitingHumanUnowned],
          ['Sem resposta de pessoa (período)', m.attendance.noHumanReply],
          ['Conversas iniciadas no período', m.attendance.conversationsInPeriod],
        ] as Array<[string, string | number]>)
      : []),
  ];
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
}

// Resumo do relatório em texto puro (WhatsApp).
// Mantido: o canal de WhatsApp do caminho interativo continua existindo no
// servidor, mesmo não sendo mais oferecido no agendamento.
export function renderWhatsAppText(name: string, typeLabel: string, periodLabel: string, m: Metrics): string {
  const lines = [
    `📊 *${name}*`,
    `${typeLabel} · ${periodLabel}`,
    '',
    `👥 Contatos: ${m.contactsTotal} (novos: ${m.contactsNew})`,
    `💬 Conversas: ${m.conversationsTotal} (novas: ${m.conversationsNew})`,
    `✉️ Mensagens no período: ${m.messagesTotal}`,
    `   • Enviadas: ${m.messagesSent}  • Recebidas: ${m.messagesReceived}`,
  ];
  if (m.funnelStages.length) {
    lines.push('', '*Funil:*');
    for (const s of m.funnelStages) lines.push(`   • ${s.name}: ${s.count}`);
  }
  if (m.attendance) {
    lines.push(
      '',
      '*Atendimento (Loja inteira):*',
      `   • 1ª resposta de uma pessoa (mediana): ${m.attendance.firstHumanReplyCount > 0 ? formatMinutes(m.attendance.firstHumanReplyMedianMinutes) : '—'}`,
      `   • Esperando uma pessoa agora: ${m.attendance.waitingHumanNow}${m.attendance.waitingHumanUnowned > 0 ? ` (${m.attendance.waitingHumanUnowned} sem responsável)` : ''}`,
      `   • Sem resposta de pessoa: ${m.attendance.noHumanReply} de ${m.attendance.conversationsInPeriod}`,
    );
  }
  lines.push('', 'Equipe ConvoFlow');
  return lines.join('\n');
}

// ── Envio ────────────────────────────────────────────────────────────────────

export interface SendEmailArgs {
  to: string[];
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
}

export async function sendViaResend(opts: {
  apiKey: string; from: string; to: string[]; subject: string; html: string;
  attachments?: Array<{ filename: string; content: string }>;
}): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: opts.from, to: opts.to, subject: opts.subject, html: opts.html, attachments: opts.attachments }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new SecureError(`Falha no envio pelo Resend (HTTP ${res.status}): ${detail.slice(0, 300)}`, 'EMAIL_PROVIDER_ERROR', 502);
  }
}

/** Fábrica do transporte de e-mail usada pelo agendador (secrets → função). */
export function resendTransport(apiKey: string, from: string) {
  return (args: SendEmailArgs) => sendViaResend({ apiKey, from, ...args });
}

// ── Montagem completa ────────────────────────────────────────────────────────

export interface BuildReportOptions {
  tenantId: string;
  name?: string;
  type?: string;
  dateRange?: string;
  format?: string;
}

export interface ReportPayload {
  name: string;
  typeLabel: string;
  periodLabel: string;
  subject: string;
  html: string;
  attachments?: Array<{ filename: string; content: string }>;
  metrics: Metrics;
}

function toBase64(value: string): string {
  // btoa existe no Deno e no browser/jsdom; o fallback cobre Node puro.
  if (typeof btoa === 'function') return btoa(unescape(encodeURIComponent(value)));
  // deno-lint-ignore no-explicit-any
  const B: any = (globalThis as any).Buffer;
  return B ? B.from(value, 'utf-8').toString('base64') : value;
}

/**
 * Coleta as métricas do tenant e monta assunto/HTML/anexo. É o ponto único onde
 * o relatório ganha forma — usar isto (em vez de remontar) é o que garante que
 * o e-mail agendado saia idêntico ao e-mail enviado pela tela.
 */
export async function buildReportPayload(
  db: ReportDb,
  opts: BuildReportOptions,
): Promise<ReportPayload> {
  const { since, label: periodLabel } = rangeToSince(opts.dateRange);
  const metrics = await collectMetrics(db, opts.tenantId, since.toISOString());

  const typeLabel = TYPE_LABELS[opts.type ?? 'general'] ?? 'Geral';
  const name = (opts.name && opts.name.trim()) || `Relatório ${typeLabel}`;
  const generatedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const html = renderHtml({ name, typeLabel, periodLabel, generatedAt, m: metrics });
  const attachments = opts.format === 'csv' || opts.format === 'excel'
    ? [{ filename: `${name.replace(/[^\w.-]+/g, '_')}.csv`, content: toBase64(renderCsv(metrics)) }]
    : undefined;

  return {
    name,
    typeLabel,
    periodLabel,
    subject: `📊 ${name} · ${periodLabel}`,
    html,
    attachments,
    metrics,
  };
}
