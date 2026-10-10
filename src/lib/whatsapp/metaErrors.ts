/**
 * O motivo de uma recusa da Meta, em pt-BR, para quem está na tela.
 *
 * Só entram códigos que estão em `.agent/skills/meta-cloud-api/SKILL.md` §9.
 * Ficaram de fora de propósito:
 *  - 132005 e 368: a descrição da skill (namespace inválido; bloqueado pelo
 *    cliente) não bate com o que a documentação da Meta diz desses códigos, e
 *    um texto errado manda o atendente fazer a coisa errada;
 *  - qualquer código que não está na skill (pagamento, contagem de variáveis…).
 * Para esses vale a frase que o servidor devolveu, que é a da própria Meta.
 *
 * O código vai sempre no fim do texto: é o que permite achar a explicação
 * depois, quando alguém manda print do erro.
 */
const MOTIVOS: Record<string, string> = {
  '131000': 'A Meta teve uma falha ao processar o envio. Tente de novo em alguns minutos.',
  '131005': 'A Meta negou a permissão de envio deste número. Reconecte o número da Loja.',
  '131008': 'Faltou um dado obrigatório no envio, como uma variável do template.',
  '131009': 'A Meta recusou um dado do envio, como o telefone num formato que ela não aceita.',
  '131016': 'O WhatsApp está instável agora. Tente de novo em alguns minutos.',
  '131021': 'O telefone de destino é o próprio número da Loja.',
  '131026': 'A Meta não conseguiu entregar para este telefone. O mais comum é o número não ter WhatsApp.',
  '131047':
    'Fora da janela de 24 horas: este telefone não escreveu para este número nas últimas 24 horas. Envie um template aprovado.',
  '131051': 'A Meta não aceita este tipo de mensagem.',
  '132001': 'Este template não existe neste número, nesse idioma, ou ainda não foi aprovado. Confira na tela Templates.',
  '133010': 'O número da Loja ainda não concluiu o registro na Meta. Reconecte o número.',
};

/**
 * Texto da recusa para a tela. Com código conhecido, a frase acima; sem ele, a
 * frase do servidor. Em qualquer caso, com o código da Meta no fim.
 */
export function motivoDaRecusaMeta(
  code: string | number | null | undefined,
  mensagemDoServidor: string | null | undefined,
): string {
  const codigo = code === null || code === undefined || code === '' ? null : String(code);
  const base =
    (codigo && MOTIVOS[codigo]) ||
    mensagemDoServidor?.trim() ||
    'A Meta recusou o envio.';
  return codigo ? `${base} (código ${codigo} da Meta)` : base;
}
