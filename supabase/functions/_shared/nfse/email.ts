// =============================================================================
// nfse/email.ts — o e-mail da nota para o cliente (puro; o Vitest importa)
// =============================================================================
// Texto simples em pt-BR e SEM HÍFEN (decisão do dono): por isso "nota fiscal
// de serviço" e "mensagem", nunca a sigla da nota nem a palavra com hífen.
// O PDF vai anexo e o link (URL assinada do bucket privado) vence em 7 dias.
// =============================================================================

export const VALIDADE_LINK_S = 7 * 24 * 60 * 60;

function escaparHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function reais(centavos: number): string {
  const [int = '0', dec = '00'] = (centavos / 100).toFixed(2).split('.');
  return `R$ ${int.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${dec}`;
}

export interface DadosDoEmail {
  nome: string;
  numeroNota: string;
  valorCentavos: number;
  periodo: string | null; // "16/10/2026 a 15/11/2026"
  link: string;
  teste: boolean;
  cancelada?: boolean;
}

export function emailDaNota(d: DadosDoEmail): { assunto: string; html: string; texto: string } {
  const assunto = `${d.teste ? '[TESTE] ' : ''}Nota fiscal de serviço ConvoFlow nº ${d.numeroNota}`;
  const linhas = [
    `Olá, ${d.nome}.`,
    d.periodo
      ? `Segue a nota fiscal de serviço da sua assinatura do ConvoFlow, referente ao período de ${d.periodo}.`
      : 'Segue a nota fiscal de serviço da sua assinatura do ConvoFlow.',
    `Número da nota: ${d.numeroNota}. Valor: ${reais(d.valorCentavos)}.`,
    'O PDF vai anexo a esta mensagem. Você também pode baixar pelo link abaixo, que vale por 7 dias:',
    d.link,
    'A nota também fica no ConvoFlow, em Configurações, Assinatura, na lista de cobranças.',
  ];
  if (d.teste) {
    linhas.push('Atenção: esta é uma nota de TESTE, emitida no ambiente de testes do governo. Ela não tem validade jurídica.');
  }
  linhas.push('Qualquer dúvida, é só responder esta mensagem.', 'Equipe ConvoFlow');
  const texto = linhas.join('\n\n');
  const html = linhas
    .map((l) => (l === d.link ? `<p><a href="${escaparHtml(d.link)}">Baixar a nota fiscal (PDF)</a></p>` : `<p>${escaparHtml(l)}</p>`))
    .join('\n');
  return { assunto, html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">${html}</div>`, texto };
}
