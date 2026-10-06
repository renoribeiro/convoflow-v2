/**
 * Tela de definir/redefinir senha.
 *
 * Ela existe porque o produto não tinha NENHUMA: quem era convidado entrava uma
 * vez pelo link do e-mail e nunca mais conseguia voltar, e quem esquecia a
 * senha dependia de um superadmin abrir o painel do Supabase.
 *
 * O caminho por CÓDIGO existe porque o link não é confiável: em 2026-08-18 os
 * logs do Auth mostraram três vezes o mesmo padrão — um `/verify` bem-sucedido
 * que ninguém pediu (varredura de e-mail ou pré-carregamento do navegador) e,
 * segundos depois, o acesso do usuário chegando num token já gasto.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockUpdateUser, mockResetPasswordForEmail, mockVerifyOtp, mockToast } = vi.hoisted(
  () => ({
    mockUpdateUser: vi.fn(),
    mockResetPasswordForEmail: vi.fn(),
    mockVerifyOtp: vi.fn(),
    mockToast: vi.fn(),
  }),
);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      updateUser: mockUpdateUser,
      resetPasswordForEmail: mockResetPasswordForEmail,
      verifyOtp: mockVerifyOtp,
    },
  },
}));

let session: { user: { id: string } } | null = null;
let authLoading = false;

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ session, isLoading: authLoading }),
}));

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: mockToast }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { DefinirSenha } from './DefinirSenha';

function renderTela(hash = '') {
  window.history.replaceState(null, '', `/definir-senha${hash}`);
  return render(
    <MemoryRouter initialEntries={[`/definir-senha${hash}`]}>
      <DefinirSenha />
    </MemoryRouter>,
  );
}

const preencherCodigo = (email: string, cod: string) => {
  fireEvent.change(screen.getByLabelText(/seu e-mail/i), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/código recebido/i), { target: { value: cod } });
};

beforeEach(() => {
  vi.clearAllMocks();
  session = { user: { id: 'u1' } };
  authLoading = false;
  mockUpdateUser.mockResolvedValue({ data: {}, error: null });
  mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mockVerifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe('link já usado ou vencido', () => {
  it('explica o otp_expired em português, sem jargão', () => {
    session = null;
    renderTela('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');

    expect(screen.getByText(/expirou ou já foi usado/i)).toBeInTheDocument();
    // A frase crua do Supabase não vaza pra tela.
    expect(screen.queryByText(/Email link is invalid/i)).not.toBeInTheDocument();
  });

  it('mesmo com link vencido, oferece o caminho por código', () => {
    session = null;
    renderTela('#error=access_denied&error_code=otp_expired');

    expect(screen.getByLabelText(/código recebido/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continuar/i })).toBeInTheDocument();
  });

  it('sem sessão não mostra campo de senha nenhum', () => {
    session = null;
    renderTela();

    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Confirme seu acesso/i)).toBeInTheDocument();
  });
});

describe('entrada por código (imune ao link ser aberto por robô)', () => {
  beforeEach(() => {
    session = null;
  });

  it('troca o código por uma sessão', async () => {
    renderTela();
    preencherCodigo('alguem@exemplo.com', '123456');
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'alguem@exemplo.com',
        token: '123456',
        type: 'recovery',
      }),
    );
  });

  it('só aceita dígitos no campo', () => {
    renderTela();
    const campo = screen.getByLabelText(/código recebido/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '12a3b4' } });
    expect(campo.value).toBe('1234');
  });

  it('código curto não chega a chamar o servidor', async () => {
    renderTela();
    preencherCodigo('alguem@exemplo.com', '123');
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    // Ancorado em "O código tem": a dica embaixo do campo também fala em
    // "6 dígitos", e um match solto pegaria as duas.
    await waitFor(() =>
      expect(screen.getByText(/O código tem 6 dígitos/i)).toBeInTheDocument(),
    );
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('código recusado vira frase que diz o que fazer', async () => {
    mockVerifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') });
    renderTela();
    preencherCodigo('alguem@exemplo.com', '999999');
    fireEvent.click(screen.getByRole('button', { name: /continuar/i }));

    await waitFor(() =>
      expect(screen.getByText(/Código inválido ou vencido/i)).toBeInTheDocument(),
    );
  });

  it('reenvio manda para /definir-senha, não para a home', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/seu e-mail/i), {
      target: { value: 'alguem@exemplo.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /não recebi/i }));

    await waitFor(() => expect(mockResetPasswordForEmail).toHaveBeenCalled());
    const [email, opcoes] = mockResetPasswordForEmail.mock.calls[0] ?? [];
    expect(email).toBe('alguem@exemplo.com');
    expect(opcoes?.redirectTo).toContain('/definir-senha');
  });

  it('não confirma se o e-mail existe — mesma resposta com ou sem erro', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });
    renderTela();
    fireEvent.change(screen.getByLabelText(/seu e-mail/i), {
      target: { value: 'naoexiste@exemplo.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /não recebi/i }));

    await waitFor(() => expect(screen.getByText(/Enviado/i)).toBeInTheDocument());
  });
});

describe('com sessão vinda do link ou do código', () => {
  it('mostra o formulário de senha', () => {
    renderTela();
    expect(screen.getByLabelText(/nova senha/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repita a senha/i)).toBeInTheDocument();
  });

  it('recusa senha curta antes de chamar o servidor', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    // Ancorado em "precisa ter": a dica embaixo do campo também diz
    // "Pelo menos 8 caracteres", e um match solto pegaria as duas.
    await waitFor(() =>
      expect(screen.getByText(/A senha precisa ter pelo menos 8/i)).toBeInTheDocument(),
    );
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('recusa quando as duas senhas diferem', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: 'outracoisa9' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await waitFor(() => expect(screen.getByText(/não são iguais/i)).toBeInTheDocument());
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('salva a senha pelo updateUser', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await waitFor(() =>
      expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'senhaboa123' }),
    );
  });

  it('erro do servidor aparece na tela em vez de sumir', async () => {
    mockUpdateUser.mockResolvedValue({ error: new Error('Senha muito fraca') });
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await waitFor(() => expect(screen.getByText(/Senha muito fraca/i)).toBeInTheDocument());
  });
});

describe('enquanto o token do link ainda está sendo processado', () => {
  it('não acusa link inválido cedo demais', () => {
    authLoading = true;
    session = null;
    renderTela();

    expect(screen.queryByText(/Confirme seu acesso/i)).not.toBeInTheDocument();
  });
});
