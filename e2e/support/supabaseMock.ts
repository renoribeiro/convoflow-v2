import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext, Route } from '@playwright/test';

/**
 * Sessão falsa + backend falso do Supabase para o Playwright.
 *
 * POR QUE EXISTE. O dashboard exige sessão do Supabase e não há credencial de
 * teste no repositório. Em vez de logar de verdade, este módulo:
 *
 *   1. Grava no localStorage (chave `convoflow-auth`, a mesma do client em
 *      src/integrations/supabase/client.ts) uma sessão com um JWT de mentira.
 *      O supabase-js só confere o formato e a validade (`expires_at`), nunca a
 *      assinatura — a assinatura é conferida pelo servidor, que aqui é falso.
 *   2. Intercepta toda requisição para `/auth/v1`, `/rest/v1`, `/functions/v1`
 *      e responde localmente. Nenhum byte chega ao Supabase real.
 *
 * DE ONDE VÊM OS DADOS. As linhas são geradas a partir dos tipos em
 * src/integrations/supabase/types.ts (a seção `Row` de cada tabela), então uma
 * coluna nova aparece sozinha nas respostas. Os valores são realistas e curtos
 * de propósito (nomes de duas palavras, etiquetas de uma) — nomes compridos
 * inflam tabela e disfarçam o layout que o usuário vê de fato.
 *
 * O QUE ESTE MOCK NÃO FAZ. Não simula RLS, nem paginação por cursor, nem
 * Realtime (o WebSocket falha e o app cai no polling, como em produção). É
 * suficiente para RENDERIZAR cada tela com dados; não serve para testar regra
 * de negócio.
 *
 * COMO USAR
 *   const ctx = await browser.newContext();
 *   await installSupabaseMock(ctx, 'gerente');
 *   const page = await ctx.newPage();
 *   await page.goto('/dashboard');
 */

export type MockRole = 'superadmin' | 'gerente' | 'gestor' | 'atendente';

// O pacote é ESM (`"type": "module"`), então não existe __dirname aqui.
const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// ----------------------------------------------------------------- schema --
interface Column { col: string; type: string }

const TABLES: Record<string, Column[]> = {};
const ENUMS: Record<string, string[]> = {};
{
  const src = fs
    .readFileSync(path.join(PROJECT_ROOT, 'src/integrations/supabase/types.ts'), 'utf8')
    .replace(/\r\n/g, '\n');
  const rowRe = /^ {6}([a-z_0-9]+): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm;
  let m: RegExpExecArray | null;
  while ((m = rowRe.exec(src))) {
    TABLES[m[1]] = m[2]
      .split('\n')
      .map((line) => line.match(/^\s+([a-z_0-9]+): (.+)$/))
      .filter((x): x is RegExpMatchArray => !!x)
      .map((x) => ({ col: x[1], type: x[2].replace(/\s*\|\s*null/g, '').trim() }));
  }
  const enumsSection = src.slice(src.indexOf('    Enums: {'));
  const enumRe = /^ {6}([a-z_0-9]+):\s*\n((?:\s+\| "[^"]+"\n)+)/gm;
  while ((m = enumRe.exec(enumsSection))) {
    ENUMS[m[1]] = [...m[2].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }
}

// --------------------------------------------------------------- fixtures --
export const IDS = {
  user: '11111111-1111-4111-8111-111111111111',
  profile: '22222222-2222-4222-8222-222222222222',
  tenant: '33333333-3333-4333-8333-333333333333',
  instance: '55555555-5555-4555-8555-555555555555',
};

const uid = (i: number, k = 'a') =>
  `${k.repeat(8)}-0000-4000-8000-${String(i).padStart(12, '0')}`;

const PEOPLE = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Rocha', 'Elisa Melo', 'Fábio Nunes', 'Gabi Prado', 'Hugo Reis'];
const STAGES = ['Novo Lead', 'Contato Feito', 'Proposta', 'Negociação', 'Fechado'];
const SOURCES = ['Instagram', 'Google Ads', 'Indicação', 'Site'];
const TAGS = ['VIP', 'Quente', 'Frio', 'Retorno', 'Orçamento', 'Reclamação'];
const MESSAGES = [
  'Oi, vocês entregam no centro?',
  'Quero um orçamento de 3 unidades.',
  'Obrigado, vou pensar e retorno.',
  'Qual o horário de atendimento?',
];
const MODULES = ['conversations', 'contacts', 'funnel', 'tracking', 'reports', 'chatbots', 'campaigns', 'followups', 'automation', 'whatsapp-numbers'];

const STATUS_BY_TABLE: Record<string, string> = {
  whatsapp_instances: 'connected', mass_message_campaigns: 'running', campaigns: 'active',
  individual_followups: 'pending', chatbot_sessions: 'active', profiles: 'active', subscriptions: 'active',
  tenants: 'active', report_executions: 'completed', report_schedules: 'active', messages: 'delivered',
  bug_reports: 'open', webhook_logs: 'success', stripe_transactions: 'succeeded',
  automation_executions: 'completed', job_queue: 'completed',
};

const NOW = Date.now();
const iso = (i: number) => new Date(NOW - i * 5 * 3_600_000).toISOString();

function valueFor(table: string, col: string, type: string, i: number, role: MockRole): unknown {
  if (col === 'id') return uid(i);
  if (col === 'tenant_id') return IDS.tenant;
  if (col === 'user_id') return i === 0 ? IDS.user : uid(i, 'b');
  if (col === 'contact_id') return uid(i % 4, 'c');
  if (col === 'conversation_id') return uid(i % 4, 'd');
  if (col === 'whatsapp_instance_id' || col === 'instance_id') return IDS.instance;
  if (col === 'parent_tenant_id' || col === 'parent_id') return null;
  if (col === 'assigned_profile_id') return i % 2 ? IDS.profile : null;
  if (col === 'status') return STATUS_BY_TABLE[table] ?? 'active';
  if (col === 'direction' || col === 'last_message_direction') return i % 2 ? 'inbound' : 'outbound';
  if (col === 'message_type' || col === 'last_message_type') return 'text';
  if (col === 'role') return role;
  if (col === 'kind') return 'store';
  if (col === 'provider' || col === 'connection_type') return 'evolution';
  if (col === 'type') return table === 'lead_sources' ? 'organic' : table === 'report_templates' ? 'conversations' : 'text';
  if (col === 'trigger_type') return 'keyword';
  if (col === 'node_type') return 'send_text';
  if (col === 'phone' || col === 'phone_number' || col === 'whatsapp_number') return `+55 11 9${8000 + i}-${1000 + i * 37}`;
  if (col === 'email') return `pessoa${i}@exemplo.com.br`;
  if (col === 'first_name') return PEOPLE[i % PEOPLE.length].split(' ')[0];
  if (col === 'last_name') return PEOPLE[i % PEOPLE.length].split(' ')[1];
  if (col === 'name' && table === 'funnel_stages') return STAGES[i % STAGES.length];
  if (col === 'name' && table === 'lead_sources') return SOURCES[i % SOURCES.length];
  if (col === 'name' && table === 'tags') return TAGS[i % TAGS.length];
  if (col === 'name' && table === 'tenants') return `Loja ${i + 1}`;
  if (col === 'name' && table === 'whatsapp_instances') return `Atendimento ${i + 1}`;
  if (col === 'name' || col === 'display_name' || col === 'title' || col === 'instance_name') return PEOPLE[i % PEOPLE.length];
  if (col === 'content' || col === 'message' || col === 'last_message_content' || col === 'message_content' || col === 'text') return MESSAGES[i % MESSAGES.length];
  if (col === 'description' || col === 'notes') return 'Veio pelo anúncio do Instagram.';
  if (col === 'color') return ['#16a34a', '#2563eb', '#dc2626', '#f59e0b'][i % 4];
  if (col === 'avatar_url' || col === 'media_url' || col === 'image_url') return null;
  if (col.endsWith('_url') || col === 'url') return 'https://exemplo.com.br/webhook';
  if (col === 'currency') return 'brl';
  if (col === 'amount' || col === 'price' || col === 'total') return 19900;
  if (col === 'unread_count') return i % 3 === 0 ? 3 : 0;
  if (col === 'sort_order') return i;
  if (col === 'percent' || col === 'percentage') return 25;
  if (['is_archived', 'is_deleted', 'is_read', 'is_from_bot', 'is_default', 'is_blocked', 'opt_out_mass_message'].includes(col)) return false;
  // Metade dos contatos com opt-in marcado, metade sem nada — o estado "sem
  // nada" é o mais largo na tabela (dois chips), e é o que precisa caber.
  if (col === 'opt_in_mass_message') return i % 2 === 0;
  if (['is_enabled', 'is_active', 'active', 'enabled'].includes(col)) return true;
  if (['settings', 'metadata', 'config', 'data', 'capabilities'].includes(col)) return {};
  if (col === 'connection_config') return { api_url: 'https://evo.exemplo.com.br', api_key: 'x' };
  if (col === 'custom_fields') return { origem: 'instagram' };
  if (['variables', 'tags', 'columns', 'filters', 'steps', 'nodes', 'edges', 'recipients', 'options', 'components'].includes(col)) return [];
  if (col.endsWith('_at') || col.endsWith('_date') || col === 'due_date') return iso(i);
  if (type === 'string') return `Valor ${i}`;
  if (type === 'number') return 10 + i * 7;
  if (type === 'boolean') return true;
  if (type === 'Json') return {};
  if (type.startsWith('Database[')) {
    const en = type.match(/Enums"\]\["([a-z_]+)"\]/);
    return en && ENUMS[en[1]] ? ENUMS[en[1]][0] : 'active';
  }
  if (type.startsWith('string[]')) return [];
  return null;
}

function row(table: string, i: number, role: MockRole): Record<string, unknown> {
  const r: Record<string, unknown> = {};
  for (const c of TABLES[table] ?? []) r[c.col] = valueFor(table, c.col, c.type, i, role);
  if (table === 'profiles') {
    Object.assign(r, {
      id: i === 0 ? IDS.profile : uid(i, 'p'),
      user_id: i === 0 ? IDS.user : uid(i, 'b'),
      role: i === 0 ? role : (['gestor', 'atendente', 'atendente'] as const)[i % 3],
      status: 'active',
      tenant_id: role === 'superadmin' ? null : IDS.tenant,
      email: i === 0 ? 'eu@exemplo.com.br' : r.email,
      first_name: i === 0 ? 'Paulo' : r.first_name,
      last_name: i === 0 ? 'Andrade' : r.last_name,
      is_active: true,
    });
  }
  if (table === 'tenants') {
    Object.assign(r, {
      id: i === 0 ? IDS.tenant : uid(i, 't'),
      kind: role === 'gerente' ? 'account' : 'store',
      parent_tenant_id: i === 0 ? null : IDS.tenant,
      subscription_status: 'active',
      manual_access_granted: true,
      name: i === 0 ? (role === 'gerente' ? 'Conta Matriz' : 'Loja Centro') : `Loja Filial ${i}`,
      settings: {},
    });
  }
  if (table === 'whatsapp_instances') {
    Object.assign(r, { id: i === 0 ? IDS.instance : uid(i, 'i'), status: i === 0 ? 'connected' : 'disconnected', name: `Atendimento ${i + 1}`, phone_number: '+55 11 98765-4321' });
  }
  if (table === 'contacts') Object.assign(r, { id: uid(i % 8, 'c'), name: PEOPLE[i % PEOPLE.length] });
  if (table === 'conversations') Object.assign(r, { id: uid(i, 'd'), contact_id: uid(i % 8, 'c') });
  if (table === 'module_settings') {
    const mod = MODULES[i % MODULES.length];
    Object.assign(r, { module_name: mod, display_name: mod, route_path: `/dashboard/${mod}`, is_enabled: true, sort_order: i });
  }
  if (table === 'usage_limits') Object.assign(r, { role: (['gerente', 'gestor', 'atendente'] as const)[i % 3] });
  return r;
}

// ---------------------------------------------------------- select parser --
interface SelectNode { field?: string; alias?: string | null; name?: string; hint?: string | null; children?: SelectNode[] }

/** Lê a gramática de `select=` do PostgREST (campos e embeds aninhados). */
function parseSelect(sel: string): SelectNode[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) parts.push(cur);
  const out: SelectNode[] = [];
  for (const raw of parts) {
    const p = raw.replace(/\s+/g, '');
    if (!p) continue;
    const open = p.indexOf('(');
    if (open === -1) { out.push({ field: p }); continue; }
    const head = p.slice(0, open);
    const inner = p.slice(open + 1, p.lastIndexOf(')'));
    let alias: string | null = null;
    let name = head;
    let hint: string | null = null;
    if (head.includes(':')) [alias, name] = head.split(':');
    if (name.includes('!')) { const [n, h] = name.split('!'); name = n; hint = h; }
    out.push({ alias, name, hint, children: parseSelect(inner) });
  }
  return out;
}

const singular = (n: string) => (n.endsWith('ies') ? n.slice(0, -3) + 'y' : n.endsWith('s') ? n.slice(0, -1) : n);

function buildRows(table: string, n: number, role: MockRole, tree: SelectNode[], filters: Record<string, unknown>): Record<string, unknown>[] {
  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < n; i++) {
    const r = row(table, i, role);
    Object.assign(r, filters);
    for (const node of tree) {
      if (!node.children || !node.name) continue;
      const key = node.alias || node.name;
      let child: string | null = TABLES[node.name] ? node.name : node.alias && TABLES[node.alias] ? node.alias : null;
      if (!child && node.name.endsWith('_id')) {
        const base = node.name.slice(0, -3);
        child = Object.keys(TABLES).find((t) => t === base + 's' || t === base) ?? null;
      }
      if (!child) child = node.name;
      const parentCols = (TABLES[table] ?? []).map((c) => c.col);
      // Um-para-um quando o pai carrega a FK; senão, lista.
      const toOne =
        parentCols.includes(`${child}_id`) ||
        parentCols.includes(`${singular(child)}_id`) ||
        (!!node.hint && node.hint.startsWith(table + '_')) ||
        node.name.endsWith('_id') ||
        parentCols.includes(node.name);
      if (toOne) {
        const fk = (r[`${child}_id`] ?? r[`${singular(child)}_id`] ?? uid(i, 'c')) as string;
        r[key] = buildRows(child, 1, role, node.children, { id: fk })[0];
      } else {
        r[key] = buildRows(child, 2, role, node.children, {});
      }
    }
    rows.push(r);
  }
  return rows;
}

// ----------------------------------------------------------------- session --
export function sessionFor(role: MockRole) {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(NOW / 1000) + 30 * 24 * 3600;
  const user = {
    id: IDS.user, aud: 'authenticated', role: 'authenticated', email: 'eu@exemplo.com.br',
    app_metadata: { provider: 'email' }, user_metadata: { first_name: 'Paulo', last_name: 'Andrade', role },
    created_at: iso(10), updated_at: iso(0), identities: [],
  };
  const token = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: IDS.user, aud: 'authenticated', role: 'authenticated', email: user.email, exp, iat: exp - 31 * 24 * 3600, session_id: 'e2e' })}.assinatura-falsa`;
  return { access_token: token, refresh_token: 'refresh-falso', token_type: 'bearer', expires_in: 30 * 24 * 3600, expires_at: exp, user };
}

function rpcResponse(name: string, role: MockRole): unknown {
  const person = (i: number) => ({ id: i === 0 ? IDS.profile : uid(i, 'p'), first_name: PEOPLE[i].split(' ')[0], last_name: PEOPLE[i].split(' ')[1], avatar_url: null, email: `pessoa${i}@exemplo.com.br`, status: 'active' });
  switch (name) {
    case 'maintenance_state': return [{ active: false, scheduled: false, reason: null, starts_at: null, ends_at: null }];
    case 'tenant_access_state': return [{ unlocked: true, source: 'paid' }];
    case 'tenant_team_directory': return [0, 1, 2, 3, 4].map((i) => ({ ...person(i), role: ['gestor', 'atendente', 'atendente', 'atendente', 'gestor'][i] }));
    case 'conversation_rotation_get': return [0, 1, 2].map((i) => ({ profile_id: person(i).id, first_name: person(i).first_name, last_name: person(i).last_name, percent: i === 0 ? 50 : 25, eligible: true, role: 'atendente' }));
    case 'loja_message_counts': return [{ tenant_id: IDS.tenant, inbound: 120, outbound: 340, total: 460 }];
    case 'contact_has_conversation': return true;
    case 'loja_response_rule_preview': return [{ unanswered: 3, would_reassign: 1 }];
    case 'get_database_performance_metrics': return [{ metric_name: 'cache_hit_ratio', metric_value: 99.1, unit: '%' }];
    case 'get_materialized_view_stats': return [{ view_name: 'daily_analytics_view', size: '120 kB', last_refresh: iso(1) }];
    case 'get_admin_users_data': case 'get_auth_users_for_admin': return [0, 1, 2, 3, 4, 5].map((i) => row('profiles', i, 'gestor'));
    case 'get_stripe_transaction_stats': return [{ total_revenue: 123456, total_transactions: 42, success_rate: 97.5, average_transaction: 2939 }];
    case 'current_user_role': case 'get_current_user_role': return role;
    default: return [];
  }
}

function functionResponse(name: string): unknown {
  switch (name) {
    case 'list-whatsapp-templates':
      return {
        templates: [0, 1, 2, 3].map((i) => ({ id: uid(i, 'e'), name: `promo_${i}`, status: 'APPROVED', category: 'MARKETING', language: 'pt_BR', waba_id: 'waba-1', waba_name: 'WABA Loja Centro', components: [{ type: 'BODY', text: MESSAGES[i] }] })),
        wabas: [{ id: 'waba-1', name: 'WABA Loja Centro', instance_name: 'Meta Loja Centro' }],
      };
    case 'stripe-admin':
      return {
        data: [],
        transactions: [0, 1, 2, 3].map((i) => ({ id: `txn_${i}`, amount: 19900, currency: 'brl', status: 'succeeded', created: Math.floor(NOW / 1000) - i * 86400, customer_email: `cliente${i}@exemplo.com.br`, description: 'Assinatura mensal' })),
        coupons: [0, 1].map((i) => ({ id: `PROMO${i}`, name: `PROMO${i}`, percent_off: 20, valid: true, times_redeemed: 3, duration: 'once', created: Math.floor(NOW / 1000) })),
        stats: { total_revenue: 123456, total_transactions: 42, success_rate: 97.5, average_transaction: 2939 },
        products: [], prices: [],
      };
    default: return {};
  }
}

// ------------------------------------------------------------------ install --
/**
 * `sessao: false` liga o backend falso SEM gravar sessão: serve para quem chega
 * de fora sem estar logado (link de convite, rota protegida) e mesmo assim não
 * pode falar com o Supabase real.
 */
export async function installSupabaseMock(
  context: BrowserContext,
  role: MockRole,
  { sessao = true }: { sessao?: boolean } = {},
): Promise<void> {
  const session = sessionFor(role);

  await context.addInitScript(
    ({ session, key, activeTenant, sessao }) => {
      // Sem sessão: só limpa na PRIMEIRA carga da aba. Uma sessão que o próprio
      // app criar depois (o link de convite cria) tem de sobreviver ao reload.
      if (!sessao) {
        if (!window.sessionStorage.getItem('e2e-sem-sessao')) {
          window.sessionStorage.setItem('e2e-sem-sessao', '1');
          window.localStorage.removeItem(key);
        }
        return;
      }
      window.localStorage.setItem(key, JSON.stringify(session));
      // Superadmin não tem Conta própria: entra "dentro" de uma, como no produto.
      if (activeTenant) window.localStorage.setItem('convoflow-active-tenant', activeTenant);
      else window.localStorage.removeItem('convoflow-active-tenant');
    },
    { session, key: 'convoflow-auth', activeTenant: role === 'superadmin' ? IDS.tenant : null, sessao },
  );

  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': '*',
    'access-control-expose-headers': '*',
  };
  const json = (route: Route, body: unknown, extra: Record<string, string> = {}) =>
    route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/json', ...extra }, body: JSON.stringify(body) });

  await context.route(/\/(auth|rest|functions|storage)\/v1\/|\/realtime\//, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    const method = req.method();
    if (method === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });

    if (p.includes('/auth/v1/user')) return json(route, session.user);
    if (p.includes('/auth/v1/token')) return json(route, session);
    if (p.includes('/auth/v1/logout')) return route.fulfill({ status: 204, headers: cors });
    if (p.includes('/auth/v1/')) return json(route, {});
    if (p.includes('/realtime/') || p.includes('/storage/v1/')) return route.abort();
    if (p.includes('/functions/v1/')) return json(route, functionResponse(p.split('/functions/v1/')[1].split('/')[0]));

    if (p.includes('/rest/v1/rpc/')) return json(route, rpcResponse(p.split('/rest/v1/rpc/')[1].split('/')[0], role));

    if (p.includes('/rest/v1/')) {
      const table = p.split('/rest/v1/')[1].split('/')[0];
      const accept = req.headers()['accept'] ?? '';
      const prefer = req.headers()['prefer'] ?? '';
      const wantsObject = accept.includes('pgrst.object');
      const tree = parseSelect(url.searchParams.get('select') ?? '*');

      // Filtros `eq.` viram valores das linhas, para joins baterem (contact_id, tenant_id, ...).
      const filters: Record<string, unknown> = {};
      for (const [k, v] of url.searchParams) {
        if (['select', 'order', 'limit', 'offset', 'or', 'and'].includes(k)) continue;
        const m = v.match(/^eq\.(.*)$/);
        if (m && k !== 'is_archived' && k !== 'is_enabled') filters[k] = m[1] === 'true' ? true : m[1] === 'false' ? false : m[1];
      }

      let n = 8;
      if (table === 'tenants') n = role === 'gerente' ? 4 : 1;
      if (table === 'whatsapp_instances') n = 3;
      if (table === 'module_settings') n = MODULES.length;
      if (table === 'usage_limits') n = 3;
      if (table === 'funnel_stages') n = STAGES.length;
      if (table === 'tags') n = TAGS.length;
      if (table === 'system_settings' || table === 'stripe_config') n = 1;
      // `.maybeSingle()` com id=eq.X: mais de uma linha vira erro PGRST116 no client.
      if ('id' in filters || (table === 'profiles' && filters.user_id === IDS.user)) n = 1;
      const limit = Number(url.searchParams.get('limit'));
      if (limit) n = Math.min(n, limit);

      const total = table === 'messages' ? 460 : 37;
      if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...cors, 'content-range': `0-${total - 1}/${total}` } });
      if (method === 'GET') {
        const rows = buildRows(table, n, role, tree, filters);
        const extra = prefer.includes('count=') ? { 'content-range': `0-${n - 1}/${total}` } : {};
        return json(route, wantsObject ? rows[0] ?? null : rows, extra);
      }
      // Escritas: devolve o que foi enviado, por cima de uma linha gerada.
      let body: unknown = null;
      try { body = req.postDataJSON(); } catch { /* sem corpo */ }
      const base = buildRows(table, 1, role, tree, filters)[0];
      const merged = Array.isArray(body) ? body.map((b, i) => ({ ...base, ...b, id: uid(i, 'w') })) : [{ ...base, ...((body as object) ?? {}) }];
      return json(route, wantsObject ? merged[0] : merged);
    }
    return json(route, {});
  });
}
