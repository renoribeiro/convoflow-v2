// =============================================================================
// nfse-admin — o que as telas pedem sobre a nota fiscal (parte 2)
// =============================================================================
// POST com a sessão do usuário (Authorization: Bearer <jwt>):
//   {acao:'baixar', nota_id, tipo:'pdf'|'xml'} → {url} (vale 60 s)
//       Quem vê a nota pelo RLS baixa: o superadmin qualquer uma; o Gerente
//       só as da própria Conta, de produção, emitidas ou canceladas. A
//       leitura é feita COM o token de quem pede, então a regra é a do banco.
//   {acao:'reemitir', charge_id}  → {ok, nota_status}   só superadmin
//   {acao:'cancelar', nota_id}    → {ok, nota_status}   só superadmin
//       Motivo fixo "2 - Serviço não prestado"; depois do dia 10 do mês
//       seguinte à emissão vira cancelar_manual (regra do dono).
// Erro: status 4xx/5xx com {error: 'mensagem em pt-BR'}.
// verify_jwt = false: a função confere o login no próprio código.
// =============================================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createLogger } from '../_shared/logger.ts';
import { corsHeaders } from '../_shared/validation.ts';
import { BUCKET, clienteDeServico, lerConfiguracao, montarPortas } from '../_shared/nfse/adaptadores.ts';
import { cancelarNota, processarCobranca, type Cobranca, type Nota } from '../_shared/nfse/worker-core.ts';

const json = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
const erro = (status: number, mensagem: string) => json(status, { error: mensagem });

const REEMITIVEIS = ['erro', 'aguardando_prefeitura', 'certificado_vencido', 'aguardando_emissao'];
const UUID = /^[0-9a-f-]{36}$/i;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return erro(405, 'Método não permitido.');
  const logger = createLogger(req);

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return erro(401, 'Entre no sistema de novo.');
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const comoUsuario = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: u } = await comoUsuario.auth.getUser(token);
  if (!u?.user) return erro(401, 'Entre no sistema de novo.');

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return erro(400, 'Pedido inválido.');
  }
  const servico = clienteDeServico();

  if (corpo.acao === 'baixar') {
    const tipo = corpo.tipo === 'xml' ? 'xml' : corpo.tipo === 'pdf' ? 'pdf' : null;
    if (!tipo || typeof corpo.nota_id !== 'string' || !UUID.test(corpo.nota_id)) return erro(400, 'Pedido inválido.');
    // Lida com o token de quem pede: o RLS decide se ele vê esta nota.
    const { data: nota } = await comoUsuario.from('notas_fiscais').select('id, pdf_path, xml_path').eq('id', corpo.nota_id).maybeSingle();
    const caminho = nota ? (tipo === 'pdf' ? nota.pdf_path : nota.xml_path) : null;
    if (!caminho) return erro(404, 'Nota não encontrada.');
    const { data, error } = await servico.storage.from(BUCKET).createSignedUrl(caminho, 60, { download: true });
    if (error || !data?.signedUrl) return erro(500, 'Não foi possível gerar o link agora. Tente de novo.');
    return json(200, { url: data.signedUrl });
  }

  // Daqui para baixo, só o superadmin.
  const { data: perfil } = await servico.from('profiles').select('role, status').eq('user_id', u.user.id).maybeSingle();
  if (perfil?.role !== 'superadmin' || perfil?.status !== 'active') return erro(403, 'Só o superadmin faz isso.');

  const cfg = lerConfiguracao();
  if (!cfg.ok) {
    logger.error('nfse-admin: configuração incompleta', { motivo: cfg.motivo });
    return erro(503, 'A emissão de nota fiscal não está configurada no servidor.');
  }
  const portas = montarPortas(servico, cfg, (m, c) => logger.info(m, c));

  try {
    if (corpo.acao === 'reemitir') {
      if (typeof corpo.charge_id !== 'string' || !UUID.test(corpo.charge_id)) return erro(400, 'Pedido inválido.');
      const cobranca = await portas.banco.cobranca(corpo.charge_id);
      if (!cobranca) return erro(404, 'Cobrança não encontrada.');
      if (!REEMITIVEIS.includes(cobranca.nota_status)) return erro(409, 'Esta cobrança não está esperando nota.');
      if (cfg.ambiente === 'restrita' && !(cobranca.tenant_id && cfg.contasTeste.includes(cobranca.tenant_id))) {
        return erro(409, 'No ambiente de teste só a Conta de teste recebe nota.');
      }
      const { data: n } = await servico.from('notas_fiscais').select('id').eq('charge_id', cobranca.id).eq('ambiente', cfg.ambiente).maybeSingle();
      if (n) await portas.banco.atualizarNota(n.id, { status: 'aguardando_emissao', proxima_tentativa_em: null, travada_ate: null });
      await portas.banco.atualizarCobranca(cobranca.id, { nota_status: 'aguardando_emissao' });
      const resultado = await processarCobranca(portas, cobranca.id);
      const depois = await portas.banco.cobranca(cobranca.id);
      logger.info('nfse-admin: reemitir', { cobranca: cobranca.id, resultado });
      return json(200, { ok: true, resultado, nota_status: depois?.nota_status });
    }

    if (corpo.acao === 'cancelar') {
      if (typeof corpo.nota_id !== 'string' || !UUID.test(corpo.nota_id)) return erro(400, 'Pedido inválido.');
      const nota = (await portas.banco.nota(corpo.nota_id)) as Nota | null;
      if (!nota) return erro(404, 'Nota não encontrada.');
      if (nota.ambiente !== cfg.ambiente) return erro(409, 'Esta nota é de outro ambiente.');
      if (nota.status !== 'emitida') return erro(409, 'Só nota emitida pode ser cancelada.');
      const cobranca = (await portas.banco.cobranca(nota.charge_id)) as Cobranca;
      const r = await cancelarNota(portas, nota, cobranca);
      logger.info('nfse-admin: cancelar', { nota: nota.id, r });
      if (r === 'erro') return erro(502, 'A Sefin não confirmou o cancelamento. Veja o erro na linha da nota e tente de novo.');
      return json(200, { ok: true, nota_status: r });
    }
  } catch (e) {
    logger.error('nfse-admin: falhou', { erro: (e as Error).message });
    return erro(500, 'Algo falhou. Tente de novo em alguns minutos.');
  }

  return erro(400, 'Ação desconhecida.');
});
