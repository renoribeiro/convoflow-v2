/**
 * instagram-connect (fatia 4b) — a lógica pura da edge function.
 *
 * O módulo vive em supabase/functions porque roda no Deno, mas não importa
 * nada do Deno (mesma convenção de instagram-token-renewal/logic.ts).
 *
 * O que estes testes existem para impedir:
 *   - o navegador ser devolvido para um endereço fora do ConvoFlow;
 *   - um id do Instagram maior que 2^53 ser arredondado e gravar a conta
 *     errada;
 *   - a ordem do retorno do login mudar: state conferido e queimado ANTES da
 *     Meta; conta recusada NUNCA inscrita no webhook; nada gravado se a
 *     inscrição falhar; e o token nunca no resultado que volta ao navegador.
 */
import { describe, it, expect, vi } from 'vitest';

import {
  BOUNCE_INVALID_MESSAGE,
  bounceErrorPage,
  buildAuthorizeUrl,
  buildReturnUrl,
  CALLBACK_PARAMS,
  cleanAuthorizationCode,
  defaultRedirectUri,
  idFromRawJson,
  INSTAGRAM_SCOPES,
  isStateShaped,
  meUrl,
  parseCodeExchange,
  parseExpiresIn,
  parseLongLived,
  parseMe,
  parseRequestBody,
  parseSubscribe,
  readBounceQuery,
  resolveReturnTo,
  runCallback,
  subscribeUrl,
  type CallbackDeps,
} from '../../../supabase/functions/instagram-connect/logic.ts';
import { INSTAGRAM_CALLBACK_PARAMS } from './connectFlow';

const STATE = 'a'.repeat(64);
const USER = '11111111-2222-4333-8444-555555555555';
const LOJA = 'bbbbbbbb-0000-4000-8000-000000000002';
const INST = 'cccccccc-0000-4000-8000-000000000003';
const BIG_ID = '17841419262135883'; // > 2^53

describe('para onde o navegador volta', () => {
  it('aceita só as origens do ConvoFlow e localhost', () => {
    expect(resolveReturnTo('https://www.convoflow.com.br')).toBe('https://www.convoflow.com.br/dashboard/whatsapp-numbers');
    expect(resolveReturnTo('https://convoflow.com.br/')).toBe('https://convoflow.com.br/dashboard/whatsapp-numbers');
    expect(resolveReturnTo('https://convoflow.vercel.app')).toBe('https://convoflow.vercel.app/dashboard/whatsapp-numbers');
    expect(resolveReturnTo('http://localhost:8081')).toBe('http://localhost:8081/dashboard/whatsapp-numbers');
    expect(resolveReturnTo('http://127.0.0.1:5173')).toBe('http://127.0.0.1:5173/dashboard/whatsapp-numbers');
  });

  it('recusa qualquer outra origem (nada de redirecionamento aberto)', () => {
    for (const o of [
      null,
      undefined,
      '',
      'https://evil.example',
      'https://www.convoflow.com.br.evil.example',
      'https://convoflow-git-branch.vercel.app',
      'http://www.convoflow.com.br',
      'https://localhost:8081',
      'http://localhost.evil.example',
    ]) {
      expect(resolveReturnTo(o as string | null)).toBeNull();
    }
  });

  it('o endereço cadastrado na Meta é a própria edge function', () => {
    expect(defaultRedirectUri('https://pqjkuwyshybxldzpfbbs.supabase.co/')).toBe(
      'https://pqjkuwyshybxldzpfbbs.supabase.co/functions/v1/instagram-connect',
    );
  });
});

describe('URL de autorização', () => {
  it('leva app, retorno exato, code, os dois escopos, o state e força o login', () => {
    const u = new URL(buildAuthorizeUrl({ appId: '123', redirectUri: 'https://x.supabase.co/functions/v1/instagram-connect', state: STATE }));
    expect(u.origin + u.pathname).toBe('https://www.instagram.com/oauth/authorize');
    expect(u.searchParams.get('client_id')).toBe('123');
    expect(u.searchParams.get('redirect_uri')).toBe('https://x.supabase.co/functions/v1/instagram-connect');
    expect(u.searchParams.get('response_type')).toBe('code');
    expect(u.searchParams.get('scope')).toBe('instagram_business_basic,instagram_business_manage_messages');
    expect(u.searchParams.get('state')).toBe(STATE);
    expect(u.searchParams.get('force_reauth')).toBe('true');
  });

  it('não pede escopo além de ler e responder mensagens', () => {
    expect([...INSTAGRAM_SCOPES]).toEqual(['instagram_business_basic', 'instagram_business_manage_messages']);
  });
});

describe('pedidos do navegador', () => {
  it('start: Loja ou cartão, uuids', () => {
    expect(parseRequestBody({ action: 'start', tenantId: LOJA })).toEqual({
      ok: true, value: { action: 'start', tenantId: LOJA, instanceId: null },
    });
    expect(parseRequestBody({ action: 'start', instanceId: INST })).toEqual({
      ok: true, value: { action: 'start', tenantId: null, instanceId: INST },
    });
    expect(parseRequestBody({ action: 'start' }).ok).toBe(false);
    expect(parseRequestBody({ action: 'start', tenantId: 'x' }).ok).toBe(false);
    expect(parseRequestBody({ action: 'start', instanceId: "1' or 1=1" }).ok).toBe(false);
  });

  it('complete: state com 64 hex; código sem o "#_"', () => {
    expect(parseRequestBody({ action: 'complete', code: 'AQBabc#_', state: STATE })).toEqual({
      ok: true, value: { action: 'complete', code: 'AQBabc', state: STATE },
    });
    expect(parseRequestBody({ action: 'complete', code: 'AQB', state: 'nao-hex' }).ok).toBe(false);
    expect(parseRequestBody({ action: 'complete', code: '', state: STATE }).ok).toBe(false);
    expect(parseRequestBody({ action: 'complete', code: 'x'.repeat(3000), state: STATE }).ok).toBe(false);
    expect(parseRequestBody({ action: 'outra' }).ok).toBe(false);
    expect(parseRequestBody(null).ok).toBe(false);
  });

  it('cleanAuthorizationCode tira o fragmento', () => {
    expect(cleanAuthorizationCode(' abc#_ ')).toBe('abc');
    expect(cleanAuthorizationCode('abc#')).toBe('abc');
    expect(cleanAuthorizationCode('abc')).toBe('abc');
  });
});

describe('a volta do Instagram (GET)', () => {
  it('sucesso: devolve à tela com ig_state e ig_code', () => {
    const q = readBounceQuery(new URL(`https://f.example/fn?code=AQB123&state=${STATE}`));
    const back = new URL(buildReturnUrl('https://www.convoflow.com.br/dashboard/whatsapp-numbers', q));
    expect(back.origin + back.pathname).toBe('https://www.convoflow.com.br/dashboard/whatsapp-numbers');
    expect(back.searchParams.get('ig_state')).toBe(STATE);
    expect(back.searchParams.get('ig_code')).toBe('AQB123');
    expect(back.searchParams.get('ig_error')).toBeNull();
  });

  it('recusa no Instagram: devolve o erro, sem código', () => {
    const q = readBounceQuery(new URL(`https://f.example/fn?error=access_denied&error_reason=user_denied&error_description=The+user+denied+your+request&state=${STATE}`));
    const back = new URL(buildReturnUrl('http://localhost:8081/dashboard/whatsapp-numbers', q));
    expect(back.searchParams.get('ig_error')).toBe('access_denied');
    expect(back.searchParams.get('ig_error_description')).toBe('The user denied your request');
    expect(back.searchParams.get('ig_code')).toBeNull();
  });

  it('os nomes dos parâmetros são os mesmos que a tela lê', () => {
    expect(CALLBACK_PARAMS).toEqual(INSTAGRAM_CALLBACK_PARAMS);
  });

  it('state sem forma de state nem chega ao banco', () => {
    expect(isStateShaped(STATE)).toBe(true);
    expect(isStateShaped(null)).toBe(false);
    expect(isStateShaped('A'.repeat(64))).toBe(false);
    expect(isStateShaped('a'.repeat(63))).toBe(false);
  });

  it('a página de erro escapa HTML', () => {
    const html = bounceErrorPage('<script>alert(1)</script>');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(bounceErrorPage(BOUNCE_INVALID_MESSAGE)).toContain('10 minutos');
  });
});

describe('respostas da Meta', () => {
  it('ids grandes vêm do TEXTO, sem arredondar (número ou string)', () => {
    expect(JSON.parse(`{"user_id":${BIG_ID}}`).user_id.toString()).not.toBe(BIG_ID); // a armadilha existe
    expect(idFromRawJson(`{"user_id":${BIG_ID},"username":"convoflow"}`, 'user_id')).toBe(BIG_ID);
    expect(idFromRawJson(`{"user_id":"${BIG_ID}"}`, 'user_id')).toBe(BIG_ID);
    expect(idFromRawJson(`{"data":[{"user_id": "${BIG_ID}"}]}`, 'user_id')).toBe(BIG_ID);
    expect(idFromRawJson('{"id":"1"}', 'user_id')).toBeNull();
  });

  it('/me: user_id vira igAccountId (nunca o id app-scoped)', () => {
    const r = parseMe(200, `{"id":"99999999999","user_id":${BIG_ID},"username":"convoflow"}`);
    expect(r).toEqual({ ok: true, igAccountId: BIG_ID, username: 'convoflow' });
    expect(parseMe(200, `{"data":[{"user_id":"${BIG_ID}","username":"convoflow"}]}`)).toEqual({
      ok: true, igAccountId: BIG_ID, username: 'convoflow',
    });
    expect(parseMe(200, '{"id":"123456"}').ok).toBe(false);
    expect(parseMe(400, '{"error":{"code":190}}')).toMatchObject({ ok: false, step: 'me', metaCode: 190 });
    // @ inválido não é inventado
    expect(parseMe(200, `{"user_id":"${BIG_ID}","username":"<b>x</b>"}`)).toEqual({ ok: true, igAccountId: BIG_ID, username: null });
  });

  it('troca do código: forma solta e forma data[0]', () => {
    expect(parseCodeExchange(200, '{"access_token":"IGQ-curto","user_id":1,"permissions":"a,b"}')).toEqual({ ok: true, accessToken: 'IGQ-curto' });
    expect(parseCodeExchange(200, '{"data":[{"access_token":"IGQ-curto"}]}')).toEqual({ ok: true, accessToken: 'IGQ-curto' });
    expect(parseCodeExchange(400, '{"error_type":"OAuthException","code":400,"error_message":"code used"}')).toMatchObject({ ok: false, step: 'code' });
    expect(parseCodeExchange(200, 'não é json')).toMatchObject({ ok: false, step: 'code' });
  });

  it('token longo: expires_in em segundos, ou null (o banco usa 60 dias)', () => {
    expect(parseLongLived(200, '{"access_token":"IGQ-longo","token_type":"bearer","expires_in":5183944}')).toEqual({
      ok: true, accessToken: 'IGQ-longo', expiresIn: 5183944,
    });
    expect(parseLongLived(200, '{"access_token":"IGQ-longo"}')).toEqual({ ok: true, accessToken: 'IGQ-longo', expiresIn: null });
    expect(parseLongLived(500, '{"error":{"code":2}}')).toMatchObject({ ok: false, step: 'long_lived', metaCode: 2 });
    expect(parseExpiresIn('5184000')).toBe(5184000);
    expect(parseExpiresIn(-1)).toBeNull();
    expect(parseExpiresIn(401 * 86_400)).toBeNull();
    expect(parseExpiresIn(1.5)).toBeNull();
  });

  it('subscribed_apps: só {success:true} conta', () => {
    expect(parseSubscribe(200, '{"success":true}')).toEqual({ ok: true });
    expect(parseSubscribe(200, '{"success":false}')).toMatchObject({ ok: false, step: 'subscribe' });
    expect(parseSubscribe(403, '{"error":{"code":10}}')).toMatchObject({ ok: false, metaCode: 10 });
  });

  it('endpoints: /me com user_id e a inscrição no campo messages', () => {
    expect(meUrl()).toBe('https://graph.instagram.com/v25.0/me?fields=user_id,username');
    expect(subscribeUrl()).toBe('https://graph.instagram.com/v25.0/me/subscribed_apps?subscribed_fields=messages');
  });
});

// -----------------------------------------------------------------------------
// A ordem do retorno do login
// -----------------------------------------------------------------------------

function deps(over: Partial<CallbackDeps> = {}) {
  const calls: string[] = [];
  const d: CallbackDeps = {
    claim: vi.fn(async () => {
      calls.push('claim');
      return { ok: true as const, state_id: 'st-1', tenant_id: LOJA, instance_id: null, redirect_uri: 'https://r', mode: 'connect' as const };
    }),
    exchangeCode: vi.fn(async (_c: string, redirect: string) => {
      calls.push(`code:${redirect}`);
      return { ok: true as const, accessToken: 'SHORT' };
    }),
    exchangeLongLived: vi.fn(async (t: string) => {
      calls.push(`long:${t}`);
      return { ok: true as const, accessToken: 'LONG', expiresIn: 5184000 };
    }),
    fetchMe: vi.fn(async (t: string) => {
      calls.push(`me:${t}`);
      return { ok: true as const, igAccountId: BIG_ID, username: 'convoflow' };
    }),
    check: vi.fn(async (_s: string, _u: string, ig: string) => {
      calls.push(`check:${ig}`);
      return { ok: true as const, mode: 'connect' as const, tenant_id: LOJA, instance_id: null };
    }),
    subscribe: vi.fn(async (t: string) => {
      calls.push(`subscribe:${t}`);
      return { ok: true as const };
    }),
    commit: vi.fn(async (a) => {
      calls.push(`commit:${a.igAccountId}:${a.longToken}:${a.expiresIn}`);
      return {
        ok: true as const,
        mode: 'connect' as const,
        instance: { id: INST, tenant_id: LOJA, name: 'Instagram @convoflow', profile_name: '@convoflow', is_active: true, valid_until: '2026-11-24T10:00:00+00:00' },
        expiry_from_meta: true,
      };
    }),
    ...over,
  };
  return { d, calls };
}

const input = { userId: USER, code: 'AQB', state: STATE };

describe('runCallback — a ordem é a segurança', () => {
  it('caminho feliz: claim → Meta (código, longo, /me) → check → subscribed_apps → commit', async () => {
    const { d, calls } = deps();
    const r = await runCallback(d, input);
    expect(calls).toEqual([
      'claim',
      'code:https://r',
      'long:SHORT',
      'me:LONG',
      `check:${BIG_ID}`,
      'subscribe:LONG',
      `commit:${BIG_ID}:LONG:5184000`,
    ]);
    expect(r).toMatchObject({ ok: true, mode: 'connect', instance: { id: INST, valid_until: '2026-11-24T10:00:00+00:00' } });
    // O token nunca volta ao navegador.
    expect(JSON.stringify(r)).not.toContain('LONG');
    expect(JSON.stringify(r)).not.toContain('SHORT');
    expect(d.claim).toHaveBeenCalledWith(STATE, USER);
  });

  it('state inventado / de outro usuário / vencido: para no claim, sem falar com a Meta', async () => {
    for (const reason of ['invalid_state', 'used_state', 'expired_state']) {
      const { d, calls } = deps({
        claim: vi.fn(async () => ({ ok: false as const, reason, message: 'Este pedido de conexão não é válido.' })),
      });
      const r = await runCallback(d, input);
      expect(r).toMatchObject({ ok: false, reason, step: 'claim' });
      expect(calls).toEqual([]);
      expect(d.exchangeCode).not.toHaveBeenCalled();
      expect(d.commit).not.toHaveBeenCalled();
    }
  });

  it('conta de outra Loja: recusada no check, NUNCA inscrita nem gravada', async () => {
    const { d } = deps({
      check: vi.fn(async () => ({
        ok: false as const,
        reason: 'foreign_account',
        message: 'Esta conta do Instagram já está conectada em outra Conta ou Loja.',
      })),
    });
    const r = await runCallback(d, input);
    expect(r).toMatchObject({ ok: false, reason: 'foreign_account', step: 'check' });
    expect(d.subscribe).not.toHaveBeenCalled();
    expect(d.commit).not.toHaveBeenCalled();
  });

  it('outra conta no cartão: recusada no check, nada inscrito', async () => {
    const { d } = deps({
      claim: vi.fn(async () => ({ ok: true as const, state_id: 'st-2', tenant_id: LOJA, instance_id: INST, redirect_uri: 'https://r', mode: 'reconnect' as const })),
      check: vi.fn(async () => ({ ok: false as const, reason: 'wrong_account', message: 'Você entrou no Instagram com outra conta.' })),
    });
    const r = await runCallback(d, input);
    expect(r).toMatchObject({ ok: false, reason: 'wrong_account' });
    expect(d.subscribe).not.toHaveBeenCalled();
    expect(d.commit).not.toHaveBeenCalled();
  });

  it('Meta recusa o código: para ali, sem check nem gravação', async () => {
    const { d } = deps({
      exchangeCode: vi.fn(async () => ({ ok: false as const, step: 'code' as const, metaCode: null, message: 'O Instagram não aceitou o pedido.' })),
    });
    const r = await runCallback(d, input);
    expect(r).toMatchObject({ ok: false, reason: 'meta_code', step: 'meta' });
    expect(d.exchangeLongLived).not.toHaveBeenCalled();
    expect(d.check).not.toHaveBeenCalled();
    expect(d.commit).not.toHaveBeenCalled();
  });

  it('/me sem conta: nada decidido nem gravado', async () => {
    const { d } = deps({
      fetchMe: vi.fn(async () => ({ ok: false as const, step: 'me' as const, metaCode: 190, message: 'x' })),
    });
    const r = await runCallback(d, input);
    expect(r).toMatchObject({ ok: false, reason: 'meta_me', metaCode: 190 });
    expect(d.check).not.toHaveBeenCalled();
    expect(d.commit).not.toHaveBeenCalled();
  });

  it('inscrição falha: nada é gravado (melhor "tente de novo" que cartão verde que não recebe)', async () => {
    const { d } = deps({
      subscribe: vi.fn(async () => ({ ok: false as const, step: 'subscribe' as const, metaCode: 10, message: 'x' })),
    });
    const r = await runCallback(d, input);
    expect(r).toMatchObject({ ok: false, reason: 'meta_subscribe', metaCode: 10 });
    expect(d.commit).not.toHaveBeenCalled();
  });

  it('o banco recusa no commit (o acesso à Loja mudou no meio): devolve a mensagem dele', async () => {
    const { d } = deps({
      commit: vi.fn(async () => ({ ok: false as const, reason: 'forbidden_tenant', message: 'Você não pode conectar o Instagram nesta Loja.' })),
    });
    const r = await runCallback(d, input);
    expect(r).toMatchObject({ ok: false, reason: 'forbidden_tenant', step: 'commit' });
  });

  it('sem expires_in, o commit recebe null (o banco decide 60 dias)', async () => {
    const { d, calls } = deps({
      exchangeLongLived: vi.fn(async () => ({ ok: true as const, accessToken: 'LONG', expiresIn: null })),
    });
    await runCallback(d, input);
    expect(calls.at(-1)).toBe(`commit:${BIG_ID}:LONG:null`);
  });

  it('erro de infraestrutura no banco sobe (a edge function devolve 500)', async () => {
    const { d } = deps({ claim: vi.fn(async () => { throw new Error('claim: 500'); }) });
    await expect(runCallback(d, input)).rejects.toThrow('claim');
    expect(d.exchangeCode).not.toHaveBeenCalled();
  });
});
