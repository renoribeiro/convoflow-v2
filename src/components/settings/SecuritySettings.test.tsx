/**
 * Configurações › Segurança troca a senha DE VERDADE.
 *
 * Até 2026-10-19 a tela esperava 1,5 s e dizia "Senha alterada com sucesso!"
 * sem chamar o servidor. Estes testes falham se isso voltar: o sucesso só
 * aparece depois de conferir a senha atual, chamar o updateUser e encerrar as
 * outras sessões.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { mockSignIn, mockUpdateUser, mockSignOut, mockLogWarn } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockUpdateUser: vi.fn(),
  mockSignOut: vi.fn(),
  mockLogWarn: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      signInWithPassword: mockSignIn,
      updateUser: mockUpdateUser,
      signOut: mockSignOut,
    },
  },
}));

let usuario: { id: string; email?: string } | null = { id: 'u1', email: 'pessoa@exemplo.com.br' };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: usuario }) }));
vi.mock('@/lib/logger', () => ({
  logger: { warn: mockLogWarn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { SecuritySettings, SENHA_TROCADA, SENHA_TROCADA_SEM_SAIR_DOS_OUTROS } from './SecuritySettings';

function preencher(atual: string, nova: string, repetida = nova) {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: atual } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: nova } });
  fireEvent.change(screen.getByLabelText('Repita a nova senha'), { target: { value: repetida } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar nova senha' }));
}

/** Nenhum pedaço do texto em inglês do Supabase pode aparecer na tela. */
function semTextoCru(...frases: string[]) {
  for (const f of frases) expect(document.body.textContent).not.toContain(f);
}

beforeEach(() => {
  vi.clearAllMocks();
  usuario = { id: 'u1', email: 'pessoa@exemplo.com.br' };
  mockSignIn.mockResolvedValue({ data: {}, error: null });
  mockUpdateUser.mockResolvedValue({ data: {}, error: null });
  mockSignOut.mockResolvedValue({ error: null });
});

describe('Configurações › Segurança', () => {
  it('rótulos em caixa de frase, como no resto do produto', () => {
    render(<SecuritySettings />);
    expect(screen.getByLabelText('Senha atual')).toBeInTheDocument();
    expect(screen.getByLabelText('Nova senha')).toBeInTheDocument();
    expect(screen.getByLabelText('Repita a nova senha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar nova senha' })).toBeInTheDocument();
  });

  it('senha atual errada é recusada e nada é trocado', async () => {
    mockSignIn.mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials', status: 400 }),
    });
    render(<SecuritySettings />);
    preencher('senhaerrada1', 'novasenha123');

    expect(await screen.findByText('A senha atual não confere.')).toBeInTheDocument();
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'pessoa@exemplo.com.br', password: 'senhaerrada1' });
    expect(mockUpdateUser).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
    semTextoCru('Invalid login credentials');
    expect(screen.queryByText(SENHA_TROCADA)).not.toBeInTheDocument();
  });

  it('sucesso: confere a atual, troca de verdade e encerra as OUTRAS sessões', async () => {
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');

    expect(await screen.findByText(SENHA_TROCADA)).toBeInTheDocument();
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'pessoa@exemplo.com.br', password: 'senhaatual12' });
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: 'novasenha123' });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: 'others' });
    // Nunca 'global' ou sem escopo: isso tiraria a pessoa desta tela também.
    expect(mockSignOut).toHaveBeenCalledTimes(1);

    // A ordem importa: conferir, trocar, sair dos outros.
    const ordem = [mockSignIn, mockUpdateUser, mockSignOut].map((m) => m.mock.invocationCallOrder[0] ?? 0);
    expect(ordem).toEqual([...ordem].sort((a, b) => a - b));

    // A mensagem diz que os outros aparelhos saíram.
    expect(SENHA_TROCADA).toMatch(/outros aparelhos/);
    expect((screen.getByLabelText('Senha atual') as HTMLInputElement).value).toBe('');
  });

  it('recusa senha curta, com a mesma regra de /definir-senha (8)', async () => {
    render(<SecuritySettings />);
    preencher('senhaatual12', '1234567');
    expect(await screen.findByText('A nova senha precisa ter pelo menos 8 caracteres.')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('recusa quando as duas novas senhas diferem', async () => {
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123', 'outracoisa99');
    expect(await screen.findByText('As duas novas senhas não são iguais.')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('recusa nova senha igual à atual antes de chamar o servidor', async () => {
    render(<SecuritySettings />);
    preencher('mesmasenha12', 'mesmasenha12');
    expect(await screen.findByText('A nova senha precisa ser diferente da atual.')).toBeInTheDocument();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('senha fraca recusada pelo servidor vira frase em português', async () => {
    mockUpdateUser.mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Password is known to be weak and easy to guess, please choose a different one.'), {
        code: 'weak_password',
        status: 422,
      }),
    });
    render(<SecuritySettings />);
    preencher('senhaatual12', 'senha12345');

    expect(await screen.findByText(/Essa senha é fraca/)).toBeInTheDocument();
    expect(mockSignOut).not.toHaveBeenCalled();
    semTextoCru('Password is known to be weak');
    expect(mockLogWarn).toHaveBeenCalledWith(
      '[SecuritySettings] updateUser falhou',
      expect.objectContaining({ code: 'weak_password' }),
    );
  });

  it('"troca de senha segura" do Supabase pedindo login recente vira instrução clara', async () => {
    mockUpdateUser.mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Password update requires reauthentication'), {
        code: 'reauthentication_needed',
        status: 400,
      }),
    });
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');

    expect(await screen.findByText(/saia do sistema, entre de novo/)).toBeInTheDocument();
    semTextoCru('requires reauthentication');
  });

  it('erro qualquer do servidor nunca aparece cru', async () => {
    mockUpdateUser.mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Database error updating user'), { code: 'unexpected_failure', status: 500 }),
    });
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');

    expect(await screen.findByText(/Não foi possível salvar a senha agora/)).toBeInTheDocument();
    semTextoCru('Database error');
  });

  it('erro na conferência que não é senha errada também não aparece cru', async () => {
    mockSignIn.mockResolvedValue({
      data: {},
      error: Object.assign(new Error('Request rate limit reached'), { code: 'over_request_rate_limit', status: 429 }),
    });
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');

    expect(await screen.findByText(/Muitas tentativas seguidas/)).toBeInTheDocument();
    semTextoCru('rate limit');
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('exceção de rede vira frase fixa', async () => {
    mockSignIn.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');

    expect(await screen.findByText(/Não foi possível salvar a senha agora/)).toBeInTheDocument();
    semTextoCru('Failed to fetch');
  });

  it('senha trocada mas sem conseguir sair dos outros: diz exatamente isso', async () => {
    mockSignOut.mockResolvedValue({ error: Object.assign(new Error('boom'), { code: 'unexpected_failure' }) });
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');

    expect(await screen.findByText(SENHA_TROCADA_SEM_SAIR_DOS_OUTROS)).toBeInTheDocument();
    expect(mockUpdateUser).toHaveBeenCalled();
    semTextoCru('boom');
  });

  it('sem e-mail na sessão não tenta nada', async () => {
    usuario = { id: 'u1' };
    render(<SecuritySettings />);
    preencher('senhaatual12', 'novasenha123');
    await waitFor(() => expect(screen.getByText(/Não foi possível salvar a senha agora/)).toBeInTheDocument());
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
