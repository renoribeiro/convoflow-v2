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

/**
 * As cores oferecidas em "Configurar etapas". O nome é o que vai para o banco;
 * o código de cor é o que pinta. Lote 7: o nome passa pelo mesmo ajuste de
 * contraste do código de cor (fundo claro da cor, texto na tinta legível de
 * cada tema), no lugar das classes fixas de antes.
 */
export const CORES_DE_ETAPA = [
  { name: 'Azul', value: 'blue', hex: '#3b82f6' },
  { name: 'Verde', value: 'green', hex: '#16a34a' },
  { name: 'Amarelo', value: 'yellow', hex: '#eab308' },
  { name: 'Laranja', value: 'orange', hex: '#f97316' },
  { name: 'Roxo', value: 'purple', hex: '#9333ea' },
  { name: 'Rosa', value: 'pink', hex: '#ec4899' },
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
  const codigo = nomeada ? nomeada.hex : valor;
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(codigo)) {
    // Fundo claro da própria cor; o texto é a mesma cor ajustada até passar
    // no contraste mínimo (a cor pura não passava em metade das cores).
    const seis = codigo.length === 4 ? `#${[...codigo.slice(1)].map((x) => x + x).join('')}` : codigo;
    return { className: CLASSE_DA_TINTA, style: { backgroundColor: `${seis}26`, borderColor: seis, ...estiloDaTinta(seis) } };
  }
  if (/\bbg-/.test(valor)) return { className: valor };
  return { className: NEUTRA };
}
