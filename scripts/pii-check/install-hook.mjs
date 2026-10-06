// Liga o hook de pre-commit do repositório: core.hooksPath = .githooks.
// Roda sozinho no `npm install` (script "prepare") de quem clona o repo.
// Nunca derruba a instalação: fora de um clone git (Vercel, tarball) só sai.
import { execFileSync } from 'node:child_process';

const git = (args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  if (git(['rev-parse', '--is-inside-work-tree']) !== 'true') process.exit(0);
} catch {
  process.exit(0);
}

let current = '';
try {
  current = git(['config', '--get', 'core.hooksPath']);
} catch {
  // não configurado
}

if (current && current !== '.githooks') {
  console.warn(`pii-check: core.hooksPath já aponta para "${current}" — não mexi. Chame lá: node scripts/pii-check/cli.mjs --staged`);
  process.exit(0);
}

try {
  if (!current) git(['config', 'core.hooksPath', '.githooks']);
  console.log('pii-check: hook de pre-commit ligado (.githooks/pre-commit).');
} catch {
  console.warn('pii-check: não consegui ligar o hook — rode: git config core.hooksPath .githooks');
}
