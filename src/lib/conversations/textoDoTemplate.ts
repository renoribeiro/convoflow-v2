/**
 * Template aprovado enviado pela conversa (lote 6d, achado 44).
 *
 * Até aqui um parâmetro em branco era descartado antes do envio, e os
 * seguintes mudavam de lugar ({{3}} caía no {{2}}): a Meta recusava ou, pior,
 * o cliente recebia a frase trocada. E a conversa gravava "Template:
 * nome_tecnico" em vez do que o cliente leu. Agora todo parâmetro é
 * obrigatório e a conversa grava o texto final, com o id do envio (é ele que
 * faz os riscos de entregue e lida avançarem pelo webhook).
 */

/** Os {{n}} (contando de 1) que estão em branco. Vazio = pode enviar. */
export function parametrosEmBranco(params: readonly string[]): number[] {
  return params.flatMap((p, i) => (p.trim() ? [] : [i + 1]));
}

/** Frase da tela para os parâmetros que faltam. null = nenhum falta. */
export function avisoDeParametros(params: readonly string[]): string | null {
  const faltam = parametrosEmBranco(params);
  if (faltam.length === 0) return null;
  const lista = faltam.map((n) => `{{${n}}}`).join(', ');
  return `Preencha ${lista}: todo parâmetro do template é obrigatório.`;
}

/**
 * O texto que o cliente recebeu: o corpo do template com cada {{n}} trocado
 * pelo valor. Sem o corpo (nome digitado à mão, lista que não carregou), o
 * nome do template e os valores, para o histórico não ficar vazio.
 */
export function textoDoTemplate(
  corpo: string | null | undefined,
  params: readonly string[],
  nome: string,
): string {
  const valores = params.map((p) => p.trim());
  if (corpo && corpo.trim()) {
    return corpo.replace(/\{\{\s*(\d+)\s*\}\}/g, (inteiro, n: string) => valores[Number(n) - 1] ?? inteiro);
  }
  return valores.length ? `Template "${nome}": ${valores.join(', ')}` : `Template "${nome}"`;
}
