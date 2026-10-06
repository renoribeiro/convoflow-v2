#!/usr/bin/env node
// Checagem de dado pessoal real no que vai para o git.
//
//   node scripts/pii-check/cli.mjs --staged            só o que está no commit (hook)
//   node scripts/pii-check/cli.mjs --range A...B       só o que o PR acrescenta (CI)
//   node scripts/pii-check/cli.mjs --all               todos os arquivos versionados
//   node scripts/pii-check/cli.mjs --files a.md b.ts   arquivos inteiros
//
// Lista privada (nomes, e-mails e ids reais — fora do git):
//   --denylist <arquivo>  >  env PII_DENYLIST_FILE  >  ops-privado/pii-denylist.txt
//
// Saída 0 = limpo, 1 = achou, 2 = erro de uso.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {
  isIgnoredPath,
  loadConfig,
  loadDenylist,
  loadHistoryList,
  mask,
  parseAddedLines,
  scanLines,
} from './scan.mjs';

function git(args, cwd) {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...args], {
    cwd,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
}

function parseArgs(argv) {
  const opts = { mode: null, range: null, files: [], denylist: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--staged') opts.mode = 'staged';
    else if (a === '--all') opts.mode = 'all';
    else if (a === '--range') {
      opts.mode = 'range';
      opts.range = argv[++i];
    } else if (a === '--files') {
      opts.mode = 'files';
      opts.files = argv.slice(i + 1);
      break;
    } else if (a === '--denylist') opts.denylist = argv[++i];
    else if (a === '--quiet') opts.quiet = true;
    else throw new Error(`argumento desconhecido: ${a}`);
  }
  if (!opts.mode || (opts.mode === 'range' && !opts.range)) throw new Error('use --staged, --range A...B, --all ou --files');
  return opts;
}

function isBinary(buf) {
  return buf.subarray(0, 8000).includes(0);
}

function wholeFileLines(root, file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).isDirectory()) return [];
  const buf = fs.readFileSync(full);
  if (isBinary(buf)) return [];
  return buf
    .toString('utf8')
    .split('\n')
    .map((text, i) => ({ n: i + 1, text: text.replace(/\r$/, '') }));
}

function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(`pii-check: ${e.message}`);
    return 2;
  }

  const root = git(['rev-parse', '--show-toplevel'], process.cwd()).trim();
  const config = loadConfig();
  const history = loadHistoryList();
  const denyFile = opts.denylist ?? process.env.PII_DENYLIST_FILE ?? path.join(root, 'ops-privado', 'pii-denylist.txt');
  const deny = loadDenylist(denyFile);

  /** @type {Map<string, {n:number,text:string}[]>} */
  let byFile;
  if (opts.mode === 'staged' || opts.mode === 'range') {
    const diffArgs = ['diff', '--no-color', '--no-ext-diff', '-U0', '--diff-filter=ACMR'];
    diffArgs.push(opts.mode === 'staged' ? '--cached' : opts.range);
    byFile = parseAddedLines(git(diffArgs, root));
  } else {
    const files = opts.mode === 'all' ? git(['ls-files', '-z'], root).split('\0').filter(Boolean) : opts.files;
    byFile = new Map(files.map((f) => [f.replace(/\\/g, '/'), wholeFileLines(root, f)]));
  }

  const findings = [];
  for (const [file, lines] of byFile) {
    if (isIgnoredPath(file, config, history)) continue;
    findings.push(...scanLines(file, lines, config, deny));
  }

  if (!deny && !opts.quiet) {
    console.error(`pii-check: lista privada não encontrada (${path.relative(root, denyFile) || denyFile}) — só os padrões rodaram.`);
  }

  if (findings.length === 0) return 0;

  console.error(`\npii-check: ${findings.length} dado(s) real(is) no que vai para o git:\n`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.kind}  ${mask(f.value)}`);
  console.error(`
Troque por valor inventado: <CONTA_ID>, <SUB_ID>, fulano@example.com, (11) 99999-9999.
Dado real mora em ops-privado/ (fora do git). Regra no topo do CLAUDE.md.
Falso positivo? Acrescente em scripts/pii-check/config.json — isso passa por revisão no PR.
`);
  return 1;
}

process.exitCode = main();
