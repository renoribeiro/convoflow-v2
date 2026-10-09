/**
 * Inserção de texto no compositor, onde o cursor está.
 *
 * O seletor de emoji acrescentava sempre no FIM da mensagem. Quem escreve
 * "Obrigado pela visita" e quer um 😊 depois de "Obrigado" tinha que apagar e
 * reescrever. Aqui o texto entra no lugar do cursor e, se houver um trecho
 * selecionado, substitui o trecho, como numa digitação normal.
 *
 * `start`/`end` vêm do `selectionStart`/`selectionEnd` do <textarea>. Fora da
 * faixa (o campo foi esvaziado depois de enviar) ou ausentes, o texto vai para
 * o fim. O `caret` devolvido é onde o cursor deve ficar: logo depois do que
 * entrou, para o próximo emoji cair em seguida.
 */
export function insertAtSelection(
  text: string,
  insert: string,
  start: number | null | undefined,
  end: number | null | undefined,
): { text: string; caret: number } {
  const clamp = (n: number | null | undefined) =>
    typeof n === 'number' && Number.isFinite(n) ? Math.min(Math.max(n, 0), text.length) : text.length;
  const from = clamp(start);
  const to = Math.max(from, clamp(end ?? start));
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    caret: from + insert.length,
  };
}
