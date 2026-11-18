import { describe, expect, it } from 'vitest';
import {
  acharLinks,
  analisarFormatacao,
  temFormatacao,
  textoSemFormatacao,
  type LinhaFormatada,
} from './formatacao';
import { CASOS_DE_TEXTO_LIMPO } from './formatacao.casos';

const linha = (texto: string): LinhaFormatada => {
  const linhas = analisarFormatacao(texto);
  expect(linhas).toHaveLength(1);
  return linhas[0];
};

describe('textoSemFormatacao: os casos comuns com a suíte SQL', () => {
  it.each(CASOS_DE_TEXTO_LIMPO.map((c) => [c.nome, c] as const))('%s', (_nome, caso) => {
    expect(textoSemFormatacao(caso.entrada)).toBe(caso.limpo);
  });

  it('os nomes dos casos não se repetem', () => {
    const nomes = CASOS_DE_TEXTO_LIMPO.map((c) => c.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it('nulo e indefinido viram texto vazio', () => {
    expect(textoSemFormatacao(null)).toBe('');
    expect(textoSemFormatacao(undefined)).toBe('');
  });
});

describe('analisarFormatacao: cada sinal', () => {
  it('negrito', () => {
    expect(linha('*Consulta*').trechos).toEqual([{ tipo: 'negrito', filhos: [{ tipo: 'texto', texto: 'Consulta' }] }]);
  });

  it('itálico', () => {
    expect(linha('_oi_').trechos).toEqual([{ tipo: 'italico', filhos: [{ tipo: 'texto', texto: 'oi' }] }]);
  });

  it('riscado', () => {
    expect(linha('~oi~').trechos).toEqual([{ tipo: 'riscado', filhos: [{ tipo: 'texto', texto: 'oi' }] }]);
  });

  it('monoespaçado', () => {
    expect(linha('```oi```').trechos).toEqual([{ tipo: 'mono', texto: 'oi' }]);
  });

  it('código', () => {
    expect(linha('`oi`').trechos).toEqual([{ tipo: 'codigo', texto: 'oi' }]);
  });

  it('citação', () => {
    expect(linha('> oi')).toEqual({ tipo: 'citacao', trechos: [{ tipo: 'texto', texto: 'oi' }] });
  });

  it('item com asterisco e com hífen', () => {
    expect(linha('* oi')).toEqual({ tipo: 'item', trechos: [{ tipo: 'texto', texto: 'oi' }] });
    expect(linha('- oi')).toEqual({ tipo: 'item', trechos: [{ tipo: 'texto', texto: 'oi' }] });
  });

  it('item numerado guarda o número', () => {
    expect(linha('12. oi')).toEqual({ tipo: 'numerado', numero: '12', trechos: [{ tipo: 'texto', texto: 'oi' }] });
  });
});

describe('analisarFormatacao: misturas e bordas', () => {
  it('negrito com itálico dentro', () => {
    expect(linha('*a _b_ c*').trechos).toEqual([
      {
        tipo: 'negrito',
        filhos: [
          { tipo: 'texto', texto: 'a ' },
          { tipo: 'italico', filhos: [{ tipo: 'texto', texto: 'b' }] },
          { tipo: 'texto', texto: ' c' },
        ],
      },
    ]);
  });

  it('negrito e itálico ao mesmo tempo', () => {
    expect(linha('*_x_*').trechos).toEqual([
      { tipo: 'negrito', filhos: [{ tipo: 'italico', filhos: [{ tipo: 'texto', texto: 'x' }] }] },
    ]);
  });

  it('sinal dentro da palavra fica texto', () => {
    expect(linha('meu_arquivo_final').trechos).toEqual([{ tipo: 'texto', texto: 'meu_arquivo_final' }]);
  });

  it('o ``` de várias linhas vira um pedaço monoespaçado em cada linha', () => {
    expect(analisarFormatacao('```a\nb```')).toEqual([
      { tipo: 'paragrafo', trechos: [{ tipo: 'mono', texto: 'a' }] },
      { tipo: 'paragrafo', trechos: [{ tipo: 'mono', texto: 'b' }] },
    ]);
  });

  it('negrito que passa da linha não conta', () => {
    expect(temFormatacao(analisarFormatacao('*a\nb*'))).toBe(false);
  });

  it('linha dentro do monoespaçado não vira item', () => {
    const linhas = analisarFormatacao('```x\n* y```');
    expect(linhas[1]).toEqual({ tipo: 'paragrafo', trechos: [{ tipo: 'mono', texto: '* y' }] });
  });

  it('linha vazia continua lá', () => {
    expect(analisarFormatacao('a\n\nb')).toHaveLength(3);
  });

  it('texto vazio é uma linha vazia', () => {
    expect(analisarFormatacao('')).toEqual([{ tipo: 'paragrafo', trechos: [] }]);
  });

  it('HTML nunca vira outra coisa além de texto', () => {
    const linhas = analisarFormatacao('*<b>oi</b>*');
    expect(linhas[0].trechos).toEqual([{ tipo: 'negrito', filhos: [{ tipo: 'texto', texto: '<b>oi</b>' }] }]);
  });
});

describe('temFormatacao', () => {
  it.each([
    ['texto comum', 'Bom dia', false],
    ['asterisco solto', 'nota 5*', false],
    ['conta', '2*3*4', false],
    ['negrito', 'um *dois*', true],
    ['citação', '> oi', true],
    ['item', '- oi', true],
  ])('%s', (_n, texto, esperado) => {
    expect(temFormatacao(analisarFormatacao(texto))).toBe(esperado);
  });
});

describe('acharLinks', () => {
  it('pega o link inteiro, como antes', () => {
    const t = 'veja https://exemplo.com.br/a_b_ ok';
    expect(acharLinks(t).map((l) => t.slice(l.inicio, l.fim))).toEqual(['https://exemplo.com.br/a_b_']);
  });

  it('o sinal que fecha a formatação sai do link', () => {
    const t = '*veja https://exemplo.com.br*';
    expect(acharLinks(t).map((l) => t.slice(l.inicio, l.fim))).toEqual(['https://exemplo.com.br']);
  });

  it('vários links', () => {
    const t = 'https://a.example e http://b.example/x';
    expect(acharLinks(t)).toHaveLength(2);
  });
});
