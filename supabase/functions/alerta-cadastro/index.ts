/**
 * alerta-cadastro — o email ao superadmin quando um email de login não saiu.
 *
 * Chamada pelo banco (gatilho zz_alerta_falha_de_email em auth_email_failures,
 * via public.cron_worker_kick('alerta-cadastro'), com o segredo do cron), no
 * máximo uma vez a cada 30 minutos. Quem confere a chamada é o backend-gate.
 *
 * Lê as falhas ainda não avisadas, manda UM email com o resumo para todo
 * superadmin ativo e marca as falhas como avisadas. Sem RESEND_API_KEY ou
 * REPORT_FROM_EMAIL não marca nada: o aviso do sino continua lá, e o próximo
 * chamado tenta de novo. A montagem do email mora em _shared/alerta-cadastro.ts.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createLogger } from '../_shared/logger.ts';
import { guardBackendCaller } from '../_shared/backend-gate.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { sendViaResend } from '../_shared/report-core.ts';
import { montarAlerta, type FalhaDeEmail } from '../_shared/alerta-cadastro.ts';

const LINK_DOS_CADASTROS = 'https://www.convoflow.com.br/dashboard/admin?tab=signups';

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  const logger = createLogger(req);
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const denied = await guardBackendCaller(req, logger);
  if (denied) return denied;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('REPORT_FROM_EMAIL');
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);
  if (!resendApiKey || !remetente) {
    logger.error('alerta-cadastro: RESEND_API_KEY ou REPORT_FROM_EMAIL ausente; o sino já avisou');
    return json({ enviado: false, motivo: 'email_nao_configurado' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const { data: falhas, error } = await admin
    .from('auth_email_failures')
    .select('id, source, reason, created_at')
    .is('alertado_em', null)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) {
    logger.error('alerta-cadastro: não li as falhas', { code: error.code });
    return json({ enviado: false }, 500);
  }
  const lista = (falhas ?? []) as FalhaDeEmail[];
  if (lista.length === 0) return json({ enviado: false, motivo: 'nada_novo' });

  const { data: emails, error: emailsError } = await admin.rpc('emails_dos_superadmins');
  const destinatarios = ((emails ?? []) as unknown[]).filter((e): e is string => typeof e === 'string');
  if (emailsError || destinatarios.length === 0) {
    logger.error('alerta-cadastro: sem superadmin para avisar', { code: emailsError?.code });
    return json({ enviado: false }, 500);
  }

  const { subject, html } = montarAlerta(lista, LINK_DOS_CADASTROS);
  try {
    await sendViaResend({ apiKey: resendApiKey, from: remetente, to: destinatarios, subject, html });
  } catch (e) {
    // Não marca: o próximo chamado tenta de novo.
    logger.error('alerta-cadastro: o Resend recusou', { erro: e instanceof Error ? e.message.slice(0, 200) : String(e) });
    return json({ enviado: false }, 502);
  }

  const { error: marcaError } = await admin
    .from('auth_email_failures')
    .update({ alertado_em: new Date().toISOString() })
    .in('id', lista.map((f) => f.id));
  if (marcaError) logger.error('alerta-cadastro: enviei, mas não marquei', { code: marcaError.code });

  logger.info('alerta-cadastro: aviso enviado', { falhas: lista.length, destinatarios: destinatarios.length });
  return json({ enviado: true, falhas: lista.length });
});
