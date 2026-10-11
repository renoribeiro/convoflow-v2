/**
 * Tela de definir/redefinir senha, que é também o "Esqueci minha senha".
 *
 * Três jeitos de chegar (src/lib/auth/linkDoEmail.ts):
 *   - link NOVO do e-mail (?token_hash=...): só o clique em "Continuar" usa o
 *     acesso, porque robô de e-mail abre link mas não clica em botão;
 *   - link ANTIGO (#access_token=...): o Supabase já usou o acesso no caminho;
 *   - visita comum: e-mail, código de 6 dígitos, senha nova.
 *
 * O alerta vermelho é só para quem chegou por um link que falhou. Até
 * 2026-10-11 ele aparecia em toda visita sem sessão e acusava um link "já
 * aberto" que ninguém tinha aberto.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

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
vi.mock('@/lib/signup/authEmailFailure', () => ({ registrarEnvioBarradoNoNavegador: vi.fn() }));

import { DefinirSenha } from './DefinirSenha';

/** `fim` é o que vem depois de /definir-senha: "?token_hash=..." ou "#...". */
function renderTela(fim = '') {
  window.history.replaceState(null, '', `/definir-senha${fim}`);
  return render(
    <MemoryRouter initialEntries={[`/definir-senha${fim}`]}>
      <Routes>
        <Route path="/definir-senha" element={<DefinirSenha />} />
      </Routes>
    </MemoryRouter>,
  );
}

const alerta = () => screen.queryByText('Não deu para usar este link');

async function irParaCodigo(email = 'alguem@exemplo.com') {
  fireEvent.change(screen.getByLabelText(/seu e-mail/i), { target: { value: email } });
  fireEvent.click(screen.getByRole('button', { name: /já tenho um código/i }));
  await screen.findByLabelText(/código recebido/i);
}

beforeEach(() => {
  vi.clearAllMocks();
  session = null;
  authLoading = false;
  mockUpdateUser.mockResolvedValue({ data: {}, error: null });
  mockResetPasswordForEmail.mockResolvedValue({ data: {}, error: null });
  mockVerifyOtp.mockResolvedValue({ data: {}, error: null });
});

describe('visita comum ("Esqueci minha senha")', () => {
  it('não mostra alerta de link nenhum', () => {
    renderTela();
    expect(screen.getByText('Esqueci minha senha')).toBeInTheDocument();
    expect(alerta()).not.toBeInTheDocument();
    expect(screen.queryByText(/já foi aberto/i)).not.toBeInTheDocument();
  });

  it('começa pelo e-mail, com "Enviar código" como botão principal', () => {
    renderTela();
    expect(screen.getByLabelText(/seu e-mail/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/código recebido/i)).not.toBeInTheDocument();
  });

  it('"Enviar código" manda o e-mail de nova senha para /definir-senha e pede o código', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/seu e-mail/i), { target: { value: 'alguem@exemplo.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));

    await screen.findByLabelText(/código recebido/i);
    const [email, opcoes] = mockResetPasswordForEmail.mock.calls[0] ?? [];
    expect(email).toBe('alguem@exemplo.com');
    expect(opcoes?.redirectTo).toContain('/definir-senha');
    expect(screen.getByText(/Enviamos um código de 6 dígitos para alguem@exemplo.com/)).toBeInTheDocument();
  });

  it('não confirma se o e-mail existe: com erro, a tela segue igual', async () => {
    mockResetPasswordForEmail.mockResolvedValue({ error: { message: 'User not found' } });
    renderTela();
    fireEvent.change(screen.getByLabelText(/seu e-mail/i), { target: { value: 'naoexiste@exemplo.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar código' }));

    await screen.findByText(/Enviamos um código de 6 dígitos para naoexiste@exemplo.com/);
  });

  it('"Já tenho um código" abre o campo sem mandar e-mail', async () => {
    renderTela();
    await irParaCodigo();
    expect(mockResetPasswordForEmail).not.toHaveBeenCalled();
  });

  it('enquanto a sessão carrega, não mostra alerta nem formulário', () => {
    authLoading = true;
    renderTela();
    expect(alerta()).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/seu e-mail/i)).not.toBeInTheDocument();
  });
});

describe('código de 6 dígitos', () => {
  it('o mesmo pedido serve para o código de nova senha e o de convite (tipo "email")', async () => {
    renderTela();
    await irParaCodigo();
    fireEvent.change(screen.getByLabelText(/código recebido/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({
        email: 'alguem@exemplo.com',
        token: '123456',
        type: 'email',
      }),
    );
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
  });

  it('só aceita dígitos no campo', async () => {
    renderTela();
    await irParaCodigo();
    const campo = screen.getByLabelText(/código recebido/i) as HTMLInputElement;
    fireEvent.change(campo, { target: { value: '12a3b4' } });
    expect(campo.value).toBe('1234');
  });

  it('código curto não chega a chamar o servidor', async () => {
    renderTela();
    await irParaCodigo();
    fireEvent.change(screen.getByLabelText(/código recebido/i), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await screen.findByText(/O código tem 6 dígitos/i);
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });

  it('código recusado vira frase que diz o que fazer', async () => {
    mockVerifyOtp.mockResolvedValue({ error: new Error('Token has expired or is invalid') });
    renderTela();
    await irParaCodigo();
    fireEvent.change(screen.getByLabelText(/código recebido/i), { target: { value: '999999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await screen.findByText(/Código inválido ou vencido/i);
  });

  it('código aceito leva ao formulário de senha', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      session = { user: { id: 'u1' } };
      return { data: {}, error: null };
    });
    const { rerender } = renderTela();
    await irParaCodigo();
    fireEvent.change(screen.getByLabelText(/código recebido/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
    await waitFor(() => expect(mockVerifyOtp).toHaveBeenCalled());

    // O AuthContext de verdade avisa a sessão nova; aqui, um novo render.
    rerender(
      <MemoryRouter initialEntries={['/definir-senha']}>
        <Routes>
          <Route path="/definir-senha" element={<DefinirSenha />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByLabelText(/nova senha/i)).toBeInTheDocument();
  });
});

describe('link NOVO do e-mail (token_hash)', () => {
  it('abrir a página NÃO usa o acesso: nada de verifyOtp até o clique', () => {
    renderTela('?token_hash=hash-falso&type=recovery');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.getByText('Crie sua nova senha')).toBeInTheDocument();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(alerta()).not.toBeInTheDocument();
  });

  it('convite tem título de convite', () => {
    renderTela('?token_hash=hash-falso&type=invite');
    expect(screen.getByText('Aceite seu convite')).toBeInTheDocument();
  });

  it('"Continuar" troca o token_hash por uma sessão, uma vez só', async () => {
    mockVerifyOtp.mockImplementation(async () => {
      session = { user: { id: 'u1' } };
      return { data: {}, error: null };
    });
    renderTela('?token_hash=hash-falso&type=invite');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    await waitFor(() =>
      expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: 'hash-falso', type: 'invite' }),
    );
    expect(await screen.findByLabelText(/nova senha/i)).toBeInTheDocument();
    expect(mockVerifyOtp).toHaveBeenCalledTimes(1);
  });

  it('quem já está logado com outra conta também precisa clicar', () => {
    session = { user: { id: 'outra-pessoa' } };
    renderTela('?token_hash=hash-falso&type=recovery');
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/nova senha/i)).not.toBeInTheDocument();
  });

  it('link já usado: alerta em português e caminho para pedir código novo', async () => {
    mockVerifyOtp.mockResolvedValue({
      error: Object.assign(new Error('Email link is invalid or has expired'), { code: 'otp_expired' }),
    });
    renderTela('?token_hash=hash-falso&type=recovery');
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));

    expect(await screen.findByText(/expirou ou já foi usado/i)).toBeInTheDocument();
    expect(alerta()).toBeInTheDocument();
    expect(screen.getByText('Peça um código novo')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeInTheDocument();
  });

  it('type estranho no link não é usado', () => {
    renderTela('?token_hash=hash-falso&type=email_change');
    expect(alerta()).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    expect(mockVerifyOtp).not.toHaveBeenCalled();
  });
});

describe('link ANTIGO do e-mail (sessão no fragmento)', () => {
  it('com a sessão criada, vai direto para a senha, sem alerta', () => {
    session = { user: { id: 'u1' } };
    renderTela('#access_token=x&refresh_token=y&type=recovery');
    expect(screen.getByText('Defina sua senha')).toBeInTheDocument();
    expect(alerta()).not.toBeInTheDocument();
  });

  it('se a sessão não veio, aí sim avisa do link', () => {
    renderTela('#access_token=x&refresh_token=y&type=recovery');
    expect(alerta()).toBeInTheDocument();
    expect(screen.getByText(/não trouxe um acesso válido/i)).toBeInTheDocument();
  });

  it('erro do Supabase (otp_expired) vira frase em português, sem o inglês cru', () => {
    renderTela('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    expect(screen.getByText(/expirou ou já foi usado/i)).toBeInTheDocument();
    expect(screen.queryByText(/Email link is invalid/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar código' })).toBeInTheDocument();
  });
});

describe('com sessão: formulário de senha', () => {
  beforeEach(() => {
    session = { user: { id: 'u1' } };
  });

  it('mostra os dois campos', () => {
    renderTela();
    expect(screen.getByLabelText(/nova senha/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/repita a senha/i)).toBeInTheDocument();
  });

  it('recusa senha curta antes de chamar o servidor', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await screen.findByText(/A senha precisa ter pelo menos 8/i);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('recusa quando as duas senhas diferem', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: 'outracoisa9' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await screen.findByText(/não são iguais/i);
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('salva a senha pelo updateUser', async () => {
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await waitFor(() => expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'senhaboa123' }));
  });

  it('erro do servidor aparece na tela em vez de sumir', async () => {
    mockUpdateUser.mockResolvedValue({ error: new Error('Senha muito fraca') });
    renderTela();
    fireEvent.change(screen.getByLabelText(/nova senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.change(screen.getByLabelText(/repita a senha/i), { target: { value: 'senhaboa123' } });
    fireEvent.click(screen.getByRole('button', { name: /salvar e entrar/i }));

    await screen.findByText(/Senha muito fraca/i);
  });
});
