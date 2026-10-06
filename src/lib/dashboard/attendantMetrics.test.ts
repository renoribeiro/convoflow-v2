import { describe, it, expect } from 'vitest';
import {
  attendantLabel,
  obtainedLabel,
  parseAttendantRow,
  splitAttendantRows,
  unownedNotice,
  type AttendantMetricsRow,
} from './attendantMetrics';

const row = (over: Partial<AttendantMetricsRow>): AttendantMetricsRow => ({
  profile_id: 'p1', first_name: 'Maria', last_name: 'Souza', role: 'atendente',
  is_parent_account: false, reason: null,
  n_held: 0, n_assumed: 0, n_transferred: 0, n_automatic: 0, n_waiting: 0, n_no_human_reply: 0,
  n_rule_transfers_suffered: 0, n_rule_transfers_received: 0,
  ...over,
});

// A VagaCerta em 2026-09-21: 4 de 168 com dono, 92 esperando, todas sem dono.
const VAGA_CERTA: AttendantMetricsRow[] = [
  row({ profile_id: null, first_name: null, last_name: null, role: null, n_held: 164, n_waiting: 92, n_no_human_reply: 64 }),
  row({ profile_id: 'bea', first_name: 'Lívia', last_name: 'Campos', n_held: 3, n_assumed: 2, n_transferred: 1 }),
  row({ profile_id: 'cam', first_name: 'Helena', last_name: 'Duarte', role: 'gerente', is_parent_account: true, n_held: 1, n_assumed: 1 }),
];

describe('parseAttendantRow', () => {
  it('bigint chega como string e vira número; nulos ficam nulos', () => {
    const r = parseAttendantRow({ profile_id: null, n_held: '164', n_waiting: '92', is_parent_account: false, reason: null });
    expect(r.profile_id).toBeNull();
    expect(r.n_held).toBe(164);
    expect(r.n_waiting).toBe(92);
    expect(r.n_assumed).toBe(0);
  });
});

describe('splitAttendantRows', () => {
  it('separa a linha sem responsável das pessoas e soma os totais', () => {
    const v = splitAttendantRows(VAGA_CERTA);
    expect(v.unowned.n_held).toBe(164);
    expect(v.people.map((p) => p.profile_id)).toEqual(['bea', 'cam']);
    expect(v.totalHeld).toBe(168);
    expect(v.totalWaiting).toBe(92);
  });
  it('sem a linha NULL, a "sem responsável" é zero em vez de sumir', () => {
    const v = splitAttendantRows(VAGA_CERTA.slice(1));
    expect(v.unowned.n_held).toBe(0);
    expect(v.totalHeld).toBe(4);
  });
});

describe('unownedNotice — a frase honesta antes da tabela', () => {
  it('VagaCerta: diz que 164 de 168 estão sem responsável e que ninguém é dono das 92 que esperam', () => {
    expect(unownedNotice(splitAttendantRows(VAGA_CERTA))).toBe(
      '164 de 168 conversas abertas estão sem responsável, e 92 delas esperam uma pessoa responder. Nenhuma conversa que espera resposta tem dono.',
    );
  });
  it('quando há gente esperando também com dono, não afirma "ninguém"', () => {
    const rows = [...VAGA_CERTA];
    rows[1] = row({ ...rows[1]!, n_waiting: 1 });
    expect(unownedNotice(splitAttendantRows(rows))).toBe(
      '164 de 168 conversas abertas estão sem responsável, e 92 delas esperam uma pessoa responder.',
    );
  });
  it('sem responsável zero: diz que tudo está com alguém (não some)', () => {
    const rows = [row({ profile_id: null, n_held: 0 }), row({ n_held: 3 })];
    expect(unownedNotice(splitAttendantRows(rows))).toBe('Todas as conversas abertas estão com alguém.');
  });
  it('Loja sem conversa aberta', () => {
    expect(unownedNotice(splitAttendantRows([row({ profile_id: null })]))).toBe('Nenhuma conversa aberta na Loja.');
  });
  it('sem responsável mas ninguém esperando: só a primeira parte', () => {
    const rows = [row({ profile_id: null, n_held: 2 }), row({ n_held: 1 })];
    expect(unownedNotice(splitAttendantRows(rows))).toBe('2 de 3 conversas abertas estão sem responsável.');
  });
});

describe('attendantLabel / obtainedLabel', () => {
  it('nome; motivo de quem saiu (mesmo rótulo da pílula); gerente da Conta', () => {
    expect(attendantLabel(row({}))).toBe('Maria Souza');
    expect(attendantLabel(row({ reason: 'suspended' }))).toBe('Maria Souza (suspenso)');
    expect(attendantLabel(row({ reason: 'moved' }))).toBe('Maria Souza (fora da Loja)');
    expect(attendantLabel(row({ is_parent_account: true, first_name: 'Helena', last_name: null }))).toBe('Helena (da Conta)');
    expect(attendantLabel(row({ first_name: null, last_name: null }))).toBe('Sem nome');
  });
  it('como as conversas chegaram', () => {
    expect(obtainedLabel(row({ n_assumed: 2, n_transferred: 1, n_automatic: 0 }))).toBe('2 assumiu · 1 de colega · 0 automático');
  });
});
