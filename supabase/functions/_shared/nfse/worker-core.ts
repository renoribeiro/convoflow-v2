// =============================================================================
// nfse/worker-core.ts — a fila da nota fiscal (parte 2), sem Deno e sem rede
// =============================================================================
// Todo I/O entra por `Portas` (banco, função da Vercel, arquivos, e-mail,
// avisos, PDF, Stripe, IBGE): o Vitest simula timeout, E0014, reembolso e
// corrida sem tocar em nada real. Quem liga às peças de verdade é
// _shared/nfse/adaptadores.ts (nfse-worker e nfse-admin).
//
// REGRAS QUE ESTE ARQUIVO GARANTE
//   1. Número reservado ANTES de mandar (nfse_reservar_numero) e nunca
//      trocado: a cobrança fica com o mesmo Id de DPS para sempre.
//   2. Antes de cada envio, `verificar_antes_de_reenviar` vira true; só volta a
//      false com resposta certa (emitida ou recusa da Sefin). Com true, o
//      próximo ciclo CONSULTA a DPS (GET /dps/{id}) antes de mandar de novo.
//   3. E0014 (número já virou nota) também consulta e recupera a nota —
//      conferindo valor e tomador; se não bater, para e avisa.
//   4. Uma cobrança por vez: trava (travada_ate) tomada por UPDATE condicional.
//   5. Restrita só emite para as Contas de teste, e o e-mail vai só para o
//      endereço de teste. Produção só emite com Fortaleza ligada no Emissor
//      Nacional; desligada = aguardando_prefeitura + aviso.
//   6. Reembolso total dentro do prazo (dia 10 do mês seguinte) cancela;
//      fora do prazo ou parcial = cancelar_manual + aviso.
// =============================================================================

import {
  avisoDeCertificado,
  cancelamentoForaDoPrazo,
  cobrancaNoEscopo,
  decisaoDeCancelamento,
  dentroDoPrazoDeCancelamento,
  diaEmFortaleza,
  dpsJaUsada,
  percentualParaLeiaute,
  proximaTentativa,
  situacaoDoReembolso,
  TENTATIVAS_PARA_ALERTA,
  type Ambiente,
  type StatusCobranca,
  type StatusNota,
} from './regras.ts';
import { dataBr, descricaoDoServico, ultimoDiaDoPeriodo, type ItensDaFatura } from './descricao.ts';
import type { ClienteNfse, ErroSefin, RespostaNfse } from './cliente-vercel.ts';
import { valor } from './xml-leitura.ts';
import { emailDaNota, VALIDADE_LINK_S } from './email.ts';

// -----------------------------------------------------------------------------
// Linhas do banco
// -----------------------------------------------------------------------------

export interface Cobranca {
  id: string;
  tenant_id: string | null;
  stripe_invoice_id: string;
  amount_paid_cents: number;
  amount_refunded_cents: number;
  paid_at: string;
  period_start: string | null;
  period_end: string | null;
  nota_status: StatusCobranca;
  fatura_itens: ItensDaFatura | null;
}

export interface DadosFiscais {
  tenant_id: string;
  person_type: 'cpf' | 'cnpj';
  tax_id: string;
  legal_name: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  city_ibge_code: string | null;
  state: string;
  invoice_email: string;
}

export interface Nota {
  id: string;
  charge_id: string;
  tenant_id: string | null;
  ambiente: Ambiente;
  numero_dps: number;
  id_dps: string | null;
  status: StatusNota;
  chave_acesso: string | null;
  numero_nfse: string | null;
  valor_centavos: number | null;
  emitida_em: string | null;
  xml_path: string | null;
  pdf_path: string | null;
  email_enviado_em: string | null;
  email_tentativas: number;
  tentativas: number;
  proxima_tentativa_em: string | null;
  verificar_antes_de_reenviar: boolean;
  travada_ate: string | null;
  ultimo_erro_codigo?: string | null;
  ultimo_erro_mensagem?: string | null;
  email_resend_id?: string | null;
}

export interface Config {
  p_tot_trib_sn: number | string;
  ambiente_ativo: Ambiente;
  certificado_valido_ate: string | null;
  prefeitura_emissor_nacional: boolean | null;
  prefeitura_lida_em: string | null;
  diario_rodado_em: string | null;
  prefeitura_producao_emissor_nacional?: boolean | null;
  prefeitura_producao_lida_em?: string | null;
}

// -----------------------------------------------------------------------------
// Portas
// -----------------------------------------------------------------------------

export interface PortaBanco {
  config(): Promise<Config>;
  atualizarConfig(patch: Partial<Config>): Promise<void>;
  /** Cobranças pagas (> 0) com nota_status na fila, mais antigas primeiro, com a nota do ambiente. */
  candidatas(ambiente: Ambiente, limite: number): Promise<Array<{ cobranca: Cobranca; nota: Nota | null }>>;
  cobranca(id: string): Promise<Cobranca | null>;
  dadosFiscais(tenantId: string): Promise<DadosFiscais | null>;
  reservarNota(chargeId: string, ambiente: Ambiente): Promise<Nota>;
  nota(id: string): Promise<Nota | null>;
  /** UPDATE condicional: true se pegou a trava (livre ou vencida). */
  travar(notaId: string, ate: Date, agora: Date): Promise<boolean>;
  atualizarNota(id: string, patch: Partial<Nota> & Record<string, unknown>): Promise<void>;
  atualizarCobranca(id: string, patch: Partial<Cobranca> & Record<string, unknown>): Promise<void>;
  /** Notas emitidas do ambiente cuja cobrança tem reembolso. */
  emitidasComReembolso(ambiente: Ambiente): Promise<Array<{ cobranca: Cobranca; nota: Nota }>>;
  /** Notas emitidas do ambiente sem e-mail mandado (e com menos de 3 tentativas). */
  semEmail(ambiente: Ambiente): Promise<Nota[]>;
  /** Cobranças de um estado (para a checagem diária). */
  cobrancasNoEstado(estados: StatusCobranca[]): Promise<Cobranca[]>;
  /** Pagas (> 0), antes de `ate`, sem nota no ambiente e sem estado final. */
  pagasSemTentativa(ambiente: Ambiente, ate: Date): Promise<Cobranca[]>;
  /** Na fila desde antes de `ate`. */
  paradas(ate: Date): Promise<Cobranca[]>;
}

export interface PortaArquivos {
  salvar(caminho: string, conteudo: Uint8Array | string, tipo: 'application/pdf' | 'application/xml'): Promise<void>;
  urlAssinada(caminho: string, segundos: number): Promise<string>;
  baixar(caminho: string): Promise<Uint8Array | null>;
}

export interface PortaEmail {
  /** Devolve o id do e-mail no provedor (Resend), quando houver. */
  enviar(m: { para: string[]; assunto: string; html: string; anexos?: Array<{ nome: string; base64: string }> }): Promise<string | null>;
}

export interface PortaAvisos {
  /** Sino + e-mail aos superadmins, uma vez por `chave`. Devolve true se avisou agora. */
  /** Sem `emails`, o e-mail vai aos superadmins; com `emails`, vai só a esses endereços (o sino vai sempre aos superadmins). */
  superadmin(chave: string, titulo: string, mensagem: string, opts?: { emails?: string[] }): Promise<boolean>;
}

export interface Portas {
  ambiente: Ambiente;
  contasTeste: string[];
  emailTeste: string | null;
  /** Para onde vai o aviso de "Fortaleza ligou" (secret NFSE_EMAIL_AVISOS). */
  emailAvisos?: string | null;
  agora: () => Date;
  banco: PortaBanco;
  nfse: ClienteNfse;
  arquivos: PortaArquivos;
  email: PortaEmail;
  avisos: PortaAvisos;
  gerarPdf: (xml: string, opts: { cancelada: boolean; municipioTomador: string | null }) => Promise<Uint8Array>;
  itensDaFatura: (invoiceId: string) => Promise<ItensDaFatura>;
  codigoIbge: (cidade: string, uf: string) => Promise<string | null>;
  log: (msg: string, ctx?: Record<string, unknown>) => void;
}

export type Resultado =
  | 'fora_do_escopo'
  | 'ocupada'
  | 'ja_finalizada'
  | 'emitida'
  | 'recuperada'
  | 'erro'
  | 'incerta'
  | 'sem_nota'
  | 'aguardando_prefeitura'
  | 'certificado_vencido';

const TRAVA_MS = 10 * 60_000;

/** Aviso único de que Fortaleza ligou o Emissor Nacional em produção. */
export const ALERTA_FORTALEZA_LIGOU = 'prefeitura:producao:ligou';
export const MENSAGEM_FORTALEZA_LIGOU = 'Fortaleza ligou o Emissor Nacional. Já dá para ligar a nota fiscal em produção.';

// -----------------------------------------------------------------------------
// Ajudantes
// -----------------------------------------------------------------------------

function base64DeBytes(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function caminho(n: Pick<Nota, 'ambiente' | 'tenant_id'>, chave: string, sufixo: string): string {
  return `${n.ambiente}/${n.tenant_id ?? 'sem-conta'}/${chave}${sufixo}`;
}

function textoDosErros(erros: ErroSefin[] | undefined): { codigo: string; mensagem: string } {
  const lista = erros ?? [];
  return {
    codigo: lista.map((e) => e.codigo).filter(Boolean).join(',') || 'SEM_CODIGO',
    mensagem: lista.map((e) => `${e.codigo}: ${e.descricao}`).join(' | ').slice(0, 1000) || 'recusa sem descrição',
  };
}

function centavosDoXml(xml: string): number | null {
  const v = valor(xml, 'infDPS', 'valores', 'vServPrest', 'vServ');
  if (!v || !/^\d+(\.\d{1,2})?$/.test(v)) return null;
  const [i, d = ''] = v.split('.');
  return Number(i) * 100 + Number((d + '00').slice(0, 2));
}

function documentoDoTomadorNoXml(xml: string): string | null {
  return valor(xml, 'infDPS', 'toma', 'CPF') ?? valor(xml, 'infDPS', 'toma', 'CNPJ');
}

// -----------------------------------------------------------------------------
// Concluir: guardar XML e PDF, marcar emitida, mandar e-mail
// -----------------------------------------------------------------------------

async function concluirEmissao(p: Portas, nota: Nota, cobranca: Cobranca, r: { chaveAcesso: string; nfseXml: string; alertas?: ErroSefin[] }, municipioTomador: string | null): Promise<void> {
  const xmlPath = caminho(nota, r.chaveAcesso, '.xml');
  const pdfPath = caminho(nota, r.chaveAcesso, '.pdf');
  await p.arquivos.salvar(xmlPath, r.nfseXml, 'application/xml');
  let pdfOk = true;
  try {
    await p.arquivos.salvar(pdfPath, await p.gerarPdf(r.nfseXml, { cancelada: false, municipioTomador }), 'application/pdf');
  } catch (e) {
    pdfOk = false;
    p.log('nfse: PDF falhou (a nota está emitida; o PDF é refeito no próximo ciclo)', { nota: nota.id, erro: (e as Error).message });
  }
  const dhProc = valor(r.nfseXml, 'infNFSe', 'dhProc');
  await p.banco.atualizarNota(nota.id, {
    status: 'emitida',
    chave_acesso: r.chaveAcesso,
    numero_nfse: valor(r.nfseXml, 'infNFSe', 'nNFSe'),
    emitida_em: dhProc ? new Date(dhProc).toISOString() : p.agora().toISOString(),
    xml_path: xmlPath,
    pdf_path: pdfOk ? pdfPath : null,
    verificar_antes_de_reenviar: false,
    proxima_tentativa_em: null,
    travada_ate: null,
    ultimo_erro_codigo: null,
    ultimo_erro_mensagem: null,
    alertas_sefin: r.alertas?.length ? r.alertas : null,
    updated_at: p.agora().toISOString(),
  });
  await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'emitida' });
  const atual = await p.banco.nota(nota.id);
  if (atual) await enviarEmail(p, atual, cobranca);
}

/** Manda o e-mail da nota (PDF anexo + link). Falha não desfaz nada: o ciclo tenta de novo até 3 vezes. */
export async function enviarEmail(p: Portas, nota: Nota, cobranca?: Cobranca | null): Promise<boolean> {
  if (nota.email_enviado_em || nota.status !== 'emitida' || !nota.pdf_path || !nota.tenant_id) return false;
  const c = cobranca ?? (await p.banco.cobranca(nota.charge_id));
  const dados = await p.banco.dadosFiscais(nota.tenant_id);
  if (!c || !dados) return false;
  const teste = p.ambiente === 'restrita';
  const para = teste ? (p.emailTeste ? [p.emailTeste] : []) : [dados.invoice_email];
  if (!para.length) {
    p.log('nfse: restrita sem NFSE_EMAIL_TESTE, e-mail não enviado', { nota: nota.id });
    return false;
  }
  try {
    const link = await p.arquivos.urlAssinada(nota.pdf_path, VALIDADE_LINK_S);
    const pdfB64 = await baixarBase64(p, nota.pdf_path);
    const m = emailDaNota({
      nome: dados.legal_name,
      numeroNota: nota.numero_nfse ?? '',
      valorCentavos: Number(nota.valor_centavos ?? c.amount_paid_cents),
      periodo: c.period_start && c.period_end ? `${dataBr(c.period_start)} a ${ultimoDiaDoPeriodo(c.period_end)}` : null,
      link,
      teste,
    });
    const idEmail = await p.email.enviar({
      para,
      assunto: m.assunto,
      html: m.html,
      anexos: pdfB64 ? [{ nome: `nota-fiscal-${nota.numero_nfse ?? nota.numero_dps}.pdf`, base64: pdfB64 }] : undefined,
    });
    await p.banco.atualizarNota(nota.id, {
      email_enviado_em: p.agora().toISOString(),
      email_tentativas: nota.email_tentativas + 1,
      ...(idEmail ? { email_resend_id: idEmail } : {}),
    });
    return true;
  } catch (e) {
    await p.banco.atualizarNota(nota.id, { email_tentativas: nota.email_tentativas + 1 });
    p.log('nfse: e-mail falhou', { nota: nota.id, erro: (e as Error).message });
    if (nota.email_tentativas + 1 >= 3) {
      await p.avisos.superadmin(`email:${nota.id}`, 'Email da nota fiscal não saiu', `A nota ${nota.numero_nfse ?? ''} foi emitida, mas o e-mail ao cliente falhou 3 vezes. Baixe o PDF em Faturamento e mande à mão.`);
    }
    return false;
  }
}

async function baixarBase64(p: Portas, caminhoPdf: string): Promise<string | null> {
  const bytes = await p.arquivos.baixar(caminhoPdf);
  return bytes ? base64DeBytes(bytes) : null;
}

// -----------------------------------------------------------------------------
// Uma cobrança
// -----------------------------------------------------------------------------

/** `nota.tentativas` já conta o envio que falhou. */
async function marcarErro(p: Portas, nota: Nota, cobranca: Cobranca, codigo: string, mensagem: string, opts: { verificar: boolean }): Promise<void> {
  const agora = p.agora();
  const tentativas = nota.tentativas;
  await p.banco.atualizarNota(nota.id, {
    status: 'erro',
    ultimo_erro_codigo: codigo.slice(0, 200),
    ultimo_erro_mensagem: mensagem.slice(0, 1000),
    verificar_antes_de_reenviar: opts.verificar,
    proxima_tentativa_em: proximaTentativa(Math.max(1, tentativas), agora).toISOString(),
    travada_ate: null,
    updated_at: agora.toISOString(),
  });
  await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'erro' });
  if (tentativas >= TENTATIVAS_PARA_ALERTA) {
    await p.avisos.superadmin(
      `erro:${nota.id}:${codigo}`,
      'Nota fiscal com erro',
      `A cobrança de ${dataBr(cobranca.paid_at)} não virou nota depois de ${tentativas} tentativas. Erro ${codigo}: ${mensagem.slice(0, 300)}. Veja em Faturamento › Cobranças.`,
    );
  }
}

async function pararSemTentar(p: Portas, cobranca: Cobranca, nota: Nota | null, codigo: string, mensagem: string): Promise<void> {
  // Dado que só uma pessoa conserta (sem Conta, sem dados fiscais): avisa já.
  if (nota) {
    await p.banco.atualizarNota(nota.id, {
      status: 'erro',
      ultimo_erro_codigo: codigo,
      ultimo_erro_mensagem: mensagem,
      proxima_tentativa_em: new Date(p.agora().getTime() + 6 * 3600_000).toISOString(),
      travada_ate: null,
    });
  }
  await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'erro' });
  await p.avisos.superadmin(`dados:${cobranca.id}:${codigo}`, 'Nota fiscal parada por falta de dados', `${mensagem} Cobrança de ${dataBr(cobranca.paid_at)}.`);
}

/** Recupera a nota de uma DPS que já existe (timeout anterior ou E0014). */
async function recuperar(p: Portas, nota: Nota, cobranca: Cobranca, dados: DadosFiscais | null, municipioTomador: string | null): Promise<Resultado | null> {
  const r = await p.nfse.chamar('consultar_dps', { numero: nota.numero_dps });
  if (r.idDps && r.idDps !== nota.id_dps) await p.banco.atualizarNota(nota.id, { id_dps: r.idDps });
  if (r.resultado === 'encontrada' && r.chaveAcesso && r.nfseXml) {
    const valorXml = centavosDoXml(r.nfseXml);
    const docXml = documentoDoTomadorNoXml(r.nfseXml);
    const esperadoValor = nota.valor_centavos ?? cobranca.amount_paid_cents;
    if (valorXml !== esperadoValor || (dados && docXml && docXml !== dados.tax_id)) {
      await p.banco.atualizarNota(nota.id, {
        status: 'erro',
        ultimo_erro_codigo: 'DPS_DE_OUTRA_NOTA',
        ultimo_erro_mensagem: 'A DPS com este número já virou uma nota com outro valor ou tomador. Nada foi reenviado.',
        verificar_antes_de_reenviar: true,
        proxima_tentativa_em: null,
        travada_ate: null,
      });
      await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'erro' });
      await p.avisos.superadmin(`outra:${nota.id}`, 'Número de DPS já usado por outra nota', `A cobrança de ${dataBr(cobranca.paid_at)} reservou um número que já virou nota com outro valor ou tomador. A emissão parou: confira o runbook antes de mexer.`);
      return 'erro';
    }
    await concluirEmissao(p, nota, cobranca, { chaveAcesso: r.chaveAcesso, nfseXml: r.nfseXml }, municipioTomador);
    return 'recuperada';
  }
  if (r.resultado === 'nao_encontrada') {
    await p.banco.atualizarNota(nota.id, { verificar_antes_de_reenviar: false });
    return null; // pode mandar
  }
  if (r.resultado === 'certificado_vencido') return marcarCertificadoVencido(p, nota, cobranca);
  await marcarErro(p, nota, cobranca, 'CONSULTA_INCERTA', r.detalhe ?? 'consulta da DPS sem resposta', { verificar: true });
  return 'incerta';
}

async function marcarCertificadoVencido(p: Portas, nota: Nota, cobranca: Cobranca): Promise<Resultado> {
  await p.banco.atualizarNota(nota.id, { status: 'certificado_vencido', travada_ate: null });
  await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'certificado_vencido' });
  await p.avisos.superadmin(`cert:vencido:${diaEmFortaleza(p.agora())}`, 'Certificado digital vencido', 'O certificado A1 da empresa venceu e nenhuma nota sai até ele ser trocado na Vercel (NFSE_CERT_PFX_B64 e NFSE_CERT_SENHA).');
  return 'certificado_vencido';
}

/** Município do tomador por extenso ("Cidade / UF") para o PDF. */
function municipioDoTomador(d: DadosFiscais | null): string | null {
  return d ? `${d.city} / ${d.state}` : null;
}

/**
 * Processa uma cobrança: reserva o número, consulta se preciso, emite e
 * conclui. Idempotente: chamar duas vezes nunca gera duas notas.
 */
export async function processarCobranca(p: Portas, cobrancaId: string): Promise<Resultado> {
  const cobranca = await p.banco.cobranca(cobrancaId);
  if (!cobranca) return 'fora_do_escopo';
  if (!cobrancaNoEscopo(p.ambiente, cobranca.tenant_id, p.contasTeste) || cobranca.amount_paid_cents <= 0) return 'fora_do_escopo';
  if (['emitida', 'cancelada', 'cancelar_manual', 'sem_nota'].includes(cobranca.nota_status)) return 'ja_finalizada';

  const reembolso = situacaoDoReembolso(cobranca.amount_paid_cents, cobranca.amount_refunded_cents);
  if (reembolso === 'total') {
    // Devolvida inteira antes de virar nota: não há serviço a declarar.
    await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'sem_nota' });
    return 'sem_nota';
  }

  const nota = await p.banco.reservarNota(cobranca.id, p.ambiente);
  const agora = p.agora();
  if (!(await p.banco.travar(nota.id, new Date(agora.getTime() + TRAVA_MS), agora))) return 'ocupada';

  if (nota.status === 'emitida' || nota.status === 'cancelada' || nota.status === 'cancelar_manual') {
    await p.banco.atualizarCobranca(cobranca.id, { nota_status: nota.status });
    await p.banco.atualizarNota(nota.id, { travada_ate: null });
    return 'ja_finalizada';
  }

  if (reembolso === 'parcial') {
    await pararSemTentar(p, cobranca, nota, 'REEMBOLSO_PARCIAL', 'A cobrança teve reembolso parcial antes de virar nota. Trate à mão.');
    return 'erro';
  }
  if (!cobranca.tenant_id) {
    await pararSemTentar(p, cobranca, nota, 'SEM_CONTA', 'Cobrança sem Conta identificada: não há tomador para a nota.');
    return 'erro';
  }
  const dados = await p.banco.dadosFiscais(cobranca.tenant_id);
  if (!dados) {
    await pararSemTentar(p, cobranca, nota, 'SEM_DADOS_FISCAIS', 'A Conta não tem os dados para a nota fiscal (CPF ou CNPJ e endereço).');
    return 'erro';
  }
  const municipioTomador = municipioDoTomador(dados);

  // Produção: Fortaleza precisa estar no Emissor Nacional. Relê no máximo 1 vez por dia.
  const config = await p.banco.config();
  const prefeitura = await prefeituraLigada(p, config);
  if (prefeitura === false) {
    await p.banco.atualizarNota(nota.id, { status: 'aguardando_prefeitura', travada_ate: null });
    await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'aguardando_prefeitura' });
    await avisarPrefeituraDesligada(p);
    return 'aguardando_prefeitura';
  }

  // Envio anterior sem resposta certa: consulta antes de mandar de novo.
  if (nota.verificar_antes_de_reenviar) {
    const r = await recuperar(p, nota, cobranca, dados, municipioTomador);
    if (r) return r;
  }

  const cMun = dados.city_ibge_code ?? (await p.codigoIbge(dados.city, dados.state));
  if (!cMun) {
    await pararSemTentar(p, cobranca, nota, 'SEM_CODIGO_IBGE', `Não achei o código IBGE de ${dados.city} / ${dados.state}.`);
    return 'erro';
  }

  let itens = cobranca.fatura_itens;
  if (!itens) {
    try {
      itens = await p.itensDaFatura(cobranca.stripe_invoice_id);
      await p.banco.atualizarCobranca(cobranca.id, { fatura_itens: itens });
    } catch (e) {
      await p.banco.atualizarNota(nota.id, { tentativas: nota.tentativas + 1 });
      await marcarErro(p, { ...nota, tentativas: nota.tentativas + 1 }, cobranca, 'STRIPE', `Não consegui ler a fatura no Stripe: ${(e as Error).message}`, { verificar: false });
      return 'erro';
    }
  }

  const descricao = descricaoDoServico({ inicio: cobranca.period_start, fim: cobranca.period_end, itens });
  const tentativas = nota.tentativas + 1;
  await p.banco.atualizarNota(nota.id, {
    status: 'emitindo',
    verificar_antes_de_reenviar: true,
    tentativas,
    valor_centavos: cobranca.amount_paid_cents,
    descricao,
    updated_at: agora.toISOString(),
  });
  await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'emitindo' });
  const notaEnviada: Nota = { ...nota, tentativas, valor_centavos: cobranca.amount_paid_cents, verificar_antes_de_reenviar: true };

  const r: RespostaNfse = await p.nfse.chamar('emitir', {
    numero: nota.numero_dps,
    competencia: diaEmFortaleza(new Date(cobranca.paid_at)),
    valorCentavos: cobranca.amount_paid_cents,
    descricao,
    pTotTribSN: percentualParaLeiaute(config.p_tot_trib_sn),
    tomador: {
      tipo: dados.person_type,
      documento: dados.tax_id,
      nome: dados.legal_name,
      email: dados.invoice_email,
      endereco: {
        cMun,
        cep: dados.cep,
        logradouro: dados.street,
        numero: dados.number,
        complemento: dados.complement ?? '',
        bairro: dados.district,
      },
    },
  });
  if (r.idDps) await p.banco.atualizarNota(nota.id, { id_dps: r.idDps });
  const comId: Nota = { ...notaEnviada, id_dps: r.idDps ?? nota.id_dps };

  if (r.resultado === 'emitida' && r.chaveAcesso && r.nfseXml) {
    await concluirEmissao(p, comId, cobranca, { chaveAcesso: r.chaveAcesso, nfseXml: r.nfseXml, alertas: r.alertas }, municipioTomador);
    return 'emitida';
  }
  if (r.resultado === 'rejeitada') {
    if (dpsJaUsada(r.erros)) {
      const rec = await recuperar(p, comId, cobranca, dados, municipioTomador);
      return rec ?? 'erro';
    }
    const { codigo, mensagem } = textoDosErros(r.erros);
    // Recusa da Sefin é resposta certa: nenhuma nota saiu desta DPS.
    await marcarErro(p, comId, cobranca, codigo, mensagem, { verificar: false });
    return 'erro';
  }
  if (r.resultado === 'certificado_vencido') {
    await p.banco.atualizarNota(nota.id, { verificar_antes_de_reenviar: false });
    return marcarCertificadoVencido(p, comId, cobranca);
  }
  await marcarErro(p, comId, cobranca, 'INCERTA', r.detalhe ?? 'sem resposta certa da Sefin', { verificar: true });
  return 'incerta';
}

// -----------------------------------------------------------------------------
// Fortaleza
// -----------------------------------------------------------------------------

/** true/false pelo convênio; relê se a leitura tem mais de 24 h. null = não deu para saber (segue). */
async function prefeituraLigada(p: Portas, config: Config): Promise<boolean | null> {
  const lida = config.prefeitura_lida_em ? new Date(config.prefeitura_lida_em).getTime() : 0;
  if (config.prefeitura_emissor_nacional !== null && p.agora().getTime() - lida < 24 * 3600_000) {
    return config.prefeitura_emissor_nacional;
  }
  return lerPrefeitura(p);
}

async function lerPrefeitura(p: Portas): Promise<boolean | null> {
  const r = await p.nfse.chamar('parametros');
  if (r.resultado !== 'ok' || typeof r.aderenteEmissorNacional !== 'boolean') return null;
  await p.banco.atualizarConfig({ prefeitura_emissor_nacional: r.aderenteEmissorNacional, prefeitura_lida_em: p.agora().toISOString() });
  return r.aderenteEmissorNacional;
}

async function avisarPrefeituraDesligada(p: Portas): Promise<void> {
  await p.avisos.superadmin(
    `prefeitura:${p.ambiente}:${diaEmFortaleza(p.agora())}`,
    'Fortaleza ainda fora do Emissor Nacional',
    `O convênio de Fortaleza (${p.ambiente === 'producao' ? 'produção' : 'teste'}) ainda diz "Emissor Nacional desligado". As cobranças ficam em "Aguardando a Prefeitura" e saem sozinhas quando ela ligar. O sistema confere todo dia.`,
  );
}

// -----------------------------------------------------------------------------
// Cancelamento
// -----------------------------------------------------------------------------

/**
 * Cancela uma nota emitida (evento e101101, motivo 2). Dentro do prazo
 * automático cancela; fora dele vira cancelar_manual e avisa.
 * O botão do superadmin usa esta mesma função: o prazo vale igual (regra do dono).
 */
export async function cancelarNota(p: Portas, nota: Nota, cobranca: Cobranca): Promise<'cancelada' | 'cancelar_manual' | 'erro'> {
  if (nota.status !== 'emitida' || !nota.chave_acesso || !nota.emitida_em) return 'erro';
  const dados = cobranca.tenant_id ? await p.banco.dadosFiscais(cobranca.tenant_id) : null;
  if (!dentroDoPrazoDeCancelamento(new Date(nota.emitida_em), p.agora())) return marcarCancelarManual(p, nota, cobranca, 'Passou do dia 10 do mês seguinte ao da emissão.');

  const r = await p.nfse.chamar('cancelar', { chave: nota.chave_acesso });
  if (r.resultado === 'cancelada') {
    const agora = p.agora().toISOString();
    let eventoPath: string | null = null;
    if (r.eventoXml) {
      eventoPath = caminho(nota, nota.chave_acesso, '-cancelamento.xml');
      await p.arquivos.salvar(eventoPath, r.eventoXml, 'application/xml');
    }
    // O PDF ganha a marca d'água CANCELADA (NT 008, 2.5.1): refeito a partir do XML guardado.
    if (nota.xml_path) {
      try {
        const xml = await textoDoArquivo(p, nota.xml_path);
        if (xml && nota.pdf_path) {
          await p.arquivos.salvar(nota.pdf_path, await p.gerarPdf(xml, { cancelada: true, municipioTomador: municipioDoTomador(dados) }), 'application/pdf');
        }
      } catch (e) {
        p.log('nfse: PDF cancelado falhou', { nota: nota.id, erro: (e as Error).message });
      }
    }
    await p.banco.atualizarNota(nota.id, { status: 'cancelada', cancelada_em: agora, evento_cancelamento_path: eventoPath, ultimo_erro_codigo: null, ultimo_erro_mensagem: null });
    await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'cancelada' });
    return 'cancelada';
  }
  if (r.resultado === 'rejeitada' && cancelamentoForaDoPrazo(r.erros)) {
    return marcarCancelarManual(p, nota, cobranca, 'A Prefeitura recusou pelo prazo (E0822).');
  }
  const { codigo, mensagem } = r.resultado === 'rejeitada' ? textoDosErros(r.erros) : { codigo: 'INCERTA', mensagem: r.detalhe ?? 'sem resposta certa' };
  await p.banco.atualizarNota(nota.id, { ultimo_erro_codigo: `CANCELAMENTO:${codigo}`, ultimo_erro_mensagem: mensagem });
  if (r.resultado === 'rejeitada') {
    await p.avisos.superadmin(`cancelar:${nota.id}:${codigo}`, 'Cancelamento da nota recusado', `A nota ${nota.numero_nfse ?? ''} não foi cancelada: ${mensagem.slice(0, 300)}`);
  }
  return 'erro';
}

async function textoDoArquivo(p: Portas, caminhoArquivo: string): Promise<string | null> {
  const bytes = await p.arquivos.baixar(caminhoArquivo);
  return bytes ? new TextDecoder().decode(bytes) : null;
}

async function marcarCancelarManual(p: Portas, nota: Nota, cobranca: Cobranca, motivo: string): Promise<'cancelar_manual'> {
  await p.banco.atualizarNota(nota.id, { status: 'cancelar_manual' });
  await p.banco.atualizarCobranca(cobranca.id, { nota_status: 'cancelar_manual' });
  await p.avisos.superadmin(
    `manual:${nota.id}`,
    'Nota fiscal para cancelar à mão',
    `A nota ${nota.numero_nfse ?? ''} (cobrança de ${dataBr(cobranca.paid_at)}) precisa ser cancelada à mão. ${motivo} Use o pedido de análise fiscal no Emissor Nacional.`,
  );
  return 'cancelar_manual';
}

/** Reembolso nas notas emitidas: total no prazo cancela; parcial ou fora do prazo vira cancelar_manual. */
async function cicloDeCancelamentos(p: Portas): Promise<number> {
  let n = 0;
  for (const { cobranca, nota } of await p.banco.emitidasComReembolso(p.ambiente)) {
    if (!cobrancaNoEscopo(p.ambiente, cobranca.tenant_id, p.contasTeste)) continue;
    if (!nota.emitida_em) continue;
    const d = decisaoDeCancelamento({
      pagoCentavos: cobranca.amount_paid_cents,
      devolvidoCentavos: cobranca.amount_refunded_cents,
      emitidaEm: new Date(nota.emitida_em),
      agora: p.agora(),
    });
    if (d === 'cancelar') {
      if ((await cancelarNota(p, nota, cobranca)) !== 'erro') n++;
    } else if (d === 'cancelar_manual') {
      const motivo =
        situacaoDoReembolso(cobranca.amount_paid_cents, cobranca.amount_refunded_cents) === 'parcial'
          ? 'O reembolso foi parcial.'
          : 'O reembolso total chegou depois do dia 10 do mês seguinte ao da emissão.';
      await marcarCancelarManual(p, nota, cobranca, motivo);
      n++;
    }
  }
  return n;
}

// -----------------------------------------------------------------------------
// Checagem diária
// -----------------------------------------------------------------------------

export async function rodarDiario(p: Portas, config: Config): Promise<Record<string, unknown>> {
  const hoje = diaEmFortaleza(p.agora());
  const out: Record<string, unknown> = {};

  // Certificado
  const c = await p.nfse.chamar('certificado');
  if (c.resultado === 'ok' && c.validoAte && typeof c.diasRestantes === 'number') {
    await p.banco.atualizarConfig({ certificado_valido_ate: c.validoAte });
    const aviso = avisoDeCertificado(c.diasRestantes);
    out.certificadoDias = c.diasRestantes;
    if (aviso === 'vencido') {
      for (const cob of await p.banco.cobrancasNoEstado(['aguardando_emissao', 'erro'])) {
        if (cobrancaNoEscopo(p.ambiente, cob.tenant_id, p.contasTeste)) await p.banco.atualizarCobranca(cob.id, { nota_status: 'certificado_vencido' });
      }
      await p.avisos.superadmin(`cert:vencido:${c.validoAte.slice(0, 10)}`, 'Certificado digital vencido', 'O certificado A1 venceu: nenhuma nota sai até trocar NFSE_CERT_PFX_B64 e NFSE_CERT_SENHA na Vercel.');
    } else {
      if (aviso !== null) {
        await p.avisos.superadmin(
          `cert:${aviso}:${c.validoAte.slice(0, 10)}`,
          `Certificado digital vence em ${c.diasRestantes} dia${c.diasRestantes === 1 ? '' : 's'}`,
          `O certificado A1 da empresa vence em ${dataBr(c.validoAte)}. Peça o novo ao contador e troque na Vercel antes disso, ou as notas param.`,
        );
      }
      // Certificado bom de novo: volta para a fila o que tinha parado por ele.
      for (const cob of await p.banco.cobrancasNoEstado(['certificado_vencido'])) {
        await p.banco.atualizarCobranca(cob.id, { nota_status: 'aguardando_emissao' });
      }
    }
  } else {
    out.certificado = c.detalhe ?? c.resultado;
    await p.avisos.superadmin(`cert:leitura:${hoje}`, 'Não consegui conferir o certificado da nota fiscal', `A função da Vercel respondeu: ${c.detalhe ?? c.resultado}. Confira as variáveis NFSE_* na Vercel.`);
  }

  // Fortaleza
  const ligada = await lerPrefeitura(p);
  out.prefeitura = ligada;
  if (ligada === true) {
    for (const cob of await p.banco.cobrancasNoEstado(['aguardando_prefeitura'])) {
      await p.banco.atualizarCobranca(cob.id, { nota_status: 'aguardando_emissao' });
    }
  } else if (ligada === false && p.ambiente === 'producao') {
    await avisarPrefeituraDesligada(p);
  }

  // Fortaleza em PRODUÇÃO, lida em qualquer ambiente. Ligou: avisa uma vez só
  // (a chave do alerta não tem data). Não liga a produção: isso é do dono.
  const prod = await p.nfse.chamar('parametros_producao');
  if (prod.resultado === 'ok' && typeof prod.aderenteEmissorNacional === 'boolean') {
    await p.banco.atualizarConfig({
      prefeitura_producao_emissor_nacional: prod.aderenteEmissorNacional,
      prefeitura_producao_lida_em: p.agora().toISOString(),
    });
    out.prefeituraProducao = prod.aderenteEmissorNacional;
    if (prod.aderenteEmissorNacional) {
      out.avisoProducao = await p.avisos.superadmin(
        ALERTA_FORTALEZA_LIGOU,
        'Fortaleza ligou o Emissor Nacional',
        MENSAGEM_FORTALEZA_LIGOU,
        { emails: p.emailAvisos ? [p.emailAvisos] : [] },
      );
    }
  } else {
    out.prefeituraProducao = prod.detalhe ?? prod.resultado;
  }

  // Toda cobrança paga tem tentativa de nota
  const semTentativa = (await p.banco.pagasSemTentativa(p.ambiente, new Date(p.agora().getTime() - 3600_000))).filter((cob) =>
    cobrancaNoEscopo(p.ambiente, cob.tenant_id, p.contasTeste),
  );
  out.semTentativa = semTentativa.length;
  if (semTentativa.length) {
    await p.avisos.superadmin(`conciliacao:${hoje}`, 'Cobranças pagas sem nota fiscal', `${semTentativa.length} cobrança(s) paga(s) há mais de 1 hora ainda sem nenhuma tentativa de nota. Veja Faturamento › Cobranças.`);
  }

  // Parada há mais de 6 h
  const paradas = (await p.banco.paradas(new Date(p.agora().getTime() - 6 * 3600_000))).filter((cob) =>
    cobrancaNoEscopo(p.ambiente, cob.tenant_id, p.contasTeste),
  );
  out.paradas = paradas.length;
  if (paradas.length) {
    await p.avisos.superadmin(`paradas:${hoje}`, 'Nota fiscal parada há mais de 6 horas', `${paradas.length} cobrança(s) paga(s) há mais de 6 horas ainda sem nota. Veja Faturamento › Cobranças.`);
  }

  await p.banco.atualizarConfig({ diario_rodado_em: hoje });
  return out;
}

// -----------------------------------------------------------------------------
// O ciclo (cron a cada 5 minutos)
// -----------------------------------------------------------------------------

export async function rodarCiclo(p: Portas, opts: { limite?: number } = {}): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ambiente: p.ambiente };
  const config = await p.banco.config();
  if (config.ambiente_ativo !== p.ambiente) await p.banco.atualizarConfig({ ambiente_ativo: p.ambiente });

  // As paradas >6 h viram aviso também fora da checagem diária? Não: uma vez por dia basta.
  const hoje = diaEmFortaleza(p.agora());
  if (config.diario_rodado_em !== hoje) out.diario = await rodarDiario(p, config);

  out.cancelamentos = await cicloDeCancelamentos(p);

  const resultados: Record<string, number> = {};
  for (const { cobranca } of await p.banco.candidatas(p.ambiente, opts.limite ?? 10)) {
    if (!cobrancaNoEscopo(p.ambiente, cobranca.tenant_id, p.contasTeste)) continue;
    let r: Resultado;
    try {
      r = await processarCobranca(p, cobranca.id);
    } catch (e) {
      p.log('nfse: falha inesperada numa cobrança', { cobranca: cobranca.id, erro: (e as Error).message });
      r = 'erro';
    }
    resultados[r] = (resultados[r] ?? 0) + 1;
    if (r === 'aguardando_prefeitura' || r === 'certificado_vencido') break; // o resto da fila esperaria igual
  }
  out.emissao = resultados;

  let emails = 0;
  for (const n of await p.banco.semEmail(p.ambiente)) if (await enviarEmail(p, n)) emails++;
  out.emails = emails;
  return out;
}
