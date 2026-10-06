import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createLogger } from '../_shared/logger.ts';
import { decideInstanceAccess } from '../_shared/instance-access.ts';
import { buildCorsHeaders } from '../_shared/validation.ts';
import { ProviderFactory } from '../_shared/provider-factory.ts';
import { MetaProvider } from '../_shared/whatsapp-providers/meta.ts';

/**
 * list-whatsapp-templates
 *
 * Lista os message templates de uma instância Meta (Cloud API) direto da Graph
 * API (SKILL.md §7.1), para o frontend oferecer um seletor de templates
 * aprovados em vez de exigir o nome digitado.
 *
 * O token Meta vive no Vault e é resolvido pelo ProviderFactory via
 * get_instance_meta_token (SECURITY DEFINER). Consumida pelo MetaAdapter.
 */

interface ListRequest {
  instance_id: string;
}

Deno.serve(async (req: Request) => {
  const logger = createLogger(req);
  const corsHeaders = buildCorsHeaders(req.headers.get('origin'));

  const jsonResponse = (body: Record<string, any>, status: number): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !supabaseServiceKey) {
    logger.error('Missing Supabase configuration');
    return jsonResponse({ ok: false, error: 'Server misconfigured' }, 500);
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  // Auth: extrair JWT e identificar caller
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return jsonResponse({ ok: false, error: 'Missing authorization header' }, 401);
  const token = authHeader.replace('Bearer ', '');
  const { data: { user: callerUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !callerUser) return jsonResponse({ ok: false, error: 'Invalid token' }, 401);

  const { data: callerProfile } = await supabaseAdmin
    .from('profiles')
    .select('tenant_id, role, status')
    .eq('user_id', callerUser.id)
    .single();
  if (!callerProfile?.tenant_id) return jsonResponse({ ok: false, error: 'Profile not found' }, 403);

  // Parse body
  let body: ListRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body' }, 400);
  }
  if (!body?.instance_id) {
    return jsonResponse({ ok: false, error: 'instance_id is required' }, 400);
  }

  // Resolve instância e checa tenant + provider=official
  const { data: instance, error: instanceError } = await supabaseAdmin
    .from('whatsapp_instances')
    .select('id, tenant_id, provider, instance_key, connection_config, status')
    .eq('id', body.instance_id)
    .single();
  if (instanceError || !instance) return jsonResponse({ ok: false, error: 'Instance not found' }, 404);

  // Quem pode usar a instância: superadmin, a própria Conta/Loja, ou o gerente
  // da Conta-mãe numa Loja filha (espelho de `gerente_child_store_ids()` — a
  // mesma regra que já deixa o inbox GRAVAR em `messages`; ver
  // `_shared/instance-access.ts`).
  const { data: instanceTenant } = await supabaseAdmin
    .from('tenants')
    .select('id, kind, parent_tenant_id')
    .eq('id', instance.tenant_id)
    .maybeSingle();
  const access = decideInstanceAccess(callerProfile, instance, instanceTenant);
  if (!access.allowed) {
    return jsonResponse({ ok: false, error: 'Forbidden' }, 403);
  }
  if (instance.provider !== 'official') {
    return jsonResponse(
      { ok: false, error: 'Esta função só atende instâncias Meta (provider=official).' },
      400,
    );
  }

  const cfg = (instance.connection_config as Record<string, any>) || {};
  if (!cfg.wabaId) {
    return jsonResponse(
      { ok: false, error: 'connection_config.wabaId ausente: não é possível listar templates.' },
      400,
    );
  }

  try {
    const provider = await ProviderFactory.getProvider(instance as any, supabaseAdmin) as MetaProvider;
    const raw = await provider.listTemplates();

    // Normaliza o shape para o frontend: nome, idioma, status, categoria, a
    // contagem de parâmetros {{n}} do corpo (para montar os campos no diálogo)
    // e — desde a tela de Templates — cabeçalho, rodapé e botões.
    //
    // Esses três já vinham na resposta da Graph API (o `fields=` do §7.1 pede
    // `components`) e eram DESCARTADOS aqui. Expô-los não custa chamada nova,
    // permissão nova nem cota: é só parar de jogar fora.
    //
    // A adição é ADITIVA de propósito. O SendTemplateDialog consome
    // { name, language, status, category, bodyText, paramCount } — esses seis
    // seguem idênticos, no mesmo lugar. Não renomeie nem reordene.
    const upper = (v: unknown): string => String(v ?? '').toUpperCase();

    const templates = raw.map((t: any) => {
      const components: any[] = Array.isArray(t.components) ? t.components : [];
      const compOf = (type: string) => components.find((c: any) => upper(c?.type) === type) || null;

      const bodyComp = compOf('BODY');
      const bodyText: string = bodyComp?.text || '';
      const matches = bodyText.match(/\{\{\s*\d+\s*\}\}/g);
      const paramCount = matches ? new Set(matches.map((m: string) => m.replace(/\D/g, ''))).size : 0;

      // HEADER: em `format: TEXT` o conteúdo vem em `text` (podendo conter
      // {{1}}); em IMAGE/VIDEO/DOCUMENT não há texto nenhum — só o formato,
      // que a UI rotula ("Imagem", "Vídeo", "Documento").
      const headerComp = compOf('HEADER');
      const header = headerComp
        ? { format: upper(headerComp.format) || 'TEXT', text: headerComp.text || '' }
        : null;

      const footerComp = compOf('FOOTER');
      const footer = footerComp?.text ? { text: String(footerComp.text) } : null;

      // Um template tem no máximo um componente BUTTONS hoje, mas achatamos
      // todos para não perder botão se a Meta passar a devolver mais de um.
      const buttons = components
        .filter((c: any) => upper(c?.type) === 'BUTTONS')
        .flatMap((c: any) => (Array.isArray(c?.buttons) ? c.buttons : []))
        .map((b: any) => ({
          type: upper(b?.type),
          text: b?.text || '',
          url: b?.url ?? null,
          phoneNumber: b?.phone_number ?? null,
        }));

      return {
        name: t.name,
        language: t.language,
        status: t.status,
        category: t.category,
        bodyText,
        paramCount,
        header,
        footer,
        buttons,
      };
    });

    logger.info('Templates Meta listados', { instance_id: instance.id, count: templates.length });
    return jsonResponse({ ok: true, templates }, 200);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error('Falha ao listar templates Meta', { instance_id: instance.id, error: msg });
    return jsonResponse({ ok: false, error: msg }, 502);
  }
});
