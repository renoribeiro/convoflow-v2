import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
// Item 14, lote 6: freio do envio de relatório pela tela.
import {
  checkReportLimits,
  MAX_RECIPIENTS_PER_CHANNEL,
  MAX_SENDS_PER_HOUR,
  MAX_REPORT_NAME_LENGTH,
} from '../../../supabase/functions/_shared/report-limits';

const emails = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@exemplo.com`);
const phones = (n: number) => Array.from({ length: n }, (_, i) => `55119000000${String(i).padStart(2, '0')}`);

describe('checkReportLimits', () => {
  it('uso normal passa (1 destinatário, poucos envios)', () => {
    expect(checkReportLimits({ emails: emails(1), phones: [], name: 'Semanal', sentLastHour: 2 })).toBeNull();
  });

  it('no teto passa; um acima barra', () => {
    const base = { phones: [], name: 'x', sentLastHour: 0 };
    expect(checkReportLimits({ ...base, emails: emails(MAX_RECIPIENTS_PER_CHANNEL) })).toBeNull();
    expect(checkReportLimits({ ...base, emails: emails(MAX_RECIPIENTS_PER_CHANNEL + 1) })?.code).toBe('TOO_MANY_EMAILS');
    expect(
      checkReportLimits({ emails: [], phones: phones(MAX_RECIPIENTS_PER_CHANNEL + 1), name: 'x', sentLastHour: 0 })?.code,
    ).toBe('TOO_MANY_PHONES');
  });

  it('nome longo barra', () => {
    const r = checkReportLimits({ emails: emails(1), phones: [], name: 'a'.repeat(MAX_REPORT_NAME_LENGTH + 1), sentLastHour: 0 });
    expect(r?.code).toBe('NAME_TOO_LONG');
    expect(checkReportLimits({ emails: emails(1), phones: [], name: 'a'.repeat(MAX_REPORT_NAME_LENGTH), sentLastHour: 0 })).toBeNull();
    expect(checkReportLimits({ emails: emails(1), phones: [], name: undefined, sentLastHour: 0 })).toBeNull();
  });

  it('teto por hora', () => {
    expect(checkReportLimits({ emails: emails(1), phones: [], name: 'x', sentLastHour: MAX_SENDS_PER_HOUR - 1 })).toBeNull();
    expect(checkReportLimits({ emails: emails(1), phones: [], name: 'x', sentLastHour: MAX_SENDS_PER_HOUR })?.code).toBe('RATE_LIMITED');
  });

  it('send-report aplica o freio antes de montar e enviar', () => {
    const src = readFileSync(resolve(__dirname, '../../../supabase/functions/send-report/index.ts'), 'utf8').replace(/\r\n/g, '\n');
    const freio = src.indexOf('checkReportLimits({');
    const montagem = src.indexOf('await buildReportPayload(admin');
    expect(freio).toBeGreaterThan(0);
    expect(montagem).toBeGreaterThan(freio);
    expect(src).toContain(".eq('executed_by', caller.user_id)");
  });
});
