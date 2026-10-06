import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Item 14, lote 4 (H5): suspender bane o login; reativar tira o ban.
import {
  LOGIN_BAN_DURATION,
  setLoginBan,
  statusBansLogin,
} from '../../../supabase/functions/_shared/login-ban';

function fakeAuth(failFor: string[] = [], throwFor: string[] = []) {
  const calls: Array<{ id: string; ban: string }> = [];
  return {
    calls,
    updateUserById: async (id: string, attrs: { ban_duration: string }) => {
      calls.push({ id, ban: attrs.ban_duration });
      if (throwFor.includes(id)) throw new Error('rede caiu');
      return { error: failFor.includes(id) ? { message: 'falhou' } : null };
    },
  };
}

describe('setLoginBan', () => {
  it('bane com a duração longa e libera com none', async () => {
    const a = fakeAuth();
    await setLoginBan(a, ['u1'], true);
    await setLoginBan(a, ['u1'], false);
    expect(a.calls).toEqual([
      { id: 'u1', ban: LOGIN_BAN_DURATION },
      { id: 'u1', ban: 'none' },
    ]);
  });

  it('ignora vazio/nulo e não repete o mesmo usuário', async () => {
    const a = fakeAuth();
    const r = await setLoginBan(a, ['u1', null, undefined, '', 'u1', 'u2'], true);
    expect(a.calls.map((c) => c.id)).toEqual(['u1', 'u2']);
    expect(r.done).toEqual(['u1', 'u2']);
  });

  it('não para no primeiro erro e diz quem falhou', async () => {
    const a = fakeAuth(['u2'], ['u3']);
    const r = await setLoginBan(a, ['u1', 'u2', 'u3', 'u4'], true);
    expect(r.done).toEqual(['u1', 'u4']);
    expect(r.failed.map((f) => f.userId)).toEqual(['u2', 'u3']);
  });

  it('só suspender e excluir tiram o login', () => {
    expect(statusBansLogin('suspended')).toBe(true);
    expect(statusBansLogin('deleted')).toBe(true);
    expect(statusBansLogin('active')).toBe(false);
    expect(statusBansLogin('pending')).toBe(false);
  });
});

// A ordem é o que garante que falha no meio nunca deixa alguém "ativo" sem
// conseguir entrar, nem "suspenso" com o banco aberto.
describe('manage-user segue a ordem de _shared/login-ban.ts', () => {
  const src = readFileSync(
    resolve(__dirname, '../../../supabase/functions/manage-user/index.ts'),
    'utf-8',
  ).replace(/\r\n/g, '\n');
  const start = src.indexOf('async function actionChangeStatus(');
  const end = src.indexOf('async function actionResetPassword(');
  const body = src.slice(start, end);

  it('importa o helper', () => {
    expect(src).toContain("import { setLoginBan, statusBansLogin } from '../_shared/login-ban.ts'");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  it('reativar: tira o ban ANTES de gravar o status', () => {
    const unban = body.indexOf('setLoginBan(admin.auth.admin, [target.user_id], false)');
    const statusWrite = body.indexOf(".update({ status: newStatus })");
    expect(unban).toBeGreaterThan(-1);
    expect(statusWrite).toBeGreaterThan(unban);
  });

  it('suspender/excluir: bane DEPOIS de gravar o status, incluindo o cascade', () => {
    const statusWrite = body.indexOf(".update({ status: newStatus })");
    const ban = body.indexOf('setLoginBan(admin.auth.admin, banUserIds, true)');
    expect(ban).toBeGreaterThan(statusWrite);
    expect(body).toMatch(/\.update\(\{ status: 'suspended' \}\)[\s\S]*?\.select\('user_id'\)/);
    expect(body).toContain('banUserIds.push(row.user_id)');
  });

  it('falha no ban ou no unban vira erro (não sucesso silencioso)', () => {
    expect(body).toContain("'UNBAN_FAILED'");
    expect(body).toContain("'BAN_FAILED'");
  });
});
