/**
 * O que reabrir no Funil depois que o Gerente escolhe a Loja.
 *
 * Trocar a Loja em foco monta de novo a tela do meio (a chave dela leva a
 * Loja, ver DashboardLayout; o menu e o topo ficam desde o lote 6f), e a
 * janela aberta morre junto. O pedido fica aqui, fora do React, e a tela do Funil o consome ao
 * montar de novo. Pedido velho é descartado: a janela nunca reabre minutos
 * depois, numa visita qualquer ao Funil.
 */
import { create } from 'zustand';

export type AcaoFunil = 'novo-lead' | 'configurar-etapas';

export const ACAO_FUNIL_TTL_MS = 30_000;

interface FunilPendenteState {
  pendente: { acao: AcaoFunil; at: number } | null;
  pedir: (acao: AcaoFunil) => void;
  limpar: () => void;
}

export const useFunilPendente = create<FunilPendenteState>()((set) => ({
  pendente: null,
  pedir: (acao) => set({ pendente: { acao, at: Date.now() } }),
  limpar: () => set({ pendente: null }),
}));

export const pedirAcaoFunil = (acao: AcaoFunil) => useFunilPendente.getState().pedir(acao);

/** Lê e apaga o pedido. Velho demais vale como nenhum. */
export function consumirAcaoFunil(agora: number = Date.now()): AcaoFunil | null {
  const { pendente, limpar } = useFunilPendente.getState();
  if (!pendente) return null;
  limpar();
  return agora - pendente.at > ACAO_FUNIL_TTL_MS ? null : pendente.acao;
}
