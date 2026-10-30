/**
 * "Conectar número" pedido com a Conta em foco: reabrir a janela depois que o
 * Gerente escolhe a Loja.
 *
 * Número de WhatsApp é sempre de uma Loja (decisão D1, 2026-10-29). Com a
 * Conta aberta, a janela pede a Loja primeiro; escolher troca a Loja em foco,
 * o que monta de novo a tela do meio (a chave dela leva a Loja, ver
 * DashboardLayout), e a janela morre junto. O pedido fica aqui, fora
 * do React, e Números de WhatsApp o consome ao montar de novo. Mesmo desenho
 * de src/lib/funnel/funilPendente.ts: pedido velho é descartado, a janela
 * nunca reabre minutos depois numa visita qualquer.
 */
import { create } from 'zustand';

export const CONECTAR_PENDENTE_TTL_MS = 30_000;

interface ConectarPendenteState {
  pedidoEm: number | null;
  pedir: () => void;
  limpar: () => void;
}

export const useConectarPendente = create<ConectarPendenteState>()((set) => ({
  pedidoEm: null,
  pedir: () => set({ pedidoEm: Date.now() }),
  limpar: () => set({ pedidoEm: null }),
}));

export const pedirConectarNumero = () => useConectarPendente.getState().pedir();

/** Lê e apaga o pedido. Velho demais vale como nenhum. */
export function consumirConectarNumero(agora: number = Date.now()): boolean {
  const { pedidoEm, limpar } = useConectarPendente.getState();
  if (pedidoEm === null) return false;
  limpar();
  return agora - pedidoEm <= CONECTAR_PENDENTE_TTL_MS;
}
