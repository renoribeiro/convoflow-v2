/**
 * A fila da nota fiscal com banco, Sefin, arquivos e email simulados em memória,
 * para os testes de src/lib/nfse. Dados inventados.
 */
import type { Cobranca, Config, DadosFiscais, Nota, Portas } from '../../supabase/functions/_shared/nfse/worker-core.ts';
import type { AcaoNfse, RespostaNfse } from '../../supabase/functions/_shared/nfse/cliente-vercel.ts';
import type { Ambiente } from '../../supabase/functions/_shared/nfse/regras.ts';
import { NFSE_XML_FICTICIA } from '@/lib/nfse/fixturesNfse';

export const CONTA_TESTE = 'aaaaaaaa-0000-4000-8000-000000000001';
export const OUTRA_CONTA = 'aaaaaaaa-0000-4000-8000-000000000002';
export const CHAVE = '23044002211222333000181000000000000126103630269879';

export function cobranca(id: string, extra: Partial<Cobranca> = {}): Cobranca {
  return {
    id,
    tenant_id: CONTA_TESTE,
    stripe_invoice_id: `in_FAKE_${id}`,
    amount_paid_cents: 49990,
    amount_refunded_cents: 0,
    paid_at: '2026-10-16T15:00:00Z',
    period_start: '2026-10-16T15:00:00Z',
    period_end: '2026-11-16T15:00:00Z',
    nota_status: 'aguardando_emissao',
    fatura_itens: null,
    ...extra,
  };
}

export const DADOS: DadosFiscais = {
  tenant_id: CONTA_TESTE,
  person_type: 'cpf',
  tax_id: '11144477735',
  legal_name: 'Cliente Inventado',
  cep: '60060170',
  street: 'Rua de Teste',
  number: '10',
  complement: null,
  district: 'Centro',
  city: 'Fortaleza',
  city_ibge_code: '2304400',
  state: 'CE',
  invoice_email: 'cliente@example.com',
};

export type Resposta = RespostaNfse | ((dados: Record<string, unknown>) => RespostaNfse);

/** Resposta boa da ação certificado: a que a função da Vercel dá quando os ambientes combinam. */
export const CERTIFICADO_OK: RespostaNfse = { resultado: 'ok', validoAte: '2027-09-21T00:00:00Z', diasRestantes: 339 };

export interface OpcoesDoMontar {
  ambiente?: Ambiente;
  /** O NFSE_AMBIENTE da Vercel. Ausente = igual ao do Supabase. Diferente: recusa como a função de verdade. */
  ambienteVercel?: Ambiente;
  respostas?: Partial<Record<AcaoNfse, Resposta[]>>;
  agora?: Date;
  config?: Partial<Config>;
  cobrancas?: Cobranca[];
  dados?: DadosFiscais;
  itensDaFatura?: Portas['itensDaFatura'];
}

export function montar(opts: OpcoesDoMontar = {}) {
  const ambiente = opts.ambiente ?? 'restrita';
  const ambienteVercel = opts.ambienteVercel ?? ambiente;
  let agora = opts.agora ?? new Date('2026-10-16T16:00:00Z');
  const cobrancas = new Map<string, Cobranca>((opts.cobrancas ?? [cobranca('c1')]).map((c) => [c.id, c]));
  const notas = new Map<string, Nota>();
  const sequencia: Record<Ambiente, number> = { restrita: 0, producao: 0 };
  const config: Config = {
    p_tot_trib_sn: '6.00',
    ambiente_ativo: ambiente,
    certificado_valido_ate: null,
    prefeitura_emissor_nacional: true,
    prefeitura_lida_em: agora.toISOString(),
    diario_rodado_em: '2026-10-16',
    emissao_producao_liberada: false,
    ...opts.config,
  };
  const chamadas: Array<{ acao: AcaoNfse; dados: Record<string, unknown> }> = [];
  const arquivos = new Map<string, Uint8Array | string>();
  const emails: Array<{ para: string[]; assunto: string; anexos?: unknown[] }> = [];
  const avisos: string[] = [];
  const avisosDetalhe: Array<{ chave: string; titulo: string; mensagem: string; emails?: string[] }> = [];
  const filas = { ...(opts.respostas ?? {}) };

  const portas: Portas = {
    ambiente,
    contasTeste: [CONTA_TESTE],
    emailTeste: 'teste@example.com',
    emailAvisos: 'dono@example.com',
    agora: () => agora,
    banco: {
      async config() { return { ...config }; },
      async atualizarConfig(p) { Object.assign(config, p); },
      async candidatas(amb, limite) {
        return [...cobrancas.values()]
          .filter((c) => ['aguardando_emissao', 'emitindo', 'erro'].includes(c.nota_status) && c.amount_paid_cents > 0)
          .map((c) => ({ cobranca: { ...c }, nota: [...notas.values()].find((n) => n.charge_id === c.id && n.ambiente === amb) ?? null }))
          .filter(({ nota }) => !nota || ((!nota.proxima_tentativa_em || new Date(nota.proxima_tentativa_em) <= agora) && (!nota.travada_ate || new Date(nota.travada_ate) < agora)))
          .slice(0, limite);
      },
      async cobranca(id) { const c = cobrancas.get(id); return c ? { ...c } : null; },
      async dadosFiscais(t) { return t === CONTA_TESTE || t === OUTRA_CONTA ? { ...(opts.dados ?? DADOS), tenant_id: t } : null; },
      async reservarNota(chargeId, amb) {
        const existente = [...notas.values()].find((n) => n.charge_id === chargeId && n.ambiente === amb);
        if (existente) return { ...existente };
        sequencia[amb] += 1;
        const n: Nota = {
          id: `n${notas.size + 1}`, charge_id: chargeId, tenant_id: cobrancas.get(chargeId)!.tenant_id, ambiente: amb,
          numero_dps: sequencia[amb], id_dps: null, status: 'aguardando_emissao', chave_acesso: null, numero_nfse: null,
          valor_centavos: null, emitida_em: null, xml_path: null, pdf_path: null, email_enviado_em: null, email_tentativas: 0,
          tentativas: 0, proxima_tentativa_em: null, verificar_antes_de_reenviar: false, travada_ate: null,
        };
        notas.set(n.id, n);
        return { ...n };
      },
      async nota(id) { const n = notas.get(id); return n ? { ...n } : null; },
      async travar(id, ate, ag) {
        const n = notas.get(id)!;
        if (n.travada_ate && new Date(n.travada_ate) >= ag) return false;
        n.travada_ate = ate.toISOString();
        return true;
      },
      async atualizarNota(id, p) { Object.assign(notas.get(id)!, p); },
      async atualizarCobranca(id, p) { Object.assign(cobrancas.get(id)!, p); },
      async emitidasComReembolso(amb) {
        return [...notas.values()]
          .filter((n) => n.ambiente === amb && n.status === 'emitida' && cobrancas.get(n.charge_id)!.amount_refunded_cents > 0)
          .map((n) => ({ nota: { ...n }, cobranca: { ...cobrancas.get(n.charge_id)! } }));
      },
      async semEmail(amb) { return [...notas.values()].filter((n) => n.ambiente === amb && n.status === 'emitida' && !n.email_enviado_em && n.pdf_path && n.email_tentativas < 3).map((n) => ({ ...n })); },
      async cobrancasNoEstado(estados) { return [...cobrancas.values()].filter((c) => estados.includes(c.nota_status)); },
      async pagasSemTentativa(amb, ate) {
        return [...cobrancas.values()].filter((c) => c.amount_paid_cents > 0 && new Date(c.paid_at) < ate && !['emitida', 'cancelada', 'cancelar_manual', 'sem_nota'].includes(c.nota_status) && ![...notas.values()].some((n) => n.charge_id === c.id && n.ambiente === amb));
      },
      async paradas(ate) { return [...cobrancas.values()].filter((c) => new Date(c.paid_at) < ate && ['aguardando_emissao', 'emitindo', 'erro'].includes(c.nota_status)); },
      async esperandoNota(ate) {
        return [...cobrancas.values()].filter((c) => c.amount_paid_cents > 0 && new Date(c.paid_at) < ate && !['emitida', 'cancelada', 'cancelar_manual', 'sem_nota'].includes(c.nota_status));
      },
    },
    nfse: {
      async chamar(acao, dados = {}) {
        chamadas.push({ acao, dados });
        // Igual à função de verdade: pedido de outro ambiente volta 409, e o cliente vira 'incerta'.
        if (ambienteVercel !== ambiente) {
          return { resultado: 'incerta', detalhe: 'função recusou: ambiente_diferente', ambienteFuncao: ambienteVercel };
        }
        const fila = filas[acao] ?? [];
        const r = fila.length > 1 ? fila.shift()! : fila[0];
        if (!r) throw new Error(`resposta não prevista para ${acao}`);
        return typeof r === 'function' ? r(dados) : r;
      },
    },
    arquivos: {
      async salvar(c, conteudo) { arquivos.set(c, conteudo); },
      async urlAssinada(c, s) { return `https://exemplo.com.br/assinada/${c}?s=${s}`; },
      async baixar(c) { const v = arquivos.get(c); return v === undefined ? null : typeof v === 'string' ? new TextEncoder().encode(v) : v; },
    },
    email: { async enviar(m) { emails.push(m); return 're_FAKE_1'; } },
    avisos: {
      async superadmin(chave, titulo, mensagem, opts) {
        if (avisos.includes(chave)) return false;
        avisos.push(chave);
        avisosDetalhe.push({ chave, titulo, mensagem, emails: opts?.emails });
        return true;
      },
    },
    gerarPdf: async (_xml, o) => new TextEncoder().encode(o.cancelada ? 'PDF CANCELADA' : 'PDF'),
    itensDaFatura: opts.itensDaFatura ?? (async () => ({ lojas_extras: 1, atendentes_extras: 0, ajuste_proporcional: false })),
    codigoIbge: async () => '2304400',
    log: () => {},
  };
  return {
    portas, cobrancas, notas, chamadas, arquivos, emails, avisos, avisosDetalhe, config,
    andar(minutos: number) { agora = new Date(agora.getTime() + minutos * 60_000); },
  };
}

export const EMITIDA: RespostaNfse = { resultado: 'emitida', idDps: 'DPS' + '2'.repeat(42), chaveAcesso: CHAVE, nfseXml: NFSE_XML_FICTICIA, alertas: [] };
export const ENCONTRADA: RespostaNfse = { resultado: 'encontrada', idDps: 'DPS' + '2'.repeat(42), chaveAcesso: CHAVE, nfseXml: NFSE_XML_FICTICIA };
