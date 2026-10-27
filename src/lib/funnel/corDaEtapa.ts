/**
 * A cor da etapa do funil, do jeito que o selo e o contador conseguem pintar.
 *
 * `funnel_stages.color` guarda três formatos, conforme quem gravou:
 *   - o nome da cor escolhida em "Configurar etapas" ('blue', 'green'...);
 *   - um código de cor ('#3b82f6'), de etapas antigas;
 *   - uma classe pronta ('bg-gray-100 text-gray-800'), padrão antigo do quadro.
 * Até o lote 5 do checkup (achado 54) as telas montavam `${cor}20` como se
 * fosse sempre código de cor: com o nome, saía "blue20" e o selo ficava sem
 * cor nenhuma. Esta função não muda o que está gravado, só lê os três.
 */
import { CLASSE_DA_TINTA, estiloDaTinta } from '@/lib/cores/tintaLegivel';

export const CORES_DE_ETAPA = [
  { name: 'Azul', value: 'blue', class: 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800' },
  { name: 'Verde', value: 'green', class: 'bg-green-100 text-green-800 border-green-300 dark:bg-green-950 dark:text-green-200 dark:border-green-800' },
  { name: 'Amarelo', value: 'yellow', class: 'bg-yellow-100 text-yellow-800 border-yellow-300 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800' },
  { name: 'Laranja', value: 'orange', class: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800' },
  { name: 'Roxo', value: 'purple', class: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800' },
  { name: 'Rosa', value: 'pink', class: 'bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950 dark:text-pink-200 dark:border-pink-800' },
] as const;

const NEUTRA = 'bg-muted text-foreground border-border';

export interface PinturaDaEtapa {
  /** Classes do Tailwind (vazio quando a cor vem em `style`). */
  className: string;
  /** Código de cor gravado: pinta por estilo; o texto usa a tinta legível da cor. */
  style?: Record<string, string>;
}

export function corDaEtapa(cor: string | null | undefined): PinturaDaEtapa {
  const valor = (cor ?? '').trim();
  if (!valor) return { className: NEUTRA };
  const nomeada = CORES_DE_ETAPA.find((c) => c.value === valor);
  if (nomeada) return { className: nomeada.class };
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(valor)) {
    // Fundo claro da própria cor; o texto é a mesma cor ajustada até passar
    // no contraste mínimo (a cor pura não passava em metade das cores).
    const seis = valor.length === 4 ? `#${[...valor.slice(1)].map((x) => x + x).join('')}` : valor;
    return { className: CLASSE_DA_TINTA, style: { backgroundColor: `${seis}26`, borderColor: seis, ...estiloDaTinta(seis) } };
  }
  if (/\bbg-/.test(valor)) return { className: valor };
  return { className: NEUTRA };
}
