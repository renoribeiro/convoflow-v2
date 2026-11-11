import { describe, expect, it } from 'vitest';
import {
  mensagemDoErroDeSenha,
  SENHA_ERRO_GENERICO,
  SENHA_FRACA,
  SENHA_IGUAL_A_ATUAL,
  SENHA_VAZADA,
} from './mensagensDeSenha';

describe('mensagemDoErroDeSenha', () => {
  it('senha vazada (proteção ligada em 2026-11-11): frase própria, não "use uma senha mais longa"', () => {
    expect(
      mensagemDoErroDeSenha({
        code: 'weak_password',
        reasons: ['pwned'],
        message: 'Password is known to be weak and easy to guess, please choose a different one.',
      }),
    ).toBe(SENHA_VAZADA);
  });

  it('senha vazada pelo texto, nas versões do auth-js sem reasons', () => {
    expect(mensagemDoErroDeSenha({ message: 'Password is known to be weak and easy to guess, please choose a different one.' })).toBe(SENHA_VAZADA);
  });

  it('senha curta continua "fraca"', () => {
    expect(mensagemDoErroDeSenha({ code: 'weak_password', reasons: ['length'], message: 'Password should be at least 8 characters.' })).toBe(SENHA_FRACA);
  });

  it('igual à atual e erro desconhecido seguem iguais', () => {
    expect(mensagemDoErroDeSenha({ code: 'same_password' })).toBe(SENHA_IGUAL_A_ATUAL);
    expect(mensagemDoErroDeSenha({ message: 'boom' })).toBe(SENHA_ERRO_GENERICO);
  });

  it('a frase nova não tem hífen nem travessão', () => {
    expect(SENHA_VAZADA).not.toMatch(/[-–—]/);
  });
});
