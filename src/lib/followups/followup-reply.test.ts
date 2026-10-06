import { describe, it, expect } from 'vitest';
// Lógica de cancelamento por resposta (compartilhada com o edge function Deno).
import {
  applyReplyCancellations,
  normalizeReplyCancelSettings,
  REPLY_CANCEL_DEFAULTS,
} from '../../../supabase/functions/_shared/followup-reply';

// ─── Fake do cliente Supabase ─────────────────────────────────────────────────
// Filtra e escreve de verdade sobre arrays em memória. Um fake que só registra
// chamadas não provaria isolamento entre Lojas — provaria só que passamos o
// argumento. Aqui a linha da outra Loja EXISTE e precisa sobreviver.

type Row = Record<string, unknown>;
interface Db {
  tenants: Row[];
  followup_sequences: Row[];
  followup_sequence_enrollments: Row[];
  individual_followups: Row[];
}

class FakeQuery {
  private filters: Array<(r: Row) => boolean> = [];
  private patch: Row | null = null;
  private single = false;

  constructor(private db: Db, private table: string) {}

  select() {
    return this;
  }
  update(patch: Row) {
    this.patch = patch;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  in(col: string, vals: readonly unknown[]) {
    const set = new Set(vals);
    this.filters.push((r) => set.has(r[col]));
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run() {
    const rows = (this.db as unknown as Record<string, Row[]>)[this.table] ?? [];
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) for (const r of matched) Object.assign(r, this.patch);
    return this.single
      ? { data: matched[0] ?? null, error: null }
      : { data: matched.map((r) => ({ ...r })), error: null };
  }

  // Thenable: `await query` resolve como o supabase-js.
  then<T>(resolve: (v: ReturnType<FakeQuery['run']>) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

const fakeSupabase = (db: Db) =>
  ({ from: (table: string) => new FakeQuery(db, table) }) as never;

// ─── Cenário ──────────────────────────────────────────────────────────────────

const LOJA_A = 'aaaaaaaa-0000-0000-0000-000000000001';
const LOJA_B = 'bbbbbbbb-0000-0000-0000-000000000002';
const CONTATO_A = 'cccccccc-0000-0000-0000-00000000000a';
const CONTATO_B = 'cccccccc-0000-0000-0000-00000000000b';

const settingsRow = (id: string, followups?: Row) => ({
  id,
  settings: followups ? { followups } : {},
});

/** Um agendado e um manual, ambos abertos, para o contato indicado. */
const avulsos = (tenant: string, contact: string, prefix: string): Row[] => [
  {
    id: `${prefix}-sched`,
    tenant_id: tenant,
    contact_id: contact,
    mode: 'scheduled',
    status: 'scheduled',
    cancelled_at: null,
    error_message: null,
  },
  {
    id: `${prefix}-manual`,
    tenant_id: tenant,
    contact_id: contact,
    mode: 'manual',
    status: 'pending',
    cancelled_at: null,
    error_message: null,
  },
];

/** Busca a linha pelo id e FALHA se ela não existir — some no meio do teste é bug. */
const byId = (rows: Row[], id: string): Row => {
  const found = rows.find((r) => r.id === id);
  if (!found) throw new Error(`linha "${id}" não existe no fake`);
  return found;
};

const statusOf = (db: Db, id: string) => byId(db.individual_followups, id).status;

const baseDb = (followups?: Row): Db => ({
  tenants: [settingsRow(LOJA_A, followups)],
  followup_sequence_enrollments: [],
  followup_sequences: [],
  individual_followups: avulsos(LOJA_A, CONTATO_A, 'a'),
});

// ─── Os quatro cruzamentos dos dois interruptores ─────────────────────────────

describe('applyReplyCancellations — os dois interruptores valem de forma independente', () => {
  const combinacoes: Array<{
    nome: string;
    settings: Row;
    agendadoCancelado: boolean;
    manualCancelado: boolean;
  }> = [
    {
      nome: 'agendado LIGADO / manual DESLIGADO (o padrão)',
      settings: { cancel_scheduled_on_reply: true, cancel_manual_on_reply: false },
      agendadoCancelado: true,
      manualCancelado: false,
    },
    {
      nome: 'agendado LIGADO / manual LIGADO',
      settings: { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true },
      agendadoCancelado: true,
      manualCancelado: true,
    },
    {
      nome: 'agendado DESLIGADO / manual LIGADO',
      settings: { cancel_scheduled_on_reply: false, cancel_manual_on_reply: true },
      agendadoCancelado: false,
      manualCancelado: true,
    },
    {
      nome: 'agendado DESLIGADO / manual DESLIGADO',
      settings: { cancel_scheduled_on_reply: false, cancel_manual_on_reply: false },
      agendadoCancelado: false,
      manualCancelado: false,
    },
  ];

  for (const c of combinacoes) {
    it(c.nome, async () => {
      const db = baseDb(c.settings);
      const r = await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

      expect(statusOf(db, 'a-sched')).toBe(c.agendadoCancelado ? 'cancelled' : 'scheduled');
      expect(statusOf(db, 'a-manual')).toBe(c.manualCancelado ? 'cancelled' : 'pending');
      expect(r.scheduledCancelled).toBe(c.agendadoCancelado ? 1 : 0);
      expect(r.manualCancelled).toBe(c.manualCancelado ? 1 : 0);
    });
  }

  it('sem nada salvo vale o padrão: agendado cancela, manual não', async () => {
    const db = baseDb();
    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(statusOf(db, 'a-sched')).toBe('cancelled');
    expect(statusOf(db, 'a-manual')).toBe('pending');
  });

  it('carimba cancelled_at e o motivo em quem foi cancelado', async () => {
    const db = baseDb({ cancel_scheduled_on_reply: true, cancel_manual_on_reply: false });
    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    const row = byId(db.individual_followups, 'a-sched');
    expect(row.cancelled_at).toEqual(expect.any(String));
    expect(String(row.error_message)).toContain('o cliente respondeu');

    // Quem não foi cancelado não é carimbado.
    const intacto = byId(db.individual_followups, 'a-manual');
    expect(intacto.cancelled_at).toBeNull();
    expect(intacto.error_message).toBeNull();
  });
});

// ─── Isolamento entre Lojas ───────────────────────────────────────────────────

describe('applyReplyCancellations — uma resposta nunca toca outra Loja', () => {
  it('com os dois interruptores ligados, as linhas da Loja B ficam intactas', async () => {
    const db: Db = {
      tenants: [
        settingsRow(LOJA_A, { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true }),
        settingsRow(LOJA_B, { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true }),
      ],
      followup_sequence_enrollments: [],
      followup_sequences: [],
      individual_followups: [
        ...avulsos(LOJA_A, CONTATO_A, 'a'),
        ...avulsos(LOJA_B, CONTATO_B, 'b'),
      ],
    };

    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(statusOf(db, 'a-sched')).toBe('cancelled');
    expect(statusOf(db, 'a-manual')).toBe('cancelled');
    // A outra Loja não foi tocada.
    expect(statusOf(db, 'b-sched')).toBe('scheduled');
    expect(statusOf(db, 'b-manual')).toBe('pending');
  });

  it('linha com o MESMO contato mas de outra Loja não é cancelada', async () => {
    // Prova que o filtro por tenant faz trabalho de verdade: sem ele, o filtro
    // por contact_id sozinho pegaria esta linha.
    const db: Db = {
      tenants: [
        settingsRow(LOJA_A, { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true }),
      ],
      followup_sequence_enrollments: [],
      followup_sequences: [],
      individual_followups: [
        ...avulsos(LOJA_A, CONTATO_A, 'a'),
        ...avulsos(LOJA_B, CONTATO_A, 'intruso'),
      ],
    };

    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(statusOf(db, 'intruso-sched')).toBe('scheduled');
    expect(statusOf(db, 'intruso-manual')).toBe('pending');
  });

  it('inscrição de outra Loja no mesmo contato não é parada', async () => {
    const db: Db = {
      tenants: [settingsRow(LOJA_A)],
      followup_sequences: [
        { id: 'seq-a', stop_on_reply: true },
        { id: 'seq-b', stop_on_reply: true },
      ],
      followup_sequence_enrollments: [
        {
          id: 'enr-a',
          tenant_id: LOJA_A,
          contact_id: CONTATO_A,
          sequence_id: 'seq-a',
          status: 'active',
          waiting_on_followup_id: null,
        },
        {
          id: 'enr-b',
          tenant_id: LOJA_B,
          contact_id: CONTATO_A,
          sequence_id: 'seq-b',
          status: 'active',
          waiting_on_followup_id: null,
        },
      ],
      individual_followups: [],
    };

    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    const enr = (id: string) => byId(db.followup_sequence_enrollments, id);
    expect(enr('enr-a').status).toBe('stopped_reply');
    expect(enr('enr-b').status).toBe('active');
  });
});

// ─── Sequências: comportamento preservado ─────────────────────────────────────

describe('applyReplyCancellations — sequências continuam obedecendo stop_on_reply', () => {
  const dbComCadencia = (stopOnReply: boolean, waitingTaskId: string | null): Db => ({
    tenants: [settingsRow(LOJA_A, { cancel_scheduled_on_reply: false, cancel_manual_on_reply: false })],
    followup_sequences: [{ id: 'seq-1', stop_on_reply: stopOnReply }],
    followup_sequence_enrollments: [
      {
        id: 'enr-1',
        tenant_id: LOJA_A,
        contact_id: CONTATO_A,
        sequence_id: 'seq-1',
        status: 'active',
        waiting_on_followup_id: waitingTaskId,
        next_run_at: '2026-09-01T10:00:00.000Z',
      },
    ],
    individual_followups: waitingTaskId
      ? [
          {
            id: waitingTaskId,
            tenant_id: LOJA_A,
            contact_id: CONTATO_A,
            mode: 'sequence',
            status: 'pending',
            cancelled_at: null,
            error_message: null,
          },
        ]
      : [],
  });

  it('stop_on_reply=true para a cadência e zera next_run_at', async () => {
    const db = dbComCadencia(true, null);
    const r = await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    const enr = byId(db.followup_sequence_enrollments, 'enr-1');
    expect(enr.status).toBe('stopped_reply');
    expect(enr.next_run_at).toBeNull();
    expect(enr.stopped_reason).toBe('Contato respondeu');
    expect(r.sequencesStopped).toBe(1);
  });

  it('stop_on_reply=false deixa a cadência correndo', async () => {
    const db = dbComCadencia(false, null);
    const r = await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(byId(db.followup_sequence_enrollments, 'enr-1').status).toBe('active');
    expect(r.sequencesStopped).toBe(0);
  });
});

// ─── Tarefa órfã da cadência morta ────────────────────────────────────────────

describe('applyReplyCancellations — tarefa presa numa cadência parada', () => {
  const dbComTarefaPresa = (stopOnReply: boolean): Db => ({
    // Os DOIS interruptores desligados: a tarefa presa não depende deles.
    tenants: [
      settingsRow(LOJA_A, { cancel_scheduled_on_reply: false, cancel_manual_on_reply: false }),
    ],
    followup_sequences: [{ id: 'seq-1', stop_on_reply: stopOnReply }],
    followup_sequence_enrollments: [
      {
        id: 'enr-1',
        tenant_id: LOJA_A,
        contact_id: CONTATO_A,
        sequence_id: 'seq-1',
        status: 'active',
        waiting_on_followup_id: 'tarefa-presa',
      },
    ],
    individual_followups: [
      {
        id: 'tarefa-presa',
        tenant_id: LOJA_A,
        contact_id: CONTATO_A,
        mode: 'sequence',
        status: 'pending',
        cancelled_at: null,
        error_message: null,
      },
    ],
  });

  it('é encerrada mesmo com o interruptor de tarefas manuais DESLIGADO', async () => {
    const db = dbComTarefaPresa(true);
    const r = await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(statusOf(db, 'tarefa-presa')).toBe('cancelled');
    expect(r.orphanTasksClosed).toBe(1);
  });

  it('é encerrada como cancelled, nunca como completed', async () => {
    const db = dbComTarefaPresa(true);
    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    const t = byId(db.individual_followups, 'tarefa-presa');
    // 'completed' alimenta métrica de produtividade — a tarefa não foi feita.
    expect(t.status).not.toBe('completed');
    expect(t.status).toBe('cancelled');
    expect(t.cancelled_at).toEqual(expect.any(String));
    expect(String(t.error_message)).toContain('cadência');
  });

  it('não é tocada quando a cadência não parou (stop_on_reply=false)', async () => {
    const db = dbComTarefaPresa(false);
    const r = await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(statusOf(db, 'tarefa-presa')).toBe('pending');
    expect(r.orphanTasksClosed).toBe(0);
  });
});

// ─── Linhas que não podem ser tocadas ─────────────────────────────────────────

describe('applyReplyCancellations — o que fica de fora', () => {
  it('não mexe em in_progress: o envio já pode estar em voo', async () => {
    const db: Db = {
      tenants: [
        settingsRow(LOJA_A, { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true }),
      ],
      followup_sequence_enrollments: [],
      followup_sequences: [],
      individual_followups: [
        {
          id: 'em-voo',
          tenant_id: LOJA_A,
          contact_id: CONTATO_A,
          mode: 'scheduled',
          status: 'in_progress',
        },
      ],
    };

    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);
    expect(statusOf(db, 'em-voo')).toBe('in_progress');
  });

  it('não reabre nem re-carimba o que já terminou', async () => {
    const db: Db = {
      tenants: [
        settingsRow(LOJA_A, { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true }),
      ],
      followup_sequence_enrollments: [],
      followup_sequences: [],
      individual_followups: [
        {
          id: 'feito',
          tenant_id: LOJA_A,
          contact_id: CONTATO_A,
          mode: 'manual',
          status: 'completed',
          error_message: null,
        },
        {
          id: 'ja-cancelado',
          tenant_id: LOJA_A,
          contact_id: CONTATO_A,
          mode: 'scheduled',
          status: 'cancelled',
          error_message: 'Contato sem telefone válido.',
        },
      ],
    };

    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);

    expect(statusOf(db, 'feito')).toBe('completed');
    expect(byId(db.individual_followups, 'feito').error_message).toBeNull();
    // O motivo original do cancelamento anterior é preservado.
    expect(byId(db.individual_followups, 'ja-cancelado').error_message).toBe(
      'Contato sem telefone válido.',
    );
  });

  it('cancela o atrasado (overdue), que ainda ia acontecer', async () => {
    const db: Db = {
      tenants: [
        settingsRow(LOJA_A, { cancel_scheduled_on_reply: true, cancel_manual_on_reply: true }),
      ],
      followup_sequence_enrollments: [],
      followup_sequences: [],
      individual_followups: [
        {
          id: 'atrasado',
          tenant_id: LOJA_A,
          contact_id: CONTATO_A,
          mode: 'manual',
          status: 'overdue',
        },
      ],
    };

    await applyReplyCancellations(fakeSupabase(db), LOJA_A, CONTATO_A);
    expect(statusOf(db, 'atrasado')).toBe('cancelled');
  });

  it('sem tenant ou sem contato não escreve nada', async () => {
    const db = baseDb({ cancel_scheduled_on_reply: true, cancel_manual_on_reply: true });
    await applyReplyCancellations(fakeSupabase(db), '', CONTATO_A);
    await applyReplyCancellations(fakeSupabase(db), LOJA_A, '');

    expect(statusOf(db, 'a-sched')).toBe('scheduled');
    expect(statusOf(db, 'a-manual')).toBe('pending');
  });
});

// ─── Normalização das preferências ────────────────────────────────────────────

describe('normalizeReplyCancelSettings', () => {
  it('sem nada salvo devolve os padrões', () => {
    expect(normalizeReplyCancelSettings(null)).toEqual(REPLY_CANCEL_DEFAULTS);
    expect(normalizeReplyCancelSettings({})).toEqual(REPLY_CANCEL_DEFAULTS);
    expect(normalizeReplyCancelSettings({ followups: null })).toEqual(REPLY_CANCEL_DEFAULTS);
  });

  it('preenche só o campo que falta', () => {
    expect(normalizeReplyCancelSettings({ followups: { cancel_manual_on_reply: true } })).toEqual({
      cancel_scheduled_on_reply: true,
      cancel_manual_on_reply: true,
    });
  });

  it('ignora valor que não é booleano em vez de convertê-lo', () => {
    const r = normalizeReplyCancelSettings({
      followups: { cancel_scheduled_on_reply: 'false', cancel_manual_on_reply: 1 },
    });
    expect(r).toEqual(REPLY_CANCEL_DEFAULTS);
  });

  it('respeita false explícito', () => {
    expect(
      normalizeReplyCancelSettings({ followups: { cancel_scheduled_on_reply: false } }),
    ).toEqual({ cancel_scheduled_on_reply: false, cancel_manual_on_reply: false });
  });
});
