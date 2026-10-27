import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { COLUNAS_FECHADAS_INSTANCIA, colunasPadrao } from './colunasFechadas';
import { SAFE_INSTANCE_SELECT } from '@/lib/whatsapp/safeInstanceColumns';

/**
 * Desde a migração 20261026000002, o navegador lê e grava whatsapp_instances
 * coluna por coluna, sem a chave, o endereço e o QR antigos. Um `*` nessa
 * tabela volta 42501 e a tela quebra. Este teste varre o src/ e falha quando
 * alguma consulta volta a pedir a linha inteira.
 */

const raiz = join(__dirname, '..', '..');

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return /\.(ts|tsx)$/.test(nome) && !/\.(test|spec)\./.test(nome) ? [caminho] : [];
  });
}

const codigo = arquivos(raiz)
  .filter((f) => !f.includes(join('integrations', 'supabase')))
  .map((f) => ({
    rel: relative(raiz, f),
    texto: readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'),
  }));

/** Do `.from('whatsapp_instances')` até o fim do comando. */
function comandos(texto: string): string[] {
  const out: string[] = [];
  const re = /\.from\(\s*['"]whatsapp_instances['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const fim = texto.indexOf(';', m.index);
    out.push(texto.slice(m.index, fim < 0 ? undefined : fim));
  }
  return out;
}

describe('whatsapp_instances: nada pede a linha inteira pelo navegador', () => {
  it('as colunas seguras não incluem nenhuma coluna fechada', () => {
    for (const col of COLUNAS_FECHADAS_INSTANCIA) {
      expect(SAFE_INSTANCE_SELECT.split(/,\s*/)).not.toContain(col);
    }
    expect(colunasPadrao('whatsapp_instances')).toBe(SAFE_INSTANCE_SELECT);
    expect(colunasPadrao('contacts')).toBe('*');
  });

  it('nenhum .from("whatsapp_instances") usa *, .select() vazio nem coluna fechada', () => {
    const achados: string[] = [];
    for (const { rel, texto } of codigo) {
      for (const cmd of comandos(texto)) {
        if (/\.select\(\s*\)/.test(cmd)) achados.push(`${rel}: .select() vazio devolve a linha inteira`);
        if (/\.select\(\s*['"`]\s*\*/.test(cmd)) achados.push(`${rel}: select('*')`);
        for (const col of COLUNAS_FECHADAS_INSTANCIA) {
          if (new RegExp(`\b${col}\b`).test(cmd)) achados.push(`${rel}: usa ${col}`);
        }
      }
    }
    expect(achados).toEqual([]);
  });

  it('nenhum ajudante genérico recebe whatsapp_instances sem dizer as colunas', () => {
    const achados: string[] = [];
    for (const { rel, texto } of codigo) {
      const re = /table:\s*['"]whatsapp_instances['"]/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(texto))) {
        const bloco = texto.slice(m.index, texto.indexOf('}', m.index) + 1);
        if (!/\bselect:/.test(bloco)) achados.push(`${rel}: table whatsapp_instances sem select`);
      }
    }
    expect(achados).toEqual([]);
  });

  it('nenhuma junção puxa whatsapp_instances(*)', () => {
    const achados = codigo
      .filter(({ texto }) => /whatsapp_instances[!\w]*\(\s*\*/.test(texto))
      .map(({ rel }) => rel);
    expect(achados).toEqual([]);
  });
});
