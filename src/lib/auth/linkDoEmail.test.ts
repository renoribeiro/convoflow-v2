import { describe, it, expect } from 'vitest';
import { lerChegada, mensagemDoErro, mensagemDoErroDoLink, TIPO_DO_CODIGO } from './linkDoEmail';

describe('lerChegada: de onde a pessoa veio', () => {
  it('sem nada no endereço é o "Esqueci minha senha"', () => {
    expect(lerChegada('', '')).toEqual({ tipo: 'visita' });
    // Link "Onde digitar" dos emails: abre direto no campo do código.
    expect(lerChegada('?digitar=codigo', '')).toEqual({ tipo: 'visita', digitarCodigo: true });
  });

  it('link novo de nova senha traz token_hash e type=recovery', () => {
    expect(lerChegada('?token_hash=abc123&type=recovery', '')).toEqual({
      tipo: 'link_novo',
      tokenHash: 'abc123',
      otpType: 'recovery',
    });
  });

  it('link novo de convite traz type=invite', () => {
    expect(lerChegada('?token_hash=abc123&type=invite', '')).toMatchObject({
      tipo: 'link_novo',
      otpType: 'invite',
    });
  });

  it('token_hash com type desconhecido ou faltando vira erro, sem tentar usar', () => {
    expect(lerChegada('?token_hash=abc123', '').tipo).toBe('erro');
    expect(lerChegada('?token_hash=abc123&type=email_change', '').tipo).toBe('erro');
  });

  it('link antigo que funcionou chega com a sessão no fragmento', () => {
    expect(lerChegada('', '#access_token=x&refresh_token=y&type=recovery')).toEqual({ tipo: 'link_antigo' });
  });

  it('erro do Supabase no fragmento vira frase em português', () => {
    const c = lerChegada('', '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(c).toEqual({ tipo: 'erro', mensagem: expect.stringMatching(/expirou ou já foi usado/) });
  });

  it('erro na busca também conta', () => {
    expect(lerChegada('?error=access_denied&error_code=otp_expired', '').tipo).toBe('erro');
  });
});

describe('mensagens', () => {
  it('otp_expired diz o que fazer', () => {
    expect(mensagemDoErro('otp_expired', null)).toMatch(/Peça um código novo/);
  });

  it('erro desconhecido não repete a descrição em inglês do Supabase', () => {
    const m = mensagemDoErro('server_error', 'Database error granting user');
    expect(m).toBe('Não foi possível validar este link. Peça um código novo abaixo.');
    expect(m).not.toMatch(/Database error/);
  });

  it('erro do clique em "Continuar" com link gasto', () => {
    expect(mensagemDoErroDoLink({ code: 'otp_expired', message: 'Email link is invalid or has expired' }))
      .toMatch(/expirou ou já foi usado/);
  });

  it('erro de rede no clique não culpa o link', () => {
    expect(mensagemDoErroDoLink({ message: 'Failed to fetch' })).toMatch(/Tente de novo/);
  });
});

describe('tipo do código de 6 dígitos', () => {
  // 'email' faz o Supabase conferir o código contra o acesso de convite e
  // depois contra o de nova senha (supabase/auth, internal/api/verify.go).
  it('é "email", que cobre o e-mail de convite e o de nova senha', () => {
    expect(TIPO_DO_CODIGO).toBe('email');
  });
});
