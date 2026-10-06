/**
 * Paleta de cores para gráficos (recharts) derivada da marca ConvoFlow.
 *
 * Fonte da verdade para TODAS as séries de dados em gráficos/analytics.
 * Não use hex hardcoded em componentes de gráfico — importe daqui.
 *
 * Marca base:
 *   Primária #DAE27C (lima) · Secundária #7777D8 (lilás) · Apoio #49511D (oliva)
 */

/** Cores-âncora da marca. */
export const BRAND_CHART = {
  primary: "#DAE27C", // Lima
  secondary: "#7777D8", // Lilás
  support: "#49511D", // Oliva
} as const;

/**
 * Série de cores para múltiplos conjuntos de dados (pizza, barras agrupadas, etc.).
 * 8 tons distinguíveis ancorados na identidade (lima → lilás → oliva + complementares).
 */
export const CHART_SERIES: string[] = [
  "#DAE27C", // 1. Lima (primária)
  "#7777D8", // 2. Lilás (secundária)
  "#49511D", // 3. Oliva (apoio)
  "#B0B85C", // 4. Lima escura
  "#A89FE6", // 5. Lilás claro
  "#8A8F3E", // 6. Oliva média
  "#C9A24B", // 7. Dourado quente (complementar)
  "#5D8C7B", // 8. Verde-azulado suave (complementar frio)
];

/** Cores semânticas de status, alinhadas aos tokens CSS (--success/--warning/--error/--info). */
export const CHART_STATUS = {
  success: "#6E9A37", // verde-lima (hsl 84 46% 40%)
  warning: "#EB9A0A", // âmbar (hsl 38 92% 48%)
  error: "#DF4444", // vermelho (hsl 0 75% 55%)
  info: "#6B6BD6", // lilás-azul (hsl 240 55% 62%)
  neutral: "#9CA08A", // cinza-oliva neutro
} as const;

/** Retorna a cor da série pelo índice, repetindo ciclicamente quando necessário. */
export const getChartColor = (index: number): string =>
  CHART_SERIES[index % CHART_SERIES.length] ?? CHART_SERIES[0]!;

/**
 * Paleta padrão de etiquetas/tags (defaults no código; registros já salvos no banco
 * mantêm a cor escolhida pelo usuário).
 */
export const TAG_PALETTE: string[] = CHART_SERIES;
