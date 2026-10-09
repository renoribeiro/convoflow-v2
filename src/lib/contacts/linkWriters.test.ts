/**
 * "O sistema nunca vincula sozinho" — a metade do código.
 *
 * A metade do banco está em docs/teste_vinculo_contatos.sql (L15): só
 * contact_link_create e contact_link_remove escrevem a tabela, nenhum trigger
 * ou cron os chama, e só `authenticated` os executa (com recusa explícita sem
 * pessoa logada). Este teste cobre o resto: no app e nas Edge Functions,
 *   - ninguém toca `contact_links` pela API de tabela, exceto a LEITURA do
 *     instagram-webhook (o vínculo para cancelar follow-ups);
 *   - só o hook da tela chama as RPCs de vincular e desvincular — nenhuma Edge
 *     Function, webhook ou worker.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const toPosix = (p: string) => path.relative(ROOT, p).split(path.sep).join('/');

function collect(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (!/^(node_modules|dist)$/.test(item.name)) collect(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(item.name)) continue;
    if (/\.(test|spec)\.tsx?$/.test(item.name)) continue;
    out.push(full);
  }
  return out;
}

const files = [...collect(path.join(ROOT, 'src')), ...collect(path.join(ROOT, 'supabase', 'functions'))].map((f) => ({
  file: toPosix(f),
  text: fs.readFileSync(f, 'utf8'),
}));

const using = (re: RegExp) => files.filter((f) => re.test(f.text)).map((f) => f.file).sort();

describe('quem mexe no vínculo', () => {
  it('a tabela só é lida, e só pelo helper do instagram-webhook', () => {
    expect(using(/from\(\s*['"]contact_links['"]\s*\)/)).toEqual(['supabase/functions/_shared/contact-link-reply.ts']);
    const helper = files.find((f) => f.file === 'supabase/functions/_shared/contact-link-reply.ts');
    expect(helper?.text).not.toMatch(/\.(insert|update|upsert|delete)\(/);
  });

  it('vincular e desvincular só pelo hook da tela (gente logada), nunca por Edge Function', () => {
    expect(using(/['"]contact_link_create['"]/)).toEqual(['src/hooks/useContactLinks.ts']);
    expect(using(/['"]contact_link_remove['"]/)).toEqual(['src/hooks/useContactLinks.ts']);
  });
});
