// =============================================================================
// nfse/adaptadores.ts — liga o worker-core às peças de verdade (só Deno)
// =============================================================================
// Banco (cliente de serviço), bucket privado notas-fiscais, Resend, Stripe,
// IBGE, sino + e-mail do superadmin e a função da Vercel.
//
// Secrets do Supabase (nunca no código):
//   NFSE_AMBIENTE        restrita | producao  (o mesmo da Vercel)
//   NFSE_FUNCAO_URL      endereço de api/nfse na Vercel
//   NFSE_HMAC_SECRET     o segredo dividido com a Vercel
//   NFSE_CONTAS_TESTE    ids das Contas de teste (vírgula): a restrita só emite para elas
//   NFSE_EMAIL_TESTE     na restrita, o e-mail da nota vai SÓ para este endereço
//   NFSE_EMAIL_AVISOS    quem recebe o e-mail de "Fortaleza ligou o Emissor Nacional"
//   NFSE_FROM_EMAIL      remetente (cai para REPORT_FROM_EMAIL)
//   RESEND_API_KEY, STRIPE_SECRET_KEY, STRIPE_PRICE_STORE_SLOT, STRIPE_PRODUCT_ATTENDANT (já existiam)
// =============================================================================

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { sendViaResend } from '../report-core.ts';
import { criarClienteNfse } from './cliente-vercel.ts';
import { gerarDanfsePdf } from './danfse-pdf.ts';
import { modeloDoDanfse } from './danfse-modelo.ts';
import { resumoDaFatura } from './descricao.ts';
import { ambienteValido, STATUS_FINAIS, STATUS_NA_FILA, type Ambiente, type StatusCobranca } from './regras.ts';
import type { Cobranca, Config, DadosFiscais, Nota, PortaBanco, Portas } from './worker-core.ts';

export const BUCKET = 'notas-fiscais';
const LINK_FATURAMENTO = '/dashboard/admin';

export function clienteDeServico(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false },
  });
}

/** Lê e confere as secrets. Devolve o motivo quando falta alguma. */
export function lerConfiguracao(): { ok: true; ambiente: Ambiente; url: string; segredo: string; contasTeste: string[]; emailTeste: string | null; emailAvisos: string | null } | { ok: false; motivo: string } {
  const ambiente = Deno.env.get('NFSE_AMBIENTE');
  const url = Deno.env.get('NFSE_FUNCAO_URL') ?? '';
  const segredo = Deno.env.get('NFSE_HMAC_SECRET') ?? '';
  if (!ambienteValido(ambiente)) return { ok: false, motivo: 'NFSE_AMBIENTE ausente ou inválido' };
  if (!/^https:\/\/[^/]+\/api\/nfse$/.test(url)) return { ok: false, motivo: 'NFSE_FUNCAO_URL ausente ou inválido' };
  if (segredo.length < 32) return { ok: false, motivo: 'NFSE_HMAC_SECRET ausente ou curto' };
  const contasTeste = (Deno.env.get('NFSE_CONTAS_TESTE') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => /^[0-9a-f-]{36}$/i.test(s));
  return {
    ok: true,
    ambiente,
    url,
    segredo,
    contasTeste,
    emailTeste: Deno.env.get('NFSE_EMAIL_TESTE')?.trim() || null,
    emailAvisos: Deno.env.get('NFSE_EMAIL_AVISOS')?.trim() || null,
  };
}

function falhou(contexto: string, error: unknown): never {
  const msg = (error as { message?: string })?.message ?? String(error);
  throw new Error(`${contexto}: ${msg}`);
}

const comNota = (ambiente: Ambiente) => (linha: Record<string, unknown>) => {
  const notas = (linha.notas as Nota[] | null) ?? [];
  const { notas: _n, ...cobranca } = linha;
  return { cobranca: cobranca as unknown as Cobranca, nota: notas.find((n) => n.ambiente === ambiente) ?? null };
};

export function bancoSupabase(db: SupabaseClient, contasTeste: string[], ambiente: Ambiente): PortaBanco {
  const agoraIso = () => new Date().toISOString();
  const noEscopo = <T extends { in: (c: string, v: string[]) => T }>(q: T): T => (ambiente === 'restrita' ? q.in('tenant_id', contasTeste.length ? contasTeste : ['00000000-0000-0000-0000-000000000000']) : q);
  return {
    async config() {
      const { data, error } = await db.from('nfse_config').select('*').eq('id', true).single();
      if (error) falhou('nfse_config', error);
      return data as Config;
    },
    async atualizarConfig(patch) {
      const { error } = await db.from('nfse_config').update({ ...patch, atualizado_em: agoraIso() }).eq('id', true);
      if (error) falhou('atualizar nfse_config', error);
    },
    async candidatas(amb, limite) {
      const { data, error } = await noEscopo(
        db
          .from('billing_charges')
          .select('*, notas:notas_fiscais(*)')
          .in('nota_status', STATUS_NA_FILA as string[])
          .gt('amount_paid_cents', 0),
      )
        .order('paid_at', { ascending: true })
        .limit(limite * 5);
      if (error) falhou('candidatas', error);
      const agora = Date.now();
      return (data ?? [])
        .map(comNota(amb))
        .filter(({ nota }) =>
          !nota ||
          ((!nota.proxima_tentativa_em || new Date(nota.proxima_tentativa_em).getTime() <= agora) &&
            (!nota.travada_ate || new Date(nota.travada_ate).getTime() < agora)))
        .slice(0, limite);
    },
    async cobranca(id) {
      const { data, error } = await db.from('billing_charges').select('*').eq('id', id).maybeSingle();
      if (error) falhou('cobrança', error);
      return (data as Cobranca | null) ?? null;
    },
    async dadosFiscais(tenantId) {
      const { data, error } = await db.from('tenant_billing_details').select('*').eq('tenant_id', tenantId).maybeSingle();
      if (error) falhou('dados fiscais', error);
      return (data as DadosFiscais | null) ?? null;
    },
    async reservarNota(chargeId, amb) {
      const { data, error } = await db.rpc('nfse_reservar_numero', { p_charge: chargeId, p_ambiente: amb });
      if (error) falhou('reservar número', error);
      return (Array.isArray(data) ? data[0] : data) as Nota;
    },
    async nota(id) {
      const { data, error } = await db.from('notas_fiscais').select('*').eq('id', id).maybeSingle();
      if (error) falhou('nota', error);
      return (data as Nota | null) ?? null;
    },
    async travar(id, ate, agora) {
      // Compare-and-swap: só grava se a trava ainda é a que foi lida. Dois
      // processos ao mesmo tempo: um muda a linha, o outro não acha nada.
      // (O filtro .or() com data no UPDATE falhou no PostgREST em 2026-10-16.)
      const { data: atual, error: e1 } = await db.from('notas_fiscais').select('travada_ate').eq('id', id).single();
      if (e1) falhou('ler trava', e1);
      const antes = (atual as { travada_ate: string | null }).travada_ate;
      if (antes && new Date(antes).getTime() >= agora.getTime()) return false;
      const base = db.from('notas_fiscais').update({ travada_ate: ate.toISOString() }).eq('id', id);
      const { data, error } = await (antes === null ? base.is('travada_ate', null) : base.eq('travada_ate', antes)).select('id');
      if (error) falhou('travar', error);
      return (data ?? []).length === 1;
    },
    async atualizarNota(id, patch) {
      const { error } = await db.from('notas_fiscais').update({ ...patch, updated_at: agoraIso() }).eq('id', id);
      if (error) falhou('atualizar nota', error);
    },
    async atualizarCobranca(id, patch) {
      const { error } = await db.from('billing_charges').update({ ...patch, updated_at: agoraIso() }).eq('id', id);
      if (error) falhou('atualizar cobrança', error);
    },
    async emitidasComReembolso(amb) {
      const { data, error } = await db
        .from('notas_fiscais')
        .select('*, cobranca:billing_charges!inner(*)')
        .eq('ambiente', amb)
        .eq('status', 'emitida')
        .gt('cobranca.amount_refunded_cents', 0);
      if (error) falhou('emitidas com reembolso', error);
      return (data ?? []).map((l: Record<string, unknown>) => {
        const { cobranca, ...nota } = l;
        return { cobranca: cobranca as Cobranca, nota: nota as unknown as Nota };
      });
    },
    async semEmail(amb) {
      const { data, error } = await db
        .from('notas_fiscais')
        .select('*')
        .eq('ambiente', amb)
        .eq('status', 'emitida')
        .is('email_enviado_em', null)
        .lt('email_tentativas', 3)
        .not('pdf_path', 'is', null)
        .limit(20);
      if (error) falhou('sem e-mail', error);
      return (data ?? []) as Nota[];
    },
    async cobrancasNoEstado(estados: StatusCobranca[]) {
      const { data, error } = await noEscopo(db.from('billing_charges').select('*').in('nota_status', estados));
      if (error) falhou('cobranças no estado', error);
      return (data ?? []) as Cobranca[];
    },
    async pagasSemTentativa(amb, ate) {
      const { data, error } = await noEscopo(
        db
          .from('billing_charges')
          .select('*, notas:notas_fiscais(*)')
          .gt('amount_paid_cents', 0)
          .lt('paid_at', ate.toISOString())
          .not('nota_status', 'in', `(${STATUS_FINAIS.join(',')})`),
      ).limit(500);
      if (error) falhou('pagas sem tentativa', error);
      return (data ?? []).map(comNota(amb)).filter(({ nota }) => !nota).map(({ cobranca }) => cobranca);
    },
    async paradas(ate) {
      const { data, error } = await noEscopo(
        db
          .from('billing_charges')
          .select('*')
          .gt('amount_paid_cents', 0)
          .lt('paid_at', ate.toISOString())
          .in('nota_status', STATUS_NA_FILA as string[]),
      ).limit(500);
      if (error) falhou('paradas', error);
      return (data ?? []) as Cobranca[];
    },
  };
}

/** Normaliza nome de cidade para comparar com o IBGE. */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

export function montarPortas(db: SupabaseClient, cfg: { ambiente: Ambiente; url: string; segredo: string; contasTeste: string[]; emailTeste: string | null; emailAvisos?: string | null }, log: (m: string, c?: Record<string, unknown>) => void): Portas {
  const resendKey = Deno.env.get('RESEND_API_KEY') ?? '';
  const remetente = Deno.env.get('NFSE_FROM_EMAIL') || Deno.env.get('REPORT_FROM_EMAIL') || '';
  const enviar = async (para: string[], assunto: string, html: string, anexos?: Array<{ nome: string; base64: string }>): Promise<string | null> => {
    if (!resendKey || !remetente) throw new Error('RESEND_API_KEY ou remetente ausente');
    return await sendViaResend({
      apiKey: resendKey,
      from: remetente,
      to: para,
      subject: assunto,
      html,
      attachments: anexos?.map((a) => ({ filename: a.nome, content: a.base64 })),
    });
  };

  return {
    ambiente: cfg.ambiente,
    contasTeste: cfg.contasTeste,
    emailTeste: cfg.emailTeste,
    emailAvisos: cfg.emailAvisos ?? null,
    agora: () => new Date(),
    banco: bancoSupabase(db, cfg.contasTeste, cfg.ambiente),
    nfse: criarClienteNfse({ url: cfg.url, segredo: cfg.segredo, ambiente: cfg.ambiente }),
    arquivos: {
      async salvar(caminho, conteudo, tipo) {
        const corpo = new Blob([conteudo], { type: tipo });
        const { error } = await db.storage.from(BUCKET).upload(caminho, corpo, { contentType: tipo, upsert: true });
        if (error) falhou(`guardar ${caminho}`, error);
      },
      async urlAssinada(caminho, segundos) {
        const { data, error } = await db.storage.from(BUCKET).createSignedUrl(caminho, segundos);
        if (error || !data?.signedUrl) falhou(`link de ${caminho}`, error ?? 'sem url');
        return data.signedUrl;
      },
      async baixar(caminho) {
        const { data, error } = await db.storage.from(BUCKET).download(caminho);
        if (error || !data) return null;
        return new Uint8Array(await data.arrayBuffer());
      },
    },
    email: {
      async enviar(m) {
        return await enviar(m.para, m.assunto, m.html, m.anexos);
      },
    },
    avisos: {
      async superadmin(chave, titulo, mensagem, opts) {
        const { error } = await db.from('nfse_alertas').insert({ chave: chave.slice(0, 300), titulo });
        if (error) {
          if ((error as { code?: string }).code === '23505') return false; // já avisado
          log('nfse: alerta não registrado', { chave, erro: error.message });
          return false;
        }
        const { data: admins } = await db.from('profiles').select('user_id').eq('role', 'superadmin').eq('status', 'active');
        const emails: string[] = [];
        for (const a of admins ?? []) {
          const uid = (a as { user_id: string | null }).user_id;
          if (!uid) continue;
          await db.from('notifications').insert({
            user_id: uid,
            title: titulo,
            message: mensagem,
            type: 'warning',
            action_url: LINK_FATURAMENTO,
            action_label: 'Abrir Faturamento',
            metadata: { source: 'nfse', chave },
          });
          if (!opts?.emails) {
            const { data } = await db.auth.admin.getUserById(uid);
            if (data?.user?.email) emails.push(data.user.email);
          }
        }
        if (opts?.emails) emails.push(...opts.emails.filter(Boolean));
        if (emails.length) {
          try {
            await enviar(emails, `[ConvoFlow] ${titulo}`, `<p>${mensagem.replace(/</g, '&lt;')}</p><p>Abra Administração, Faturamento, Cobranças.</p>`);
          } catch (e) {
            log('nfse: e-mail do alerta falhou', { erro: (e as Error).message });
          }
        }
        return true;
      },
    },
    gerarPdf: async (xml, opts) => gerarDanfsePdf(modeloDoDanfse(xml, opts)),
    async itensDaFatura(invoiceId) {
      const chave = Deno.env.get('STRIPE_SECRET_KEY');
      if (!chave) throw new Error('STRIPE_SECRET_KEY ausente');
      const res = await fetch(`https://api.stripe.com/v1/invoices/${encodeURIComponent(invoiceId)}?expand[]=lines.data.price`, {
        headers: { Authorization: `Bearer ${chave}`, 'Stripe-Version': '2024-12-18.acacia' },
      });
      if (!res.ok) throw new Error(`Stripe respondeu ${res.status}`);
      return resumoDaFatura(await res.json(), {
        precoLojaExtra: Deno.env.get('STRIPE_PRICE_STORE_SLOT') ?? null,
        produtoAtendente: Deno.env.get('STRIPE_PRODUCT_ATTENDANT') ?? null,
      });
    },
    async codigoIbge(cidade, uf) {
      try {
        const res = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios`);
        if (!res.ok) return null;
        const lista = (await res.json()) as Array<{ id: number; nome: string }>;
        const alvo = semAcento(cidade);
        const achado = lista.find((m) => semAcento(m.nome) === alvo);
        return achado ? String(achado.id) : null;
      } catch {
        return null;
      }
    },
    log,
  };
}

/**
 * Situação do e-mail de uma nota no Resend (delivered, bounced, complained = spam,
 * opened, ...). Pelo id guardado; sem id (e-mails de antes de 2026-10-16),
 * procura pelo assunto na lista recente e guarda o id achado. Devolve só a
 * situação: nem destinatário nem conteúdo.
 */
export async function statusDoEmailNoResend(db: SupabaseClient, notaId: string): Promise<{ status: string | null; via: 'id' | 'lista' | 'nenhum'; detalhe?: string }> {
  const chave = Deno.env.get('RESEND_API_KEY');
  if (!chave) return { status: null, via: 'nenhum', detalhe: 'sem RESEND_API_KEY' };
  const { data: nota } = await db.from('notas_fiscais').select('id, email_resend_id, numero_nfse, ambiente, email_enviado_em').eq('id', notaId).maybeSingle();
  if (!nota) return { status: null, via: 'nenhum', detalhe: 'nota não encontrada' };
  if (!nota.email_enviado_em) return { status: null, via: 'nenhum', detalhe: 'e-mail ainda não enviado' };
  const cabecalhos = { Authorization: `Bearer ${chave}` };
  if (nota.email_resend_id) {
    const r = await fetch(`https://api.resend.com/emails/${encodeURIComponent(nota.email_resend_id)}`, { headers: cabecalhos });
    if (!r.ok) return { status: null, via: 'id', detalhe: `Resend respondeu HTTP ${r.status}` };
    const j = (await r.json()) as { last_event?: string };
    return { status: j.last_event ?? null, via: 'id' };
  }
  const assunto = `${nota.ambiente === 'restrita' ? '[TESTE] ' : ''}Nota fiscal de serviço ConvoFlow nº ${nota.numero_nfse}`;
  const r = await fetch('https://api.resend.com/emails?limit=100', { headers: cabecalhos });
  if (!r.ok) return { status: null, via: 'lista', detalhe: `Resend respondeu HTTP ${r.status}` };
  const lista = ((await r.json()) as { data?: Array<{ id: string; subject?: string; last_event?: string }> }).data ?? [];
  const achado = lista.find((e) => e.subject === assunto);
  if (!achado) return { status: null, via: 'lista', detalhe: 'não achei o e-mail pelo assunto' };
  await db.from('notas_fiscais').update({ email_resend_id: achado.id }).eq('id', nota.id);
  return { status: achado.last_event ?? null, via: 'lista' };
}
