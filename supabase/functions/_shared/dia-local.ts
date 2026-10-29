// =============================================================================
// dia-local.ts — onde começa e termina "hoje" num fuso (por padrão, Brasília)
// =============================================================================
// Regra pura, zero I/O, para o Vitest testar sem Deno.
//
// O DEFEITO QUE ISTO EXISTE PARA CONSERTAR (lote 6b, B6):
//
//   O limite diário da campanha pegava a DATA de Brasília ("2026-10-29") e
//   comparava `sent_at` com "2026-10-29T00:00:00" .. "T23:59:59", SEM fuso.
//   O banco lê isso como UTC: a janela contada ia das 21h de Brasília do dia
//   ANTERIOR às 20h59 de hoje. Das 21h à meia noite o envio caía fora da
//   janela e o limite parava de somar: dava para mandar o limite inteiro de
//   novo nessas três horas.
//
// Decisão D5 do dono (2026-10-29): o limite diário da campanha e o teto de
// aquecimento do número oficial contam o dia de Brasília (meia noite em
// America/Sao_Paulo). A API pública continua contando em UTC, de propósito
// (o dia dela vira às 21h de Brasília, e a documentação diz isso).
//
// O teto de aquecimento conta no banco (instance_outbound_today, migração
// 20261029000002, pela função inicio_do_dia_brasilia). Mantenha as duas
// regras iguais.
// =============================================================================

export const FUSO_BRASILIA = 'America/Sao_Paulo';

/** Diferença (ms) entre o relógio de parede em `tz` e o UTC, no instante `t`. */
function deslocamento(t: number, tz: string): number {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(t));
  const n = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? '0');
  const parede = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return parede - Math.floor(t / 1000) * 1000;
}

/** Ano, mês (1 a 12) e dia do calendário em `tz` no instante `agora`. */
function dataEm(agora: Date, tz: string): { ano: number; mes: number; dia: number } {
  const [ano = 0, mes = 0, dia = 0] = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(agora)
    .split('-')
    .map(Number);
  return { ano, mes, dia };
}

/** O instante UTC da meia noite do dia `ano-mes-dia` em `tz`. */
function meiaNoite(ano: number, mes: number, dia: number, tz: string): Date {
  const palpite = Date.UTC(ano, mes - 1, dia, 0, 0, 0);
  let inicio = palpite - deslocamento(palpite, tz);
  // Se o fuso mudou de deslocamento entre o palpite e a meia noite (horário de
  // verão), a segunda volta acerta.
  inicio = palpite - deslocamento(inicio, tz);
  return new Date(inicio);
}

/**
 * O dia de `tz` que contém `agora`: `inicio` (meia noite, incluída) e `fim`
 * (meia noite seguinte, excluída), como instantes UTC. Para filtrar
 * timestamptz: `>= inicio.toISOString()` e `< fim.toISOString()`.
 */
export function diaLocal(agora: Date = new Date(), tz: string = FUSO_BRASILIA): { inicio: Date; fim: Date } {
  const { ano, mes, dia } = dataEm(agora, tz);
  const inicio = meiaNoite(ano, mes, dia, tz);
  // Date.UTC normaliza o dia 32 para o dia 1 do mês seguinte.
  const amanha = new Date(Date.UTC(ano, mes - 1, dia + 1));
  const fim = meiaNoite(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), tz);
  return { inicio, fim };
}
