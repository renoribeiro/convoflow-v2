// =============================================================================
// media-links — link temporário (1 hora) da mídia das Conversas
// =============================================================================
// POST com a sessão do usuário (Authorization: Bearer <jwt>):
//   {message_ids: [uuid, ...]}  (até 100)  →  {links: {<message_id>: <url>}, expires_in}
// Mensagem que a pessoa não vê, ou cujo arquivo não bate com ela, simplesmente
// não aparece em `links`. A regra está em _shared/media-links.ts.
// verify_jwt = false: a função confere o login no próprio código.
// =============================================================================

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { createLogger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { atenderMediaLinks, WHATSAPP_MEDIA_BUCKET, type LinhaDaMensagem } from '../_shared/media-links.ts';

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));
  const json = (status: number, corpo: unknown) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!url || !anon || !servico) {
    logger.error('media-links: configuração do Supabase ausente');
    return json(500, { error: 'Servidor sem configuração.' });
  }

  let corpo: unknown = null;
  try {
    corpo = await req.json();
  } catch {
    corpo = null;
  }

  const comoUsuario = (token: string) =>
    createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const admin = createClient(url, servico, { auth: { persistSession: false } });

  try {
    const r = await atenderMediaLinks(
      { token: req.headers.get('Authorization'), corpo },
      {
        origemDoProjeto: url,
        async usuarioDoToken(token) {
          const { data } = await comoUsuario(token).auth.getUser(token);
          return data?.user ? { id: data.user.id } : null;
        },
        async lerMensagens(token, ids) {
          const { data, error } = await comoUsuario(token)
            .from('messages')
            .select('id, tenant_id, direction, evolution_message_id, media_url')
            .in('id', ids);
          if (error) throw new Error(`leitura das mensagens: ${error.message}`);
          return (data ?? []) as LinhaDaMensagem[];
        },
        async assinar(caminhos, validadeS) {
          const { data, error } = await admin.storage.from(WHATSAPP_MEDIA_BUCKET).createSignedUrls(caminhos, validadeS);
          if (error) throw new Error(`assinatura: ${error.message}`);
          return (data ?? []).map((d: { path: string | null; signedUrl: string | null; error: string | null }) => ({
            path: d.path ?? '',
            signedUrl: d.error ? null : d.signedUrl,
          }));
        },
      },
    );
    if (r.status === 200 && 'links' in r.body) {
      const pedidos = Array.isArray((corpo as { message_ids?: unknown[] } | null)?.message_ids)
        ? (corpo as { message_ids: unknown[] }).message_ids.length
        : 0;
      logger.info('media-links', { pedidos, links: Object.keys(r.body.links).length });
    }
    return json(r.status, r.body);
  } catch (e) {
    logger.error('media-links: falhou', { erro: (e as Error).message });
    return json(500, { error: 'Não foi possível abrir os arquivos agora. Tente de novo.' });
  }
});
