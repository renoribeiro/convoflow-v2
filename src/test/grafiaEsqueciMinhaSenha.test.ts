/**
 * "Esqueci minha senha" escrito certo em todo o src/.
 *
 * Em 2026-10-19 o dono recebeu a foto de uma tela de login com o link escrito
 * errado (Es + cique). A grafia não estava neste repositório nem no site no ar,
 * mas uma varredura que só procura a palavra certa nunca acharia a errada. Este
 * teste procura as erradas.
 *
 * As palavras erradas são montadas por pedaços para que este arquivo não acuse
 * a si mesmo.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const ESTE_ARQUIVO = resolve(__filename);
const EXTENSOES = /\.(tsx?|jsx?|json|html|css|md)$/;

function arquivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivos(caminho);
    return EXTENSOES.test(nome) ? [caminho] : [];
  });
}

const TODOS = arquivos(SRC).filter((f) => resolve(f) !== ESTE_ARQUIVO);

/** Grafias erradas já vistas ou prováveis (teclado de celular, sotaque). */
const ERRADAS = [
  ['es', 'cique'],
  ['es', 'quesci'],
  ['es', 'quici'],
  ['es', 'qeci'],
  ['es', 'queçi'],
  ['es', 'quce'],
  ['es', 'queic'],
  ['se', 'nah'],
].map(([a, b]) => new RegExp(`\\b${a}${b}`, 'i'));

// Lido UMA vez: com cada padrão relendo o src/ inteiro, a suíte completa em
// paralelo levava um caso desta lista a passar dos 10 s (medido em 2026-10-21).
const LINHAS = TODOS.map((f) => {
  const texto = readFileSync(f, 'utf8');
  return { f, texto, linhas: texto.split(/\r?\n/) };
});

function ocorrencias(re: RegExp): string[] {
  const achados: string[] = [];
  for (const { f, linhas } of LINHAS) {
    linhas.forEach((linha, i) => {
      if (re.test(linha)) achados.push(`${relative(SRC, f)}:${i + 1}: ${linha.trim().slice(0, 120)}`);
    });
  }
  return achados;
}

describe('grafia de "Esqueci minha senha"', () => {
  it.each(ERRADAS.map((re) => [re.source, re]))('nenhum arquivo de src/ tem %s', (_nome, re) => {
    expect(ocorrencias(re as RegExp)).toEqual([]);
  });

  it('toda palavra antes de "minha senha" que começa com "es" é "Esqueci"', () => {
    const errados: string[] = [];
    for (const { f, texto } of LINHAS) {
      for (const m of texto.matchAll(/\b(es\p{L}*)\s+minha\s+senha/giu)) {
        if ((m[1] ?? '').toLowerCase() !== 'esqueci') errados.push(`${relative(SRC, f)}: ${m[0]}`);
      }
    }
    expect(errados).toEqual([]);
  });

  it('"Esqueci minha ..." é sempre seguido de "senha"', () => {
    const errados: string[] = [];
    for (const { f, texto } of LINHAS) {
      for (const m of texto.matchAll(/\besqueci\s+minha\s+(\p{L}+)/giu)) {
        if ((m[1] ?? '').toLowerCase() !== 'senha') errados.push(`${relative(SRC, f)}: ${m[0]}`);
      }
    }
    expect(errados).toEqual([]);
  });

  it('a tela de login tem o link "Esqueci minha senha" para /definir-senha', () => {
    const auth = readFileSync(join(SRC, 'pages', 'Auth.tsx'), 'utf8');
    expect(auth).toMatch(/to="\/definir-senha"[\s\S]{0,200}>\s*Esqueci minha senha\s*</);
  });

  it('/login não tem tela própria: repassa a de /auth (mesmos textos, mesmo caminho)', () => {
    const login = readFileSync(join(SRC, 'pages', 'Login.tsx'), 'utf8');
    expect(login).toMatch(/export \{ Auth as default \} from '\.\/Auth';/);
    expect(login).not.toMatch(/<form|signInWithPassword|placeholder=/);
  });

  it('a varredura de fato lê o src/ (protege contra caminho errado)', () => {
    expect(TODOS.length).toBeGreaterThan(200);
    expect(ocorrencias(/Esqueci minha senha/).length).toBeGreaterThan(3);
  });
});
