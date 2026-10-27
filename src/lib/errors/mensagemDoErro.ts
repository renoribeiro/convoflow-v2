/**
 * A frase que a tela mostra quando o banco ou a rede recusa algo.
 *
 * Lote 3 do checkup (achado 36): os avisos genéricos mostravam "Erro na
 * Mutação" com o nome da tabela e o texto cru do servidor, em inglês. Aqui o
 * erro vira uma frase que diz o que aconteceu e o que fazer
 * (docs/GLOSSARIO_UX.md). O detalhe técnico fica só no log de quem chamou.
 */

export type AcaoDoAviso = 'salvar' | 'excluir' | 'carregar';

/** Título do aviso, pela ação que falhou. */
export function tituloDoErro(acao: AcaoDoAviso): string {
  if (acao === 'excluir') return 'Não foi possível excluir';
  if (acao === 'carregar') return 'Não foi possível carregar';
  return 'Não foi possível salvar';
}

interface ErroDoBanco {
  code?: unknown;
  message?: unknown;
  status?: unknown;
}

/** O que aconteceu e o que fazer, sem código, tabela nem inglês. */
export function motivoDoErro(error: unknown): string {
  const e = (error ?? {}) as ErroDoBanco;
  const code = typeof e.code === 'string' ? e.code : '';
  const message = typeof e.message === 'string' ? e.message : '';
  const status = typeof e.status === 'number' ? e.status : 0;

  if (code === '42501' || status === 401 || status === 403 || /permission denied|row-level security/i.test(message)) {
    return 'Você não tem permissão para isso. Peça ao Gestor da Loja.';
  }
  if (code === '23505' || /duplicate key/i.test(message)) {
    return 'Já existe um cadastro igual a este. Confira os dados e tente de novo.';
  }
  if (code === '23503') {
    return 'Este item está ligado a outros dados e não pode ser alterado assim. Confira e tente de novo.';
  }
  if (code === '23502' || code === '22P02' || code === '22023' || code === '23514') {
    return 'Algum campo está vazio ou num formato que não vale. Confira os dados e tente de novo.';
  }
  if (/failed to fetch|networkerror|network request failed|load failed/i.test(message)) {
    return 'Não foi possível falar com o servidor. Confira a internet e tente de novo.';
  }
  return 'Tente de novo em instantes. Se continuar, fale com o suporte do ConvoFlow.';
}
