// =============================================================================
// send-report — Gera um relatório com dados reais do tenant e entrega por
// e-mail (Resend) e/ou WhatsApp (instância de envio do sistema, configurada
// pelo super admin). Registra a execução em report_executions.
// =============================================================================
// Secrets necessários (e-mail):
//   RESEND_API_KEY     — API key do Resend (re_...)
//   REPORT_FROM_EMAIL  — remetente verificado, ex.: "ConvoFlow <relatorios@...>"
//
// WhatsApp: o super admin define em system_settings (key='report_whatsapp_instance_id',
// value={instanceId}) qual whatsapp_instances é o número de envio do sistema.
// O envio é agnóstico de provider (evolution | waha | official/Meta).
//
// ⚠️ Meta Cloud API (provider 'official') só envia texto livre dentro da janela
// de 24h; fora disso exige template aprovado (erro 131047).
//
// Regras WhatsApp: ver .agent/skills/{evolution-v2,waha,meta-cloud-api}/SKILL.md
// =============================================================================

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  EMAIL,
  EMAIL_RE,
  SecureError,
  buildReportPayload,
  renderWhatsAppText,
  sendViaResend,
} from '../_shared/report-core.ts';
import { checkReportLimits } from '../_shared/report-limits.ts';

const ALLOWED_ORIGINS = [
  'https://convoflow.com.br',
  'https://www.convoflow.com.br',
  'https://convoflow.vercel.app',
  'https://www.convoflow.vercel.app',
];
const LOCALHOST_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function buildCorsHeaders(requestOrigin?: string | null): Record<string, string> {
  const env = Deno.env.get('ENVIRONMENT') || Deno.env.get('DENO_ENV') || 'production';
  let origin = ALLOWED_ORIGINS[0];
  if (env === 'development' || env === 'local') {
    origin = requestOrigin || '*';
  } else if (requestOrigin && (ALLOWED_ORIGINS.includes(requestOrigin) || LOCALHOST_PATTERN.test(requestOrigin))) {
    origin = requestOrigin;
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

interface ReportRequest {
  name?: string;
  description?: string;
  type?: string;
  frequency?: string;
  format?: string;
  metrics?: string[];
  /**
   * A Loja aberta no seletor (tenant.id do TenantContext). Sem ela o relatório
   * saía SEMPRE da Conta do perfil de quem clicou: um gerente olhando uma Loja
   * filha recebia os números da própria Conta — zeros. Revalidada no servidor
   * por resolveReportTenant: só a própria Conta ou uma Loja filha do gerente.
   */
  tenant_id?: string | null;
  filters?: { dateRange?: string; campaigns?: string[]; contacts?: string[]; status?: string[] };
  delivery?: { email?: boolean; whatsapp?: boolean; recipients?: string[] | string };
}

interface CallerProfile {
  id: string;
  user_id: string;
  role: string;
  tenant_id: string | null;
  status: string;
}

const json = (body: unknown, status: number, cors: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Os dois `require*` têm default true, preservando o comportamento original do
// relatório. O fluxo de relato de bug passa false nos dois:
//   - requireTenant: um superadmin não tem tenant_id próprio.
//   - requireActive: quem está com a conta 'pending'/'suspended' é justamente
//     quem mais precisa conseguir relatar um problema. Barrar o relato aí deixa
//     o usuário sem canal nenhum para avisar que algo está quebrado.
async function getCaller(
  admin: SupabaseClient,
  token: string,
  opts: { requireTenant?: boolean; requireActive?: boolean } = {},
): Promise<CallerProfile> {
  const { requireTenant = true, requireActive = true } = opts;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new SecureError('Token inválido', 'UNAUTHORIZED', 401);
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, user_id, role, tenant_id, status')
    .eq('user_id', user.id)
    .maybeSingle();
  if (profileError || !profile) throw new SecureError('Profile do caller não encontrado', 'NO_PROFILE', 403);
  if (requireActive && profile.status && profile.status !== 'active') throw new SecureError('Conta suspensa ou inativa', 'INACTIVE', 403);
  if (requireTenant && !profile.tenant_id) throw new SecureError('Usuário sem tenant associado', 'NO_TENANT', 403);
  return profile as CallerProfile;
}

// Cargos que administram Lojas filhas — o mesmo conjunto de is_account_manager_safe().
const GERENTE_ROLES = new Set(['gerente', 'agencia', 'account_manager']);

/**
 * A Loja de que o relatório sai. O agendado já segue a Loja da agenda
 * (report_schedules.tenant_id); o interativo passa a seguir a Loja aberta no
 * seletor — mas nunca só por dizer: um gerente só alcança a própria Conta e as
 * Lojas cuja `parent_tenant_id` é a Conta dele (o mesmo teste de
 * canUseActiveTenant no cliente e de gerente_child_store_ids no banco). Todo
 * mundo mais só pode pedir a própria Conta. Pedido fora do alcance é 403, não
 * silêncio: silêncio era o bug.
 */
async function resolveReportTenant(
  admin: SupabaseClient,
  caller: CallerProfile,
  requested: string | null | undefined,
): Promise<string> {
  const own = caller.tenant_id!;
  if (!requested || requested === own) return own;
  if (GERENTE_ROLES.has(String(caller.role))) {
    const { data, error } = await admin
      .from('tenants')
      .select('id')
      .eq('id', requested)
      .eq('parent_tenant_id', own)
      .maybeSingle();
    if (!error && data) return requested;
  }
  throw new SecureError('A Loja pedida não está no seu alcance.', 'TENANT_FORBIDDEN', 403);
}

// Instância de WhatsApp de envio do sistema (definida pelo super admin).
async function loadSystemWhatsAppInstance(admin: SupabaseClient): Promise<any> {
  const { data: setting } = await admin
    .from('system_settings')
    .select('value')
    .eq('key', 'report_whatsapp_instance_id')
    .maybeSingle();
  const raw = setting?.value as any;
  const instanceId = raw?.instanceId || (typeof raw === 'string' ? raw : null);
  if (!instanceId) {
    throw new SecureError(
      'Número de envio do sistema não configurado. Peça ao super admin para configurar em Configurações.',
      'NO_SYSTEM_WHATSAPP',
      400,
    );
  }
  const { data: instance } = await admin
    .from('whatsapp_instances')
    .select('id, provider, instance_key, connection_config, evolution_api_url, evolution_api_key, status')
    .eq('id', instanceId)
    .maybeSingle();
  if (!instance) throw new SecureError('Instância de envio do sistema não encontrada.', 'SYSTEM_WHATSAPP_NOT_FOUND', 400);
  return instance;
}

// Envio de texto WhatsApp agnóstico de provider. Regras por provider:
//  - evolution: POST {baseUrl}/message/sendText/{instanceKey}  (.agent/skills/evolution-v2)
//  - waha:      POST {baseUrl}/api/sendText                      (.agent/skills/waha)
//  - official:  Graph API + token do Vault                       (.agent/skills/meta-cloud-api)
async function sendWhatsApp(admin: SupabaseClient, instance: any, to: string, text: string): Promise<void> {
  const provider = instance.provider || 'evolution';
  const cfg = (instance.connection_config as Record<string, any>) || {};
  const number = String(to).replace(/\D/g, '');

  if (provider === 'official') {
    const phoneNumberId = cfg.phoneNumberId || instance.instance_key;
    const graphVersion = cfg.graphApiVersion || 'v20.0';
    if (!phoneNumberId) throw new Error('connection_config.phoneNumberId ausente na instância do sistema.');
    const { data: token, error: tErr } = await admin.rpc('get_instance_meta_token', { p_instance_id: instance.id });
    if (tErr || !token) throw new Error('Token Meta não encontrado no Vault para a instância do sistema.');
    const resp = await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: `+${number}`,
        type: 'text',
        text: { body: text, preview_url: false },
      }),
    });
    if (!resp.ok) {
      const j = await resp.json().catch(() => null);
      const code = j?.error?.code;
      let msg = j?.error?.message || `HTTP ${resp.status}`;
      if (code === 131047) {
        msg = 'Fora da janela de 24h do WhatsApp: o destinatário precisa ter enviado mensagem nas últimas 24h, ou é necessário um template aprovado.';
      } else if (code === 131026) {
        msg = 'Número não existe no WhatsApp.';
      }
      throw new Error(msg);
    }
    return;
  }

  if (provider === 'evolution') {
    const baseUrl = cfg.baseUrl || instance.evolution_api_url;
    const apiKey = cfg.apiKey || instance.evolution_api_key;
    if (!baseUrl || !apiKey) throw new Error('Configuração Evolution ausente na instância do sistema.');
    const resp = await fetch(`${baseUrl}/message/sendText/${instance.instance_key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: apiKey },
      body: JSON.stringify({ number, text }),
    });
    if (!resp.ok) throw new Error(`Evolution API (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    return;
  }

  if (provider === 'waha') {
    const baseUrl = cfg.baseUrl;
    const apiKey = cfg.apiKey;
    if (!baseUrl) throw new Error('Configuração WAHA ausente na instância do sistema.');
    const resp = await fetch(`${baseUrl}/api/sendText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(apiKey ? { 'X-Api-Key': apiKey } : {}) },
      body: JSON.stringify({ session: cfg.sessionName || instance.instance_key, chatId: `${number}@c.us`, text, linkPreview: false }),
    });
    if (!resp.ok) throw new Error(`WAHA (${resp.status}): ${(await resp.text()).slice(0, 200)}`);
    return;
  }

  throw new Error(`Provider de WhatsApp não suportado: ${provider}`);
}

// =============================================================================
// Relato de bug ("Relatar um problema" — botão da Navbar)
// =============================================================================
// Fluxo independente do relatório: entra por { kind: 'bug_report' } e envia um
// e-mail formatado. Remetente = REPORT_FROM_EMAIL (o mesmo dos relatórios);
// DESTINATÁRIOS = system_settings.key='bug_report_recipients', definidos pelo
// super admin em /dashboard/admin → Configurações (fallback: o próprio
// REPORT_FROM_EMAIL). O anexo vai como LINK (URL assinada do bucket privado
// bug-reports), nunca em base64 — vídeo de 50 MB estouraria o limite do Resend.
//
// Este caminho NÃO grava em report_executions: a linha durável do relato é
// public.bug_reports, escrita pelo frontend antes de chamar esta função.

interface BugReportRequest {
  kind: 'bug_report';
  description?: string;
  attachment_url?: string | null;
  attachment_type?: 'image' | 'video' | null;
  page_url?: string;
  user_email?: string;
  user_role?: string;
  tenant_id?: string | null;
  store_id?: string | null;
  tenant_name?: string | null;
}

/** Escapa texto do usuário antes de interpolar no HTML do e-mail. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderBugReportHtml(opts: {
  description: string;
  pageUrl: string;
  userEmail: string;
  userRole: string;
  tenantName: string | null;
  tenantId: string | null;
  storeId: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  reportedAt: string;
}): string {
  const row = (label: string, value: string) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.muted};white-space:nowrap;">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${EMAIL.border};color:${EMAIL.ink};word-break:break-word;">${value}</td>
    </tr>`;

  const attachmentBlock = opts.attachmentUrl
    ? `<p style="margin:0 0 8px;"><a href="${escapeHtml(opts.attachmentUrl)}" style="display:inline-block;background:${EMAIL.lime};color:${EMAIL.ink};text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px;">Abrir anexo (${escapeHtml(opts.attachmentType ?? 'arquivo')})</a></p>
       <p style="font-size:11px;color:${EMAIL.muted};margin:0;word-break:break-all;">${escapeHtml(opts.attachmentUrl)}</p>`
    : `<p style="font-size:13px;color:${EMAIL.muted};margin:0;">Nenhum anexo enviado.</p>`;

  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:${EMAIL.bg};font-family:${EMAIL.font};">
  <div style="max-width:640px;margin:0 auto;padding:24px;">
    <div style="background:${EMAIL.ink};border-radius:12px 12px 0 0;padding:24px;">
      <div style="color:${EMAIL.bg};font-size:20px;font-weight:700;">ConvoFlow · Relato de bug</div>
      <div style="color:${EMAIL.lime};font-size:13px;margin-top:4px;">${escapeHtml(opts.userRole)} · ${escapeHtml(opts.userEmail)}</div>
    </div>
    <div style="background:${EMAIL.card};border:1px solid ${EMAIL.border};border-top:none;border-radius:0 0 12px 12px;padding:24px;">
      <h2 style="font-size:15px;color:${EMAIL.ink};margin:0 0 8px;">Descrição</h2>
      <div style="background:${EMAIL.bg};border:1px solid ${EMAIL.border};border-radius:8px;padding:16px;font-size:14px;color:${EMAIL.ink};white-space:pre-wrap;line-height:1.5;">${escapeHtml(opts.description)}</div>

      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Anexo</h2>
      ${attachmentBlock}

      <h2 style="font-size:15px;color:${EMAIL.ink};margin:24px 0 8px;">Contexto</h2>
      <table role="presentation" width="100%" style="border-collapse:collapse;border:1px solid ${EMAIL.border};border-radius:8px;overflow:hidden;font-size:13px;">
        ${row('Página', `<a href="${escapeHtml(opts.pageUrl)}" style="color:${EMAIL.olive};">${escapeHtml(opts.pageUrl)}</a>`)}
        ${row('Usuário', escapeHtml(opts.userEmail))}
        ${row('Papel', escapeHtml(opts.userRole))}
        ${row('Conta', escapeHtml(opts.tenantName ?? '—'))}
        ${row('tenant_id', escapeHtml(opts.tenantId ?? '—'))}
        ${row('store_id', escapeHtml(opts.storeId ?? '—'))}
        ${row('Data/hora', escapeHtml(opts.reportedAt))}
      </table>

      <p style="font-size:12px;color:${EMAIL.muted};margin:24px 0 0;border-top:1px solid ${EMAIL.border};padding-top:16px;">Enviado pelo botão "Relatar um problema" do ConvoFlow. O registro completo está na tabela <strong>bug_reports</strong>.</p>
    </div>
  </div>
</body></html>`;
}

/**
 * Destinatários dos relatos, definidos pelo super admin em
 * system_settings.key='bug_report_recipients' (UI: /dashboard/admin →
 * Configurações). Lista ausente/vazia/toda inválida cai no fallback histórico:
 * envia para o próprio REPORT_FROM_EMAIL.
 *
 * Lido com o client de service role, que ignora o RLS de superadmin da tabela —
 * quem relata o bug é um usuário comum e não pode ler system_settings.
 */
async function loadBugReportRecipients(admin: SupabaseClient, fallback: string): Promise<string[]> {
  try {
    const { data, error } = await admin
      .from('system_settings')
      .select('value')
      .eq('key', 'bug_report_recipients')
      .maybeSingle();
    if (error) throw error;

    const raw = (data?.value as { emails?: unknown } | null)?.emails;
    const valid = (Array.isArray(raw) ? raw : [])
      .map((e) => String(e).trim())
      .filter((e) => EMAIL_RE.test(e));
    if (valid.length) return valid;
  } catch (e) {
    console.warn('[send-report/bug_report] Falha ao ler bug_report_recipients:', (e as Error)?.message);
  }
  return [fallback];
}

async function handleBugReport(
  admin: SupabaseClient,
  caller: CallerProfile,
  body: BugReportRequest,
  cors: Record<string, string>,
): Promise<Response> {
  const description = (body.description ?? '').trim();
  if (description.length < 20) {
    throw new SecureError('A descrição precisa ter pelo menos 20 caracteres.', 'INVALID_DESCRIPTION', 400);
  }

  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('REPORT_FROM_EMAIL');
  if (!apiKey) throw new SecureError('RESEND_API_KEY não configurada no servidor.', 'NO_EMAIL_CONFIG', 500);
  if (!from) throw new SecureError('REPORT_FROM_EMAIL não configurada no servidor.', 'NO_EMAIL_CONFIG', 500);

  // Só aceita link de anexo do próprio Storage — impede que a chamada injete
  // uma URL arbitrária num e-mail que sai com a marca ConvoFlow.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const rawAttachment = body.attachment_url ?? null;
  const attachmentUrl =
    rawAttachment && supabaseUrl && rawAttachment.startsWith(supabaseUrl) ? rawAttachment : null;
  if (rawAttachment && !attachmentUrl) {
    console.warn('[send-report/bug_report] attachment_url fora do Storage do projeto — descartado.');
  }

  const userEmail = body.user_email ?? '—';
  const userRole = body.user_role ?? '—';
  const reportedAt = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });

  const html = renderBugReportHtml({
    description,
    pageUrl: body.page_url ?? '—',
    userEmail,
    userRole,
    tenantName: body.tenant_name ?? null,
    tenantId: body.tenant_id ?? caller.tenant_id ?? null,
    storeId: body.store_id ?? null,
    attachmentUrl,
    attachmentType: body.attachment_type ?? null,
    reportedAt,
  });

  // Remetente = REPORT_FROM_EMAIL (mesmo dos relatórios); destinatários vêm da
  // configuração do super admin.
  const recipients = await loadBugReportRecipients(admin, from);

  await sendViaResend({
    apiKey,
    from,
    to: recipients,
    subject: `[ConvoFlow Bug] Relato de ${userRole} (${userEmail})`,
    html,
  });

  return json({ success: true, delivered: [{ channel: 'email', to: recipients }] }, 200, cors);
}

Deno.serve(async (req) => {
  const cors = buildCorsHeaders(req.headers.get('origin'));
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: { message: 'Método não permitido', code: 'METHOD_NOT_ALLOWED' } }, 405, cors);

  const startedAt = Date.now();
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);

  let caller: CallerProfile | null = null;
  let body: ReportRequest = {};

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!token) throw new SecureError('Authorization ausente', 'UNAUTHORIZED', 401);

    const rawBody = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // Relato de bug: fluxo próprio, sem métricas e sem report_executions.
    // `caller` continua null de propósito para que o catch externo não tente
    // registrar uma execução de relatório que nunca existiu.
    if (rawBody?.kind === 'bug_report') {
      const bugCaller = await getCaller(admin, token, { requireTenant: false, requireActive: false });
      return await handleBugReport(admin, bugCaller, rawBody as unknown as BugReportRequest, cors);
    }

    caller = await getCaller(admin, token);
    body = rawBody as ReportRequest;
    // A Loja aberta no seletor, revalidada. Fica em `caller.tenant_id` para o
    // resto do fluxo (montagem, report_executions e o catch) usar UMA fonte.
    caller.tenant_id = await resolveReportTenant(admin, caller, body.tenant_id);

    // Destinatários: separa e-mails de telefones a partir do mesmo campo.
    const rawRecipients = body.delivery?.recipients;
    const rawList = (Array.isArray(rawRecipients) ? rawRecipients : String(rawRecipients ?? '').split(/[,;\n]/))
      .map((r) => r.trim())
      .filter(Boolean);
    const emails = rawList.filter((r) => EMAIL_RE.test(r));
    const phones = rawList
      .filter((r) => !EMAIL_RE.test(r))
      .map((r) => r.replace(/\D/g, ''))
      .filter((d) => d.length >= 10);

    const wantsEmail = body.delivery?.email === true;
    const wantsWhatsapp = body.delivery?.whatsapp === true;
    if (!wantsEmail && !wantsWhatsapp) {
      throw new SecureError('Selecione ao menos um canal de entrega (e-mail ou WhatsApp).', 'NO_CHANNEL', 400);
    }
    if (wantsEmail && emails.length === 0) {
      throw new SecureError('Informe ao menos um e-mail de destinatário válido.', 'NO_EMAIL_RECIPIENTS', 400);
    }
    if (wantsWhatsapp && phones.length === 0) {
      throw new SecureError('Informe ao menos um número de WhatsApp válido (com DDD).', 'NO_PHONE_RECIPIENTS', 400);
    }

    // Freio (item 14 lote 6): teto de destinatários, de envios por hora e do
    // tamanho do nome. Conta os envios pela tela desta pessoa (report_executions,
    // que registra sucesso E falha — tentativa barrada também conta).
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: sentLastHour } = await admin
      .from('report_executions')
      .select('id', { count: 'exact', head: true })
      .eq('executed_by', caller.user_id)
      .gte('executed_at', umaHoraAtras);
    const limite = checkReportLimits({
      emails: wantsEmail ? emails : [],
      phones: wantsWhatsapp ? phones : [],
      name: body.name,
      sentLastHour: sentLastHour ?? 0,
    });
    if (limite) {
      throw new SecureError(limite.message, limite.code, limite.code === 'RATE_LIMITED' ? 429 : 400);
    }

    // Montagem do relatório (uma vez, reaproveitada em ambos os canais).
    // Passa pelo mesmo report-core que o agendador usa — é isso que garante que
    // o e-mail enviado pela tela e o e-mail agendado saiam idênticos.
    const payload = await buildReportPayload(admin, {
      tenantId: caller.tenant_id!,
      name: body.name,
      type: body.type,
      dateRange: body.filters?.dateRange,
      format: body.format,
    });
    const { name, typeLabel, periodLabel, metrics: m } = payload;

    const delivered: Array<{ channel: string; to: string[] }> = [];
    const warnings: string[] = [];

    // --- Canal e-mail ---
    if (wantsEmail) {
      try {
        const apiKey = Deno.env.get('RESEND_API_KEY');
        const from = Deno.env.get('REPORT_FROM_EMAIL');
        if (!apiKey) throw new Error('RESEND_API_KEY não configurada no servidor.');
        if (!from) throw new Error('REPORT_FROM_EMAIL não configurada no servidor.');

        await sendViaResend({
          apiKey,
          from,
          to: emails,
          subject: payload.subject,
          html: payload.html,
          attachments: payload.attachments,
        });
        delivered.push({ channel: 'email', to: emails });
      } catch (e) {
        warnings.push(`E-mail: ${(e as Error).message}`);
      }
    }

    // --- Canal WhatsApp (instância de envio do sistema) ---
    if (wantsWhatsapp) {
      try {
        const instance = await loadSystemWhatsAppInstance(admin);
        const text = renderWhatsAppText(name, typeLabel, periodLabel, m);
        const okPhones: string[] = [];
        for (const phone of phones) {
          try {
            await sendWhatsApp(admin, instance, phone, text);
            okPhones.push(phone);
          } catch (e) {
            warnings.push(`WhatsApp ${phone}: ${(e as Error).message}`);
          }
        }
        if (okPhones.length) delivered.push({ channel: 'whatsapp', to: okPhones });
      } catch (e) {
        warnings.push(`WhatsApp: ${(e as Error).message}`);
      }
    }

    // Nenhum canal entregou → falha (registra como failed via catch).
    if (delivered.length === 0) {
      throw new SecureError(warnings.join(' | ') || 'Nenhum canal foi entregue.', 'DELIVERY_FAILED', 502);
    }

    const allRecipients = [...emails, ...phones];
    const executionTime = Date.now() - startedAt;
    let executionId: string | null = null;
    try {
      const { data: execution } = await admin.from('report_executions').insert({
        tenant_id: caller.tenant_id, template_id: null, executed_by: caller.user_id,
        status: 'success', execution_time: executionTime,
        // parameters guarda a config + destinatários + resultado gerado + avisos.
        parameters: { ...body, recipients: allRecipients, delivered, warnings, result: m },
        executed_at: new Date().toISOString(),
      }).select('id').single();
      executionId = execution?.id ?? null;
    } catch (logErr) {
      console.error('Falha ao registrar report_execution (entrega já realizada):', logErr);
    }

    return json({ success: true, executionId, delivered, warnings, executionTime, metrics: m }, 200, cors);
  } catch (err) {
    const secure = err instanceof SecureError ? err : null;
    if (caller?.tenant_id) {
      await admin.from('report_executions').insert({
        tenant_id: caller.tenant_id, template_id: null, executed_by: caller.user_id,
        status: 'failed', execution_time: Date.now() - startedAt,
        error_message: (err as Error)?.message?.slice(0, 500) ?? 'Erro desconhecido',
        parameters: body, executed_at: new Date().toISOString(),
      }).then(() => {}, () => {});
    }
    return json({ success: false, error: { message: (err as Error)?.message ?? 'Erro interno', code: secure?.code ?? 'INTERNAL_ERROR' } }, secure?.statusCode ?? 500, cors);
  }
});
