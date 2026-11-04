// =============================================================================
// nfse/regras.ts — regras puras da emissão (nota fiscal, parte 2)
// =============================================================================
// Sem Deno e sem rede: o Vitest importa (src/lib/nfse/*.test.ts).
// Decisões do dono (docs/RUNBOOK_nfse_nacional.md):
//   - cancelamento automático só até o dia 10 do mês seguinte ao da emissão
//     (horário de Fortaleza); depois disso, "cancelar_manual";
//   - reembolso parcial nunca cancela sozinho: "cancelar_manual".
// =============================================================================

export type Ambiente = 'restrita' | 'producao';

export type StatusNota =
  | 'aguardando_emissao'
  | 'emitindo'
  | 'emitida'
  | 'erro'
  | 'cancelada'
  | 'cancelar_manual'
  | 'aguardando_prefeitura'
  | 'certificado_vencido';

export type StatusCobranca = StatusNota | 'sem_nota';

/** Estados em que a cobrança ainda espera nota (o worker pega). */
export const STATUS_NA_FILA: readonly StatusCobranca[] = ['aguardando_emissao', 'emitindo', 'erro'];

/** Estados finais: nada mais acontece sem uma pessoa. */
export const STATUS_FINAIS: readonly StatusCobranca[] = ['emitida', 'cancelada', 'cancelar_manual', 'sem_nota'];

const FUSO_MS = 3 * 60 * 60 * 1000; // Fortaleza: UTC-3, sem horário de verão

export function ambienteValido(v: unknown): v is Ambiente {
  return v === 'restrita' || v === 'producao';
}

/**
 * Último instante do cancelamento automático: 23:59:59 do dia 10 do mês
 * seguinte ao da emissão, em Fortaleza.
 */
export function prazoCancelamentoAutomatico(emitidaEm: Date): Date {
  const local = new Date(emitidaEm.getTime() - FUSO_MS);
  const ano = local.getUTCFullYear();
  const mes = local.getUTCMonth();
  // Date.UTC normaliza mês 12 para janeiro do ano seguinte.
  return new Date(Date.UTC(ano, mes + 1, 10, 23, 59, 59) + FUSO_MS);
}

export function dentroDoPrazoDeCancelamento(emitidaEm: Date, agora: Date): boolean {
  return agora.getTime() <= prazoCancelamentoAutomatico(emitidaEm).getTime();
}

export type SituacaoReembolso = 'nenhum' | 'parcial' | 'total';

export function situacaoDoReembolso(pagoCentavos: number, devolvidoCentavos: number): SituacaoReembolso {
  const pago = Number(pagoCentavos) || 0;
  const devolvido = Number(devolvidoCentavos) || 0;
  if (devolvido <= 0) return 'nenhum';
  return devolvido >= pago ? 'total' : 'parcial';
}

export type DecisaoCancelamento = 'cancelar' | 'cancelar_manual' | 'nada';

/** O que fazer com uma nota emitida diante do reembolso da cobrança. */
export function decisaoDeCancelamento(opts: {
  pagoCentavos: number;
  devolvidoCentavos: number;
  emitidaEm: Date;
  agora: Date;
}): DecisaoCancelamento {
  const r = situacaoDoReembolso(opts.pagoCentavos, opts.devolvidoCentavos);
  if (r === 'nenhum') return 'nada';
  if (r === 'parcial') return 'cancelar_manual';
  return dentroDoPrazoDeCancelamento(opts.emitidaEm, opts.agora) ? 'cancelar' : 'cancelar_manual';
}

/** Espera depois da N-ésima tentativa (1 = a primeira falhou). */
const ESPERAS_MIN = [1, 5, 15, 60, 180];
export const ESPERA_LONGA_MIN = 360;

/** A partir de quantas tentativas o superadmin é avisado. */
export const TENTATIVAS_PARA_ALERTA = 3;

export function proximaTentativa(tentativas: number, agora: Date): Date {
  const i = Math.max(0, Math.min(tentativas, ESPERAS_MIN.length + 1) - 1);
  const minutos = ESPERAS_MIN[i] ?? ESPERA_LONGA_MIN;
  return new Date(agora.getTime() + minutos * 60_000);
}

/** numeric do banco (6, "6", "6.00") → "6.00" (TSDec2V2 do leiaute). */
export function percentualParaLeiaute(valor: unknown): string {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n >= 100) throw new Error('pTotTribSN fora de 0 a 99,99');
  return n.toFixed(2);
}

/** Restrita só emite para as Contas de teste; produção emite para toda Conta identificada. */
export function cobrancaNoEscopo(ambiente: Ambiente, tenantId: string | null, contasTeste: readonly string[]): boolean {
  if (ambiente === 'producao') return true;
  return !!tenantId && contasTeste.includes(tenantId);
}

/** Pagamento de cliente de verdade: qualquer um que não seja de Conta de teste, inclusive sem Conta identificada. */
export function cobrancaDeCliente(tenantId: string | null, contasTeste: readonly string[]): boolean {
  return !tenantId || !contasTeste.includes(tenantId);
}

/**
 * A regra da emissão em produção (decisão do dono, 2026-11-04): só com o
 * ambiente em produção nos DOIS lugares e a liberação ligada. Os dados de
 * Fortaleza não entram aqui: são só informação.
 */
export function emissaoEmProducaoPermitida(s: { ambienteSupabase: Ambiente; ambienteVercel: Ambiente | null; liberada: boolean }): boolean {
  return s.ambienteSupabase === 'producao' && s.ambienteVercel === 'producao' && s.liberada === true;
}

export interface Desacordo {
  codigo: 'ambientes_diferentes' | 'producao_sem_liberacao' | 'liberada_no_teste';
  titulo: string;
  mensagem: string;
}

const NOME_DO_AMBIENTE: Record<Ambiente, string> = { restrita: 'teste', producao: 'produção' };

/**
 * Ambiente e liberação que não combinam. `ambienteVercel` null = não deu para
 * saber (o aviso do certificado cobre esse caso). Null de volta = tudo combina.
 */
export function desacordoDaEmissao(s: { ambienteSupabase: Ambiente; ambienteVercel: Ambiente | null; liberada: boolean }): Desacordo | null {
  if (s.ambienteVercel === null) return null;
  if (s.ambienteVercel !== s.ambienteSupabase) {
    return {
      codigo: 'ambientes_diferentes',
      titulo: 'Ambiente da nota fiscal diferente nos dois lugares',
      mensagem: `O ambiente da nota fiscal está em ${NOME_DO_AMBIENTE[s.ambienteSupabase]} no Supabase e em ${NOME_DO_AMBIENTE[s.ambienteVercel]} na Vercel. Enquanto os dois não forem iguais, nenhuma nota sai. Acerte NFSE_AMBIENTE nos dois lugares.`,
    };
  }
  if (s.ambienteSupabase === 'producao' && !s.liberada) {
    return {
      codigo: 'producao_sem_liberacao',
      titulo: 'Produção ligada, emissão desligada',
      mensagem: 'O ambiente da nota fiscal está em produção, mas a chave "Emissão em produção liberada" está desligada. Nenhuma nota sai até você ligar a chave em Faturamento.',
    };
  }
  if (s.ambienteSupabase === 'restrita' && s.liberada) {
    return {
      codigo: 'liberada_no_teste',
      titulo: 'Emissão liberada, ambiente de teste',
      mensagem: 'A chave "Emissão em produção liberada" está ligada, mas o ambiente da nota fiscal é de teste. Nenhuma nota de cliente sai até trocar NFSE_AMBIENTE na Vercel e no Supabase.',
    };
  }
  return null;
}

export interface LeituraDeFortaleza {
  /** aderenteEmissorNacional, como o sistema guarda. Null = ainda não lido. */
  emissorNacional: boolean | null;
  /** situacaoEmissaoPadraoContribuintesRFB. Null = ainda não lido. */
  situacaoRfb: number | null;
}

export interface MudancaDeFortaleza {
  campo: 'aderenteEmissorNacional' | 'situacaoEmissaoPadraoContribuintesRFB';
  de: number;
  para: number;
}

const numeroDoSimNao = (v: boolean | null): number | null => (v === null ? null : v ? 1 : 0);

/** Os campos de Fortaleza que mudaram. A primeira leitura de um campo não é mudança: só guarda o valor. */
export function mudancasDeFortaleza(antes: LeituraDeFortaleza, depois: LeituraDeFortaleza): MudancaDeFortaleza[] {
  const pares: Array<[MudancaDeFortaleza['campo'], number | null, number | null]> = [
    ['aderenteEmissorNacional', numeroDoSimNao(antes.emissorNacional), numeroDoSimNao(depois.emissorNacional)],
    ['situacaoEmissaoPadraoContribuintesRFB', antes.situacaoRfb, depois.situacaoRfb],
  ];
  const mudancas: MudancaDeFortaleza[] = [];
  for (const [campo, de, para] of pares) {
    if (de !== null && para !== null && de !== para) mudancas.push({ campo, de, para });
  }
  return mudancas;
}

/** Data do dia em Fortaleza, AAAA-MM-DD. */
export function diaEmFortaleza(d: Date): string {
  return new Date(d.getTime() - FUSO_MS).toISOString().slice(0, 10);
}

/** Depois de quantas horas um pagamento de cliente sem nota vira aviso, em qualquer ambiente. */
export const HORAS_PARA_ALERTA_DE_ESPERA = 24;

/** Avisos do certificado: 30, 15, 7 e 1 dia antes. Devolve o maior limite já alcançado. */
export const AVISOS_CERTIFICADO_DIAS = [30, 15, 7, 1] as const;

export function avisoDeCertificado(diasRestantes: number): number | 'vencido' | null {
  if (diasRestantes < 0) return 'vencido';
  let alcancado: number | null = null;
  for (const d of AVISOS_CERTIFICADO_DIAS) if (diasRestantes <= d) alcancado = d;
  return alcancado;
}

/** Erros da Sefin que querem dizer "o número desta DPS já virou nota". */
export function dpsJaUsada(erros: Array<{ codigo: string }> | undefined): boolean {
  return (erros ?? []).some((e) => e.codigo === 'E0014');
}

/** Recusa de cancelamento por prazo do município (E0822) ou outra que só uma pessoa resolve. */
export function cancelamentoForaDoPrazo(erros: Array<{ codigo: string }> | undefined): boolean {
  return (erros ?? []).some((e) => e.codigo === 'E0822');
}
