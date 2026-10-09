import { describe, expect, it } from 'vitest';
// O que o instagram-webhook chama depois de gravar a mensagem do cliente.
import { cancelLinkedWhatsAppFollowups } from '../../../supabase/functions/_shared/contact-link-reply';

// ─── Fake do cliente Supabase ─────────────────────────────────────────────────
// Igual ao de followup-reply.test.ts: filtra e escreve de verdade sobre arrays
// em memória, para a prova ser "o follow-up do WhatsApp mudou e o resto não".

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

class FakeQuery {
  private filters: Array<(r: Row) => boolean> = [];
  private patch: Row | null = null;
  private single = false;

  constructor(private db: Db, private table: string, private failOn?: string) {}

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
    if (this.failOn === this.table) return { data: null, error: { message: 'boom' } };
    const rows = this.db[this.table] ?? [];
    const matched = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.patch) for (const r of matched) Object.assign(r, this.patch);
    return this.single
      ? { data: matched[0] ?? null, error: null }
      : { data: matched.map((r) => ({ ...r })), error: null };
  }

  then<T>(resolve: (v: ReturnType<FakeQuery['run']>) => T) {
    return Promise.resolve(this.run()).then(resolve);
  }
}

const fakeSupabase = (db: Db, failOn?: string) =>
  ({ from: (table: string) => new FakeQuery(db, table, failOn) }) as never;

// ─── Cenário ──────────────────────────────────────────────────────────────────

const LOJA = 'aaaaaaaa-0000-4000-8000-000000000001';
const OUTRA_LOJA = 'aaaaaaaa-0000-4000-8000-000000000009';
const WA = 'aaaaaaaa-0000-4000-8000-0000000000a1';
const IG = 'aaaaaaaa-0000-4000-8000-0000000000b1';
const IG_SOZINHO = 'aaaaaaaa-0000-4000-8000-0000000000b2';

const cenario = (): Db => ({
  tenants: [{ id: LOJA, settings: {} }],
  contact_links: [{ tenant_id: LOJA, whatsapp_contact_id: WA, instagram_contact_id: IG }],
  followup_sequences: [],
  followup_sequence_enrollments: [],
  individual_followups: [
    { id: 'f1', tenant_id: LOJA, contact_id: WA, mode: 'scheduled', status: 'scheduled' },
    { id: 'f2', tenant_id: LOJA, contact_id: WA, mode: 'manual', status: 'pending' },
    { id: 'f3', tenant_id: LOJA, contact_id: 'aaaaaaaa-0000-4000-8000-0000000000c1', mode: 'scheduled', status: 'scheduled' },
  ],
});

const statusOf = (db: Db, id: string) => (db.individual_followups ?? []).find((f) => f.id === id)?.status;

const entrada = (over: Record<string, unknown> = {}) => ({
  outcome: 'stored',
  direction: 'inbound',
  tenant_id: LOJA,
  contact_id: IG,
  ...over,
});

describe('resposta no Instagram com contatos vinculados', () => {
  it('cancela o agendado do WhatsApp da mesma pessoa, com as preferências de sempre (manual fica)', async () => {
    const db = cenario();
    const r = await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada());
    expect(r?.whatsappContactId).toBe(WA);
    expect(r?.result.scheduledCancelled).toBe(1);
    expect(r?.result.manualCancelled).toBe(0);
    expect(statusOf(db, 'f1')).toBe('cancelled');
    expect(statusOf(db, 'f2')).toBe('pending');
    expect(statusOf(db, 'f3')).toBe('scheduled');
  });

  it('sem vínculo, nada acontece', async () => {
    const db = cenario();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ contact_id: IG_SOZINHO }))).toBeNull();
    expect(statusOf(db, 'f1')).toBe('scheduled');
  });

  it('eco (resposta da Loja pelo app) e entrega repetida não contam como resposta do cliente', async () => {
    const db = cenario();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ direction: 'outbound' }))).toBeNull();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ outcome: 'duplicate' }))).toBeNull();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ outcome: 'unknown_account' }))).toBeNull();
    expect(statusOf(db, 'f1')).toBe('scheduled');
  });

  it('o vínculo é procurado na Loja da mensagem, nunca em outra', async () => {
    const db = cenario();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ tenant_id: OUTRA_LOJA }))).toBeNull();
    expect(statusOf(db, 'f1')).toBe('scheduled');
  });

  it('falha ao ler o vínculo não derruba nada e não cancela nada', async () => {
    const db = cenario();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db, 'contact_links'), entrada())).toBeNull();
    expect(statusOf(db, 'f1')).toBe('scheduled');
  });

  it('resposta sem Loja ou sem contato é ignorada', async () => {
    const db = cenario();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ tenant_id: undefined }))).toBeNull();
    expect(await cancelLinkedWhatsAppFollowups(fakeSupabase(db), entrada({ contact_id: null }))).toBeNull();
  });
});
