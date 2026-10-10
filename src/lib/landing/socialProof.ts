// =============================================================================
// Chaves dos números da página de vendas (pedido do Mário, 2026-10-10)
// =============================================================================
// A página de vendas mostrava números que não temos como provar: "+300% de
// aumento em conversões", "50k+ empresas atendidas", "1M+ mensagens
// processadas" e "Junte-se a mais de 50.000 empresas". Ficam DESLIGADOS até
// existirem números de verdade. O texto continua aqui, para voltar sem caçar
// nada no histórico.
//
// DESLIGADO (false), que é o estado de hoje:
//   - o topo não mostra a faixa de números (some a faixa inteira, nunca um
//     cartão só);
//   - a chamada final mostra CTA_NEUTRAL_SENTENCE no lugar dos "50.000".
//
// PARA LIGAR UM BLOCO DE VOLTA:
//   1. ponha o número real em HERO_STATS ou em CTA_COMPANY_COUNT, abaixo;
//   2. troque a chave dele de false para true:
//        - faixa de números do topo .......... HERO_STATS_ENABLED
//        - frase "mais de X empresas" no fim .. CTA_COMPANY_COUNT_ENABLED
//   3. faça o merge na main e publique a cópia pública
//      (docs/RUNBOOK_copia_publica.md). O site só muda depois do --publicar e
//      do build Ready no Vercel.
// Cada chave liga só o próprio bloco; as duas não dependem uma da outra.
// =============================================================================

/** Faixa de números do topo da página de vendas. */
export const HERO_STATS_ENABLED = false;

/** Frase "Junte-se a mais de X empresas" da chamada final. */
export const CTA_COMPANY_COUNT_ENABLED = false;

/** Qual ícone o cartão usa (o desenho mora no HeroSection). */
export type HeroStatIcon = 'conversoes' | 'empresas' | 'mensagens';

export interface HeroStat {
  icon: HeroStatIcon;
  value: string;
  label: string;
}

/** Os cartões da faixa do topo, na ordem em que aparecem. */
export const HERO_STATS: readonly HeroStat[] = [
  { icon: 'conversoes', value: '+300%', label: 'Aumento em conversões' },
  { icon: 'empresas', value: '50k+', label: 'Empresas atendidas' },
  { icon: 'mensagens', value: '1M+', label: 'Mensagens processadas' },
];

/** O número da frase da chamada final, já escrito como deve aparecer. */
export const CTA_COMPANY_COUNT = '50.000';

/** O que a chamada final diz enquanto a chave dos "X empresas" está desligada. */
export const CTA_NEUTRAL_SENTENCE =
  'Organize o atendimento e as vendas da sua equipe no WhatsApp com o ConvoFlow.';

/**
 * A faixa de números do topo aparece? O parâmetro existe para o teste provar
 * os dois lados da chave.
 */
export function heroStatsOn(enabled: boolean = HERO_STATS_ENABLED): boolean {
  return enabled;
}

/** A frase abaixo do título da chamada final. */
export function ctaSubtitle(enabled: boolean = CTA_COMPANY_COUNT_ENABLED): string {
  return enabled
    ? `Junte-se a mais de ${CTA_COMPANY_COUNT} empresas que já revolucionaram seu atendimento e vendas com o ConvoFlow`
    : CTA_NEUTRAL_SENTENCE;
}
