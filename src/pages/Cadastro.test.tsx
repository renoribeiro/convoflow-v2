/**
 * /cadastro — o formulário do cadastro pelo site, com a chave forçada ligada.
 *
 * Trava:
 *   - validação de cortesia antes de enviar;
 *   - o que vai para o servidor: só os campos do formulário, as versões dos
 *     Termos/Política e o token — nada de cargo ou Conta;
 *   - a tela de sucesso é UMA só, com o mesmo texto para qualquer desfecho
 *     (o servidor responde igual, e a tela não inventa diferença);
 *   - erro do próprio pedido aparece na tela e o token é renovado;
 *   - sem a site key do Turnstile, o formulário nem aparece.
 */
import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { mockInvoke, mockReset, siteKey } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockReset: vi.fn(),
  siteKey: { valor: 'site-key-de-teste' as string | undefined },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mockInvoke } } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ session: null }) }));
// O widget de verdade baixa script do Cloudflare; aqui ele entrega um token na hora.
vi.mock('@/components/signup/TurnstileWidget', async () => {
  const R = await import('react');
  const TurnstileWidget = R.forwardRef(
    (props: { onToken(t: string | null): void }, ref: React.Ref<{ reset(): void }>) => {
      R.useImperativeHandle(ref, () => ({
        reset: () => {
          mockReset();
          props.onToken('token-novo');
        },
      }));
      R.useEffect(() => props.onToken('token-1'), []);
      return R.createElement('div', { 'data-testid': 'turnstile' });
    },
  );
  return { TurnstileWidget };
});

import Cadastro, { CADASTRO_ENVIADO_TITULO } from './Cadastro';
import { env } from '@/lib/env';
import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/legal/versions';

const renderizar = () =>
  render(
    <MemoryRouter>
      <Cadastro habilitado />
    </MemoryRouter>,
  );

const preencher = () => {
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana' } });
  fireEvent.change(screen.getByLabelText('Sobrenome'), { target: { value: 'Souza' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: ' Ana@Empresa.example ' } });
  fireEvent.change(screen.getByLabelText('Nome da empresa'), { target: { value: 'Imobiliária Horizonte' } });
  fireEvent.change(screen.getByLabelText('Telefone com DDD'), { target: { value: '(11) 99999-0000' } });
  fireEvent.click(screen.getByRole('checkbox'));
};

const enviar = async () => {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Criar minha conta/ }));
  });
};

const getOriginal = env.get.bind(env);

beforeEach(() => {
  vi.clearAllMocks();
  siteKey.valor = 'site-key-de-teste';
  vi.spyOn(env, 'get').mockImplementation(((k: Parameters<typeof env.get>[0]) =>
    k === 'TURNSTILE_SITE_KEY' ? siteKey.valor : getOriginal(k)) as typeof env.get);
});

describe('/cadastro', () => {
  it('mostra o formulário com a promessa do teste e o link para entrar', () => {
    renderizar();
    expect(screen.getByText('Comece seu teste grátis')).toBeInTheDocument();
    expect(screen.getByText(/7 dias grátis/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Entrar' })).toHaveAttribute('href', '/auth');
    expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/terms-of-service');
    expect(screen.getByRole('link', { name: 'Política de Privacidade' })).toHaveAttribute('href', '/privacy-policy');
  });

  it('valida antes de enviar e não chama o servidor', async () => {
    renderizar();
    await enviar();
    expect(screen.getByText('Informe seu nome.')).toBeInTheDocument();
    expect(screen.getByText(/aceite os Termos de Uso/)).toBeInTheDocument();
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it('manda só os campos do formulário, as versões aceitas e o token', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    renderizar();
    preencher();
    await enviar();

    expect(mockInvoke).toHaveBeenCalledTimes(1);
    const [funcao, { body }] = mockInvoke.mock.calls[0]!;
    expect(funcao).toBe('public-signup');
    expect(body).toEqual({
      firstName: 'Ana',
      lastName: 'Souza',
      email: 'ana@empresa.example',
      companyName: 'Imobiliária Horizonte',
      phone: '11999990000',
      acceptedTerms: true,
      termsVersion: TERMS_VERSION,
      privacyVersion: PRIVACY_VERSION,
      turnstileToken: 'token-1',
    });
    expect(body).not.toHaveProperty('role');
    expect(body).not.toHaveProperty('tenant_id');
  });

  it('sucesso → "Confira seu e-mail", com o mesmo texto de sempre', async () => {
    mockInvoke.mockResolvedValueOnce({ data: { ok: true }, error: null });
    const { container } = renderizar();
    preencher();
    await enviar();

    expect(await screen.findByText(CADASTRO_ENVIADO_TITULO)).toBeInTheDocument();
    const texto = screen.getByTestId('cadastro-enviado').textContent;
    expect(texto).toContain('Se este e-mail puder ser usado');
    expect(texto).toContain('Se você já tem conta no ConvoFlow');
    // Nenhuma pista de desfecho: nada de "já existe", "falhou", "limite".
    expect(container.textContent).not.toMatch(/já existe|já cadastrado|falhou|limite/i);
  });

  it('erro do próprio pedido aparece na tela e o token é renovado', async () => {
    const resposta = new Response(JSON.stringify({ error: 'Muitas tentativas a partir desta conexão.' }), {
      status: 429,
    });
    mockInvoke.mockResolvedValueOnce({ data: null, error: Object.assign(new Error('non-2xx status code'), { context: resposta }) });
    renderizar();
    preencher();
    await enviar();

    expect(await screen.findByText(/Muitas tentativas/)).toBeInTheDocument();
    expect(screen.queryByText(CADASTRO_ENVIADO_TITULO)).not.toBeInTheDocument();
    expect(mockReset).toHaveBeenCalled();
    // O botão volta com o token novo.
    await waitFor(() => expect(screen.getByRole('button', { name: /Criar minha conta/ })).toBeEnabled());
  });

  it('sem a site key do Turnstile, não há formulário', () => {
    siteKey.valor = undefined;
    renderizar();
    expect(screen.getByText(/indisponível no momento/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Criar minha conta/ })).not.toBeInTheDocument();
  });
});
