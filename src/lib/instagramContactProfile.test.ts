import { describe, it, expect } from 'vitest';
// Parte pura do instagram-contact-profile (fatia 4a), compartilhada com o Deno.
import {
  buildProfileUrl,
  classifyProfileResponse,
  MAX_CONTACTS_PER_CALL,
  recordStatusFor,
  validateProfileRequest,
} from '../../supabase/functions/instagram-contact-profile/logic';
import {
  contactDisplayName,
  instagramHandle,
  isProfileFetchDue,
  PROFILE_PENDING_STALE_MS,
  PROFILE_RETRY_AFTER_MS,
  profileConnectionUsable,
} from '@/lib/instagram/contactProfile';

const NOW = new Date('2026-09-25T15:00:00Z');
const H = 3_600_000;
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe('resposta do Instagram → o que gravar', () => {
  it('nome e @: ok (o @ sem arroba)', () => {
    expect(classifyProfileResponse(200, { name: ' Paulo Andrade ', username: '@paulo.a', id: '1' }))
      .toEqual({ kind: 'ok', name: 'Paulo Andrade', username: 'paulo.a' });
  });

  it('só o @ (nome vazio é comum): ok com nome nulo', () => {
    expect(classifyProfileResponse(200, { name: '', username: 'paulo.a' }))
      .toEqual({ kind: 'ok', name: null, username: 'paulo.a' });
  });

  it('200 sem nome nem @: não há o que mostrar — não tenta mais', () => {
    expect(classifyProfileResponse(200, {})).toEqual({ kind: 'unavailable', metaCode: null });
  });

  it('bloqueou / sem consentimento / não existe: não tenta mais', () => {
    expect(classifyProfileResponse(400, { error: { code: 230, message: 'User consent is required to access user profile' } }))
      .toEqual({ kind: 'unavailable', metaCode: 230 });
    expect(classifyProfileResponse(400, { error: { code: 100, error_subcode: 33 } }))
      .toMatchObject({ kind: 'unavailable', metaCode: 100 });
    expect(classifyProfileResponse(403, { error: { code: 10 } })).toMatchObject({ kind: 'unavailable' });
  });

  it('acesso da conta recusado (190, 102, 401 OAuth): é a conexão, não o cliente', () => {
    expect(classifyProfileResponse(400, { error: { code: 190, type: 'OAuthException' } }))
      .toEqual({ kind: 'token_invalid', metaCode: 190 });
    expect(classifyProfileResponse(400, { error: { code: 102 } })).toMatchObject({ kind: 'token_invalid' });
    expect(classifyProfileResponse(401, { error: { type: 'OAuthException' } })).toMatchObject({ kind: 'token_invalid' });
  });

  it('limite, instabilidade, 5xx: tenta de novo mais tarde', () => {
    for (const code of [4, 17, 32, 613, 80002, 80006, 1, 2]) {
      expect(classifyProfileResponse(400, { error: { code } })).toMatchObject({ kind: 'retry', metaCode: code });
    }
    expect(classifyProfileResponse(429, null)).toMatchObject({ kind: 'retry' });
    expect(classifyProfileResponse(503, 'html')).toMatchObject({ kind: 'retry' });
    expect(classifyProfileResponse(400, { error: { code: 9999, is_transient: true } })).toMatchObject({ kind: 'retry' });
  });

  it('o que vai para o banco', () => {
    expect(recordStatusFor({ kind: 'ok', name: null, username: 'a' })).toBe('ok');
    expect(recordStatusFor({ kind: 'unavailable', metaCode: 230 })).toBe('unavailable');
    expect(recordStatusFor({ kind: 'retry', metaCode: null })).toBe('retry');
    // Acesso recusado: o contato não tem culpa — tira a marca.
    expect(recordStatusFor({ kind: 'token_invalid', metaCode: 190 })).toBe('release');
  });

  it('URL: perfil pelo IGSID, só nome e @ (a foto vence em dias e não é buscada)', () => {
    const u = new URL(buildProfileUrl('978239761327698'));
    expect(`${u.origin}${u.pathname}`).toBe('https://graph.instagram.com/v25.0/978239761327698');
    expect(u.searchParams.get('fields')).toBe('name,username');
  });

  it('pedido: 1 a 20 uuids, sem repetir', () => {
    const id = 'cccccccc-0000-4000-8000-000000000003';
    expect(validateProfileRequest({ contactIds: [id, id] })).toEqual({ ok: true, contactIds: [id] });
    expect(validateProfileRequest({ contactIds: [] }).ok).toBe(false);
    expect(validateProfileRequest({ contactIds: ['x'] }).ok).toBe(false);
    expect(validateProfileRequest({}).ok).toBe(false);
    const muitos = Array.from({ length: MAX_CONTACTS_PER_CALL + 1 }, (_, i) =>
      `cccccccc-0000-4000-8000-${String(i).padStart(12, '0')}`,
    );
    expect(validateProfileRequest({ contactIds: muitos }).ok).toBe(false);
  });
});

describe('está na hora de buscar? (espelho do instagram_contact_profile_claim)', () => {
  const ig = (profile_status: string | null, profile_checked_at: string | null = null) => ({
    id: 'c1',
    channel: 'instagram',
    profile_status,
    profile_checked_at,
  });

  it('os prazos são os do SQL: 6 h para retry, 10 min para pending esquecido', () => {
    expect(PROFILE_RETRY_AFTER_MS).toBe(6 * H);
    expect(PROFILE_PENDING_STALE_MS).toBe(10 * 60_000);
  });

  it('nunca tentado: sim', () => {
    expect(isProfileFetchDue(ig(null), NOW)).toBe(true);
  });

  it('ok e unavailable: nunca mais', () => {
    expect(isProfileFetchDue(ig('ok', ago(30 * 24 * H)), NOW)).toBe(false);
    expect(isProfileFetchDue(ig('unavailable', ago(30 * 24 * H)), NOW)).toBe(false);
  });

  it('retry: só depois de 6 h', () => {
    expect(isProfileFetchDue(ig('retry', ago(5 * H)), NOW)).toBe(false);
    expect(isProfileFetchDue(ig('retry', ago(7 * H)), NOW)).toBe(true);
  });

  it('pending: só se esquecido há mais de 10 min', () => {
    expect(isProfileFetchDue(ig('pending', ago(60_000)), NOW)).toBe(false);
    expect(isProfileFetchDue(ig('pending', ago(11 * 60_000)), NOW)).toBe(true);
  });

  it('WhatsApp nunca; coluna ausente na consulta, nunca', () => {
    expect(isProfileFetchDue({ id: 'w', channel: 'whatsapp', profile_status: null }, NOW)).toBe(false);
    expect(isProfileFetchDue({ id: 'c', channel: 'instagram' }, NOW)).toBe(false);
  });

  it('conexão: só com a conta ativa e o acesso atendendo', () => {
    const inst = (cfg: Record<string, unknown>, is_active = true) => [
      { row: { id: 'ig-1', provider: 'instagram', is_active, connection_config: cfg } },
    ];
    const contato = { id: 'c1', whatsapp_instance_id: 'ig-1' };
    const valida = { tokenIssuedAt: 'A', tokenExpiresAt: new Date(NOW.getTime() + 40 * 24 * H).toISOString() };
    expect(profileConnectionUsable(contato, inst(valida), NOW)).toBe(true);
    expect(profileConnectionUsable(contato, inst(valida, false), NOW)).toBe(false);
    expect(profileConnectionUsable(contato, inst({ ...valida, tokenExpiresAt: ago(1) }), NOW)).toBe(false);
    expect(
      profileConnectionUsable(
        contato,
        inst({ ...valida, renewal: { status: 'needs_reconnect', forTokenIssuedAt: 'A' } }),
        NOW,
      ),
    ).toBe(false);
    expect(profileConnectionUsable({ id: 'c1', whatsapp_instance_id: 'outra' }, inst(valida), NOW)).toBe(false);
  });
});

describe('nome para mostrar', () => {
  it('nome > @ > "Cliente do Instagram"', () => {
    expect(contactDisplayName({ name: 'Paulo', username: 'paulo.a' }, 'instagram')).toBe('Paulo');
    expect(contactDisplayName({ name: null, username: 'paulo.a' }, 'instagram')).toBe('@paulo.a');
    expect(contactDisplayName({ name: '  ', username: null }, 'instagram')).toBe('Cliente do Instagram');
    expect(contactDisplayName(null, 'instagram')).toBe('Cliente do Instagram');
  });

  it('WhatsApp continua "Contato sem nome" (o @ não existe lá)', () => {
    expect(contactDisplayName({ name: null, username: 'x' }, 'whatsapp')).toBe('Contato sem nome');
    expect(contactDisplayName({ name: 'Ana', username: null }, 'whatsapp')).toBe('Ana');
  });

  it('@ sempre com uma arroba só', () => {
    expect(instagramHandle('paulo')).toBe('@paulo');
    expect(instagramHandle('@@paulo')).toBe('@paulo');
    expect(instagramHandle('')).toBeNull();
    expect(instagramHandle(null)).toBeNull();
  });
});
