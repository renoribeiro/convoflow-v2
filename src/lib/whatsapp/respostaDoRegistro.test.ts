import { describe, expect, it } from 'vitest';
import { lerRespostaDoRegistro, TEXTO_PADRAO_DO_PIN } from './respostaDoRegistro';

describe('resposta do registro do número (ícone de chave)', () => {
  it('409 com pin_required: abre a caixa do PIN com a frase do servidor', () => {
    expect(
      lerRespostaDoRegistro({ success: false, pin_required: true, pin_desconhecido: true, error: 'Este número já funcionava em outra empresa.' }, true),
    ).toEqual({ tipo: 'pedir_pin', texto: 'Este número já funcionava em outra empresa.', pinDesconhecido: true });
  });

  it('pin_required sem frase: usa o texto de sempre', () => {
    expect(lerRespostaDoRegistro({ pin_required: true }, true)).toEqual({
      tipo: 'pedir_pin',
      texto: TEXTO_PADRAO_DO_PIN,
      pinDesconhecido: false,
    });
  });

  it('erro com frase do servidor: mostra a frase', () => {
    expect(lerRespostaDoRegistro({ success: false, error: 'A Meta recusou o registro do número.' }, true)).toEqual({
      tipo: 'erro',
      texto: 'A Meta recusou o registro do número.',
    });
  });

  it('erro sem corpo: frase genérica em pt-BR', () => {
    const r = lerRespostaDoRegistro(null, true);
    expect(r.tipo).toBe('erro');
    expect(r.tipo === 'erro' && r.texto).toMatch(/Tente de novo/);
  });

  it('sucesso com PIN criado agora: devolve o PIN para "Guarde o PIN"', () => {
    expect(lerRespostaDoRegistro({ success: true, registered: true, pin: '123456' }, false)).toEqual({ tipo: 'ok', pin: '123456', aviso: null });
  });

  it('sucesso sem PIN (número de outra empresa ou PIN digitado): não mostra PIN', () => {
    expect(lerRespostaDoRegistro({ success: true, registered: true }, false)).toEqual({ tipo: 'ok', pin: null, aviso: null });
  });
});
