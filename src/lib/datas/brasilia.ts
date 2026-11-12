/**
 * Dia e hora de Brasília no navegador (lote 6c).
 *
 * A pessoa escolhe "29/10 às 14:00" pensando no relógio de Brasília, que é o
 * relógio da Loja e o que a ajuda promete. O navegador, porém, monta datas no
 * fuso do computador: num computador em outro fuso (ou em UTC) o envio saía em
 * outra hora, e o calendário bloqueava "hoje" a partir das 21h de Brasília,
 * quando o UTC já virou o dia. Toda conta de agendamento passa por aqui.
 *
 * O dia escolhido num calendário é tratado como DIA (ano, mês, dia), não como
 * instante: o react-day-picker devolve a meia noite local daquele dia, e só os
 * três números interessam.
 */

export const FUSO_DE_BRASILIA = 'America/Sao_Paulo';

export interface DiaCivil {
  ano: number;
  /** 1 a 12. */
  mes: number;
  dia: number;
}

const formatoPartes = new Intl.DateTimeFormat('en-US', {
  timeZone: FUSO_DE_BRASILIA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function partesEmBrasilia(instante: Date) {
  const p: Record<string, number> = {};
  for (const parte of formatoPartes.formatToParts(instante)) {
    if (parte.type !== 'literal') p[parte.type] = Number(parte.value);
  }
  return {
    ano: p.year ?? 0,
    mes: p.month ?? 1,
    dia: p.day ?? 1,
    hora: (p.hour ?? 0) % 24,
    minuto: p.minute ?? 0,
    segundo: p.second ?? 0,
  };
}

/** Diferença de Brasília para UTC naquele instante, em minutos (hoje, -180). */
function deslocamentoEmMinutos(instante: Date): number {
  const p = partesEmBrasilia(instante);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  return Math.round((comoUtc - Math.floor(instante.getTime() / 1000) * 1000) / 60_000);
}

/** O dia de Brasília em que o instante cai. */
export function diaEmBrasilia(instante: Date = new Date()): DiaCivil {
  const { ano, mes, dia } = partesEmBrasilia(instante);
  return { ano, mes, dia };
}

/** "HH:mm" no relógio de Brasília. */
export function horaEmBrasilia(instante: Date): string {
  const { hora, minuto } = partesEmBrasilia(instante);
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}

/** "dd/MM HH:mm" no relógio de Brasília. */
export function dataHoraCurtaEmBrasilia(instante: Date): string {
  const p = partesEmBrasilia(instante);
  const dd = String(p.dia).padStart(2, '0');
  const mm = String(p.mes).padStart(2, '0');
  return `${dd}/${mm} ${horaEmBrasilia(instante)}`;
}

/** O dia que o calendário devolveu (meia noite local), só como ano/mês/dia. */
export function diaDoCalendario(data: Date): DiaCivil {
  return { ano: data.getFullYear(), mes: data.getMonth() + 1, dia: data.getDate() };
}

/** O contrário: o Date que o calendário entende para aquele dia. */
export function dataParaCalendario(dia: DiaCivil): Date {
  return new Date(dia.ano, dia.mes - 1, dia.dia);
}

/** Compara dois dias: negativo se `a` vem antes, 0 se iguais. */
export function compararDias(a: DiaCivil, b: DiaCivil): number {
  return a.ano - b.ano || a.mes - b.mes || a.dia - b.dia;
}

/** O dia é anterior a hoje em Brasília? (Hoje NÃO é passado.) */
export function diaJaPassouEmBrasilia(dia: DiaCivil, agora: Date = new Date()): boolean {
  return compararDias(dia, diaEmBrasilia(agora)) < 0;
}

/**
 * O instante de "dia às HH:mm, hora de Brasília". Devolve null para hora
 * malformada. Funciona em qualquer fuso do computador.
 */
export function instanteEmBrasilia(dia: DiaCivil, hora: string): Date | null {
  const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(hora.trim());
  if (!m) return null;
  const comoUtc = Date.UTC(dia.ano, dia.mes - 1, dia.dia, Number(m[1]), Number(m[2]), 0, 0);
  // Primeiro palpite com o deslocamento daquele momento; a segunda volta só
  // muda algo se o fuso tiver trocado de regra entre o palpite e o resultado.
  let instante = comoUtc - deslocamentoEmMinutos(new Date(comoUtc)) * 60_000;
  instante = comoUtc - deslocamentoEmMinutos(new Date(instante)) * 60_000;
  return new Date(instante);
}

/**
 * "dia às HH:mm" de Brasília ainda está no futuro? É a regra do agendamento:
 * hoje vale, desde que a hora não tenha passado.
 */
export function horarioNoFuturo(dia: DiaCivil, hora: string, agora: Date = new Date()): boolean {
  const instante = instanteEmBrasilia(dia, hora);
  return !!instante && instante.getTime() > agora.getTime();
}

// ---------------------------------------------------------------------------
// Dias inteiros de Brasília para relatórios (2026-11-12, Rastreamento e
// Dashboard). O dia vira à meia noite de Brasília, qualquer que seja o fuso do
// computador; antes, os gráficos viravam o dia às 21h (meia noite UTC).
// ---------------------------------------------------------------------------

/** "AAAA-MM-DD" do dia civil (o formato que o banco devolve em colunas `date`). */
export function diaIso(dia: DiaCivil): string {
  return `${String(dia.ano).padStart(4, '0')}-${String(dia.mes).padStart(2, '0')}-${String(dia.dia).padStart(2, '0')}`;
}

/** O contrário de diaIso. Aceita também um carimbo completo: usa só os 10 primeiros caracteres. */
export function diaDeIso(iso: string): DiaCivil {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { ano: a ?? 0, mes: m ?? 1, dia: d ?? 1 };
}

/** Soma (ou subtrai) dias de calendário. Não depende de fuso: é conta de calendário. */
export function somarDias(dia: DiaCivil, n: number): DiaCivil {
  const t = new Date(Date.UTC(dia.ano, dia.mes - 1, dia.dia + n));
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() };
}

/** Quantos dias de `de` até `ate`, contando os dois (de 01/11 a 12/11 são 12). */
export function diasNoIntervalo(de: DiaCivil, ate: DiaCivil): number {
  const a = Date.UTC(de.ano, de.mes - 1, de.dia);
  const b = Date.UTC(ate.ano, ate.mes - 1, ate.dia);
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Meia noite de Brasília do dia (o instante em que o dia começa). */
export function inicioDoDiaEmBrasilia(dia: DiaCivil): Date {
  return instanteEmBrasilia(dia, '00:00') as Date;
}

/** Último milissegundo do dia de Brasília. */
export function fimDoDiaEmBrasilia(dia: DiaCivil): Date {
  return new Date(inicioDoDiaEmBrasilia(somarDias(dia, 1)).getTime() - 1);
}

/** "dd/MM" de um dia "AAAA-MM-DD" sem passar por Date (new Date('2026-11-12') é meia noite UTC, 11/11 em Brasília). */
export function rotuloDiaCurto(iso: string): string {
  const d = diaDeIso(iso);
  return `${String(d.dia).padStart(2, '0')}/${String(d.mes).padStart(2, '0')}`;
}

/** "dd/MM/AAAA" de um dia "AAAA-MM-DD". */
export function rotuloDiaLongo(iso: string): string {
  const d = diaDeIso(iso);
  return `${rotuloDiaCurto(iso)}/${d.ano}`;
}
