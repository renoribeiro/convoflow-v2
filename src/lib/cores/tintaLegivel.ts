/**
 * Texto na cor que a pessoa escolheu (etiqueta, etapa), mas legível.
 *
 * A etiqueta pinta o próprio nome com a cor dela. Verde, amarelo e laranja
 * claros sobre fundo branco ficavam abaixo do contraste mínimo (AA, 4,5:1).
 * Lote 5 do checkup: o texto passa a usar a MESMA cor, escurecida no tema
 * claro e clareada no escuro só até passar. Fundo e borda continuam a cor
 * escolhida. Nada muda no que está gravado.
 */

type Rgb = [number, number, number];

function hexParaRgb(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const cod = m[1] ?? '';
  const h = cod.length === 3 ? [...cod].map((x) => x + x).join('') : cod;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as Rgb;
}

const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminancia = ([r, g, b]: Rgb) => 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
export const contraste = (a: Rgb, b: Rgb) => {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

function rgbParaHsl([r, g, b]: Rgb): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

const paraHex = (rgb: Rgb) => `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, '0')).join('')}`;

/**
 * Fundos de referência. O selo pinta o próprio fundo com a cor a ~15% por
 * cima do que está atrás; o pior caso claro é a linha "não lida" de Conversas
 * (lima clara, --unread-bg-hover), o escuro é o card do tema escuro.
 */
const ATRAS_CLARO: Rgb = hslParaRgb(84, 0.56, 0.85);
const ATRAS_ESCURO: Rgb = [0.13, 0.125, 0.1];
const OPACIDADE_DO_FUNDO = 0.16;
const MINIMO = 4.6;

const misturar = ([r, g, b]: Rgb, [ar, ag, ab]: Rgb, a: number): Rgb => [
  r * a + ar * (1 - a),
  g * a + ag * (1 - a),
  b * a + ab * (1 - a),
];

/** O fundo do selo nos dois temas, no pior caso (exportado para o teste). */
export function fundosDoSelo(cor: string): { claro: Rgb; escuro: Rgb } | null {
  const rgb = hexParaRgb(cor);
  if (!rgb) return null;
  return { claro: misturar(rgb, ATRAS_CLARO, OPACIDADE_DO_FUNDO), escuro: misturar(rgb, ATRAS_ESCURO, OPACIDADE_DO_FUNDO) };
}

function ajustar(rgb: Rgb, fundo: Rgb, passo: number): Rgb {
  const [h, s, l0] = rgbParaHsl(rgb);
  let l = l0;
  let atual = rgb;
  while (contraste(atual, fundo) < MINIMO && (passo < 0 ? l > 0 : l < 1)) {
    l = Math.min(1, Math.max(0, l + passo));
    atual = hslParaRgb(h, s, l);
  }
  return atual;
}

export interface TintaLegivel {
  /** Texto no tema claro. */
  clara: string;
  /** Texto no tema escuro. */
  escura: string;
}

/** As duas tintas do texto; `null` quando a cor gravada não é um código de cor. */
export function tintaLegivel(cor: string | null | undefined): TintaLegivel | null {
  const rgb = cor ? hexParaRgb(cor) : null;
  if (!rgb) return null;
  const { claro, escuro } = fundosDoSelo(cor as string)!;
  return { clara: paraHex(ajustar(rgb, claro, -0.02)), escura: paraHex(ajustar(rgb, escuro, 0.02)) };
}

/**
 * Estilo pronto para o texto: duas variáveis que as classes
 * `text-[var(--tinta-clara)] dark:text-[var(--tinta-escura)]` leem.
 */
export function estiloDaTinta(cor: string | null | undefined): Record<string, string> {
  const t = tintaLegivel(cor);
  return t ? { '--tinta-clara': t.clara, '--tinta-escura': t.escura } : {};
}

export const CLASSE_DA_TINTA = 'text-[var(--tinta-clara)] dark:text-[var(--tinta-escura)]';
