import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_OFF,
  formatarFaltando,
  formatarMomento,
  parseMaintenanceConfig,
  resolveMaintenance,
  serializeMaintenanceConfig,
  type MaintenanceConfig,
} from './maintenanceState';

const AGORA = new Date('2026-09-01T12:00:00.000Z');
const iso = (h: number) => new Date(AGORA.getTime() + h * 3600_000).toISOString();

const config = (patch: Partial<MaintenanceConfig> = {}): MaintenanceConfig => ({
  enabled: true,
  reason: 'Atualizando o banco.',
  startsAt: null,
  endsAt: null,
  ...patch,
});

describe('resolveMaintenance', () => {
  it('desligada quando o interruptor está em false', () => {
    expect(resolveMaintenance(config({ enabled: false }), AGORA)).toEqual({
      status: 'off',
      active: false,
    });
  });

  it('ligada sem janela nenhuma bloqueia', () => {
    expect(resolveMaintenance(config(), AGORA)).toEqual({ status: 'active', active: true });
  });

  it('janela em curso bloqueia', () => {
    const r = resolveMaintenance(config({ startsAt: iso(-1), endsAt: iso(1) }), AGORA);
    expect(r).toEqual({ status: 'active', active: true });
  });

  it('janela agendada para o futuro NÃO bloqueia', () => {
    const r = resolveMaintenance(config({ startsAt: iso(2), endsAt: iso(4) }), AGORA);
    expect(r).toEqual({ status: 'scheduled', active: false });
  });

  // ------------------------------------------------------------------------
  // O requisito central: a janela vencida se resolve sozinha, sem cron e sem
  // ninguém lembrar de desligar.
  // ------------------------------------------------------------------------
  it('janela VENCIDA resolve para desligada sozinha', () => {
    const r = resolveMaintenance(config({ startsAt: iso(-4), endsAt: iso(-1) }), AGORA);
    expect(r).toEqual({ status: 'ended', active: false });
  });

  it('vence no instante exato do fim, não um minuto depois', () => {
    const fim = iso(0); // exatamente AGORA
    expect(resolveMaintenance(config({ endsAt: fim }), AGORA).active).toBe(false);
    // um milissegundo antes ainda bloqueia
    const quase = new Date(AGORA.getTime() - 1);
    expect(resolveMaintenance(config({ endsAt: fim }), quase).active).toBe(true);
  });

  it('janela inteiramente no passado é "ended", nunca "active"', () => {
    // O fim é conferido ANTES do início de propósito. Se a ordem inverter,
    // uma janela velha volta a bloquear todo mundo.
    const r = resolveMaintenance(config({ startsAt: iso(-10), endsAt: iso(-9) }), AGORA);
    expect(r.status).toBe('ended');
  });

  it('interruptor desligado vence a janela em curso', () => {
    const r = resolveMaintenance(
      config({ enabled: false, startsAt: iso(-1), endsAt: iso(1) }),
      AGORA,
    );
    expect(r).toEqual({ status: 'off', active: false });
  });

  it('falha aberta com config nula ou indefinida', () => {
    expect(resolveMaintenance(null, AGORA).active).toBe(false);
    expect(resolveMaintenance(undefined, AGORA).active).toBe(false);
  });
});

describe('parseMaintenanceConfig — falha aberta', () => {
  it('devolve null para qualquer coisa que não seja um objeto', () => {
    for (const lixo of [null, undefined, 'texto', 42, true, [], [1, 2]]) {
      expect(parseMaintenanceConfig(lixo), String(lixo)).toBeNull();
    }
  });

  it('trata enabled ausente como desligado', () => {
    expect(parseMaintenanceConfig({})?.enabled).toBe(false);
  });

  it('só o booleano true liga — string "true" não conta', () => {
    expect(parseMaintenanceConfig({ enabled: 'true' })?.enabled).toBe(false);
    expect(parseMaintenanceConfig({ enabled: 1 })?.enabled).toBe(false);
    expect(parseMaintenanceConfig({ enabled: true })?.enabled).toBe(true);
  });

  it('data impossível vira null em vez de derrubar a leitura', () => {
    const c = parseMaintenanceConfig({ enabled: true, ends_at: 'banana' });
    expect(c?.endsAt).toBeNull();
    // e sem fim reconhecível a manutenção segue ligada — o desligamento é
    // manual, não acidental.
    expect(resolveMaintenance(c, AGORA).active).toBe(true);
  });

  it('motivo em branco vira null, não string vazia', () => {
    expect(parseMaintenanceConfig({ enabled: true, reason: '   ' })?.reason).toBeNull();
    expect(parseMaintenanceConfig({ enabled: true, reason: ' oi ' })?.reason).toBe('oi');
  });

  it('ida e volta pelo serializer preserva a configuração', () => {
    const original = config({ startsAt: iso(1), endsAt: iso(3) });
    const voltou = parseMaintenanceConfig(serializeMaintenanceConfig(original));
    expect(voltou).toEqual(original);
  });

  it('MAINTENANCE_OFF não bloqueia ninguém', () => {
    expect(resolveMaintenance(MAINTENANCE_OFF, AGORA).active).toBe(false);
  });
});

describe('formatação', () => {
  it('formatarMomento devolve null para entrada inválida', () => {
    expect(formatarMomento(null)).toBeNull();
    expect(formatarMomento('banana')).toBeNull();
  });

  it('diz "hoje às" quando é o mesmo dia', () => {
    const daquiAPouco = new Date(AGORA.getTime() + 60 * 60_000).toISOString();
    expect(formatarMomento(daquiAPouco, AGORA)).toMatch(/^hoje às /);
  });

  it('mostra a data quando não é hoje', () => {
    const outroDia = new Date(AGORA.getTime() + 48 * 3600_000).toISOString();
    expect(formatarMomento(outroDia, AGORA)).not.toMatch(/hoje/);
  });

  it('formatarFaltando não mostra "em 0 min"', () => {
    expect(formatarFaltando(iso(0), AGORA)).toBe('a qualquer momento');
    expect(formatarFaltando(iso(-1), AGORA)).toBe('a qualquer momento');
  });

  it('formatarFaltando dá minutos, horas e dias', () => {
    expect(formatarFaltando(new Date(AGORA.getTime() + 12 * 60_000).toISOString(), AGORA)).toBe(
      'em 12 min',
    );
    expect(formatarFaltando(iso(2), AGORA)).toBe('em 2h');
    expect(
      formatarFaltando(new Date(AGORA.getTime() + 80 * 60_000).toISOString(), AGORA),
    ).toBe('em 1h20');
    expect(formatarFaltando(iso(48), AGORA)).toBe('em 2 dias');
  });
});
