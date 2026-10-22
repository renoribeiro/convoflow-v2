import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  MIN_TEXT_CHARS,
  canonicalText,
  changeEmail,
  changeNotification,
  extractMainText,
  extractMetaMarkdown,
  extractorFor,
  formatPageDate,
  markdownUrlFor,
  metaDevLastUpdated,
  mobileFacebookUrl,
  parseRecipients,
  problemNotification,
  readPolicy,
  runPolicyWatch,
  sha256Hex,
  splitPageDate,
  summarizeChange,
  testEmail,
  type FetchedPage,
  type PolicyDocRow,
} from '../../../supabase/functions/_shared/policy-watch-core.ts';

// =============================================================================
// A vigia das políticas (supabase/functions/policy-watch) avisava "a política
// mudou" toda semana porque tirava o hash da página com o menu do site junto.
// Estes testes usam amostras salvas em ./fixtures com a mesma estrutura das
// páginas reais (menu, rodapé, scripts, o .md da Meta, a tela de login do
// Facebook) e provam: menu mudando não avisa; texto mudando avisa uma vez, com
// resumo e e-mail; página vazia avisa "monitor com problema" sem apagar o texto
// guardado; duas entradas da mesma página são lidas uma vez só.
// =============================================================================

const fixture = (name: string) => readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');

const MENU_A = fixture('whatsapp-legal-menu-a.html');
const MENU_B = fixture('whatsapp-legal-menu-b.html');
const WAB_POLICY = fixture('whatsappbusiness-policy.html');
const META_PAGE = fixture('meta-dev-page.html');
const MD_ANTES = fixture('meta-dev-md-antes.md');
const MD_DEPOIS = fixture('meta-dev-md-depois.html');
const FB_LOGIN = fixture('facebook-legal-login.html');
const FB_MOBILE = fixture('facebook-legal-mobile.html');

const GUIDELINES_URL = 'https://www.whatsapp.com/legal/messaging-guidelines';
const ENFORCEMENT_OLD_URL = 'https://developers.facebook.com/docs/whatsapp/overview/policy-enforcement';
const ENFORCEMENT_URL = 'https://developers.facebook.com/documentation/business-messaging/whatsapp/policy-enforcement';
const ENFORCEMENT_MD = `${ENFORCEMENT_URL}.md`;
const META_TERMS_URL = 'https://www.whatsapp.com/legal/meta-terms-whatsapp-business';
const FB_WWW = 'https://www.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform';
const FB_M = 'https://m.facebook.com/legal/Meta-Terms-for-WhatsApp-Business-Platform';

const SUPER_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const SUPER_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const GERENTE = 'aaaaaaaa-0000-4000-8000-000000000003';
const DONO = 'alertas@exemplo.com.br';

// ── Internet falsa ───────────────────────────────────────────────────────────

type Page = { status?: number; body?: string; redirectTo?: string };

function fakeWeb(pages: Record<string, Page>) {
  const calls: string[] = [];
  const fetchPage = vi.fn(async (url: string): Promise<FetchedPage> => {
    calls.push(url);
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const p = pages[current];
      if (!p) return { status: 404, url: current, body: 'Not found' };
      if (p.redirectTo) { current = p.redirectTo; continue; }
      return { status: p.status ?? 200, url: current, body: p.body ?? '' };
    }
    throw new Error('redirecionamento em laço');
  });
  return { fetchPage, calls };
}

// ── Banco falso (o formato do supabase-js que o laço usa) ───────────────────

type Row = Record<string, any>;
type TableName = 'whatsapp_policy_documents' | 'whatsapp_policy_change_log' | 'notifications' | 'profiles';

class FakeDb {
  tables: Record<TableName, Row[]> = {
    whatsapp_policy_documents: [],
    whatsapp_policy_change_log: [],
    notifications: [],
    profiles: [
      { user_id: SUPER_A, role: 'superadmin' },
      { user_id: SUPER_B, role: 'superadmin' },
      { user_id: GERENTE, role: 'gerente' },
    ],
  };

  from(table: string) {
    const tables = this.tables;
    const filters: Array<[string, unknown]> = [];
    let mode: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let rows: Row[] = [];
    const matches = (r: Row) => filters.every(([c, v]) => r[c] === v);
    const q = {
      select() { mode = 'select'; return q; },
      eq(col: string, val: unknown) { filters.push([col, val]); return q; },
      update(p: Row) { mode = 'update'; patch = p; return q; },
      insert(r: Row | Row[]) { mode = 'insert'; rows = Array.isArray(r) ? r : [r]; return q; },
      then(resolve: (v: unknown) => void) {
        const t = tables[table as TableName];
        if (!t) throw new Error(`tabela inesperada: ${table}`);
        if (mode === 'select') return resolve({ data: t.filter(matches).map((r) => ({ ...r })), error: null });
        if (mode === 'update') {
          for (const r of t.filter(matches)) Object.assign(r, patch);
          return resolve({ data: null, error: null });
        }
        t.push(...rows.map((r) => ({ ...r })));
        return resolve({ data: null, error: null });
      },
    };
    return q;
  }

  doc(key: string) {
    return this.tables.whatsapp_policy_documents.find((d) => d.key === key)!;
  }
}

function seedDoc(db: FakeDb, d: Partial<PolicyDocRow> & { key: string; url: string }) {
  db.tables.whatsapp_policy_documents.push({
    label: d.key,
    is_active: true,
    last_hash: null,
    clean_text: null,
    page_updated: null,
    ...d,
  });
}

async function run(db: FakeDb, web: ReturnType<typeof fakeWeb>, sendEmail: any = vi.fn(async () => 'id')) {
  const out = await runPolicyWatch({
    db,
    fetchPage: web.fetchPage,
    sendEmail,
    emailTo: [DONO],
    now: () => new Date('2026-10-26T09:00:00Z'),
  });
  return { ...out, sendEmail };
}

const byStatus = (results: Array<{ key: string; status: string }>) =>
  Object.fromEntries(results.map((r) => [r.key, r.status]));

// ── Ler só o texto ───────────────────────────────────────────────────────────

describe('texto limpo: só a política, nunca menu, rodapé ou script', () => {
  it('whatsapp.com: menu e rodapé diferentes, mesmo texto e mesmo hash', async () => {
    const a = splitPageDate(extractMainText(MENU_A));
    const b = splitPageDate(extractMainText(MENU_B));
    expect(a.text).toBe(b.text);
    expect(await sha256Hex(canonicalText(a.text))).toBe(await sha256Hex(canonicalText(b.text)));
    for (const lixo of ['WhatsApp Plus', 'Parental controls', 'Careers', 'Deutsch', 'token_', 'csrf', 'WhatsApp LLC']) {
      expect(a.text).not.toContain(lixo);
      expect(b.text).not.toContain(lixo);
    }
    expect(a.text).toContain('If someone asks you to stop sending them messages, stop.');
    expect(a.text.split('\n')[0]).toBe('WhatsApp Messaging Guidelines');
  });

  it('a data da página sai do texto e vem à parte', () => {
    const { text, pageUpdated } = splitPageDate(extractMainText(MENU_A));
    expect(pageUpdated).toBe('September 23, 2026');
    expect(text).not.toMatch(/Last updated/i);
    expect(formatPageDate(pageUpdated)).toBe('23/09/2026');
    expect(formatPageDate('2026-05-21')).toBe('21/05/2026');
    expect(formatPageDate('21 de mai de 2026')).toBe('21 de mai de 2026');
    expect(formatPageDate(null)).toBeNull();
  });

  it('whatsappbusiness.com: só o <main>, sem os <header> aninhados, aside, rodapé e cookies', () => {
    const { text } = splitPageDate(extractMainText(WAB_POLICY));
    expect(text).toContain('The Commerce Policy is used to govern');
    expect(text).toContain('opt in permission');
    for (const lixo of ['Products', 'Pricing', 'Get started', 'Related:', 'Compliance Center', 'cookies', 'Skip to content', 'country/region']) {
      expect(text).not.toContain(lixo);
    }
  });

  it('developers.facebook.com: o .md, cru ou dentro de <pre>, sem o rodapé do índice', () => {
    const antes = extractMetaMarkdown(MD_ANTES);
    const depois = extractMetaMarkdown(MD_DEPOIS);
    expect(antes).not.toContain('Full documentation index');
    expect(antes.split('\n').at(-1)).not.toBe('---');
    expect(depois).not.toMatch(/<\/?(pre|html|style)/);
    expect(depois.split('\n')[0]).toBe('# WhatsApp Business Platform policy and spam enforcement');
    // Sem a troca de palavras, os dois formatos dão o mesmo texto.
    const igual = extractMetaMarkdown(MD_DEPOIS.replace(/WhatsApp accounts/g, 'WhatsApp Business Accounts')
      .replace('a WhatsApp account has', 'a WhatsApp Business Account has')
      .replace('relevant Messaging account', 'relevant WhatsApp Business Account'));
    expect(igual).toBe(antes);
  });

  it('developers.facebook.com: a data sai do JSON da página', () => {
    expect(metaDevLastUpdated(META_PAGE)).toBe('2026-05-21');
    expect(metaDevLastUpdated('<html>sem data</html>')).toBeNull();
  });

  it('escolhe o jeito de ler pelo endereço final', () => {
    expect(extractorFor(ENFORCEMENT_URL)).toBe('meta-dev-md');
    expect(extractorFor(FB_WWW)).toBe('facebook-legal');
    expect(extractorFor(GUIDELINES_URL)).toBe('html-main');
    expect(extractorFor('https://www.facebook.com/business')).toBe('html-main');
    expect(markdownUrlFor(`${ENFORCEMENT_URL}/?locale=pt_BR#webhooks`)).toBe(ENFORCEMENT_MD);
    expect(mobileFacebookUrl(FB_WWW)).toBe(FB_M);
  });

  it('readPolicy segue o redirecionamento da Meta e lê a .md do endereço novo', async () => {
    const web = fakeWeb({
      [ENFORCEMENT_OLD_URL]: { redirectTo: ENFORCEMENT_URL },
      [ENFORCEMENT_URL]: { body: META_PAGE },
      [ENFORCEMENT_MD]: { body: MD_DEPOIS },
    });
    const r = await readPolicy(ENFORCEMENT_OLD_URL, web.fetchPage);
    expect(web.calls).toEqual([ENFORCEMENT_OLD_URL, ENFORCEMENT_MD]);
    expect(r.sourceUrl).toBe(ENFORCEMENT_MD);
    expect(r.pageUpdated).toBe('2026-05-21');
    expect(r.text).not.toContain('Max price billing SKU');
    expect(r.text).not.toMatch(/^Updated/m);
  });

  it('readPolicy troca a tela de login do Facebook pela m.facebook.com', async () => {
    const web = fakeWeb({
      [META_TERMS_URL]: { redirectTo: FB_WWW },
      [FB_WWW]: { body: FB_LOGIN },
      [FB_M]: { body: FB_MOBILE },
    });
    const r = await readPolicy(META_TERMS_URL, web.fetchPage);
    expect(r.sourceUrl).toBe(FB_M);
    expect(r.pageUpdated).toBe('September 23, 2026');
    expect(r.text).toContain('Meta Terms for WhatsApp Business Platform');
    expect(r.text).toContain('2.1 You must comply');
    expect(r.text.length).toBeGreaterThan(MIN_TEXT_CHARS);
    // A tela de login sozinha não tem texto: é o que dava o hash "Facebook".
    expect(extractMainText(FB_LOGIN).length).toBeLessThan(MIN_TEXT_CHARS);
  });
});

// ── O laço da vigia ──────────────────────────────────────────────────────────

describe('runPolicyWatch', () => {
  it('primeira leitura só guarda o texto: nenhum aviso, nenhum e-mail', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'messaging-guidelines', url: GUIDELINES_URL, last_hash: 'hash-antigo-da-pagina-inteira' });
    const { results, sendEmail } = await run(db, fakeWeb({ [GUIDELINES_URL]: { body: MENU_A } }));
    expect(byStatus(results)).toEqual({ 'messaging-guidelines': 'baseline' });
    expect(db.tables.notifications).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    const doc = db.doc('messaging-guidelines');
    expect(doc.clean_text).toContain('Respect people who ask you to stop');
    expect(doc.page_updated).toBe('September 23, 2026');
    expect(doc.last_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('menu mudou e o texto não: nenhum aviso, nenhum e-mail', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'messaging-guidelines', url: GUIDELINES_URL });
    await run(db, fakeWeb({ [GUIDELINES_URL]: { body: MENU_A } }));
    const { results, sendEmail } = await run(db, fakeWeb({ [GUIDELINES_URL]: { body: MENU_B } }));
    expect(byStatus(results)).toEqual({ 'messaging-guidelines': 'unchanged' });
    expect(db.tables.notifications).toHaveLength(0);
    expect(db.tables.whatsapp_policy_change_log).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('só a data da página mudou: não é a política mudando', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'messaging-guidelines', url: GUIDELINES_URL });
    await run(db, fakeWeb({ [GUIDELINES_URL]: { body: MENU_A } }));
    const novaData = MENU_A.replace('September 23, 2026', 'October 30, 2026');
    const { results, sendEmail } = await run(db, fakeWeb({ [GUIDELINES_URL]: { body: novaData } }));
    expect(byStatus(results)).toEqual({ 'messaging-guidelines': 'unchanged' });
    expect(db.tables.notifications).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db.doc('messaging-guidelines').page_updated).toBe('October 30, 2026');
  });

  it('texto mudou de verdade: um aviso por superadmin, com resumo, e um e-mail', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'policy-enforcement', label: 'WhatsApp Business Platform: Policy Enforcement', url: ENFORCEMENT_URL });
    const antes = fakeWeb({ [ENFORCEMENT_URL]: { body: META_PAGE }, [ENFORCEMENT_MD]: { body: MD_ANTES } });
    await run(db, antes);
    const textoAntes = db.doc('policy-enforcement').clean_text;

    const depois = fakeWeb({ [ENFORCEMENT_URL]: { body: META_PAGE }, [ENFORCEMENT_MD]: { body: MD_DEPOIS } });
    const { results, sendEmail } = await run(db, depois);
    expect(byStatus(results)).toEqual({ 'policy-enforcement': 'changed' });

    // Sino: só superadmins, um aviso cada, dizendo O QUE mudou.
    const avisos = db.tables.notifications;
    expect(avisos.map((n) => n.user_id).sort()).toEqual([SUPER_A, SUPER_B]);
    expect(avisos[0]!.title).toBe('Política do WhatsApp foi atualizada');
    expect(avisos[0]!.message).toContain('4 frases mudaram');
    expect(avisos[0]!.message).toContain('"Business Accounts" virou "accounts" (em 2 frases)');
    expect(avisos[0]!.message).toContain('Data na página: 21/05/2026, a mesma de antes.');
    expect(avisos[0]!.metadata).toMatchObject({ source: 'policy-watch', kind: 'change', document_key: 'policy-enforcement' });

    // Histórico com os dois textos, para conferir depois.
    const log = db.tables.whatsapp_policy_change_log;
    expect(log).toHaveLength(1);
    expect(log[0]!.old_text).toBe(textoAntes);
    expect(log[0]!.new_text).toContain('relevant Messaging account');
    expect(log[0]!.summary).toContain('Trocas de palavras:');

    // E-mail: uma vez, para o destinatário configurado.
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const email = sendEmail.mock.calls[0][0];
    expect(email.to).toEqual([DONO]);
    expect(email.subject).toBe('Política do WhatsApp mudou: WhatsApp Business Platform: Policy Enforcement');
    expect(email.html).toContain('virou');
    expect(email.html).toContain(ENFORCEMENT_URL);
    expect(results[0]).toMatchObject({ emailed: true });

    // O texto novo passa a ser o guardado: rodar de novo não avisa outra vez.
    expect(db.doc('policy-enforcement').last_changed_at).toBe('2026-10-26T09:00:00.000Z');
    const deNovo = await run(db, depois);
    expect(byStatus(deNovo.results)).toEqual({ 'policy-enforcement': 'unchanged' });
    expect(db.tables.notifications).toHaveLength(2);
    expect(deNovo.sendEmail).not.toHaveBeenCalled();
  });

  it('página vazia (tela de login): "monitor com problema", sem apagar o texto guardado', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'meta-terms-business', label: 'Meta Terms for WhatsApp Business Platform', url: META_TERMS_URL });
    const boa = fakeWeb({ [META_TERMS_URL]: { redirectTo: FB_WWW }, [FB_WWW]: { body: FB_LOGIN }, [FB_M]: { body: FB_MOBILE } });
    await run(db, boa);
    const guardado = { ...db.doc('meta-terms-business') };

    const quebrada = fakeWeb({ [META_TERMS_URL]: { redirectTo: FB_WWW }, [FB_WWW]: { body: FB_LOGIN }, [FB_M]: { body: FB_LOGIN } });
    const { results, sendEmail } = await run(db, quebrada);
    expect(results[0]).toMatchObject({ key: 'meta-terms-business', status: 'problem' });
    expect(results[0]?.reason).toMatch(/vazio ou quase vazio/);

    expect(db.tables.notifications).toHaveLength(2);
    expect(db.tables.notifications[0]!.title).toBe('Monitor de política com problema');
    expect(db.tables.notifications[0]!.type).toBe('error');
    expect(db.tables.notifications[0]!.message).not.toMatch(/foi atualizada/);
    expect(db.tables.whatsapp_policy_change_log).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();

    const doc = db.doc('meta-terms-business');
    expect(doc.clean_text).toBe(guardado.clean_text);
    expect(doc.last_hash).toBe(guardado.last_hash);
    expect(doc.last_error).toMatch(/vazio/);

    // Quando a página volta ao normal, não é "mudança": o texto é o mesmo.
    const volta = await run(db, boa);
    expect(byStatus(volta.results)).toEqual({ 'meta-terms-business': 'unchanged' });
    expect(db.doc('meta-terms-business').last_error).toBeNull();
  });

  it('texto bem menor que o guardado também é "monitor com problema"', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'messaging-guidelines', url: GUIDELINES_URL });
    const fim = '<li>Removing violating account information from our servers</li>';
    const longo = MENU_A.replace(fim, `${fim}<li>${'This paragraph is part of the policy text. '.repeat(40)}</li>`);
    await run(db, fakeWeb({ [GUIDELINES_URL]: { body: longo } }));
    const { results, sendEmail } = await run(db, fakeWeb({ [GUIDELINES_URL]: { body: MENU_A } }));
    expect(results[0]).toMatchObject({ status: 'problem' });
    expect(results[0]?.reason).toMatch(/bem menor/);
    expect(db.tables.notifications[0]!.title).toBe('Monitor de política com problema');
    expect(db.doc('messaging-guidelines').clean_text).toContain('This paragraph is part of the policy text.');
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('erro HTTP e falha de rede viram "monitor com problema" e a vigia segue para a próxima', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'a-http', url: 'https://www.whatsapp.com/legal/fora-do-ar' });
    seedDoc(db, { key: 'b-rede', url: 'https://www.whatsapp.com/legal/sem-rede' });
    seedDoc(db, { key: 'c-boa', url: GUIDELINES_URL });
    const web = fakeWeb({
      'https://www.whatsapp.com/legal/fora-do-ar': { status: 500, body: 'erro' },
      [GUIDELINES_URL]: { body: MENU_A },
    });
    const fetchPage = vi.fn(async (url: string) => {
      if (url.endsWith('/sem-rede')) throw new Error('connection reset');
      return web.fetchPage(url);
    });
    const { results } = await runPolicyWatch({ db, fetchPage, sendEmail: null, emailTo: [] });
    expect(byStatus(results)).toEqual({ 'a-http': 'problem', 'b-rede': 'problem', 'c-boa': 'baseline' });
    expect(results[0]?.reason).toContain('HTTP 500');
    expect(results[1]?.reason).toContain('connection reset');
    expect(db.tables.notifications.every((n) => n.title === 'Monitor de política com problema')).toBe(true);
  });

  it('duas entradas que levam à mesma página são lidas uma vez só', async () => {
    const db = new FakeDb();
    const BUSINESS = 'https://www.whatsapp.com/legal/business-policy/';
    const COMMERCE = 'https://www.whatsapp.com/legal/commerce-policy/';
    const FINAL = 'https://whatsappbusiness.com/policy/';
    seedDoc(db, { key: 'business-messaging', url: BUSINESS });
    seedDoc(db, { key: 'commerce-policy', url: COMMERCE });
    const web = (body: string) => fakeWeb({
      [BUSINESS]: { redirectTo: FINAL },
      [COMMERCE]: { redirectTo: FINAL },
      [FINAL]: { body },
    });
    const primeira = await run(db, web(WAB_POLICY));
    expect(byStatus(primeira.results)).toEqual({ 'business-messaging': 'baseline', 'commerce-policy': 'duplicate' });
    expect(primeira.results[1]).toMatchObject({ duplicateOf: 'business-messaging' });
    expect(db.doc('commerce-policy').clean_text).toBeNull();

    // Mudança real na página: UM aviso por superadmin e UM e-mail, não dois.
    const mudou = WAB_POLICY.replace('weapons or adult products', 'weapons, tobacco or adult products');
    const segunda = await run(db, web(mudou));
    expect(byStatus(segunda.results)).toEqual({ 'business-messaging': 'changed', 'commerce-policy': 'duplicate' });
    expect(db.tables.notifications).toHaveLength(2);
    expect(segunda.sendEmail).toHaveBeenCalledTimes(1);
    expect(db.tables.whatsapp_policy_change_log).toHaveLength(1);
  });

  it('sem e-mail configurado o sino continua avisando', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'policy-enforcement', url: ENFORCEMENT_URL });
    await runPolicyWatch({ db, fetchPage: fakeWeb({ [ENFORCEMENT_URL]: { body: META_PAGE }, [ENFORCEMENT_MD]: { body: MD_ANTES } }).fetchPage, sendEmail: null, emailTo: [] });
    const { results } = await runPolicyWatch({ db, fetchPage: fakeWeb({ [ENFORCEMENT_URL]: { body: META_PAGE }, [ENFORCEMENT_MD]: { body: MD_DEPOIS } }).fetchPage, sendEmail: null, emailTo: [] });
    expect(results[0]).toMatchObject({ status: 'changed', emailed: false });
    expect(db.tables.notifications).toHaveLength(2);
  });

  it('falha no e-mail não perde o aviso nem a gravação do texto novo', async () => {
    const db = new FakeDb();
    seedDoc(db, { key: 'policy-enforcement', url: ENFORCEMENT_URL });
    await run(db, fakeWeb({ [ENFORCEMENT_URL]: { body: META_PAGE }, [ENFORCEMENT_MD]: { body: MD_ANTES } }));
    const falha = vi.fn(async () => { throw new Error('Resend fora do ar'); });
    const { results } = await run(db, fakeWeb({ [ENFORCEMENT_URL]: { body: META_PAGE }, [ENFORCEMENT_MD]: { body: MD_DEPOIS } }), falha);
    expect(results[0]).toMatchObject({ status: 'changed', emailed: false });
    expect(db.tables.notifications).toHaveLength(2);
    expect(db.doc('policy-enforcement').clean_text).toContain('relevant Messaging account');
  });
});

// ── O resumo ─────────────────────────────────────────────────────────────────

describe('summarizeChange', () => {
  it('troca de nome repetida vira uma linha só, com a contagem', () => {
    const s = summarizeChange(extractMetaMarkdown(MD_ANTES), extractMetaMarkdown(MD_DEPOIS));
    expect(s.changed).toBe(4);
    expect(s.added).toBe(0);
    expect(s.removed).toBe(0);
    expect(s.replacements[0]).toEqual({ from: 'Business Accounts', to: 'accounts', count: 2 });
    expect(s.short).toBe('4 frases mudaram. Troca mais comum: "Business Accounts" virou "accounts" (em 2 frases).');
    expect(s.lines).toContain('Exemplo de frase trocada:');
  });

  it('frase nova e frase que saiu aparecem pelo que dizem', () => {
    const antes = 'Regra um vale para todos.\nRegra dois proíbe spam em grupos.\nRegra três fala de pagamentos.';
    const depois = 'Regra um vale para todos.\nRegra três fala de pagamentos.\nNovidade: contas inativas por 90 dias podem ser removidas.';
    const s = summarizeChange(antes, depois);
    expect(s.short).toBe('1 frase entrou e 1 frase saiu.');
    expect(s.addedExamples).toEqual(['Novidade: contas inativas por 90 dias podem ser removidas.']);
    expect(s.removedExamples).toEqual(['Regra dois proíbe spam em grupos.']);
  });

  it('texto quase todo diferente diz que pode ser outro idioma', () => {
    const antes = Array.from({ length: 12 }, (_, i) => `Rule number ${i} applies to every business account.`).join('\n');
    const depois = Array.from({ length: 12 }, (_, i) => `A regra ${i} vale para toda conta comercial.`).join('\n');
    const s = summarizeChange(antes, depois);
    expect(s.short).toMatch(/^Quase todo o texto mudou/);
    expect(s.short).toContain('outro idioma');
  });
});

// ── Os textos que a gente escreve: pt-BR, sem hífen nem travessão ────────────

describe('textos dos avisos', () => {
  const doc: PolicyDocRow = {
    key: 'politica',
    label: 'Politica de Teste',
    url: 'https://www.exemplo.com.br/politica',
    last_hash: null,
    clean_text: null,
    page_updated: 'May 21, 2026',
  };
  const read = { text: '', sourceUrl: doc.url, status: 200, pageUpdated: 'October 30, 2026' };
  const summary = summarizeChange('A regra vale para contas comerciais.', 'A regra vale para contas de mensagens.');
  const visible = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ');
  const HYPHENS = /[-‐-―]/;

  it('nenhum hífen ou travessão no e-mail, no teste e nos avisos', () => {
    const email = changeEmail(doc, read, summary);
    expect(email.html).toContain('O que mudou:');
    expect(email.html).toContain('Data que a página mostra:</strong> 30/10/2026');
    for (const text of [
      visible(email.html),
      email.subject,
      visible(testEmail().html),
      testEmail().subject,
      changeNotification(doc, read, summary).message,
      changeNotification(doc, read, summary).title,
      problemNotification(doc, 'o texto veio vazio').message,
      problemNotification(doc, 'o texto veio vazio').title,
    ]) {
      expect(text).not.toMatch(HYPHENS);
    }
  });

  it('o aviso de mudança diz a data nova da página', () => {
    expect(changeNotification(doc, read, summary).message).toContain('Data na página: 30/10/2026.');
  });

  it('parseRecipients aceita vírgula e descarta o que não é e-mail', () => {
    expect(parseRecipients(' a@exemplo.com.br, b@exemplo.com.br;lixo ')).toEqual(['a@exemplo.com.br', 'b@exemplo.com.br']);
    expect(parseRecipients(undefined)).toEqual([]);
  });
});
