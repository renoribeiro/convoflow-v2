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

/** Data do dia em Fortaleza, AAAA-MM-DD. */
export function diaEmFortaleza(d: Date): string {
  return new Date(d.getTime() - FUSO_MS).toISOString().slice(0, 10);
}

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
