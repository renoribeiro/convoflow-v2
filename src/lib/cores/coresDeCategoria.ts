/**
 * Cores das categorias de bloco do chatbot e de passo da automação.
 *
 * São exceção legítima à regra "só tokens" (lote 7 do checkup): a cor É a
 * categoria, igual nos dois temas, e quem constrói o fluxo aprende a ler por
 * ela. Por isso moram aqui como código de cor, e toda tela que as pinta passa
 * pelo ajuste de contraste de ./tintaLegivel.ts:
 *   - fundo cheio (cabeçalho do bloco, círculo do ícone): a cor escurecida até
 *     o texto branco passar (estiloDoFundoCheio);
 *   - fundo suave (cartão do passo): a cor bem clara e a borda
 *     (estiloDoFundoSuave); o rótulo da categoria na tinta legível de cada
 *     tema (estiloDaTinta com CLASSE_DA_TINTA).
 */
import { CLASSE_DA_TINTA, estiloDaTinta, estiloDoFundoCheio, estiloDoFundoSuave } from './tintaLegivel';

/** Categorias de bloco do chatbot (a paleta do construtor). */
export const CORES_DO_CHATBOT = {
  inicio: '#059669', // verde
  mensagens: '#15803d', // verde escuro
  interacao: '#2563eb', // azul
  condicao: '#9333ea', // roxo
  acoes: '#f97316', // laranja
  finalizar: '#dc2626', // vermelho
} as const;

/** Categorias de passo da automação. */
export const CORES_DA_AUTOMACAO = {
  trigger: '#10b981', // gatilho, verde
  action: '#3b82f6', // ação, azul
  condition: '#f59e0b', // condição, âmbar
  delay: '#64748b', // espera, cinza
} as const;

/** Tudo o que uma tela precisa para pintar uma categoria, já legível. */
export interface PinturaDaCategoria {
  /** Fundo cheio com texto branco: `style`. */
  cheio: Record<string, string>;
  /** Cartão: fundo suave e borda. */
  suave: Record<string, string>;
  /** Só o texto na cor da categoria. Use com `className={CLASSE_DA_TINTA}`. */
  texto: Record<string, string>;
  /** Anel de seleção (com `ring-2`). */
  anel: Record<string, string>;
}

export function pinturaDaCategoria(cor: string): PinturaDaCategoria {
  return {
    cheio: estiloDoFundoCheio(cor),
    suave: estiloDoFundoSuave(cor),
    texto: estiloDaTinta(cor),
    anel: { '--tw-ring-color': cor },
  };
}

export { CLASSE_DA_TINTA };
