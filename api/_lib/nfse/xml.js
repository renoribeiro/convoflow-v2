// Utilitários de texto para montar o XML da DPS e do evento.

/** Escapa os cinco caracteres reservados do XML. */
export function esc(valor) {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Texto de uma linha: sem caractere de controle, espaços colapsados, aparado e
 * cortado em `max` caracteres. Devolve '' quando não sobra nada.
 */
export function linha(valor, max) {
  if (valor === null || valor === undefined) return '';
  const limpo = String(valor)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return limpo.slice(0, max).trim();
}

/** `<nome>valor</nome>`, ou nada quando o valor é vazio. */
export function el(nome, valor) {
  if (valor === null || valor === undefined || valor === '') return '';
  return `<${nome}>${esc(valor)}</${nome}>`;
}

/** Só os algarismos. */
export function digitos(valor) {
  return String(valor ?? '').replace(/\D/g, '');
}

const FUSO_FORTALEZA_MS = 3 * 60 * 60 * 1000; // UTC-3, sem horário de verão
const dois = (n) => String(n).padStart(2, '0');

/** Data e hora de Fortaleza no formato do leiaute: AAAA-MM-DDThh:mm:ss-03:00. */
export function dataHoraFortaleza(data) {
  const d = new Date(data.getTime() - FUSO_FORTALEZA_MS);
  return (
    `${d.getUTCFullYear()}-${dois(d.getUTCMonth() + 1)}-${dois(d.getUTCDate())}` +
    `T${dois(d.getUTCHours())}:${dois(d.getUTCMinutes())}:${dois(d.getUTCSeconds())}-03:00`
  );
}

/** Data de Fortaleza: AAAA-MM-DD. */
export function dataFortaleza(data) {
  return dataHoraFortaleza(data).slice(0, 10);
}

/** Centavos inteiros → decimal do leiaute (TSDec15V2): 49990 → "499.90". */
export function centavosParaDecimal(centavos) {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error('valor em centavos inválido');
  const reais = Math.floor(centavos / 100);
  return `${reais}.${dois(centavos % 100)}`;
}
