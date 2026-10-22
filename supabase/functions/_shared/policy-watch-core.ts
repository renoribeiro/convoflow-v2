// =============================================================================
// policy-watch-core — a regra da vigia das políticas do WhatsApp/Meta.
// =============================================================================
// O que mora aqui: como ler o TEXTO de uma política (sem menu, rodapé nem
// script), como decidir se ele mudou de verdade, o resumo do que mudou e o laço
// da vigia (`runPolicyWatch`). Rede, banco e e-mail entram por parâmetro: o
// Vitest testa tudo isto sem internet (src/lib/compliance/policyWatch.test.ts)
// e supabase/functions/policy-watch/index.ts é só a casca.
//
// Por que existe (2026-10-21): a versão anterior tirava o hash da página
// inteira, menu do site junto. A Meta mexe no menu quase toda semana, e o sino
// dizia "a política mudou" sem a política mudar. Agora:
//   • developers.facebook.com → a versão .md da própria Meta ("Ver como
//     Markdown"), que só traz o texto do artigo;
//   • facebook.com/legal → a mesma página em m.facebook.com, que responde o
//     texto (a www devolve uma tela de login com a palavra "Facebook");
//   • o resto (whatsapp.com, whatsappbusiness.com) → só o bloco principal,
//     sem <header>, <footer>, <nav> e <aside>.
// A data "atualizado em" da página vai no aviso, mas nunca decide nada: em
// outubro de 2026 a Meta trocou palavras do texto sem mexer na data.
//
// Sem import por URL de propósito: o Vitest carrega este arquivo.
// =============================================================================

/** O mesmo User-Agent desde 2026-06: é com ele que m.facebook.com responde o texto. */
export const POLICY_WATCH_USER_AGENT = 'ConvoFlow-PolicyWatch/1.0 (+compliance)';

/** Menos que isto não é política: é página de erro, de login ou vazia. */
export const MIN_TEXT_CHARS = 200;

/** Texto novo com menos da metade do guardado: algo quebrou na leitura. */
export const SHRINK_RATIO = 0.5;

// ── Rede (por parâmetro) ─────────────────────────────────────────────────────

export interface FetchedPage {
  status: number;
  /** URL final, depois dos redirecionamentos. */
  url: string;
  body: string;
}

export type FetchPage = (url: string) => Promise<FetchedPage>;

// ── HTML → texto ─────────────────────────────────────────────────────────────

const DROP_BLOCKS = /<(script|style|noscript|template|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi;
const BLOCK_TAGS =
  /<\/?(?:p|div|li|ul|ol|h[1-6]|tr|td|th|table|thead|tbody|section|article|blockquote|pre|dd|dt|dl|hr)\b[^>]*>/gi;

interface ElementSpan {
  start: number;
  innerStart: number;
  innerEnd: number;
  end: number;
}

/**
 * Acha o primeiro elemento `tag` e onde ele fecha, contando os aninhados do
 * mesmo nome (o <header> do whatsappbusiness.com tem outro <header> dentro).
 * Elemento sem fechamento devolve null: melhor não cortar do que cortar o resto
 * da página.
 */
function findElement(html: string, tag: string): ElementSpan | null {
  const re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi');
  let depth = 0;
  let start = -1;
  let innerStart = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (!m[1]) {
      if (depth === 0) {
        start = m.index;
        innerStart = re.lastIndex;
      }
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) return { start, innerStart, innerEnd: m.index, end: re.lastIndex };
    }
  }
  return null;
}

function removeElements(html: string, tag: string): string {
  let out = html;
  for (let guard = 0; guard < 200; guard++) {
    const el = findElement(out, tag);
    if (!el) break;
    out = out.slice(0, el.start) + '\n' + out.slice(el.end);
  }
  return out;
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“',
  ndash: '–', mdash: '—', hellip: '…', copy: '©',
  reg: '®', trade: '™', laquo: '«', raquo: '»',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (all, name) => NAMED_ENTITIES[name.toLowerCase()] ?? all);
}

/** Uma linha por bloco, espaços colapsados, sem linha vazia. */
export function normalizeText(s: string): string {
  return s
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.replace(/[\s\u00a0\u200b\u202f\u2060\ufeff]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function htmlToText(fragment: string): string {
  const text = fragment
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(DROP_BLOCKS, ' ')
    // Como no navegador: quebra de linha no código-fonte é só espaço. As linhas
    // do texto saem dos blocos (<p>, <li>, <h2>...), não do jeito que o HTML
    // foi indentado nesta semana.
    .replace(/\s+/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(BLOCK_TAGS, '\n')
    .replace(/<[^>]+>/g, ' ');
  return normalizeText(
    decodeEntities(text)
      // A troca de tag por espaço deixa "Policy ." e "( texto )": junta de volta.
      .replace(/ +([.,;:!?)\]])/g, '$1')
      .replace(/([([]) +/g, '$1'),
  );
}

/**
 * O texto do bloco principal de uma página HTML: o <main> (ou <article>, ou o
 * <body>), sem cabeçalho, rodapé, menus e laterais.
 */
export function extractMainText(html: string): string {
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ').replace(DROP_BLOCKS, ' ');
  const root = findElement(h, 'main') ?? findElement(h, 'article') ?? findElement(h, 'body');
  if (root) h = h.slice(root.innerStart, root.innerEnd);
  for (const tag of ['header', 'footer', 'nav', 'aside']) h = removeElements(h, tag);
  return htmlToText(h);
}

/**
 * O texto da versão .md de uma página de developers.facebook.com. A Meta às
 * vezes responde o Markdown cru, às vezes embrulhado num <pre>; e no cru ela
 * acrescenta um rodapé com o índice da documentação, que não é a política.
 */
export function extractMetaMarkdown(body: string): string {
  let t = body;
  const pre = findElement(t, 'pre');
  if (pre) t = decodeEntities(t.slice(pre.innerStart, pre.innerEnd).replace(/<[^>]+>/g, ''));
  t = t
    .replace(/\n\s*-{3,}\s*\n\s*Full documentation index[^\n]*\s*$/i, '\n')
    .replace(/^\s*Full documentation index[^\n]*$/gim, '');
  return normalizeText(t);
}

// ── De onde ler o texto ──────────────────────────────────────────────────────

export type Extractor = 'meta-dev-md' | 'facebook-legal' | 'html-main';

export function extractorFor(url: string): Extractor {
  const u = new URL(url);
  const host = u.hostname.toLowerCase();
  if (host === 'developers.facebook.com') return 'meta-dev-md';
  if (/^(?:www\.|m\.|mbasic\.)?facebook\.com$/.test(host) && u.pathname.startsWith('/legal/')) {
    return 'facebook-legal';
  }
  return 'html-main';
}

/** A página atual (já redirecionada) + ".md", sem query nem âncora. */
export function markdownUrlFor(pageUrl: string): string {
  const u = new URL(pageUrl);
  u.search = '';
  u.hash = '';
  u.pathname = u.pathname.replace(/\/+$/, '');
  if (!u.pathname.endsWith('.md')) u.pathname += '.md';
  return u.toString();
}

export function mobileFacebookUrl(url: string): string {
  const u = new URL(url);
  u.hostname = 'm.facebook.com';
  return u.toString();
}

/** Chave para achar duas entradas que caem na mesma página. */
export function sourceKey(url: string): string {
  const u = new URL(url);
  return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '').toLowerCase()}`;
}

// ── A data que a página mostra (informação, nunca gatilho) ──────────────────

const EN_MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

const DATE_PATTERN =
  '(?:[A-Z][a-z]+\\.? \\d{1,2}, \\d{4}|\\d{1,2} de [a-zç]+\\.? de \\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}/\\d{1,2}/\\d{4})';
const DATE_LINE = new RegExp(
  '^(?:last updated|last modified|updated|effective(?: date)?|atualizad[oa] em|[uú]ltima atualiza[cç][aã]o)' +
    '\\s*:?\\s*(' + DATE_PATTERN + ')(?:\\s*\\(\\s*archived versions\\s*\\))?',
  'i',
);

/** "2026-05-21" e "May 21, 2026" viram "21/05/2026"; o resto sai como veio. */
export function formatPageDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const en = raw.match(/^([A-Za-z]+)\.? (\d{1,2}), (\d{4})$/);
  if (en) {
    const [, name = '', day = '', year = ''] = en;
    const month = EN_MONTHS.findIndex((m) => m.startsWith(name.toLowerCase().slice(0, 3)));
    if (month >= 0) return `${day.padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`;
  }
  return raw;
}

/**
 * Tira do texto a linha "Last updated: ..." (ou "Effective ...") e devolve a
 * data à parte. Ela sai do texto comparado: só a data mudar não é a política
 * mudar. Procura só no começo, onde as páginas da Meta põem a data.
 */
export function splitPageDate(text: string): { text: string; pageUpdated: string | null } {
  const lines = text.split('\n');
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i] ?? '';
    const m = line.match(DATE_LINE);
    if (!m) continue;
    const rest = line.slice(m[0].length).trim();
    if (rest) lines[i] = rest;
    else lines.splice(i, 1);
    return { text: lines.join('\n'), pageUpdated: m[1] ?? null };
  }
  return { text, pageUpdated: null };
}

/** developers.facebook.com guarda a data num JSON da página: "lastUpdated":"2026-05-21". */
export function metaDevLastUpdated(html: string): string | null {
  const m = html.match(/\\?"lastUpdated\\?"\s*:\s*\\?"(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

// ── Ler uma política ─────────────────────────────────────────────────────────

export interface PolicyText {
  text: string;
  /** De onde o texto saiu de fato (a .md, a m.facebook.com, a página final). */
  sourceUrl: string;
  status: number;
  pageUpdated: string | null;
}

export async function readPolicy(url: string, fetchPage: FetchPage): Promise<PolicyText> {
  const page = await fetchPage(url);
  if (page.status >= 400) return { text: '', sourceUrl: page.url, status: page.status, pageUpdated: null };

  const kind = extractorFor(page.url);
  if (kind === 'meta-dev-md') {
    const md = await fetchPage(markdownUrlFor(page.url));
    if (md.status >= 400) return { text: '', sourceUrl: md.url, status: md.status, pageUpdated: null };
    // Hoje o .md não traz a data; se um dia trouxer, ela sai do texto do mesmo jeito.
    const { text, pageUpdated } = splitPageDate(extractMetaMarkdown(md.body));
    return {
      text,
      sourceUrl: md.url,
      status: md.status,
      pageUpdated: metaDevLastUpdated(page.body) ?? pageUpdated,
    };
  }

  const source = kind === 'facebook-legal' && new URL(page.url).hostname !== 'm.facebook.com'
    ? await fetchPage(mobileFacebookUrl(page.url))
    : page;
  if (source.status >= 400) return { text: '', sourceUrl: source.url, status: source.status, pageUpdated: null };
  const { text, pageUpdated } = splitPageDate(extractMainText(source.body));
  return { text, sourceUrl: source.url, status: source.status, pageUpdated };
}

/** O que entra no hash: o texto com todo espaço e quebra de linha virando um espaço. */
export function canonicalText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ── Resumo da mudança ────────────────────────────────────────────────────────

export function toSentences(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    for (const part of line.split(/(?<=[^\d\s][.!?])\s+(?=\S)/)) {
      const s = part.trim();
      if (s) out.push(s);
    }
  }
  return out;
}

type DiffOp = 'eq' | 'del' | 'ins';

/** Diferença por maior subsequência comum, com o começo e o fim iguais cortados antes. */
function diff(a: string[], b: string[]): Array<{ op: DiffOp; value: string }> {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;

  const head = a.slice(0, pre).map((value) => ({ op: 'eq' as const, value }));
  const tail = a.slice(a.length - suf).map((value) => ({ op: 'eq' as const, value }));
  const x = a.slice(pre, a.length - suf);
  const y = b.slice(pre, b.length - suf);
  const n = x.length;
  const m = y.length;

  let middle: Array<{ op: DiffOp; value: string }>;
  if (n * m > 4_000_000) {
    // Grande demais para a tabela: tudo o que sobrou conta como trocado.
    middle = [
      ...x.map((value) => ({ op: 'del' as const, value })),
      ...y.map((value) => ({ op: 'ins' as const, value })),
    ];
  } else {
    // t[i][j] = tamanho da maior subsequência comum de x[i..] e y[j..].
    const w = m + 1;
    const t = new Uint32Array((n + 1) * w);
    const at = (i: number, j: number) => t[i * w + j] ?? 0;
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        t[i * w + j] = x[i] === y[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
      }
    }
    middle = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      const xi = x[i] ?? '';
      const yj = y[j] ?? '';
      if (xi === yj) { middle.push({ op: 'eq', value: xi }); i++; j++; }
      else if (at(i + 1, j) >= at(i, j + 1)) { middle.push({ op: 'del', value: xi }); i++; }
      else { middle.push({ op: 'ins', value: yj }); j++; }
    }
    for (; i < n; i++) middle.push({ op: 'del', value: x[i] ?? '' });
    for (; j < m; j++) middle.push({ op: 'ins', value: y[j] ?? '' });
  }
  return [...head, ...middle, ...tail];
}

function words(s: string): string[] {
  return s.split(/\s+/).filter(Boolean);
}

function similarity(a: string, b: string): number {
  const wa = words(a);
  const wb = words(b);
  if (!wa.length || !wb.length) return 0;
  const same = diff(wa, wb).filter((d) => d.op === 'eq').length;
  return (2 * same) / (wa.length + wb.length);
}

const trimPunct = (s: string) => s.replace(/^[\s"“”'(]+|[\s"“”'),.;:]+$/g, '');

/** Os trechos trocados dentro de uma frase: [{ from: "Business Accounts", to: "accounts" }]. */
function replacementsIn(before: string, after: string): Array<{ from: string; to: string }> {
  const out: Array<{ from: string; to: string }> = [];
  let del: string[] = [];
  let ins: string[] = [];
  const flush = () => {
    const from = trimPunct(del.join(' '));
    const to = trimPunct(ins.join(' '));
    if (from || to) out.push({ from, to });
    del = [];
    ins = [];
  };
  for (const d of diff(words(before), words(after))) {
    if (d.op === 'eq') flush();
    else if (d.op === 'del') del.push(d.value);
    else ins.push(d.value);
  }
  flush();
  return out;
}

export interface ChangeSummary {
  changed: number;
  added: number;
  removed: number;
  /** Fração das frases antigas que continuam iguais. */
  keptRatio: number;
  replacements: Array<{ from: string; to: string; count: number }>;
  addedExamples: string[];
  removedExamples: string[];
  example: { before: string; after: string } | null;
  /** Uma frase curta: vai no sino. */
  short: string;
  /** O resumo inteiro: vai no e-mail e no histórico. */
  lines: string[];
}

function truncate(s: string, max = 220): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * As duas versões de uma frase trocada, recortadas a partir de umas palavras
 * antes da primeira diferença: numa frase longa, o começo igual não ajuda.
 */
function aroundFirstDifference(before: string, after: string): { before: string; after: string } {
  const a = words(before);
  const b = words(after);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const from = Math.max(0, i - 6);
  const cut = (ws: string[]) => (from > 0 ? '…' : '') + truncate(ws.slice(from).join(' '), 200);
  return { before: cut(a), after: cut(b) };
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function joinPt(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} e ${parts[parts.length - 1]}`;
}

function describeReplacement(r: { from: string; to: string; count: number }): string {
  const what = r.from && r.to ? `"${r.from}" virou "${r.to}"` : r.to ? `entrou "${r.to}"` : `saiu "${r.from}"`;
  return r.count > 1 ? `${what} (em ${r.count} frases)` : what;
}

export function summarizeChange(oldText: string, newText: string): ChangeSummary {
  const before = toSentences(oldText);
  const after = toSentences(newText);
  const ops = diff(before, after);

  let changed = 0;
  const addedList: string[] = [];
  const removedList: string[] = [];
  const pairs: Array<{ before: string; after: string }> = [];

  // Junta cada trecho seguido de frases que saíram e entraram; dentro dele,
  // a frase que saiu e a que entrou parecidas (metade das palavras ou mais)
  // são a MESMA frase trocada, não uma que saiu e outra que entrou.
  let dels: string[] = [];
  let ins: string[] = [];
  const closeHunk = () => {
    const used = new Set<number>();
    for (const d of dels) {
      let best = -1;
      let bestScore = 0.5;
      ins.forEach((s, k) => {
        if (used.has(k)) return;
        const score = similarity(d, s);
        if (score >= bestScore) { best = k; bestScore = score; }
      });
      const match = best >= 0 ? ins[best] : undefined;
      if (match !== undefined) {
        used.add(best);
        changed++;
        pairs.push({ before: d, after: match });
      } else {
        removedList.push(d);
      }
    }
    ins.forEach((s, k) => { if (!used.has(k)) addedList.push(s); });
    dels = [];
    ins = [];
  };
  for (const op of ops) {
    if (op.op === 'eq') closeHunk();
    else if (op.op === 'del') dels.push(op.value);
    else ins.push(op.value);
  }
  closeHunk();

  const counts = new Map<string, { from: string; to: string; count: number }>();
  for (const p of pairs) {
    const seen = new Set<string>();
    for (const r of replacementsIn(p.before, p.after)) {
      const k = `${r.from.toLowerCase()}\u0000${r.to.toLowerCase()}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const cur = counts.get(k);
      if (cur) cur.count++;
      else counts.set(k, { ...r, count: 1 });
    }
  }
  const replacements = [...counts.values()].sort((a, b) => b.count - a.count);

  const kept = ops.filter((o) => o.op === 'eq').length;
  const keptRatio = before.length ? kept / before.length : 0;

  const countParts: string[] = [];
  if (changed) countParts.push(plural(changed, 'frase mudou', 'frases mudaram'));
  if (addedList.length) countParts.push(plural(addedList.length, 'frase entrou', 'frases entraram'));
  if (removedList.length) countParts.push(plural(removedList.length, 'frase saiu', 'frases saíram'));
  const countSentence = countParts.length
    ? `${joinPt(countParts)}.`
    : 'Mudaram só detalhes de pontuação ou espaço.';

  let short: string;
  if (before.length >= 10 && keptRatio < 0.1) {
    short = `Quase todo o texto mudou: só ${Math.round(keptRatio * 100)}% das frases ficaram iguais. ` +
      'Pode ser uma versão nova do documento ou a página veio em outro idioma.';
  } else {
    short = countSentence;
    if (replacements[0]) short += ` Troca mais comum: ${describeReplacement(replacements[0])}.`;
  }

  const lines: string[] = [short];
  if (!short.startsWith(countSentence)) lines.push(countSentence);
  if (replacements.length) {
    lines.push('Trocas de palavras:');
    for (const r of replacements.slice(0, 5)) lines.push(`• ${describeReplacement(r)}`);
  }
  const example = pairs[0] ? aroundFirstDifference(pairs[0].before, pairs[0].after) : null;
  if (example) {
    lines.push('Exemplo de frase trocada:', `• antes: "${example.before}"`, `• agora: "${example.after}"`);
  }
  const addedExamples = addedList.slice(0, 3).map((s) => truncate(s));
  const removedExamples = removedList.slice(0, 3).map((s) => truncate(s));
  if (addedExamples.length) {
    lines.push('Frases novas:');
    for (const s of addedExamples) lines.push(`• "${s}"`);
  }
  if (removedExamples.length) {
    lines.push('Frases que saíram:');
    for (const s of removedExamples) lines.push(`• "${s}"`);
  }

  return {
    changed,
    added: addedList.length,
    removed: removedList.length,
    keptRatio,
    replacements,
    addedExamples,
    removedExamples,
    example,
    short,
    lines,
  };
}

// ── O que fazer com a leitura ────────────────────────────────────────────────

export interface PolicyDocRow {
  key: string;
  label: string;
  url: string;
  last_hash: string | null;
  clean_text: string | null;
  page_updated: string | null;
}

export type Decision =
  | { kind: 'problem'; reason: string }
  | { kind: 'baseline' }
  | { kind: 'unchanged' }
  | { kind: 'changed'; summary: ChangeSummary };

/**
 * A decisão de uma página, sem efeito colateral. "problem" nunca grava o texto
 * novo: o guardado continua sendo o da última leitura boa.
 */
export function decide(doc: PolicyDocRow, read: PolicyText, hash: string): Decision {
  const len = read.text.length;
  const oldLen = doc.clean_text?.length ?? 0;
  if (read.status >= 400) return { kind: 'problem', reason: `a página respondeu com erro HTTP ${read.status}` };
  if (len < MIN_TEXT_CHARS) {
    return {
      kind: 'problem',
      reason: oldLen
        ? `o texto veio vazio ou quase vazio (${len} caracteres; da última vez eram ${oldLen})`
        : `o texto veio vazio ou quase vazio (${len} caracteres)`,
    };
  }
  if (oldLen && len < oldLen * SHRINK_RATIO) {
    return { kind: 'problem', reason: `o texto veio bem menor que da última vez (${len} caracteres contra ${oldLen})` };
  }
  if (!doc.clean_text) return { kind: 'baseline' };
  if (doc.last_hash === hash) return { kind: 'unchanged' };
  return { kind: 'changed', summary: summarizeChange(doc.clean_text, read.text) };
}

// ── Textos dos avisos (pt-BR, sem hífen nem travessão) ───────────────────────

export interface NotificationDraft {
  title: string;
  message: string;
  type: 'warning' | 'error';
  action_url: string;
  action_label: string;
  metadata: Record<string, unknown>;
}

function dateNote(pageUpdated: string | null, previous: string | null): string {
  const now = formatPageDate(pageUpdated);
  if (!now) return '';
  return previous && previous === pageUpdated
    ? ` Data na página: ${now}, a mesma de antes.`
    : ` Data na página: ${now}.`;
}

export function changeNotification(doc: PolicyDocRow, read: PolicyText, summary: ChangeSummary): NotificationDraft {
  return {
    title: 'Política do WhatsApp foi atualizada',
    message: `O texto de "${doc.label}" mudou. ${summary.short}${dateNote(read.pageUpdated, doc.page_updated)}`,
    type: 'warning',
    action_url: doc.url,
    action_label: 'Ver política',
    metadata: { source: 'policy-watch', kind: 'change', document_key: doc.key },
  };
}

export function problemNotification(doc: PolicyDocRow, reason: string): NotificationDraft {
  return {
    title: 'Monitor de política com problema',
    message:
      `Não deu para ler o texto de "${doc.label}": ${reason}. ` +
      'O texto guardado continua o da última leitura boa e nenhuma mudança foi avisada. ' +
      'Abra a página: se ela estiver normal, o monitor precisa de ajuste.',
    type: 'error',
    action_url: doc.url,
    action_label: 'Ver página',
    metadata: { source: 'policy-watch', kind: 'problem', document_key: doc.key, reason },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML de propósito simples (sem estilo): o que se lê é o texto. */
function plainHtml(paragraphs: string[]): string {
  return `<!doctype html><html lang="pt-BR"><body>${paragraphs
    .map((p) => `<p>${p}</p>`)
    .join('')}</body></html>`;
}

export function changeEmail(
  doc: PolicyDocRow,
  read: PolicyText,
  summary: ChangeSummary,
): { subject: string; html: string } {
  const date = formatPageDate(read.pageUpdated);
  const paragraphs = [
    'Olá,',
    'O monitor de políticas do ConvoFlow viu uma mudança de verdade no texto de uma página da Meta.',
    `<strong>Página:</strong> ${escapeHtml(doc.label)}`,
    `<strong>O que mudou:</strong><br>${summary.lines.map(escapeHtml).join('<br>')}`,
    ...(date ? [`<strong>Data que a página mostra:</strong> ${escapeHtml(date)}`] : []),
    `<strong>Link:</strong> <a href="${escapeHtml(doc.url)}">${escapeHtml(doc.url)}</a>`,
    'Vale reler a página e conferir se as regras de conformidade do ConvoFlow continuam certas.',
    'Este aviso vem do monitor semanal de políticas do ConvoFlow.',
  ];
  return { subject: `Política do WhatsApp mudou: ${doc.label}`, html: plainHtml(paragraphs) };
}

export function testEmail(): { subject: string; html: string } {
  return {
    subject: 'Teste do aviso de política do WhatsApp',
    html: plainHtml([
      'Olá,',
      'Este é um teste do monitor de políticas do ConvoFlow. Nada mudou.',
      'Quando o texto de uma política da Meta mudar de verdade, o aviso chega assim, com o nome da página, um resumo do que mudou e o link.',
    ]),
  };
}

export function parseRecipients(raw: string | null | undefined): string[] {
  return (raw ?? '')
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
}

// ── O laço da vigia ──────────────────────────────────────────────────────────

/** Formato mínimo do supabase-js que o laço usa (o dublê dos testes imita). */
export interface PolicyWatchDb {
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export interface PolicyWatchLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

export interface PolicyWatchDeps {
  db: PolicyWatchDb;
  fetchPage: FetchPage;
  /** null quando o servidor não tem e-mail configurado. */
  sendEmail: ((args: { to: string[]; subject: string; html: string }) => Promise<unknown>) | null;
  emailTo: string[];
  now?: () => Date;
  logger?: PolicyWatchLogger;
}

export type DocStatus = 'baseline' | 'unchanged' | 'changed' | 'problem' | 'duplicate';

export interface DocResult {
  key: string;
  status: DocStatus;
  reason?: string;
  duplicateOf?: string;
  summary?: string;
  emailed?: boolean;
}

const DOC_COLUMNS = 'key,label,url,last_hash,clean_text,page_updated';

export async function runPolicyWatch(deps: PolicyWatchDeps): Promise<{ results: DocResult[] }> {
  const { db, fetchPage, sendEmail, emailTo } = deps;
  const now = deps.now ?? (() => new Date());
  const log = deps.logger;

  const { data, error } = await db.from('whatsapp_policy_documents').select(DOC_COLUMNS).eq('is_active', true);
  if (error) throw new Error(`Falha ao carregar a lista de políticas: ${error.message}`);
  const docs = [...((data ?? []) as PolicyDocRow[])].sort((a, b) => a.key.localeCompare(b.key));

  let admins: string[] | null = null;
  const superadmins = async (): Promise<string[]> => {
    if (admins) return admins;
    const { data: rows, error: err } = await db.from('profiles').select('user_id').eq('role', 'superadmin');
    if (err) log?.error('policy-watch: falha ao listar superadmins', { error: err.message });
    // notifications.user_id referencia auth.users(id) == profiles.user_id (NÃO profiles.id).
    admins = ((rows ?? []) as Array<{ user_id: string | null }>).map((r) => r.user_id).filter((id): id is string => !!id);
    return admins;
  };
  const notify = async (draft: NotificationDraft) => {
    const ids = await superadmins();
    if (!ids.length) return;
    const { error: err } = await db.from('notifications').insert(ids.map((user_id) => ({ user_id, ...draft })));
    if (err) log?.error('policy-watch: falha ao gravar aviso', { error: err.message });
  };
  const updateDoc = async (key: string, patch: Record<string, unknown>) => {
    const { error: err } = await db.from('whatsapp_policy_documents').update(patch).eq('key', key);
    if (err) log?.error('policy-watch: falha ao gravar a leitura', { key, error: err.message });
  };

  const seen = new Map<string, string>();
  const results: DocResult[] = [];

  for (const doc of docs) {
    const checkedAt = now().toISOString();
    let read: PolicyText;
    try {
      read = await readPolicy(doc.url, fetchPage);
    } catch (e) {
      const reason = `não consegui baixar a página (${e instanceof Error ? e.message : String(e)})`;
      await updateDoc(doc.key, { last_checked_at: checkedAt, last_error: reason, updated_at: checkedAt });
      await notify(problemNotification(doc, reason));
      results.push({ key: doc.key, status: 'problem', reason });
      continue;
    }

    const source = sourceKey(read.sourceUrl);
    const first = seen.get(source);
    if (first) {
      // Duas entradas, uma página: lê uma vez só e não avisa nada pela segunda.
      await updateDoc(doc.key, {
        last_checked_at: checkedAt,
        resolved_url: read.sourceUrl,
        last_error: `mesma página de ${first}`,
        updated_at: checkedAt,
      });
      results.push({ key: doc.key, status: 'duplicate', duplicateOf: first });
      continue;
    }
    seen.set(source, doc.key);

    const hash = await sha256Hex(canonicalText(read.text));
    const decision = decide(doc, read, hash);

    if (decision.kind === 'problem') {
      log?.warn('policy-watch: leitura com problema', { key: doc.key, reason: decision.reason });
      await updateDoc(doc.key, {
        last_checked_at: checkedAt,
        last_status_code: read.status,
        last_error: decision.reason,
        resolved_url: read.sourceUrl,
        updated_at: checkedAt,
      });
      await notify(problemNotification(doc, decision.reason));
      results.push({ key: doc.key, status: 'problem', reason: decision.reason });
      continue;
    }

    const stored = {
      last_hash: hash,
      clean_text: read.text,
      page_updated: read.pageUpdated,
      resolved_url: read.sourceUrl,
      last_status_code: read.status,
      last_checked_at: checkedAt,
      last_error: null,
      updated_at: checkedAt,
    };

    if (decision.kind !== 'changed') {
      await updateDoc(doc.key, stored);
      results.push({ key: doc.key, status: decision.kind });
      continue;
    }

    const { summary } = decision;
    log?.warn('policy-watch: o texto da política mudou', { key: doc.key, summary: summary.short });
    const { error: logErr } = await db.from('whatsapp_policy_change_log').insert({
      document_key: doc.key,
      old_hash: doc.last_hash,
      new_hash: hash,
      http_status: read.status,
      excerpt: summary.short,
      summary: summary.lines.join('\n'),
      old_text: doc.clean_text,
      new_text: read.text,
      page_updated: read.pageUpdated,
    });
    if (logErr) log?.error('policy-watch: falha ao gravar o histórico', { key: doc.key, error: logErr.message });

    await notify(changeNotification(doc, read, summary));

    let emailed = false;
    if (sendEmail && emailTo.length) {
      try {
        await sendEmail({ to: emailTo, ...changeEmail(doc, read, summary) });
        emailed = true;
      } catch (e) {
        log?.error('policy-watch: falha ao mandar o e-mail', { key: doc.key, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await updateDoc(doc.key, { ...stored, last_changed_at: checkedAt });
    results.push({ key: doc.key, status: 'changed', summary: summary.short, emailed });
  }

  return { results };
}
