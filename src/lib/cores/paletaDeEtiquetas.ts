/**
 * Cores padrão oferecidas para etiqueta (defaults no código). A cor escolhida
 * é GRAVADA no banco e pinta a etiqueta nos dois temas, por isso é código de
 * cor e não token: quem deixa o texto legível é src/lib/cores/tintaLegivel.ts.
 * Registros já salvos mantêm a cor que a pessoa escolheu.
 *
 * Até o lote 7 estas cores moravam em src/lib/chartColors.ts, junto das séries
 * dos gráficos; os gráficos passaram para os tokens --chart-*.
 */
export const TAG_PALETTE: string[] = [
  '#DAE27C', // Lima (primária)
  '#7777D8', // Lilás (secundária)
  '#49511D', // Oliva (apoio)
  '#B0B85C', // Lima escura
  '#A89FE6', // Lilás claro
  '#8A8F3E', // Oliva média
  '#C9A24B', // Dourado quente
  '#5D8C7B', // Verde-azulado suave
];
