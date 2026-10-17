// =============================================================================
// nfse/danfse-pdf.ts — desenha o DANFSe (NT 008 v1.02, Anexo I) em PDF
// =============================================================================
// Só Deno (pdf-lib e qrcode pelo npm:). O conteúdo de cada campo vem pronto de
// danfse-modelo.ts (puro, testado no Vitest); aqui é só posição e traço.
//
// Medidas da NT em centímetros (2.4.5), A4 em retrato, uma página só.
// Fontes: a NT pede Arial nos rótulos e Microsoft Sans Serif no conteúdo; o PDF
// usa Helvetica (mesmas métricas da Arial e embutida em todo leitor).
// Bordas de 0,5 pt, borda da página 1 pt, cabeçalho e títulos com cinza 5%.
// =============================================================================

import { degrees, PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'npm:pdf-lib@1.17.1';
import QRCode from 'npm:qrcode@1.5.4';
import type { ModeloDanfse, PessoaDanfse } from './danfse-modelo.ts';
import { LOGO_NFSE_PNG_BASE64, LOGO_NFSE_PROPORCAO } from './logo-nfse.ts';

const CM = 72 / 2.54;
const A4 = { w: 595.28, h: 841.89 };
const ESQ = 0.3;
const LARG = 20.4;
const COLS = [0.3, 5.41, 10.51, 15.62];
const LARG_1 = 5.09;
const LARG_2 = 10.19;
const CINZA = rgb(0.95, 0.95, 0.95);
const PRETO = rgb(0, 0, 0);
const VERMELHO = rgb(1, 0, 0);

interface Fontes {
  normal: PDFFont;
  negrito: PDFFont;
}

interface Celula {
  x: number;
  w: number;
  rotulo?: string;
  valor?: string;
  sombra?: boolean;
  titulo?: boolean; // título do bloco: caixa alta 7 pt negrito, sem valor
}

function bytesDoBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

class Desenho {
  constructor(private page: PDFPage, private f: Fontes) {}

  /** y em cm a partir do topo → pt a partir da base. */
  private y(cmTopo: number): number {
    return A4.h - cmTopo * CM;
  }

  caixa(x: number, topo: number, w: number, h: number, sombra = false, espessura = 0.5): void {
    this.page.drawRectangle({
      x: x * CM,
      y: this.y(topo + h),
      width: w * CM,
      height: h * CM,
      borderWidth: espessura,
      borderColor: PRETO,
      color: sombra ? CINZA : undefined,
    });
  }

  caber(texto: string, fonte: PDFFont, tamanho: number, larguraCm: number): string {
    const max = larguraCm * CM - 4;
    if (fonte.widthOfTextAtSize(texto, tamanho) <= max) return texto;
    let t = texto;
    while (t.length > 1 && fonte.widthOfTextAtSize(`${t}...`, tamanho) > max) t = t.slice(0, -1);
    return `${t}...`;
  }

  texto(t: string, x: number, topoCm: number, tamanho: number, fonte: PDFFont, cor = PRETO): void {
    this.page.drawText(t, { x: x * CM + 2, y: this.y(topoCm) - tamanho, size: tamanho, font: fonte, color: cor });
  }

  centralizado(t: string, x: number, w: number, topoCm: number, tamanho: number, fonte: PDFFont, cor = PRETO): void {
    const largura = fonte.widthOfTextAtSize(t, tamanho);
    this.page.drawText(t, { x: x * CM + (w * CM - largura) / 2, y: this.y(topoCm) - tamanho, size: tamanho, font: fonte, color: cor });
  }

  /** Quebra em linhas que cabem na largura. */
  linhas(t: string, fonte: PDFFont, tamanho: number, larguraCm: number): string[] {
    const max = larguraCm * CM - 4;
    const out: string[] = [];
    for (const paragrafo of t.split(/\n/)) {
      let atual = '';
      for (const palavra of paragrafo.split(/\s+/)) {
        const tentativa = atual ? `${atual} ${palavra}` : palavra;
        if (fonte.widthOfTextAtSize(tentativa, tamanho) <= max) atual = tentativa;
        else {
          if (atual) out.push(atual);
          atual = this.caber(palavra, fonte, tamanho, larguraCm);
        }
      }
      out.push(atual);
    }
    return out;
  }

  /** Uma linha de células de mesma altura. Rótulo 6 pt negrito, conteúdo 7 pt. */
  linha(topo: number, altura: number, celulas: Celula[], rotulo7 = false): void {
    for (const c of celulas) {
      this.caixa(c.x, topo, c.w, altura, c.sombra || c.titulo);
      if (c.titulo) {
        this.texto(this.caber((c.rotulo ?? '').toUpperCase(), this.f.negrito, 7, c.w), c.x, topo + 0.12, 7, this.f.negrito);
        continue;
      }
      if (c.rotulo) this.texto(this.caber(c.rotulo, this.f.negrito, rotulo7 ? 7 : 6, c.w), c.x, topo + 0.06, rotulo7 ? 7 : 6, this.f.negrito);
      if (c.valor !== undefined) this.texto(this.caber(c.valor, this.f.normal, 7, c.w), c.x, topo + (rotulo7 ? 0.36 : 0.31), 7, this.f.normal);
    }
  }

  /** Bloco de uma linha só com aviso (destinatário, intermediário). */
  aviso(topo: number, texto: string): number {
    const h = 0.32;
    this.caixa(ESQ, topo, LARG, h, true);
    this.texto(this.caber(texto, this.f.negrito, 6.5, LARG), ESQ, topo + 0.03, 6.5, this.f.negrito);
    return topo + h;
  }
}

function linhasDaPessoa(d: Desenho, topo: number, titulo: string, p: PessoaDanfse, comEndereco: boolean): number {
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: titulo, titulo: true },
    { x: COLS[1], w: LARG_1, rotulo: 'CNPJ / CPF / NIF', valor: p.documento },
    { x: COLS[2], w: LARG_1, rotulo: 'Indicador Municipal (Inscrição)', valor: p.im },
    { x: COLS[3], w: LARG_1, rotulo: 'Telefone', valor: p.fone },
  ]);
  topo += 0.63;
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_2, rotulo: 'Nome / Nome Empresarial', valor: p.nome },
    { x: COLS[2], w: LARG_1, rotulo: 'Município / Sigla UF', valor: p.municipio },
    { x: COLS[3], w: LARG_1, rotulo: 'Código IBGE / CEP', valor: p.ibgeCep },
  ]);
  topo += 0.63;
  if (comEndereco) {
    d.linha(topo, 0.63, [
      { x: COLS[0], w: LARG_2, rotulo: 'Endereço', valor: p.endereco },
      { x: COLS[2], w: LARG_2, rotulo: 'E-mail', valor: p.email },
    ]);
    topo += 0.63;
  }
  return topo;
}

/** Gera o PDF do DANFSe. */
export async function gerarDanfsePdf(m: ModeloDanfse): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`DANFSe ${m.numeroNfse}`);
  pdf.setProducer('ConvoFlow');
  const page = pdf.addPage([A4.w, A4.h]);
  const f: Fontes = { normal: await pdf.embedFont(StandardFonts.Helvetica), negrito: await pdf.embedFont(StandardFonts.HelveticaBold) };
  const d = new Desenho(page, f);

  // Borda da página (1 pt)
  d.caixa(ESQ, 0.3, LARG, 29.1, false, 1);

  // --- Cabeçalho -------------------------------------------------------------
  d.caixa(ESQ, 0.3, LARG, 1.16, true);
  const logo = await pdf.embedPng(bytesDoBase64(LOGO_NFSE_PNG_BASE64));
  const logoH = 4.0 * LOGO_NFSE_PROPORCAO;
  page.drawImage(logo, { x: 0.49 * CM, y: A4.h - (0.44 + logoH) * CM, width: 4.0 * CM, height: logoH * CM });
  d.centralizado('DANFSe v2.0', 5.41, 10.19, 0.38, 9, f.negrito);
  d.centralizado('Documento Auxiliar da NFS-e', 5.41, 10.19, 0.7, 9, f.negrito);
  if (m.homologacao) d.centralizado('NFS-e SEM VALIDADE JURÍDICA', 5.41, 10.19, 1.02, 9, f.negrito, VERMELHO);
  d.texto(d.caber(m.municipioCabecalho, f.normal, 8, LARG_1), 15.62, 0.4, 8, f.normal);
  d.texto(d.caber(m.ambienteGerador, f.normal, 6, LARG_1), 15.62, 0.93, 6, f.normal);
  d.texto(d.caber(m.tipoAmbiente, f.normal, 6, LARG_1), 15.62, 1.16, 6, f.normal);

  // --- Dados da NFS-e ----------------------------------------------------------
  d.caixa(ESQ, 1.48, LARG, 2.84);
  d.linha(1.48, 0.77, [{ x: COLS[0], w: 15.3, rotulo: 'CHAVE DE ACESSO DA NFS-e', valor: m.chave }], true);
  d.linha(2.27, 0.67, [
    { x: COLS[0], w: LARG_1, rotulo: 'NÚMERO DA NFS-e', valor: m.numeroNfse },
    { x: COLS[1], w: LARG_1, rotulo: 'COMPETÊNCIA DA NFS-e', valor: m.competencia },
    { x: COLS[2], w: LARG_1, rotulo: 'DATA E HORA DA EMISSÃO DA NFS-e', valor: m.emissaoNfse },
  ], true);
  d.linha(2.96, 0.67, [
    { x: COLS[0], w: LARG_1, rotulo: 'NÚMERO DA DPS', valor: m.numeroDps },
    { x: COLS[1], w: LARG_1, rotulo: 'SÉRIE DA DPS', valor: m.serieDps },
    { x: COLS[2], w: LARG_1, rotulo: 'DATA E HORA DA EMISSÃO DA DPS', valor: m.emissaoDps },
  ], true);
  d.linha(3.65, 0.67, [
    { x: COLS[0], w: LARG_1, rotulo: 'EMITENTE DA NFS-e', valor: m.emitente, sombra: true },
    { x: COLS[1], w: LARG_1, rotulo: 'SITUAÇÃO DA NFS-e', valor: m.situacao },
    { x: COLS[2], w: LARG_1, rotulo: 'FINALIDADE', valor: m.finalidade },
  ], true);
  // QR Code (mínimo 1,52 cm, em X 17,48 / Y 1,67)
  const qr = QRCode.create(m.qrUrl, { errorCorrectionLevel: 'M' });
  const n = qr.modules.size;
  const lado = 1.52 * CM;
  const modulo = lado / n;
  const qx = 17.48 * CM;
  const qyTopo = A4.h - 1.67 * CM;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.modules.get(r, c)) {
        page.drawRectangle({ x: qx + c * modulo, y: qyTopo - (r + 1) * modulo, width: modulo + 0.05, height: modulo + 0.05, color: PRETO });
      }
    }
  }
  for (const [i, t] of [
    'A autenticidade desta NFS-e pode ser verificada',
    'pela leitura deste código QR ou pela consulta da',
    'chave de acesso no portal nacional da NFS-e',
  ].entries()) {
    d.centralizado(t, 15.8, 4.72, 3.36 + i * 0.22, 6, f.normal);
  }

  // --- Prestador ---------------------------------------------------------------
  let topo = 4.34;
  topo = linhasDaPessoa(d, topo, 'Prestador / Fornecedor', m.prestador, !m.ocultarEnderecoPrestador);
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'Simples Nacional na Data de Competência', valor: m.prestador.simples },
    { x: COLS[1], w: 15.3, rotulo: 'Regime de Apuração Tributária pelo SN', valor: m.prestador.regimeSn },
  ]);
  topo += 0.63;

  // --- Tomador / destinatário / intermediário ---------------------------------
  topo = m.tomador ? linhasDaPessoa(d, topo, 'Tomador / Adquirente', m.tomador, true) : d.aviso(topo, 'TOMADOR/ADQUIRENTE DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');
  topo = d.aviso(topo, 'O DESTINATÁRIO É O PRÓPRIO TOMADOR/ADQUIRENTE DA OPERAÇÃO');
  topo = d.aviso(topo, 'INTERMEDIÁRIO DA OPERAÇÃO NÃO IDENTIFICADO NA NFS-e');

  // --- Serviço -----------------------------------------------------------------
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'Serviço Prestado', titulo: true },
    { x: COLS[1], w: LARG_1, rotulo: 'Código de Tributação Nacional / Municipal', valor: m.servico.codigo },
    { x: COLS[2], w: LARG_1, rotulo: 'Código da NBS', valor: m.servico.nbs },
    { x: COLS[3], w: LARG_1, rotulo: 'Local da Prestação / Sigla UF / País', valor: m.servico.local },
  ]);
  topo += 0.63;
  d.caixa(ESQ, topo, LARG, 0.38);
  d.texto(d.caber(m.servico.descricaoCodigo, f.normal, 7, LARG), ESQ, topo + 0.08, 7, f.normal);
  topo += 0.38;
  const linhasDesc = d.linhas(m.servico.descricao, f.normal, 7, LARG).slice(0, 18);
  const hDesc = Math.max(0.63, 0.34 + linhasDesc.length * 0.3);
  d.caixa(ESQ, topo, LARG, hDesc);
  d.texto('Descrição do Serviço', ESQ, topo + 0.06, 6, f.negrito);
  linhasDesc.forEach((l, i) => d.texto(l, ESQ, topo + 0.31 + i * 0.3, 7, f.normal));
  topo += hDesc;

  // --- Tributação municipal ----------------------------------------------------
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'Tributação Municipal (ISSQN)', titulo: true },
    { x: COLS[1], w: LARG_1, rotulo: 'Tipo de Tributação do ISSQN', valor: m.issqn.tipo },
    { x: COLS[2], w: LARG_2, rotulo: 'Município / Sigla UF / País da Incidência do ISSQN', valor: m.issqn.incidencia },
  ]);
  topo += 0.63;
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'Regime Especial de Tributação do ISSQN', valor: m.issqn.regimeEspecial },
    { x: COLS[1], w: LARG_1, rotulo: 'Tipo de Imunidade do ISSQN', valor: m.issqn.imunidade },
    { x: COLS[2], w: LARG_1, rotulo: 'Suspensão da Exigibilidade do ISSQN', valor: m.issqn.suspensao },
    { x: COLS[3], w: LARG_1, rotulo: 'Número Processo Suspensão', valor: m.issqn.processo },
  ]);
  topo += 0.63;
  // A linha do benefício municipal sai só com dado (nota 5); a nossa nunca tem.
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'BC ISSQN', valor: m.issqn.bc },
    { x: COLS[1], w: LARG_1, rotulo: 'Alíquota Aplicada', valor: m.issqn.aliquota },
    { x: COLS[2], w: LARG_1, rotulo: 'Retenção do ISSQN', valor: m.issqn.retencao },
    { x: COLS[3], w: LARG_1, rotulo: 'ISSQN Apurado', valor: m.issqn.apurado },
  ]);
  topo += 0.63;

  // --- Tributação federal ------------------------------------------------------
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'Tributação Federal (Exceto CBS)', titulo: true },
    { x: COLS[1], w: LARG_1, rotulo: 'IRRF', valor: m.federal.irrf },
    { x: COLS[2], w: LARG_1, rotulo: 'Contribuição Previdenciária - Retida', valor: m.federal.cp },
    { x: COLS[3], w: LARG_1, rotulo: 'Contribuições Sociais - Retidas', valor: m.federal.cs },
  ]);
  topo += 0.63;
  if (m.imprimirPisCofins) {
    d.linha(topo, 0.63, [
      { x: COLS[0], w: LARG_1, rotulo: 'PIS - Débito Apuração Própria', valor: m.federal.pis },
      { x: COLS[1], w: LARG_1, rotulo: 'COFINS - Débito Apuração Própria', valor: m.federal.cofins },
      { x: COLS[2], w: LARG_2, rotulo: 'Descrição Contrib. Sociais - Retidas', valor: m.federal.descricaoCs },
    ]);
    topo += 0.63;
  }

  // --- IBS / CBS (o grupo não vai na nossa DPS em 2026: tudo "-") --------------
  d.linha(topo, 0.63, [
    { x: COLS[0], w: LARG_1, rotulo: 'Tributação IBS / CBS', titulo: true },
    { x: COLS[1], w: LARG_1, rotulo: 'CST / cClassTrib', valor: '-' },
    { x: COLS[2], w: LARG_2, rotulo: 'Indicador de Operação / Código IBGE Incidência / Município Incidência / Sigla UF', valor: '-' },
  ]);
  topo += 0.63;
  for (const rotulos of [
    ['Exclusões e Reduções da Base de Cálculo', 'Base de Cálculo Após Exclusões e Reduções', 'Red. Alíquota IBS / Red. Alíquota CBS', 'Alíquota - IBS UF / IBS Mun'],
    ['Alíq. Efetiva Municipal - IBS', 'Valor Apurado Municipal - IBS', 'Alíq. Efetiva Estadual - IBS', 'Valor Apurado Estadual - IBS'],
    ['Valor Total Apurado - IBS', 'Alíquota - CBS', 'Alíquota Efetiva - CBS', 'Valor Total Apurado - CBS'],
  ]) {
    d.linha(topo, 0.63, rotulos.map((r, i) => ({ x: COLS[i], w: LARG_1, rotulo: r, valor: '-' })));
    topo += 0.63;
  }

  // --- Valor total -------------------------------------------------------------
  d.linha(topo, 0.67, [
    { x: COLS[0], w: LARG_1, rotulo: 'Valor Total da NFS-e', titulo: true },
    { x: COLS[1], w: LARG_1, rotulo: 'Valor da Operação / Serviço', valor: m.totais.servico },
    { x: COLS[2], w: LARG_1, rotulo: 'Desconto Incondicionado', valor: m.totais.descIncond },
    { x: COLS[3], w: LARG_1, rotulo: 'Desconto Condicionado', valor: m.totais.descCond },
  ]);
  topo += 0.67;
  d.linha(topo, 0.67, [
    { x: COLS[0], w: LARG_1, rotulo: 'Total das Retenções (ISSQN / Federais)', valor: m.totais.retencoes },
    { x: COLS[1], w: LARG_1, rotulo: 'Valor Líquido da NFS-e', valor: m.totais.liquido },
    { x: COLS[2], w: LARG_1, rotulo: 'Total do IBS/CBS', valor: m.totais.ibsCbs },
    { x: COLS[3], w: LARG_1, rotulo: 'Valor Líquido da NFS-e + IBS/CBS', valor: m.totais.liquidoComIbsCbs, sombra: true },
  ]);
  topo += 0.67;

  // --- Informações complementares (até o fim da página) ------------------------
  d.linha(topo, 0.39, [{ x: ESQ, w: LARG, rotulo: 'Informações Complementares', titulo: true }]);
  topo += 0.39;
  const hInfo = 29.4 - topo;
  d.caixa(ESQ, topo, LARG, hInfo);
  const maxLinhas = Math.max(1, Math.floor((hInfo - 0.1) / 0.3));
  d.linhas(m.informacoesComplementares, f.normal, 7, LARG)
    .slice(0, maxLinhas)
    .forEach((l, i) => d.texto(l, ESQ, topo + 0.08 + i * 0.3, 7, f.normal));

  // --- Marca d'água de cancelamento (2.5.1) ------------------------------------
  if (m.cancelada) {
    const t = 'CANCELADA';
    const tam = 96;
    const largura = f.normal.widthOfTextAtSize(t, tam);
    page.drawText(t, {
      x: A4.w / 2 - (largura / 2) * Math.cos(Math.PI / 4) + 20,
      y: A4.h / 2 - (largura / 2) * Math.sin(Math.PI / 4),
      size: tam,
      font: f.normal,
      color: rgb(0.65, 0.65, 0.65),
      rotate: degrees(45),
      opacity: 0.6,
    });
  }

  return await pdf.save();
}
