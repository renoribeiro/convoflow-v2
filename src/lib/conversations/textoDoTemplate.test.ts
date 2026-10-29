import { describe, expect, it } from 'vitest';
import { avisoDeParametros, parametrosEmBranco, textoDoTemplate } from './textoDoTemplate';

describe('parâmetros do template', () => {
  it('aponta cada {{n}} em branco, sem deslocar os outros', () => {
    expect(parametrosEmBranco(['Ana', '  ', 'sexta'])).toEqual([2]);
    expect(parametrosEmBranco(['', ''])).toEqual([1, 2]);
    expect(parametrosEmBranco(['Ana'])).toEqual([]);
    expect(parametrosEmBranco([])).toEqual([]);
  });

  it('aviso só quando falta algum', () => {
    expect(avisoDeParametros(['Ana', ''])).toBe('Preencha {{2}}: todo parâmetro do template é obrigatório.');
    expect(avisoDeParametros(['', 'x', ''])).toBe('Preencha {{1}}, {{3}}: todo parâmetro do template é obrigatório.');
    expect(avisoDeParametros(['Ana'])).toBeNull();
  });
});

describe('textoDoTemplate', () => {
  it('troca cada {{n}} pelo seu valor, na posição certa', () => {
    expect(textoDoTemplate('Olá {{1}}, sua visita é {{2}} às {{3}}.', ['Ana', ' sexta ', '10h'], 'visita')).toBe(
      'Olá Ana, sua visita é sexta às 10h.',
    );
  });

  it('o mesmo {{n}} repetido sai igual nas duas vezes', () => {
    expect(textoDoTemplate('{{1}}, tudo bem? Aqui é sobre o pedido de {{1}}.', ['Ana'], 'x')).toBe(
      'Ana, tudo bem? Aqui é sobre o pedido de Ana.',
    );
  });

  it('template sem variáveis: o corpo como está', () => {
    expect(textoDoTemplate('Seu pedido saiu para entrega.', [], 'pedido_saiu')).toBe('Seu pedido saiu para entrega.');
  });

  it('sem o corpo (nome digitado à mão): nome e valores, nunca vazio', () => {
    expect(textoDoTemplate(undefined, ['Ana', 'sexta'], 'retorno_orcamento')).toBe('Template "retorno_orcamento": Ana, sexta');
    expect(textoDoTemplate('', [], 'aviso')).toBe('Template "aviso"');
  });
});
