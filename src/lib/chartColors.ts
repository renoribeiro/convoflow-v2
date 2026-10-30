/**
 * Paleta de cores para gráficos (recharts) derivada da marca ConvoFlow.
 *
 * Fonte da verdade para TODAS as séries de dados em gráficos/analytics.
 * Não use cor escrita à mão em componentes de gráfico: importe daqui.
 *
 * Desde o lote 7 ("Cores e tema escuro") cada cor é um token (--chart-1 a
 * --chart-8 e os de situação em src/index.css), que troca sozinho entre o tema
 * claro e o escuro. No claro a lima pura sumia no branco; agora a série 1 é a
 * lima escura no claro e a lima da marca no escuro. O recharts aceita
 * `hsl(var(--x))` em fill e stroke.
 */
const token = (nome: string) => `hsl(var(--${nome}))`;

/** Cores-âncora da marca. */
export const BRAND_CHART = {
  primary: token('chart-1'), // Lima
  secondary: token('chart-2'), // Lilás
  support: token('chart-3'), // Oliva
} as const;

/**
 * Série de cores para múltiplos conjuntos de dados (pizza, barras agrupadas, etc.).
 * 8 tons distinguíveis ancorados na identidade (lima → lilás → oliva + complementares).
 */
export const CHART_SERIES: string[] = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => token(`chart-${n}`));

/** Cores semânticas de situação: os mesmos tokens das telas (--success/--warning/--error/--info). */
export const CHART_STATUS = {
  success: token('success'),
  warning: token('warning'),
  error: token('destructive'),
  info: token('info'),
  neutral: token('muted-foreground'),
} as const;

/** Retorna a cor da série pelo índice, repetindo ciclicamente quando necessário. */
export const getChartColor = (index: number): string =>
  CHART_SERIES[index % CHART_SERIES.length] ?? CHART_SERIES[0]!;
