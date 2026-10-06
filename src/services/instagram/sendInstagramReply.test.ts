/**
 * O lado do navegador da reconciliação do eco (fatia 3 do Instagram). O lado
 * do banco — o eco em cada ordem, com ids iguais e diferentes — é provado por
 * docs/teste_instagram_resposta.sql.
 */
import { describe, it, expect, vi } from 'vitest';
import { sendInstagramReply } from './sendInstagramReply';

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> };

/** Cliente falso: registra cada chamada e devolve o que o teste mandar. */
function fakeClient(opts: {
  insert?: { data: unknown; error: unknown };
  updates?: Array<{ error: unknown }>;
  rpc?: { data: unknown; error: unknown };
}) {
  const calls: Call[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const updates = [...(opts.updates ?? [])];

  const client = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          const call: Call = { table, op: 'insert', payload, filters: [] };
          calls.push(call);
          return {
            select: () => ({ single: async () => opts.insert ?? { data: { id: 'row-1' }, error: null } }),
          };
        },
        update(payload: unknown) {
          const call: Call = { table, op: 'update', payload, filters: [] };
          calls.push(call);
          const result = updates.shift() ?? { error: null };
          const chain: any = {
            eq: (c: string, v: unknown) => { call.filters.push(['eq', c, v]); return chain; },
            is: (c: string, v: unknown) => { call.filters.push(['is', c, v]); return chain; },
            then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(result).then(res, rej),
          };
          return chain;
        },
      };
    },
    rpc: vi.fn(async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return opts.rpc ?? { data: null, error: null };
    }),
  };
  return { client, calls, rpcCalls };
}

const base = {
  tenantId: 't-1',
  instanceId: 'ig-inst',
  contactId: 'c-1',
  recipientId: '978239761327698',
  text: 'Olá!',
};

describe('sendInstagramReply', () => {
  it('grava pending SEM created_at (o relógio é do banco), envia, grava o mid', async () => {
    const { client, calls } = fakeClient({});
    const adapter = { sendText: vi.fn(async () => ({ status: 'sent' as const, providerMessageId: 'mid.X' })) };
    const r = await sendInstagramReply({ ...base, client, adapter });

    expect(r).toEqual({ ok: true, messageRowId: 'row-1' });
    const ins = calls[0];
    expect(ins.op).toBe('insert');
    expect(ins.payload).toEqual({
      tenant_id: 't-1', whatsapp_instance_id: 'ig-inst', contact_id: 'c-1', direction: 'outbound',
      message_type: 'text', content: 'Olá!', status: 'pending', is_from_bot: false,
    });
    expect(ins.payload).not.toHaveProperty('created_at');
    expect(adapter.sendText).toHaveBeenCalledWith('978239761327698', 'Olá!');
    expect(calls[1]).toMatchObject({
      op: 'update', payload: { status: 'sent', evolution_message_id: 'mid.X' }, filters: [['eq', 'id', 'row-1']],
    });
  });

  it('UPDATE bate no índice (23505): chama reconcile_instagram_send e segue ok', async () => {
    const { client, rpcCalls } = fakeClient({
      updates: [{ error: { code: '23505' } }],
      rpc: { data: { outcome: 'merged' }, error: null },
    });
    const adapter = { sendText: async () => ({ status: 'sent' as const, providerMessageId: 'mid.X' }) };
    const r = await sendInstagramReply({ ...base, client, adapter });
    expect(rpcCalls).toEqual([{ fn: 'reconcile_instagram_send', args: { p_message_id: 'row-1', p_mid: 'mid.X' } }]);
    expect(r).toEqual({ ok: true, messageRowId: 'row-1', reconciled: 'merged' });
  });

  it('conflito que a reconciliação não resolve: avisa, não falha calado, tira o relógio', async () => {
    const { client, calls } = fakeClient({
      updates: [{ error: { code: '23505' } }, { error: null }],
      rpc: { data: { outcome: 'conflict_foreign' }, error: null },
    });
    const adapter = { sendText: async () => ({ status: 'sent' as const, providerMessageId: 'mid.X' }) };
    const r = await sendInstagramReply({ ...base, client, adapter });
    expect(r.ok).toBe(true);
    expect(r.ok && r.warning).toMatch(/duas vezes/);
    expect(calls[2]).toMatchObject({ op: 'update', payload: { status: 'sent' } });
  });

  it('falha no envio: failed SÓ se nenhum eco já casou a linha (evolution_message_id IS NULL)', async () => {
    const { client, calls } = fakeClient({});
    const adapter = {
      sendText: async () => ({ status: 'failed' as const, reason: 'outside_window', error: 'fora da janela' }),
    };
    const r = await sendInstagramReply({ ...base, client, adapter });
    expect(r).toEqual({ ok: false, reason: 'outside_window', error: 'fora da janela', messageRowId: 'row-1' });
    expect(calls[1]).toMatchObject({
      op: 'update',
      payload: { status: 'failed' },
      filters: [['eq', 'id', 'row-1'], ['is', 'evolution_message_id', null]],
    });
  });

  it('aceito sem message_id: a linha fica pending (o eco ainda a casa pelo texto)', async () => {
    const { client, calls } = fakeClient({});
    const adapter = { sendText: async () => ({ status: 'sent' as const }) };
    const r = await sendInstagramReply({ ...base, client, adapter });
    expect(r).toEqual({ ok: true, messageRowId: 'row-1', warning: 'sem_message_id' });
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0);
  });

  it('mais de 1000 bytes: não grava nem envia', async () => {
    const { client, calls } = fakeClient({});
    const adapter = { sendText: vi.fn() };
    const r = await sendInstagramReply({ ...base, text: '🙂'.repeat(251), client, adapter });
    expect(r).toMatchObject({ ok: false, reason: 'too_long' });
    expect(calls).toHaveLength(0);
    expect(adapter.sendText).not.toHaveBeenCalled();
  });

  it('INSERT falhou: nada é enviado', async () => {
    const { client } = fakeClient({ insert: { data: null, error: { code: '42501' } } });
    const adapter = { sendText: vi.fn() };
    const r = await sendInstagramReply({ ...base, client, adapter });
    expect(r).toMatchObject({ ok: false, reason: 'insert_failed' });
    expect(adapter.sendText).not.toHaveBeenCalled();
  });
});
