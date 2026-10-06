import { test, expect, type Page } from '@playwright/test';
import { installSupabaseMock, IDS, type MockRole } from './support/supabaseMock';

/**
 * Varredura de responsividade: cada tela alcançável, em cada cargo, em seis
 * larguras. Falha quando a página ganha rolagem horizontal ou quando algum
 * elemento visível sai da janela pela direita ou pela esquerda.
 *
 * COMO RODAR
 *   npm run test:responsive            (= playwright test e2e/responsive.spec.ts --workers=4)
 *   npx playwright test e2e/responsive.spec.ts -g "gerente"     só um cargo
 *   npx playwright test e2e/responsive.spec.ts -g "Contacts"    só uma tela
 *
 * O servidor do Vite sobe sozinho (ver playwright.config.ts). Com `--workers=1`
 * a suíte inteira leva ~25 min; com 4 workers, ~7 min.
 *
 * COMO FUNCIONA
 * O dashboard exige sessão do Supabase e não há credencial de teste no repo.
 * `installSupabaseMock` (e2e/support/supabaseMock.ts) grava uma sessão falsa no
 * localStorage e responde localmente a toda chamada de auth/rest/rpc/functions
 * com linhas geradas dos tipos do banco. Nada chega ao Supabase real. Cada tela
 * é recarregada em cada largura, porque vários componentes decidem o layout no
 * mount (useIsMobile, estado inicial por window.innerWidth).
 *
 * O QUE CONTA COMO VIOLAÇÃO
 *   1. `document.documentElement.scrollWidth > window.innerWidth`.
 *   2. Elemento visível cujo retângulo passa da borda direita ou esquerda da
 *      janela, exceto quando está dentro de um contêiner com rolagem
 *      horizontal própria (overflow-x auto/scroll) — aí é rolável, não
 *      cortado. O canvas do ReactFlow, tooltips, poppers e toasts ficam de fora.
 *   3. Tabelas (decisão de 2026-09-16: toda tabela de dados vira lista de
 *      cartões no celular, via src/components/shared/ResponsiveTable):
 *      - abaixo de md (768px), qualquer <table> visível em <main> é violação
 *        ("tabela-no-celular") — inclusive uma tabela nova que não use o padrão;
 *      - uma lista de cartões mais larga que a própria caixa é violação
 *        ("cartoes-estourando");
 *      - a ação de uma linha (botão/menu) fora da janela ou fora da caixa
 *        rolável da tabela é violação ("acao-inalcancavel"), nos dois modos.
 *
 * O QUE FICA DE FORA (e por quê)
 *   - Modais e drawers: o gatilho de quase todos depende de estado por linha
 *     (ícone da instância, linha da tabela). Cobri-los aqui dobraria o tempo
 *     e a chance de flake. Eles foram medidos à mão em 2026-09-15 e a lista de
 *     larguras está no PR fix/responsividade-buckets-a-b.
 *   - Rodapé do Stripe ("Cupons"): a aba só monta com stripe_config real.
 *   - Rotas legadas (/register redireciona; /profile é a mesma tela de
 *     Configurações > Perfil).
 * Cada linha `RESPONSIVE-VIOLATION | cargo | tela | largura | ...` no stdout é
 * uma violação; conte com `grep -c` para ter o número por largura.
 */

const WIDTHS = [390, 768, 1024, 1280, 1440, 1920] as const;
type Role = MockRole | 'public';
const ROLES: Role[] = ['public', 'superadmin', 'gerente', 'gestor', 'atendente'];

interface Screen {
  name: string;
  path: string;
  roles: Role[];
  /** Nome acessível da aba a clicar depois de carregar. */
  tab?: string | RegExp;
}

const LOJA_ROLES: Role[] = ['gerente', 'gestor', 'atendente'];
const ALL_DASHBOARD: Role[] = ['superadmin', ...LOJA_ROLES];

const SCREENS: Screen[] = [
  // Público (sem sessão)
  { name: 'Landing', path: '/', roles: ['public'] },
  { name: 'Auth', path: '/auth', roles: ['public'] },
  { name: 'Login', path: '/login', roles: ['public'] },
  { name: 'DefinirSenha', path: '/definir-senha', roles: ['public'] },
  { name: 'TermsOfService', path: '/terms-of-service', roles: ['public'] },
  { name: 'PrivacyPolicy', path: '/privacy-policy', roles: ['public'] },
  { name: 'DataDeletion', path: '/exclusao-de-dados', roles: ['public'] },
  { name: 'NotFound', path: '/rota-inexistente', roles: ['public'] },

  // Dashboard — todo cargo
  { name: 'Index', path: '/dashboard', roles: ALL_DASHBOARD },
  { name: 'Templates', path: '/dashboard/templates', roles: ALL_DASHBOARD },
  { name: 'Settings/profile', path: '/dashboard/settings', roles: ALL_DASHBOARD },
  { name: 'Settings/attendance', path: '/dashboard/settings?tab=attendance', roles: ['gerente', 'atendente'] },
  { name: 'Settings/visibility', path: '/dashboard/settings?tab=visibility', roles: ['gerente', 'atendente'] },
  { name: 'Settings/quick-replies', path: '/dashboard/settings?tab=quick-replies', roles: ['gerente'] },
  { name: 'Settings/followups', path: '/dashboard/settings?tab=followups', roles: ['gerente'] },
  { name: 'Settings/subscription', path: '/dashboard/settings?tab=subscription', roles: ['gerente'] },
  { name: 'Settings/notifications', path: '/dashboard/settings?tab=notifications', roles: ['gerente'] },
  { name: 'Settings/security', path: '/dashboard/settings?tab=security', roles: ['gerente'] },
  { name: 'Settings/integrations', path: '/dashboard/settings?tab=integrations', roles: ['gerente'] },
  { name: 'Notifications', path: '/dashboard/notifications', roles: ['gerente'] },
  { name: 'Help', path: '/dashboard/help', roles: ['gerente', 'atendente'] },

  // Dashboard — Lojas (ModuleGuard)
  { name: 'Conversations', path: '/dashboard/conversations', roles: LOJA_ROLES },
  { name: 'Contacts', path: '/dashboard/contacts', roles: LOJA_ROLES },
  { name: 'Funnel', path: '/dashboard/funnel', roles: LOJA_ROLES },
  { name: 'Funnel/metrics', path: '/dashboard/funnel', roles: ['gerente'], tab: /Métricas/ },
  { name: 'Tracking', path: '/dashboard/tracking', roles: ALL_DASHBOARD },
  { name: 'Tracking/sources', path: '/dashboard/tracking', roles: ['gerente'], tab: /Fontes/ },
  { name: 'Reports', path: '/dashboard/reports', roles: ALL_DASHBOARD },
  { name: 'Reports/builder', path: '/dashboard/reports', roles: ['gerente'], tab: 'Criar' },
  { name: 'Reports/schedule', path: '/dashboard/reports', roles: ['gerente'], tab: 'Agendamentos' },
  { name: 'Reports/delivery', path: '/dashboard/reports', roles: ['gerente'], tab: 'Entregas' },
  { name: 'Chatbots', path: '/dashboard/chatbots', roles: LOJA_ROLES },
  { name: 'ChatbotFlowBuilder', path: `/dashboard/chatbots/${IDS.tenant.replace(/3/g, 'a')}/builder`, roles: ['gerente', 'gestor'] },
  { name: 'Campaigns', path: '/dashboard/campaigns', roles: LOJA_ROLES },
  { name: 'Campaigns/completed', path: '/dashboard/campaigns', roles: ['gerente'], tab: 'Concluídas' },
  { name: 'Followups', path: '/dashboard/followups', roles: LOJA_ROLES },
  { name: 'Followups/sequences', path: '/dashboard/followups', roles: ['gerente'], tab: 'Sequências' },
  { name: 'Automation', path: '/dashboard/automation', roles: LOJA_ROLES },
  { name: 'WhatsAppNumbers', path: '/dashboard/whatsapp-numbers', roles: LOJA_ROLES },
  { name: 'WhatsAppNumbers/monitoring', path: '/dashboard/whatsapp-numbers', roles: ['gerente'], tab: 'Monitoramento' },

  // Equipe / Conta
  { name: 'Team', path: '/dashboard/team', roles: ['gerente', 'gestor'] },
  { name: 'StoreComparison', path: '/dashboard/store-comparison', roles: ['gerente'] },

  // Administração (superadmin)
  { name: 'Admin/overview', path: '/dashboard/admin', roles: ['superadmin'] },
  { name: 'Admin/users', path: '/dashboard/admin', roles: ['superadmin'], tab: 'Usuários' },
  { name: 'Admin/billing', path: '/dashboard/admin', roles: ['superadmin'], tab: 'Faturamento' },
  { name: 'Admin/reports', path: '/dashboard/admin', roles: ['superadmin'], tab: 'Relatórios' },
  { name: 'Admin/settings', path: '/dashboard/admin', roles: ['superadmin'], tab: 'Configurações' },
  { name: 'Admin/UsersPage', path: '/dashboard/admin/users', roles: ['superadmin'] },
  { name: 'Admin/UsageLimits', path: '/dashboard/admin/usage-limits', roles: ['superadmin'] },
];

interface Violation { width: number; kind: string; detail: string }

/** Roda no navegador: mede a página e devolve a lista de violações. */
const MEASURE = () => {
  const vw = window.innerWidth;
  const out: { scrollWidth: number; offscreen: string[]; tables: string[] } = { scrollWidth: document.documentElement.scrollWidth, offscreen: [], tables: [] };

  const EXCLUDE = '.react-flow, [data-radix-popper-content-wrapper], [role="tooltip"], [data-sonner-toaster], [aria-hidden="true"]';
  const visible = (el: Element) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const insideScroller = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflow)) return true;
    }
    return false;
  };
  // Pela esquerda só conta o que NÃO está sendo recortado de propósito por um
  // ancestral overflow-hidden (ex.: a barra de progresso do shadcn desloca o
  // indicador com translateX negativo dentro de um trilho recortado).
  const insideClipper = (el: Element) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflow)) return true;
    }
    return false;
  };
  const describe = (el: Element) => {
    const parts: string[] = [];
    let e: Element | null = el;
    for (let d = 0; e && e !== document.body && d < 3; d++) {
      let s = e.tagName.toLowerCase();
      const cls = [...e.classList].slice(0, 3).join('.');
      if (cls) s += '.' + cls;
      parts.unshift(s);
      e = e.parentElement;
    }
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${parts.join(' > ')} "${text}"`;
  };

  const past: Element[] = [];
  for (const el of document.querySelectorAll('body *')) {
    if (['SCRIPT', 'STYLE', 'svg', 'path'].includes(el.tagName)) continue;
    if (el.closest(EXCLUDE)) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const pastRight = r.right > vw + 1 && r.left < vw;
    const pastLeft = r.left < -1 && !insideClipper(el);
    if ((pastRight || pastLeft) && !insideScroller(el)) past.push(el);
  }
  // Só o elemento mais externo de cada cadeia: o filho de um contêiner que já
  // saiu da tela não acrescenta informação.
  const set = new Set(past);
  for (const el of past) {
    if (el.parentElement && set.has(el.parentElement)) continue;
    const r = el.getBoundingClientRect();
    out.offscreen.push(`${describe(el)} [left=${Math.round(r.left)} right=${Math.round(r.right)} vw=${vw}]`);
  }
  out.offscreen = out.offscreen.slice(0, 8);

  // ---- tabelas: cartões no celular, ações sempre alcançáveis ----------------
  const MD = 768;
  if (vw < MD) {
    for (const t of document.querySelectorAll('main table')) {
      if (visible(t)) out.tables.push(`tabela-no-celular|${describe(t)}`);
    }
    for (const list of document.querySelectorAll('[data-responsive-table="cards"]')) {
      if (list.scrollWidth > list.clientWidth + 1) out.tables.push(`cartoes-estourando|${describe(list)} [${list.scrollWidth} > ${list.clientWidth}]`);
    }
  }
  for (const box of document.querySelectorAll('[data-responsive-row] [data-responsive-actions]')) {
    if (!visible(box)) continue;
    const controls = [...box.querySelectorAll('button, a[href], input, [role="button"]')].filter(visible);
    if (controls.length === 0) continue;
    // Na tabela a caixa rolável é a div overflow-auto do shadcn; a ação precisa
    // estar dentro dela (coluna sticky) E dentro da janela. No cartão, só a janela.
    const table = box.closest('[data-responsive-table="table"]');
    const scroller = table?.parentElement;
    const limit = scroller ? Math.min(vw, scroller.getBoundingClientRect().right) : vw;
    for (const c of controls) {
      const r = c.getBoundingClientRect();
      if (r.right > limit + 1 || r.left < -1) {
        out.tables.push(`acao-inalcancavel|${describe(c)} [left=${Math.round(r.left)} right=${Math.round(r.right)} limite=${Math.round(limit)}]`);
        break;
      }
    }
  }
  out.tables = out.tables.slice(0, 8);
  return out;
};

async function settle(page: Page) {
  try { await page.waitForLoadState('networkidle', { timeout: 2500 }); } catch { /* polling nunca para */ }
  await page.waitForTimeout(600);
  // Chunk lazy + skeleton ainda no ar? Espera um pouco mais (só o conteúdo, não a landing).
  // Até 6s: a regra "tabela no celular" precisa da tabela com dados, não do
  // esqueleto — numa máquina carregada o chunk + a consulta passam de 2s.
  for (let i = 0; i < 15; i++) {
    const busy = await page.evaluate(() => !!document.querySelector('main .animate-spin, main .animate-pulse, body > div > .animate-spin'));
    if (!busy) break;
    await page.waitForTimeout(400);
  }
}

for (const role of ROLES) {
  test.describe(`responsividade — ${role}`, () => {
    for (const screen of SCREENS.filter((s) => s.roles.includes(role))) {
      test(`${screen.name}`, async ({ context, page }) => {
        // Seis recargas por tela; numa máquina carregada cada uma passa de 30s.
        test.setTimeout(300_000);
        if (role !== 'public') await installSupabaseMock(context, role);

        const violations: Violation[] = [];
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: width < 500 ? 844 : 900 });
          await page.goto(screen.path, { waitUntil: 'domcontentloaded' });
          await settle(page);
          if (screen.tab) {
            const tab = page.getByRole('tab', { name: screen.tab }).first();
            if (await tab.count()) {
              await tab.click({ force: true });
              await settle(page);
            }
          }

          // A tela realmente abriu? (guard redirecionando é erro de fixture, não de layout)
          const url = new URL(page.url());
          const expectedPath = screen.path.split('?')[0];
          expect.soft(url.pathname, `${role}/${screen.name}@${width}: redirecionou para ${url.pathname}`).toBe(expectedPath);

          const m = await page.evaluate(MEASURE);
          if (m.scrollWidth > width + 1) {
            violations.push({ width, kind: 'rolagem-horizontal', detail: `scrollWidth ${m.scrollWidth} > ${width}` });
          }
          for (const d of m.offscreen) violations.push({ width, kind: 'fora-da-janela', detail: d });
          for (const d of m.tables) {
            const [kind, detail] = d.split('|', 2);
            violations.push({ width, kind, detail });
          }
        }

        for (const v of violations) {
          console.log(`RESPONSIVE-VIOLATION | ${role} | ${screen.name} | ${v.width} | ${v.kind} | ${v.detail}`);
        }
        const resumo = violations.map((v) => `  [${v.width}] ${v.kind}: ${v.detail}`).join('\n');
        expect(violations, `${role}/${screen.name} tem ${violations.length} violação(ões):\n${resumo}`).toEqual([]);
      });
    }
  });
}
