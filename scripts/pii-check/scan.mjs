// Detecção de dado pessoal real (e de chave) em texto.
//
// Sem dependências: o mesmo código roda no hook de pre-commit, no GitHub Action
// e no Vitest. A regra que ele guarda está no topo do CLAUDE.md.
//
// Este arquivo não pode conter nenhum dos valores que ele procura — ele mesmo
// passa pelo hook. Por isso os exemplos nos comentários são descritos, não
// escritos, e os testes montam os valores em tempo de execução.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Configuração versionada (lista de permissões + histórico de migrações)
// ---------------------------------------------------------------------------

export function loadConfig(file = path.join(HERE, 'config.json')) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return {
    allowedEmailDomains: (raw.allowedEmailDomains ?? []).map((d) => d.toLowerCase()),
    allowedEmails: new Set((raw.allowedEmails ?? []).map((e) => e.toLowerCase())),
    allowedIps: new Set(raw.allowedIps ?? []),
    allowedPhones: new Set((raw.allowedPhones ?? []).map((p) => String(p).replace(/\D/g, ''))),
    ignoredPaths: raw.ignoredPaths ?? [],
  };
}

/** Migrações que já rodaram são história: ficam fora da checagem, as novas não. */
export function loadHistoryList(file = path.join(HERE, 'historico-migracoes.txt')) {
  if (!fs.existsSync(file)) return new Set();
  return new Set(
    fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#')),
  );
}

export function isIgnoredPath(file, config, history) {
  const p = file.replace(/\\/g, '/');
  if (history.has(p)) return true;
  return config.ignoredPaths.some((pattern) =>
    pattern.endsWith('/') ? p.startsWith(pattern) : p === pattern || p.endsWith('/' + pattern),
  );
}

// ---------------------------------------------------------------------------
// Lista privada (fora do git): nomes, e-mails, UUIDs e ids reais do banco
// ---------------------------------------------------------------------------

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const MIN_DENY_LEN = 4;

/** Minúsculas, sem acento, espaços colapsados: "José  da Silva" e "jose da silva" batem. */
export function normalize(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function parseDenylist(text) {
  const deny = { uuids: new Set(), emails: new Set(), tokens: new Set(), digits: new Set(), phrases: [] };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const entry = normalize(line).trim();
    if (entry.length < MIN_DENY_LEN) continue;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entry)) deny.uuids.add(entry);
    else if (entry.includes('@')) deny.emails.add(entry);
    else if (/^\+?[\d\s().-]+$/.test(entry)) {
      const d = entry.replace(/\D/g, '');
      if (d.length >= 8) deny.digits.add(d);
    } else if (/^[a-z0-9_]+$/.test(entry) && /\d/.test(entry)) deny.tokens.add(entry);
    else deny.phrases.push(entry);
  }
  // Uma regex só para todas as frases: mais longas primeiro, borda de palavra Unicode.
  deny.phraseRe = deny.phrases.length
    ? new RegExp(
        '(?<![\\p{L}\\p{N}])(?:' +
          [...new Set(deny.phrases)]
            .sort((a, b) => b.length - a.length)
            .map((p) => escapeRegExp(p).replace(/ /g, '\\s+'))
            .join('|') +
          ')(?![\\p{L}\\p{N}])',
        'gu',
      )
    : null;
  return deny;
}

export function loadDenylist(file) {
  if (!file || !fs.existsSync(file)) return null;
  return parseDenylist(fs.readFileSync(file, 'utf8'));
}

function denyFindings(line, deny) {
  if (!deny) return [];
  const out = [];
  const norm = normalize(line);
  for (const m of norm.matchAll(UUID_RE)) if (deny.uuids.has(m[0])) out.push(m[0]);
  for (const m of norm.matchAll(EMAIL_RE)) if (deny.emails.has(m[0])) out.push(m[0]);
  for (const m of norm.matchAll(/[a-z0-9_]+/g)) if (deny.tokens.has(m[0])) out.push(m[0]);
  if (deny.digits.size) {
    for (const m of norm.matchAll(/\+?\d[\d\s().-]{6,}\d/g)) {
      const d = m[0].replace(/\D/g, '');
      for (const cand of [d, d.replace(/^55/, '')]) if (deny.digits.has(cand) || deny.digits.has('55' + cand)) out.push(m[0]);
    }
  }
  if (deny.phraseRe) for (const m of norm.matchAll(deny.phraseRe)) out.push(m[0]);
  return [...new Set(out)];
}

// ---------------------------------------------------------------------------
// Padrões
// ---------------------------------------------------------------------------

// Domínios reservados para exemplo (RFC 2606/6761) e os endereços de JID do WhatsApp,
// que parecem e-mail mas são número de telefone — o número é pego pela regra de telefone.
const RESERVED_TLDS = ['test', 'example', 'invalid', 'localhost', 'local'];
const JID_DOMAINS = ['s.whatsapp.net', 'c.us', 'g.us', 'lid', 'broadcast', 'newsletter'];

function emailAllowed(email, config) {
  const e = email.toLowerCase();
  if (config.allowedEmails.has(e)) return true;
  const domain = e.split('@')[1];
  if (JID_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d))) return true;
  if (RESERVED_TLDS.includes(domain.split('.').pop())) return true;
  return config.allowedEmailDomains.some((d) => domain === d || domain.endsWith('.' + d));
}

// DDDs que existem (Anatel). Número com DDD fora daqui não é telefone brasileiro.
const DDD = new Set(
  '11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99'.split(
    ' ',
  ),
);

/**
 * Padrão de número falso. Olha o assinante (os dígitos depois do DDD):
 *   - os 8 últimos usam no máximo 2 algarismos distintos (9999-9999, 9999-0000);
 *   - ou há uma sequência de 5+ algarismos iguais (9 8000-0001, 9 9999-0301);
 *   - ou os 8 últimos são uma escada (1234-5678, 8765-4321).
 * Um número real cai aqui com chance perto de 0,05 %.
 */
export function isFakePhoneDigits(digits) {
  const tail = digits.slice(-8);
  if (new Set(tail).size <= 2) return true;
  if (/(\d)\1{4}/.test(digits.slice(-9))) return true;
  const up = '01234567890123456789';
  const down = '98765432109876543210';
  return up.includes(tail) || down.includes(tail);
}

const PHONE_PATTERNS = [
  // +55 com qualquer formatação
  { re: /\+55[\s.-]?\(?\d{2}\)?[\s.-]?9?[\s.-]?\d{4}[\s.-]?\d{4}(?!\d)/g, ddd: true },
  // (DDD) número
  { re: /(?<![\d+])\(\d{2}\)[\s.-]?9?[\s.-]?\d{4}[\s.-]?\d{4}(?!\d)/g, ddd: true },
  // 55 + DDD + número, só dígitos (é o formato do WhatsApp)
  { re: /(?<![\w+-])55\d{10,11}(?![\w-])/g, ddd: true },
  // DDD + 9 + 8 dígitos, só dígitos
  { re: /(?<![\w+-])\d{2}9\d{8}(?![\w-])/g, ddd: true },
  // DDD separado por espaço ou ponto: "DD 9XXXX-XXXX"
  { re: /(?<![\w(+.-])\d{2}[\s.]9?\s?\d{4}-\d{4}(?!\d)/g, ddd: true },
  // celular sem DDD: "9XXXX-XXXX"
  { re: /(?<![\w-])9\d{4}-\d{4}(?![\w-])/g, ddd: false },
];

function phoneCandidate(match, withDdd) {
  let d = match.replace(/\D/g, '');
  if (withDdd) {
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2);
    if (d.length !== 10 && d.length !== 11) return null;
    if (!DDD.has(d.slice(0, 2))) return null;
    const sub = d.slice(2);
    if (sub.length === 9 && sub[0] !== '9') return null;
    // 8 dígitos: fixo (2-5) ou celular antigo sem o 9 na frente, como o WhatsApp ainda grava (6-9)
    if (sub.length === 8 && !/[2-9]/.test(sub[0])) return null;
  } else if (d.length !== 9) return null;
  return d;
}

function ipv4IsPublic(ip) {
  const o = ip.split('.').map(Number);
  if (ip.split('.').some((s) => s.length > 1 && s.startsWith('0'))) return false;
  if (o.some((n) => n > 255)) return false;
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && b === 168) return false;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // doc/IETF
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmark
  if (a === 198 && b === 51 && c === 100) return false; // doc
  if (a === 203 && b === 0 && c === 113) return false; // doc
  return true;
}

const FAKE_MARKER = /test|fake|exampl|dummy|mock|placeholder|redacted|your|x{4}|0{6}/i;

const STRIPE_RE = /(?<![\w])(?:cus|sub|pi|acct)_[A-Za-z0-9]{14,}(?![\w])/g;

const KEY_PATTERNS = [
  { name: 'chave Stripe', re: /(?<![\w])[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g },
  { name: 'segredo de webhook Stripe', re: /(?<![\w])whsec_[A-Za-z0-9+/=]{20,}/g },
  { name: 'chave Supabase', re: /(?<![\w])sb_(?:secret|publishable)_[A-Za-z0-9_-]{16,}/g, random: true },
  { name: 'token de acesso Supabase', re: /(?<![\w])sbp_[a-f0-9]{40}/g },
  { name: 'JWT', re: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{20,}/g },
  { name: 'chave AWS', re: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/g },
  { name: 'token GitHub', re: /(?<![\w])(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g },
  { name: 'chave Google', re: /(?<![\w])AIza[0-9A-Za-z_-]{35}/g },
  { name: 'chave Resend', re: /(?<![\w])re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/g },
  { name: 'token Meta/Instagram', re: /(?<![\w])(?:EAA|IGAA)[A-Za-z0-9]{80,}/g },
  { name: 'chave privada', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { name: 'token Slack', re: /(?<![\w])xox[abprs]-[A-Za-z0-9-]{10,}/g },
  {
    name: 'senha em URL de banco',
    re: /postgres(?:ql)?:\/\/([^:\s/]+):([^@\s]{6,})@/g,
    // placeholder ou credencial de container local (usuário = senha)
    fakeIf: (m) => /[[<${]|password|senha/i.test(m[2]) || m[1] === m[2],
  },
];

// ---------------------------------------------------------------------------
// Varredura
// ---------------------------------------------------------------------------

/** Esconde o miolo do valor: o relatório não pode republicar o que achou. */
export function mask(value) {
  const v = String(value);
  if (v.length <= 4) return '*'.repeat(v.length);
  const keep = v.length <= 8 ? 1 : 2;
  return v.slice(0, keep) + '*'.repeat(v.length - keep * 2) + v.slice(-keep);
}

/**
 * Varre uma linha. Devolve [{ kind, value }] — `value` cru, quem imprime mascara.
 */
export function scanLine(rawLine, config, deny = null) {
  const found = [];
  // "\n" escrito no código-fonte não é parte do e-mail que vem depois dele
  const line = rawLine.replace(/\\[ntr]/g, ' ');

  for (const m of line.matchAll(EMAIL_RE)) {
    if (!emailAllowed(m[0], config)) found.push({ kind: 'e-mail', value: m[0] });
  }

  const taken = [];
  for (const { re, ddd } of PHONE_PATTERNS) {
    for (const m of line.matchAll(re)) {
      const start = m.index;
      const end = start + m[0].length;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      const digits = phoneCandidate(m[0], ddd);
      if (!digits) continue;
      taken.push([start, end]);
      if (isFakePhoneDigits(digits)) continue;
      if (config.allowedPhones.has(digits) || config.allowedPhones.has('55' + digits)) continue;
      found.push({ kind: 'telefone', value: m[0] });
    }
  }

  for (const m of line.matchAll(/(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)/g)) {
    if (ipv4IsPublic(m[0]) && !config.allowedIps.has(m[0])) found.push({ kind: 'IP público', value: m[0] });
  }
  for (const m of line.matchAll(/(?<![\w:])[23][0-9a-fA-F]{3}:(?:[0-9a-fA-F]{0,4}:){1,6}[0-9a-fA-F]{1,4}(?![\w:])/g)) {
    if (/^2001:0?db8:/i.test(m[0]) || config.allowedIps.has(m[0].toLowerCase())) continue;
    found.push({ kind: 'IP público', value: m[0] });
  }

  for (const m of line.matchAll(STRIPE_RE)) {
    const tail = m[0].slice(m[0].indexOf('_') + 1);
    if (!/\d/.test(tail) || !/[A-Za-z]/.test(tail) || FAKE_MARKER.test(tail)) continue;
    found.push({ kind: 'id do Stripe', value: m[0] });
  }

  for (const { name, re, fakeIf, random } of KEY_PATTERNS) {
    for (const m of line.matchAll(re)) {
      if (fakeIf ? fakeIf(m) : FAKE_MARKER.test(m[0])) continue;
      // chave de verdade é aleatória: tem dígito, maiúscula e minúscula
      if (random && !(/\d/.test(m[0]) && /[A-Z]/.test(m[0]) && /[a-z]/.test(m[0]))) continue;
      found.push({ kind: name, value: m[0] });
    }
  }

  for (const value of denyFindings(line, deny)) found.push({ kind: 'lista privada', value });

  return found;
}

/**
 * Varre linhas de um arquivo. `lines` é [{ n, text }] (número real da linha).
 */
export function scanLines(file, lines, config, deny = null) {
  const findings = [];
  for (const { n, text } of lines) {
    for (const f of scanLine(text, config, deny)) findings.push({ file, line: n, ...f });
  }
  return findings;
}

/** Diff unificado (-U0) → Map(arquivo → [{ n, text }]) só com as linhas acrescentadas. */
export function parseAddedLines(diff) {
  const out = new Map();
  let file = null;
  let n = 0;
  // No cabeçalho (entre "diff --git" e o primeiro "@@") uma linha "+++ " é o nome
  // do arquivo; depois dele, é conteúdo acrescentado que começa com "++".
  let inHeader = false;
  for (const raw of diff.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.startsWith('diff --git ')) {
      file = null;
      inHeader = true;
      continue;
    }
    if (inHeader && line.startsWith('+++ ')) {
      const target = line.slice(4);
      file = target === '/dev/null' ? null : target.replace(/^b\//, '');
      if (file && !out.has(file)) out.set(file, []);
      continue;
    }
    if (line.startsWith('@@')) {
      inHeader = false;
      const m = /\+(\d+)(?:,\d+)?/.exec(line);
      n = m ? Number(m[1]) : 0;
      continue;
    }
    if (!file || inHeader) continue;
    if (line.startsWith('+')) {
      out.get(file).push({ n, text: line.slice(1) });
      n++;
    }
  }
  return out;
}
