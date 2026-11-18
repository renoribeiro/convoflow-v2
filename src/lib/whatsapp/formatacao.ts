/**
 * Formatação de texto do WhatsApp, lida do jeito que o próprio WhatsApp lê.
 *
 * Fonte oficial: "Como formatar suas mensagens", Central de Ajuda do WhatsApp
 * (https://faq.whatsapp.com/539178204879377). Os sinais são:
 *
 *   *negrito*   _itálico_   ~riscado~   ```monoespaçado```   `código`
 *   "> " no começo da linha (citação)
 *   "* " ou "- " no começo da linha (lista com marcadores)
 *   "1. " no começo da linha (lista numerada)
 *
 * Quando um sinal conta (o comportamento do aplicativo, que a página oficial
 * resume como "dos dois lados do texto"):
 *
 *   - colado no texto: depois do sinal de abrir e antes do de fechar vem uma
 *     letra, número ou símbolo, nunca espaço ("* oi*" não formata);
 *   - fora da palavra: antes do sinal de abrir e depois do de fechar não pode
 *     haver letra nem número ("meu_arquivo_final", "2*3*4" ficam iguais);
 *   - na mesma linha: só o ``` atravessa quebra de linha;
 *   - com conteúdo: "**" sozinho não é nada;
 *   - dentro de link não conta (o "_" de um endereço continua no endereço);
 *   - negrito, itálico e riscado se combinam ("*_oi_*"); dentro de ``` e de `
 *     nada mais é lido.
 *
 * Isto só LÊ o texto. A mensagem gravada nunca muda, e o atendente envia os
 * sinais como digitou: quem formata é o WhatsApp do cliente.
 *
 * Duas saídas:
 *   - `analisarFormatacao` devolve as linhas com os trechos marcados, para o
 *     componente <TextoWhatsApp /> montar com elementos React (nunca HTML cru);
 *   - `textoSemFormatacao` devolve o texto limpo, sem os sinais, para onde a
 *     formatação não faz sentido (lista de conversas, notificação, citação).
 *
 * Os casos do texto limpo moram em `formatacao.casos.ts` (formatacao.test.ts).
 */

export type TipoDeDestaque = 'negrito' | 'italico' | 'riscado';

export type TrechoFormatado =
  | { tipo: 'texto'; texto: string }
  | { tipo: TipoDeDestaque; filhos: TrechoFormatado[] }
  | { tipo: 'mono' | 'codigo'; texto: string };

export type LinhaFormatada =
  | { tipo: 'paragrafo' | 'citacao' | 'item'; trechos: TrechoFormatado[] }
  | { tipo: 'numerado'; numero: string; trechos: TrechoFormatado[] };

const DESTAQUE_POR_SINAL: Record<string, TipoDeDestaque> = {
  '*': 'negrito',
  _: 'italico',
  '~': 'riscado',
};

// Letra de qualquer língua (acentuada também) e algarismo comum: "²" e "½"
// não contam como número (o mesmo que o [[:alnum:]] do Postgres em en_US.UTF-8).
const LETRA_OU_NUMERO = /[\p{L}\p{Nd}]/u;
const ESPACO = /\s/;
const TRIPLA = '```';

/** Endereço clicável: o mesmo que a bolha sempre transformou em link. */
const LINK = /https?:\/\/[^\s]+/g;
const SINAIS = '*_~`';

/**
 * Os links do texto. Um sinal colado no fim do endereço só sai do link quando
 * o mesmo sinal aparece antes, no texto (é ele que fecha: "*veja https://x.com*").
 * Sem isso o endereço fica inteiro, como sempre foi ("https://x.com/_promo_").
 */
export function acharLinks(texto: string): Array<{ inicio: number; fim: number }> {
  const achados: Array<{ inicio: number; fim: number }> = [];
  LINK.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINK.exec(texto)) !== null) {
    const antes = texto.slice(0, m.index);
    let fim = m.index + m[0].length;
    while (fim > m.index && SINAIS.includes(texto[fim - 1]) && antes.includes(texto[fim - 1])) fim--;
    // "https://" sozinho, depois de tirar os sinais, não é link.
    if (/^https?:\/\/.+/.test(texto.slice(m.index, fim))) achados.push({ inicio: m.index, fim });
  }
  return achados;
}

const ehLetraOuNumero = (c: string | undefined) => c !== undefined && LETRA_OU_NUMERO.test(c);
const ehEspaco = (c: string | undefined) => c !== undefined && ESPACO.test(c);

interface Leitura {
  texto: string;
  /** true nas posições que estão dentro de um link. */
  protegido: boolean[];
}

/** Abre aqui? Antes: começo, espaço ou símbolo. Depois: algo que não é espaço nem o mesmo sinal. */
function podeAbrir(l: Leitura, i: number, tamanho: number): boolean {
  if (l.protegido[i]) return false;
  if (ehLetraOuNumero(l.texto[i - 1])) return false;
  const depois = l.texto[i + tamanho];
  if (depois === undefined || ehEspaco(depois)) return false;
  // "**" e "~~": o primeiro não abre (o segundo pode).
  if (tamanho === 1 && depois === l.texto[i]) return false;
  return true;
}

/** Fecha aqui? Antes: algo que não é espaço. Depois: fim, espaço ou símbolo. */
function podeFechar(l: Leitura, j: number, tamanho: number): boolean {
  if (l.protegido[j]) return false;
  if (ehEspaco(l.texto[j - 1])) return false;
  if (ehLetraOuNumero(l.texto[j + tamanho])) return false;
  return true;
}

/** Onde fecha o sinal aberto em `i` (ou -1). Procura até `fim`; só o ``` passa da linha. */
function acharFechamento(l: Leitura, i: number, sinal: string, fim: number): number {
  const tamanho = sinal.length;
  for (let j = i + tamanho + 1; j + tamanho <= fim; j++) {
    const c = l.texto[j];
    if (c === '\n' && tamanho === 1) return -1;
    if (l.texto.startsWith(sinal, j) && podeFechar(l, j, tamanho)) {
      // "```" fechando dentro de outro "`": o de uma crase só não fecha no meio de três.
      if (tamanho === 1 && sinal === '`' && l.texto.startsWith(TRIPLA, j)) continue;
      return j;
    }
  }
  return -1;
}

function lerTrechos(l: Leitura, inicio: number, fim: number): TrechoFormatado[] {
  const saida: TrechoFormatado[] = [];
  let pendente = inicio;
  const guardarTexto = (ate: number) => {
    if (ate > pendente) saida.push({ tipo: 'texto', texto: l.texto.slice(pendente, ate) });
  };

  let i = inicio;
  while (i < fim) {
    const c = l.texto[i];

    if (c === '`' && l.texto.startsWith(TRIPLA, i) && i + 3 < fim && podeAbrir(l, i, 3)) {
      const j = acharFechamento(l, i, TRIPLA, fim);
      if (j > 0) {
        guardarTexto(i);
        saida.push({ tipo: 'mono', texto: l.texto.slice(i + 3, j) });
        i = j + 3;
        pendente = i;
        continue;
      }
    }

    if (c === '`' && !l.texto.startsWith(TRIPLA, i) && podeAbrir(l, i, 1)) {
      const j = acharFechamento(l, i, '`', fim);
      if (j > 0) {
        guardarTexto(i);
        saida.push({ tipo: 'codigo', texto: l.texto.slice(i + 1, j) });
        i = j + 1;
        pendente = i;
        continue;
      }
    }

    const destaque = DESTAQUE_POR_SINAL[c];
    if (destaque && podeAbrir(l, i, 1)) {
      const j = acharFechamento(l, i, c, fim);
      if (j > 0) {
        guardarTexto(i);
        saida.push({ tipo: destaque, filhos: lerTrechos(l, i + 1, j) });
        i = j + 1;
        pendente = i;
        continue;
      }
    }

    i++;
  }
  guardarTexto(fim);
  return saida;
}

/** Corta os trechos nas quebras de linha (um ``` de várias linhas vira um pedaço por linha). */
function quebrarEmLinhas(trechos: TrechoFormatado[]): TrechoFormatado[][] {
  const linhas: TrechoFormatado[][] = [[]];
  const atual = () => linhas[linhas.length - 1];

  for (const t of trechos) {
    if (t.tipo === 'texto' || t.tipo === 'mono' || t.tipo === 'codigo') {
      const partes = t.texto.split('\n');
      partes.forEach((parte, k) => {
        if (k > 0) linhas.push([]);
        if (parte) atual().push({ ...t, texto: parte });
      });
      continue;
    }
    const sub = quebrarEmLinhas(t.filhos);
    sub.forEach((filhos, k) => {
      if (k > 0) linhas.push([]);
      if (filhos.length) atual().push({ tipo: t.tipo, filhos });
    });
  }
  return linhas;
}

const CITACAO = /^> /;
const ITEM = /^[*-] /;
const NUMERADO = /^(\d{1,3})\. /;

/** O começo da linha diz se ela é citação, item ou item numerado. Só conta texto comum. */
function tipoDaLinha(trechos: TrechoFormatado[]): LinhaFormatada {
  const primeiro = trechos[0];
  if (!primeiro || primeiro.tipo !== 'texto') return { tipo: 'paragrafo', trechos };

  const semPrefixo = (tamanho: number): TrechoFormatado[] => {
    const resto = primeiro.texto.slice(tamanho);
    return resto ? [{ tipo: 'texto', texto: resto }, ...trechos.slice(1)] : trechos.slice(1);
  };

  if (CITACAO.test(primeiro.texto)) return { tipo: 'citacao', trechos: semPrefixo(2) };
  if (ITEM.test(primeiro.texto)) return { tipo: 'item', trechos: semPrefixo(2) };
  const n = NUMERADO.exec(primeiro.texto);
  if (n) return { tipo: 'numerado', numero: n[1], trechos: semPrefixo(n[0].length) };
  return { tipo: 'paragrafo', trechos };
}

/** As linhas do texto, com o que cada trecho é. Texto vazio dá uma linha vazia. */
export function analisarFormatacao(texto: string | null | undefined): LinhaFormatada[] {
  const t = typeof texto === 'string' ? texto.replace(/\r\n?/g, '\n') : '';
  const protegido = new Array<boolean>(t.length).fill(false);
  for (const { inicio, fim } of acharLinks(t)) for (let k = inicio; k < fim; k++) protegido[k] = true;
  const trechos = lerTrechos({ texto: t, protegido }, 0, t.length);
  return quebrarEmLinhas(trechos).map(tipoDaLinha);
}

/** O texto tem alguma coisa que o WhatsApp formataria? (Sem isso a bolha fica como sempre foi.) */
export function temFormatacao(linhas: LinhaFormatada[]): boolean {
  return linhas.some(
    (linha) => linha.tipo !== 'paragrafo' || linha.trechos.some((t) => t.tipo !== 'texto'),
  );
}

function textoDosTrechos(trechos: TrechoFormatado[]): string {
  return trechos
    .map((t) => (t.tipo === 'texto' || t.tipo === 'mono' || t.tipo === 'codigo' ? t.texto : textoDosTrechos(t.filhos)))
    .join('');
}

/**
 * O texto sem os sinais que o WhatsApp usaria para formatar: "*Consulta*" vira
 * "Consulta", "> citação" vira "citação", "* item" vira "• item". O que não é
 * formatação (um asterisco solto, "2*3", "meu_arquivo") fica exatamente igual.
 */
export function textoSemFormatacao(texto: string | null | undefined): string {
  if (typeof texto !== 'string' || texto === '') return '';
  // Atalho: sem nenhum sinal possível, o texto volta como veio.
  if (!/[*_~`>-]|\d\. /.test(texto)) return texto;
  return analisarFormatacao(texto)
    .map((linha) => {
      const corpo = textoDosTrechos(linha.trechos);
      if (linha.tipo === 'item') return `• ${corpo}`;
      if (linha.tipo === 'numerado') return `${linha.numero}. ${corpo}`;
      return corpo;
    })
    .join('\n');
}
