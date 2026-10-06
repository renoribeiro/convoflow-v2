/**
 * Nó "Transferir para Atendente" — quem recebe a conversa.
 *
 * Testa o lado servidor (supabase/functions/_shared/chatbot-engine.ts), como
 * capabilities.test.ts e automation-actions.test.ts já fazem com o _shared:
 *
 *   1. resolveTransferTarget — pura: traduz o user_id guardado no nó para o
 *      profiles.id e decide se a pessoa pode receber.
 *   2. assignConversationToTransferTarget — a escrita, contra um cliente falso
 *      que grava a cadeia de chamadas. É o que prova que o UPDATE leva o guarda
 *      `assigned_profile_id IS NULL` no WHERE, que dono existente não é tocado,
 *      que inelegível nem procura a conversa, e que falha nunca lança.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  TRANSFER_ELIGIBLE_ROLES,
  assignConversationToTransferTarget,
  resolveTransferTarget,
  type EngineInput,
  type LoggerLike,
  type SupabaseClientLike,
  type TransferCandidateProfile,
} from '../../../supabase/functions/_shared/chatbot-engine';

const LOJA = '11111111-1111-4111-8111-111111111111';
const OUTRA_LOJA = '22222222-2222-4222-8222-222222222222';
const USER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROFILE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONV = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CONTACT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

const perfil = (over: Partial<TransferCandidateProfile> = {}): TransferCandidateProfile => ({
  id: PROFILE,
  user_id: USER,
  tenant_id: LOJA,
  status: 'active',
  role: 'atendente',
  ...over,
});

// ---------------------------------------------------------------------------
// 1. resolveTransferTarget
// ---------------------------------------------------------------------------
describe('resolveTransferTarget', () => {
  it('atendente ativo da Loja: elegível, devolve o profiles.id (não o user_id)', () => {
    const r = resolveTransferTarget([perfil()], LOJA);
    expect(r).toEqual({ ok: true, profileId: PROFILE });
  });

  it('gestor ativo da Loja também recebe (o fluxo pode nomear o gestor)', () => {
    expect(resolveTransferTarget([perfil({ role: 'gestor' })], LOJA)).toEqual({
      ok: true,
      profileId: PROFILE,
    });
  });

  it('id que não resolve a perfil nenhum: not_found', () => {
    expect(resolveTransferTarget([], LOJA)).toEqual({ ok: false, reason: 'not_found' });
    expect(resolveTransferTarget(null, LOJA)).toEqual({ ok: false, reason: 'not_found' });
    expect(resolveTransferTarget(undefined, LOJA)).toEqual({ ok: false, reason: 'not_found' });
  });

  it('perfil existe mas em outra Loja: other_tenant', () => {
    expect(resolveTransferTarget([perfil({ tenant_id: OUTRA_LOJA })], LOJA)).toEqual({
      ok: false,
      reason: 'other_tenant',
    });
  });

  it.each(['suspended', 'deleted', 'pending', null])('status %s: inactive', (status) => {
    expect(resolveTransferTarget([perfil({ status })], LOJA)).toEqual({
      ok: false,
      reason: 'inactive',
    });
  });

  it.each(['gerente', 'superadmin', null])('cargo %s: role (não atende conversa numa Loja)', (role) => {
    expect(resolveTransferTarget([perfil({ role })], LOJA)).toEqual({ ok: false, reason: 'role' });
  });

  it('com mais de um perfil para o mesmo user_id, vale o da Loja do bot', () => {
    const rows = [
      perfil({ id: 'outro', tenant_id: OUTRA_LOJA, status: 'active' }),
      perfil({ id: PROFILE, tenant_id: LOJA, status: 'active' }),
    ];
    expect(resolveTransferTarget(rows, LOJA)).toEqual({ ok: true, profileId: PROFILE });
  });

  it('0 % no rodízio NÃO entra na conta: a função nem recebe porcentagem', () => {
    // Documenta a decisão: 0 % é "sem conversa nova por sorteio", não "o fluxo
    // não pode nomeá-la". A elegibilidade aqui é status + Loja + cargo, só.
    expect(TRANSFER_ELIGIBLE_ROLES).toEqual(['atendente', 'gestor']);
    expect(resolveTransferTarget([perfil()], LOJA).ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 2. assignConversationToTransferTarget — cliente falso que grava a cadeia
// ---------------------------------------------------------------------------

interface Call {
  table: string;
  chain: Array<{ method: string; args: unknown[] }>;
}

interface FakeResponses {
  profiles?: { data: unknown; error?: unknown } | Error;
  conversationsSelect?: { data: unknown; error?: unknown } | Error;
  conversationsUpdate?: { data: unknown; error?: unknown } | Error;
}

/**
 * Um QueryBuilder mínimo: todo método encadeável devolve o próprio objeto,
 * `maybeSingle()`/`single()`/`then` resolvem com a resposta configurada para
 * (tabela, operação). A operação é o primeiro método da cadeia que a define
 * (select = leitura, update = escrita).
 */
function fakeClient(responses: FakeResponses): { client: SupabaseClientLike; calls: Call[] } {
  const calls: Call[] = [];

  const resolve = (call: Call) => {
    const op = call.chain.find((c) => c.method === 'update' || c.method === 'insert')?.method ?? 'select';
    let r: { data: unknown; error?: unknown } | Error | undefined;
    if (call.table === 'profiles') r = responses.profiles;
    else if (call.table === 'conversations' && op === 'select') r = responses.conversationsSelect;
    else if (call.table === 'conversations' && op === 'update') r = responses.conversationsUpdate;
    if (r instanceof Error) throw r;
    return { data: r?.data ?? null, error: r?.error ?? null };
  };

  const client = {
    from(table: string) {
      const call: Call = { table, chain: [] };
      calls.push(call);
      const builder: Record<string, unknown> = {};
      for (const m of ['select', 'insert', 'update', 'eq', 'neq', 'is', 'in', 'limit', 'order']) {
        builder[m] = (...args: unknown[]) => {
          call.chain.push({ method: m, args });
          return builder;
        };
      }
      builder.maybeSingle = () => {
        call.chain.push({ method: 'maybeSingle', args: [] });
        return Promise.resolve().then(() => resolve(call));
      };
      builder.single = builder.maybeSingle;
      builder.then = (onFulfilled: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
        Promise.resolve()
          .then(() => resolve(call))
          .then(onFulfilled, onRejected);
      return builder;
    },
    rpc() {
      throw new Error('rpc não é usado por este caminho');
    },
  } as unknown as SupabaseClientLike;

  return { client, calls };
}

const input: EngineInput = {
  tenant_id: LOJA,
  whatsapp_instance_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  contact_id: CONTACT,
  phone: '5511999990000',
  message: 'oi',
};

const logger = (): LoggerLike & { warn: ReturnType<typeof vi.fn> } => ({
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
});

const updateCall = (calls: Call[]) =>
  calls.find((c) => c.table === 'conversations' && c.chain.some((x) => x.method === 'update'));

describe('assignConversationToTransferTarget', () => {
  it('conversa sem responsável + pessoa elegível: atribui com o guarda no WHERE', async () => {
    const { client, calls } = fakeClient({
      profiles: { data: [perfil()] },
      conversationsSelect: { data: { id: CONV, assigned_profile_id: null } },
      conversationsUpdate: { data: [{ id: CONV }] },
    });
    const log = logger();
    const before = Date.now();

    const r = await assignConversationToTransferTarget(client, input, USER, log);

    expect(r).toEqual({ outcome: 'assigned', profileId: PROFILE, conversationId: CONV });

    const upd = updateCall(calls);
    expect(upd, 'houve UPDATE em conversations').toBeDefined();
    const patch = upd!.chain.find((x) => x.method === 'update')!.args[0] as Record<string, unknown>;
    // assigned_profile_id é o profiles.id; assigned_at agora; assigned_by NULL.
    expect(patch.assigned_profile_id).toBe(PROFILE);
    expect(patch.assigned_by).toBeNull();
    expect(Date.parse(String(patch.assigned_at))).toBeGreaterThanOrEqual(before - 1000);
    // O guarda vai no WHERE, não só na checagem anterior.
    expect(upd!.chain).toContainEqual({ method: 'is', args: ['assigned_profile_id', null] });
    expect(upd!.chain).toContainEqual({ method: 'eq', args: ['id', CONV] });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('a conversa é procurada por (tenant_id, contact_id) — a UNIQUE da tabela', async () => {
    const { client, calls } = fakeClient({
      profiles: { data: [perfil()] },
      conversationsSelect: { data: { id: CONV, assigned_profile_id: null } },
      conversationsUpdate: { data: [{ id: CONV }] },
    });
    await assignConversationToTransferTarget(client, input, USER, logger());
    const sel = calls.find((c) => c.table === 'conversations' && c.chain[0]?.method === 'select')!;
    expect(sel.chain).toContainEqual({ method: 'eq', args: ['tenant_id', LOJA] });
    expect(sel.chain).toContainEqual({ method: 'eq', args: ['contact_id', CONTACT] });
  });

  it('conversa já com responsável: não escreve nada e diz already_owned', async () => {
    const { client, calls } = fakeClient({
      profiles: { data: [perfil()] },
      conversationsSelect: { data: { id: CONV, assigned_profile_id: 'alguem' } },
    });
    const r = await assignConversationToTransferTarget(client, input, USER, logger());
    expect(r).toEqual({ outcome: 'already_owned', conversationId: CONV });
    expect(updateCall(calls)).toBeUndefined();
  });

  it('pessoa inelegível: nem procura a conversa, muito menos escreve', async () => {
    const { client, calls } = fakeClient({
      profiles: { data: [perfil({ status: 'suspended' })] },
    });
    const r = await assignConversationToTransferTarget(client, input, USER, logger());
    expect(r).toEqual({ outcome: 'ineligible', reason: 'inactive' });
    expect(calls.filter((c) => c.table === 'conversations')).toHaveLength(0);
  });

  it('id que não resolve: ineligible/not_found (decisão 2 — vai para o rodízio)', async () => {
    const { client } = fakeClient({ profiles: { data: [] } });
    const r = await assignConversationToTransferTarget(client, input, USER, logger());
    expect(r).toEqual({ outcome: 'ineligible', reason: 'not_found' });
  });

  it('alguém atribuiu entre a leitura e o UPDATE (zero linhas): lost_race, sem erro', async () => {
    const { client } = fakeClient({
      profiles: { data: [perfil()] },
      conversationsSelect: { data: { id: CONV, assigned_profile_id: null } },
      conversationsUpdate: { data: [] },
    });
    const log = logger();
    const r = await assignConversationToTransferTarget(client, input, USER, log);
    expect(r).toEqual({ outcome: 'lost_race', conversationId: CONV });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('conversa inexistente: no_conversation', async () => {
    const { client } = fakeClient({
      profiles: { data: [perfil()] },
      conversationsSelect: { data: null },
    });
    const r = await assignConversationToTransferTarget(client, input, USER, logger());
    expect(r).toEqual({ outcome: 'no_conversation', conversationId: null });
  });

  it('erro do banco no UPDATE: nunca lança — devolve error e avisa no log', async () => {
    const { client } = fakeClient({
      profiles: { data: [perfil()] },
      conversationsSelect: { data: { id: CONV, assigned_profile_id: null } },
      conversationsUpdate: { data: null, error: { code: '23503', message: 'fk' } },
    });
    const log = logger();
    await expect(assignConversationToTransferTarget(client, input, USER, log)).resolves.toEqual({
      outcome: 'error',
    });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });

  it('exceção crua na leitura de profiles: idem', async () => {
    const { client } = fakeClient({ profiles: new Error('rede caiu') });
    const log = logger();
    await expect(assignConversationToTransferTarget(client, input, USER, log)).resolves.toEqual({
      outcome: 'error',
    });
    expect(log.warn).toHaveBeenCalledTimes(1);
  });
});
