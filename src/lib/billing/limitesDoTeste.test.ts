/**
 * Os limites do teste grátis e as defesas do cadastro (sessão 2, 2026-11-09).
 *
 * O que fica travado aqui (sem banco; o banco tem docs/teste_limites_do_teste.sql):
 *   - o resumo que a tela de bloqueio mostra antes do cartão;
 *   - a decisão da edge function para a pessoa logada (superadmin passa, limite
 *     vira 429 com a frase do banco, banco fora vira 503, nunca "passa");
 *   - a cota dos trabalhadores: saldo por CONTA (duas Lojas somam), Conta fora
 *     do teste sem limite, banco fora = "desconhecido" (não envia, não cancela);
 *   - a frase do limite chega inteira na tela (CF429);
 *   - a lista de e-mails temporários e o e-mail de alerta ao superadmin.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  CAMPOS_DOS_LIMITES,
  LIMITES_PADRAO,
  resumoDosLimitesDoTeste,
} from './limitesDoTesteTexto';
import {
  conferirLimiteDoTeste,
  criarCotaDeEnvios,
  LIMITE_DO_TESTE_CODE,
  MSG_LIMITE_INDISPONIVEL,
  type RespostaDoLimite,
} from '../../../supabase/functions/_shared/limites-do-teste.ts';
import {
  DOMINIOS_DESCARTAVEIS,
  emailDescartavel,
} from '../../../supabase/functions/_shared/emails-descartaveis.ts';
import { montarAlerta, type FalhaDeEmail } from '../../../supabase/functions/_shared/alerta-cadastro.ts';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { CODIGO_LIMITE_DO_TESTE, motivoDoErro } from '@/lib/errors/mensagemDoErro';

const CONTA = 'aaaaaaaa-0000-4000-8000-000000000001';
const LOJA_A = 'aaaaaaaa-0000-4000-8000-000000000002';
const LOJA_B = 'aaaaaaaa-0000-4000-8000-000000000003';
const OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000004';

const FRASE =
  'No teste grátis, a Conta envia até 300 mensagens por dia, e hoje já foram 300. O limite existe para evitar abuso durante o teste e deixa de valer depois do primeiro pagamento.';

/** Um banco de mentira para teste_limite. */
function banco(resposta: (tenant: string) => RespostaDoLimite | Error) {
  const chamadas: Array<Record<string, unknown>> = [];
  return {
    chamadas,
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.push({ nome, ...args });
      const r = resposta(args.p_tenant_id as string);
      if (r instanceof Error) return { data: null, error: { message: r.message } };
      return { data: r, error: null };
    },
  };
}

// ---------------------------------------------------------------------------

describe('o resumo da tela de bloqueio', () => {
  it('com os números com que a tabela nasce', () => {
    expect(resumoDosLimitesDoTeste(LIMITES_PADRAO)).toEqual([
      'Até 2 Lojas.',
      'Até 2 números de WhatsApp (1 por QR Code).',
      'Até 300 mensagens enviadas por dia.',
      'Campanhas de até 100 contatos por disparo.',
    ]);
  });

  it('singular, nenhum por QR Code e todos por QR Code', () => {
    expect(resumoDosLimitesDoTeste({ ...LIMITES_PADRAO, teste_lojas: 1, teste_numeros: 1, teste_numeros_qr: 0 }).slice(0, 2)).toEqual([
      'Até 1 Loja.',
      'Até 1 número de WhatsApp (nenhum por QR Code).',
    ]);
    expect(resumoDosLimitesDoTeste({ ...LIMITES_PADRAO, teste_numeros: 3, teste_numeros_qr: 3 })[1]).toBe(
      'Até 3 números de WhatsApp (todos podem ser por QR Code).',
    );
  });

  it('a lista de campos é a do superadmin, sem repetição', () => {
    expect(new Set(CAMPOS_DOS_LIMITES).size).toBe(CAMPOS_DOS_LIMITES.length);
    expect(Object.keys(LIMITES_PADRAO).sort()).toEqual([...CAMPOS_DOS_LIMITES].sort());
    expect(LIMITES_PADRAO.teste_numeros_qr).toBeLessThanOrEqual(LIMITES_PADRAO.teste_numeros);
    expect(LIMITES_PADRAO.cadastro_por_dia).toBeGreaterThanOrEqual(LIMITES_PADRAO.cadastro_por_hora);
  });
});

describe('conferirLimiteDoTeste (a pessoa logada)', () => {
  const noLimite = (): RespostaDoLimite => ({ ok: false, em_teste: true, conta: CONTA, limite: 300, usado: 300, mensagem: FRASE });

  it('dentro do limite → segue', async () => {
    const b = banco(() => ({ ok: true, em_teste: true, conta: CONTA, limite: 300, usado: 299 }));
    expect(await conferirLimiteDoTeste(b, { role: 'gerente' }, LOJA_A, 'mensagens')).toEqual({ ok: true });
    expect(b.chamadas).toEqual([{ nome: 'teste_limite', p_tenant_id: LOJA_A, p_recurso: 'mensagens', p_quantidade: 1 }]);
  });

  it('passou do limite → 429 com a frase do banco e o código', async () => {
    const r = await conferirLimiteDoTeste(banco(noLimite), { role: 'atendente' }, LOJA_A, 'mensagens');
    expect(r).toEqual({ ok: false, status: 429, code: LIMITE_DO_TESTE_CODE, error: FRASE });
  });

  it('a quantidade vai junto (campanha de 150 contatos)', async () => {
    const b = banco(() => ({ ok: false, em_teste: true, limite: 100, usado: 0, mensagem: 'x' }));
    await conferirLimiteDoTeste(b, { role: 'gestor' }, LOJA_A, 'contatos_campanha', 150);
    expect(b.chamadas[0]).toMatchObject({ p_recurso: 'contatos_campanha', p_quantidade: 150 });
  });

  it('banco fora ou resposta estranha → 503 "tente de novo", nunca passa', async () => {
    for (const b of [banco(() => new Error('timeout')), { rpc: async () => ({ data: { qualquer: 1 }, error: null }) }]) {
      expect(await conferirLimiteDoTeste(b, { role: 'gerente' }, LOJA_A, 'lojas')).toEqual({
        ok: false,
        status: 503,
        code: 'limite_indisponivel',
        error: MSG_LIMITE_INDISPONIVEL,
      });
    }
  });

  it('superadmin nunca é limitado, e nem pergunta', async () => {
    const b = banco(noLimite);
    expect(await conferirLimiteDoTeste(b, { role: 'superadmin' }, LOJA_A, 'numeros')).toEqual({ ok: true });
    expect(b.chamadas).toHaveLength(0);
  });

  it('Conta fora do teste (paga ou liberada à mão): o banco diz ok', async () => {
    const b = banco(() => ({ ok: true, em_teste: false, conta: CONTA }));
    expect(await conferirLimiteDoTeste(b, { role: 'gerente' }, LOJA_A, 'numeros_qr')).toEqual({ ok: true });
  });
});

describe('criarCotaDeEnvios (os trabalhadores)', () => {
  it('o saldo é da CONTA: duas Lojas dividem o mesmo limite', async () => {
    const b = banco(() => ({ ok: true, em_teste: true, conta: CONTA, limite: 300, usado: 298 }));
    const cota = criarCotaDeEnvios(b);
    expect(await cota.podeEnviar(LOJA_A)).toBe('sim');
    await cota.registrarEnvio(LOJA_A);
    expect(await cota.podeEnviar(LOJA_B)).toBe('sim');
    await cota.registrarEnvio(LOJA_B);
    expect(await cota.podeEnviar(LOJA_A)).toBe('nao');
    expect(await cota.podeEnviar(LOJA_B)).toBe('nao');
    // Uma pergunta por Loja na rodada, não uma por envio.
    expect(b.chamadas).toHaveLength(2);
  });

  it('no limite desde o começo → não', async () => {
    const cota = criarCotaDeEnvios(banco(() => ({ ok: false, em_teste: true, conta: CONTA, limite: 300, usado: 300 })));
    expect(await cota.podeEnviar(LOJA_A)).toBe('nao');
  });

  it('Conta fora do teste → sempre sim, e registrar não muda nada', async () => {
    const cota = criarCotaDeEnvios(banco(() => ({ ok: true, em_teste: false, conta: OUTRA_CONTA })));
    for (let i = 0; i < 1000; i++) await cota.registrarEnvio(LOJA_A);
    expect(await cota.podeEnviar(LOJA_A)).toBe('sim');
  });

  it('banco fora → desconhecido (não envia nesta rodada, não cancela) e avisa', async () => {
    const aoFalhar = vi.fn();
    const cota = criarCotaDeEnvios(banco(() => new Error('timeout')), aoFalhar);
    expect(await cota.podeEnviar(LOJA_A)).toBe('desconhecido');
    await cota.registrarEnvio(LOJA_A);
    expect(aoFalhar).toHaveBeenCalledWith(LOJA_A, 'timeout');
  });
});

describe('a frase do limite chega inteira na tela', () => {
  it('CF429 do banco → a frase, sem "erro" técnico', () => {
    expect(CODIGO_LIMITE_DO_TESTE).toBe('CF429');
    expect(motivoDoErro({ code: 'CF429', message: FRASE })).toBe(FRASE);
  });

  it('a recusa da edge function (código limite_do_teste) → a frase', () => {
    expect(motivoDoErro({ code: LIMITE_DO_TESTE_CODE, message: FRASE })).toBe(FRASE);
  });
});

describe('e-mails de caixa temporária', () => {
  it('a lista está em ordem, sem repetição, em minúsculas e só com domínios', () => {
    const ordenada = [...DOMINIOS_DESCARTAVEIS].sort();
    expect([...DOMINIOS_DESCARTAVEIS]).toEqual(ordenada);
    expect(new Set(DOMINIOS_DESCARTAVEIS).size).toBe(DOMINIOS_DESCARTAVEIS.length);
    for (const d of DOMINIOS_DESCARTAVEIS) {
      expect(d, d).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/);
    }
    expect(DOMINIOS_DESCARTAVEIS.length).toBeGreaterThan(50);
  });

  it('nenhum provedor comum entra na lista', () => {
    for (const d of ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'uol.com.br', 'bol.com.br', 'terra.com.br', 'live.com', 'proton.me']) {
      expect(DOMINIOS_DESCARTAVEIS, d).not.toContain(d);
      expect(emailDescartavel(`ana@${d}`), d).toBe(false);
    }
  });

  // Só o domínio importa; o endereço é montado aqui (não é de ninguém).
  it.each([
    ['mailinator.com', true],
    ['Mailinator.COM', true],
    ['qualquer.mailinator.com', true],
    ['notmailinator.com', false],
    ['empresa.example', false],
  ])('domínio %s → %s', (dominio, esperado) => {
    expect(emailDescartavel(`ana@${dominio}`)).toBe(esperado);
  });

  it('texto sem arroba ou vazio não é temporário', () => {
    expect(emailDescartavel('sem-arroba')).toBe(false);
    expect(emailDescartavel('')).toBe(false);
  });
});

describe('o e-mail de alerta ao superadmin', () => {
  const falha = (i: number, source: string, reason: string): FalhaDeEmail => ({
    id: `f${i}`,
    source,
    reason,
    created_at: '2026-11-09T12:00:00Z',
  });

  it('uma falha: assunto no singular, origem e motivo em português, e o link', () => {
    const { subject, html } = montarAlerta([falha(1, 'public_signup_invite', 'quota')], 'https://convoflow.com.br/dashboard/admin?tab=signups');
    expect(subject).toBe('ConvoFlow: um email de login não saiu');
    expect(html).toContain('convite do cadastro pelo site: passou do limite de emails por hora (1)');
    expect(html).toContain('href="https://convoflow.com.br/dashboard/admin?tab=signups"');
  });

  it('várias: agrupa, conta, e põe o grupo maior primeiro', () => {
    const { subject, html } = montarAlerta(
      [
        falha(1, 'manage_user_invite', 'other'),
        falha(2, 'public_signup_invite', 'quota'),
        falha(3, 'public_signup_invite', 'quota'),
      ],
      'https://x.example/',
    );
    expect(subject).toBe('ConvoFlow: 3 emails de login não saíram');
    expect(html.indexOf('passou do limite de emails por hora (2)')).toBeLessThan(
      html.indexOf('convite de alguém da equipe: o servidor de email deu erro (1)'),
    );
  });

  it('origem desconhecida sai como veio, escapada, e nada de e-mail de cliente', () => {
    const { html } = montarAlerta([falha(1, '<script>', 'x')], 'https://x.example/');
    expect(html).toContain('&lt;script&gt;: x (1)');
    expect(html).not.toContain('<script>');
    expect(html).not.toMatch(/[\w.+-]+@[\w-]+\.[\w.]+/);
  });
});
