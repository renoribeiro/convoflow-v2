/**
 * Trava da troca de cargo (lote 6e, decisão D2 parcial).
 *
 * Mudar o cargo, a Loja ou a Conta de quem já entrou está EM ESPERA até a
 * reunião sobre o redesenho da hierarquia. Até lá, só passa a troca que deixa
 * a pessoa no lugar certo: entre Gestor e Atendente, dentro da mesma Loja.
 * Qualquer outra (Atendente ou Gestor virando Gerente dentro de uma Loja,
 * Gerente rebaixado preso a uma Conta, qualquer troca com Superadmin) é
 * recusada com a frase abaixo.
 *
 * Cópia exata de supabase/functions/_shared/troca-de-cargo.ts (o servidor,
 * manage-user); src/lib/users/trocaDeCargoParity.test.ts compara as duas em
 * todas as combinações.
 */

export const TROCA_DE_CARGO_EM_ESPERA =
  'Essa troca de cargo ainda não está disponível. Fale com o suporte do ConvoFlow.';

/** O tipo do lugar onde a pessoa está: Conta, Loja, ou nenhum (superadmin). */
export type LugarDaPessoa = 'account' | 'store' | null;

export type ResultadoDaTroca = { permitida: true } | { permitida: false; mensagem: string };

/** Onde cada cargo mora. Cargo desconhecido: lugar nenhum serve. */
function lugarDoCargo(cargo: string): LugarDaPessoa | 'nenhum' {
  switch (cargo) {
    case 'superadmin':
      return null;
    case 'gerente':
      return 'account';
    case 'gestor':
    case 'atendente':
      return 'store';
    default:
      return 'nenhum';
  }
}

export function avaliarTrocaDeCargo(cargoAtual: string, cargoNovo: string, lugar: LugarDaPessoa): ResultadoDaTroca {
  if (cargoAtual === cargoNovo) return { permitida: true };
  if (lugar === 'store' && lugarDoCargo(cargoAtual) === 'store' && lugarDoCargo(cargoNovo) === 'store') {
    return { permitida: true };
  }
  return { permitida: false, mensagem: TROCA_DE_CARGO_EM_ESPERA };
}
