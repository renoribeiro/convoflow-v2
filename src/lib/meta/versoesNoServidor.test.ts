/**
 * Toda chamada à Graph API usa a versão única (src/lib/meta/versoes.ts).
 *
 * Varre as edge functions e o src/ atrás de versão escrita à mão ('v20.0',
 * graph.facebook.com/v25.0/...). Comentário não conta. Até 2026-11 havia
 * sete cópias de 'v20.0' (vencida em 24/09/2026) e o Instagram em 'v25.0'.
 *
 * Lê só supabase/functions e src/, que vão os dois para a cópia pública: roda
 * lá também.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(HERE, '../../..');
const FUNCOES = path.join(RAIZ, 'supabase', 'functions');
const SRC = path.join(RAIZ, 'src');

/** Versão escrita à mão: entre aspas ou crases, ou colada no host da Graph API. */
const VERSAO_A_MAO = /(['"`]v\d{1,2}\.\d{1,2}['"`])|(graph\.(facebook|instagram)\.com\/v\d)/;

function arquivos(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, nome.name);
    if (nome.isDirectory()) {
      if (nome.name === 'node_modules') continue;
      saida.push(...arquivos(p));
    } else if (/\.(ts|tsx)$/.test(nome.name)) {
      saida.push(p);
    }
  }
  return saida;
}

/** Tira comentários de linha e de bloco (o suficiente para código nosso). */
function semComentarios(codigo: string): string {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => (/^\s*\/\//.test(l) ? '' : l.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
}

function achados(dir: string, ignorar: (rel: string) => boolean): string[] {
  const lista: string[] = [];
  for (const arq of arquivos(dir)) {
    const rel = path.relative(RAIZ, arq).replace(/\\/g, '/');
    if (ignorar(rel)) continue;
    semComentarios(fs.readFileSync(arq, 'utf8'))
      .split('\n')
      .forEach((linha, i) => {
        if (VERSAO_A_MAO.test(linha)) lista.push(`${rel}:${i + 1}: ${linha.trim()}`);
      });
  }
  return lista;
}

describe('versão da Graph API escrita num lugar só', () => {
  it('nenhuma edge function escreve a versão à mão', () => {
    expect(achados(FUNCOES, () => false)).toEqual([]);
  });

  it('nenhum arquivo do site escreve a versão à mão (fora o da constante e os testes)', () => {
    const ignorar = (rel: string) =>
      rel === 'src/lib/meta/versoes.ts' ||
      /\.test\.tsx?$/.test(rel) ||
      rel === 'src/integrations/supabase/types.ts';
    expect(achados(SRC, ignorar)).toEqual([]);
  });

  it('o servidor importa a constante do mesmo arquivo do botão', () => {
    const ponte = fs.readFileSync(path.join(FUNCOES, '_shared', 'meta-versoes.ts'), 'utf8');
    expect(ponte).toContain("from '../../../src/lib/meta/versoes.ts'");
  });

  it('o servidor não escolhe versão pela linha do número nem pelo corpo do pedido', () => {
    const usos = arquivos(FUNCOES)
      .map((a) => [path.relative(RAIZ, a).replace(/\\/g, '/'), semComentarios(fs.readFileSync(a, 'utf8'))] as const)
      .filter(([, c]) => /cfg\.graphApiVersion|graph_api_version\s*\|\||\.graphApiVersion\s*\|\|/.test(c))
      .map(([rel]) => rel);
    expect(usos).toEqual([]);
  });

  it('as funções que falam com a Graph API importam a versão única', () => {
    const semConstante = arquivos(FUNCOES)
      .map((a) => [path.relative(RAIZ, a).replace(/\\/g, '/'), semComentarios(fs.readFileSync(a, 'utf8'))] as const)
      .filter(([, c]) => /graph\.(facebook|instagram)\.com\/\$\{/.test(c) || /\$\{META_GRAPH_ROOT\}|\$\{INSTAGRAM_GRAPH/.test(c))
      .filter(([, c]) => !/from '\.\.?\/(\.\.\/)?_shared\/meta-versoes\.ts'|from '\.\.\/meta-versoes\.ts'/.test(c))
      .map(([rel]) => rel);
    expect(semConstante).toEqual([]);
  });
});
