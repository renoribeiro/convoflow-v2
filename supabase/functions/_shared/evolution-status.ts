// =============================================================================
// evolution-status.ts: o aviso de entrega e leitura (messages.update) do Evolution
// =============================================================================
// Correção de 2026-11-23. Até aqui o evolution-webhook lia `key.id` e
// `update.status`, o formato do Baileys cru. O Evolution v2 (conferido no
// código do tag 2.3.7, whatsapp.baileys.service.ts, handler de
// 'messages.update', e em /chat/findStatusMessage) manda tudo solto:
//   { keyId, remoteJid, fromMe, participant, status: 'DELIVERY_ACK', instanceId, messageId }
// Sem `key.id`, todo aviso era pulado: nenhuma mensagem enviada por número
// QR Code saía de um check. E a gravação ainda mandava `updated_at`, coluna que
// `messages` não tem, então falharia mesmo com o id certo.
//
// Regras:
//   - lê o formato do 2.3.7 e também o antigo ({ key: { id }, update: { status } },
//     status em texto ou número: 0 ERROR, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED);
//   - SERVER_ACK enviada, DELIVERY_ACK entregue, READ e PLAYED lida, ERROR falhou;
//     PENDING, EDITED e o que não se conhece não mudam nada;
//   - só para frente: o Evolution manda "enviada" depois de "entregue" (visto em
//     produção), e isso nunca volta a mensagem. O banco confere o status atual
//     na própria gravação (`status in ANTERIORES[novo]`);
//   - aviso de mensagem recebida (fromMe false) não mexe em nada.
// Sem I/O: quem grava é o webhook, pelas funções de `DepsDoStatus`; o Vitest
// testa sem Deno.
// =============================================================================

export type StatusDeEntrega = 'sent' | 'delivered' | 'read' | 'failed';

const POR_NOME: Record<string, StatusDeEntrega> = {
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  READ: 'read',
  PLAYED: 'read',
  ERROR: 'failed',
};

// renderStatus.ts do Evolution: 0 ERROR, 1 PENDING, 2 SERVER_ACK, 3 DELIVERY_ACK, 4 READ, 5 PLAYED.
const POR_NUMERO: Record<number, StatusDeEntrega> = {
  0: 'failed',
  2: 'sent',
  3: 'delivered',
  4: 'read',
  5: 'read',
};

/** De que status cada novo pode vir. Só para frente; recebida, apagada e falhou nunca mudam. */
export const ANTERIORES: Record<StatusDeEntrega, readonly string[]> = {
  sent: ['pending'],
  delivered: ['pending', 'sent'],
  read: ['pending', 'sent', 'delivered'],
  failed: ['pending', 'sent'],
};

export function statusDoEvolution(bruto: unknown): StatusDeEntrega | null {
  if (typeof bruto === 'number') return POR_NUMERO[bruto] ?? null;
  if (typeof bruto === 'string') {
    const t = bruto.trim();
    if (/^\d+$/.test(t)) return POR_NUMERO[Number(t)] ?? null;
    return POR_NOME[t.toUpperCase()] ?? null;
  }
  return null;
}

/** O status atual pode dar lugar ao novo? */
export function statusAvanca(atual: string | null | undefined, novo: StatusDeEntrega): boolean {
  return typeof atual === 'string' && ANTERIORES[novo].includes(atual);
}

export interface AvisoDeStatus {
  /** Id da mensagem no WhatsApp (o `evolution_message_id` gravado no envio). */
  id: string;
  status: StatusDeEntrega;
}

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Um item do aviso; null quando não há o que gravar (sem id, status sem efeito, mensagem recebida). */
export function lerAvisoDeStatus(item: unknown): AvisoDeStatus | null {
  const o = obj(item);
  if (!o) return null;
  const key = obj(o.key);
  const update = obj(o.update);

  // 2.3.7 primeiro: `keyId` já vem trocado pelo id original quando o aviso é de
  // uma edição; `key.id` é o formato antigo.
  const id = texto(o.keyId) ?? texto(key?.id);
  if (!id) return null;

  const fromMe = typeof o.fromMe === 'boolean' ? o.fromMe : typeof key?.fromMe === 'boolean' ? key.fromMe : null;
  if (fromMe === false) return null;

  const status = statusDoEvolution(o.status ?? update?.status);
  if (!status) return null;

  return { id, status };
}

export interface DepsDoStatus {
  /** Grava `novo` nas mensagens com esse id cujo status está em `anteriores`; devolve quantas mudaram. */
  avancar(id: string, novo: StatusDeEntrega, anteriores: readonly string[]): Promise<{ linhas: number; erro: string | null }>;
  /** Existe mensagem com esse id (na Loja do número)? */
  existe(id: string): Promise<{ existe: boolean; erro: string | null }>;
}

export interface ResultadoDoStatus {
  recebidos: number;
  /** Avisos com id e status que vale gravar, na ordem em que chegaram. */
  avisos: AvisoDeStatus[];
  gravados: number;
  /** Mensagem já no mesmo status ou à frente. */
  iguais: number;
  /** Sem id, status sem efeito ou mensagem recebida. */
  ignorados: number;
  semMensagem: string[];
  falhas: Array<{ id: string; erro: string }>;
}

export async function aplicarAvisosDeStatus(dados: unknown, deps: DepsDoStatus): Promise<ResultadoDoStatus> {
  const itens = Array.isArray(dados) ? dados : dados == null ? [] : [dados];
  const r: ResultadoDoStatus = {
    recebidos: itens.length, avisos: [], gravados: 0, iguais: 0, ignorados: 0, semMensagem: [], falhas: [],
  };

  for (const item of itens) {
    const aviso = lerAvisoDeStatus(item);
    if (!aviso) { r.ignorados++; continue; }
    r.avisos.push(aviso);

    const gravou = await deps.avancar(aviso.id, aviso.status, ANTERIORES[aviso.status]);
    if (gravou.erro) { r.falhas.push({ id: aviso.id, erro: gravou.erro }); continue; }
    if (gravou.linhas > 0) { r.gravados++; continue; }

    const achou = await deps.existe(aviso.id);
    if (achou.erro) r.falhas.push({ id: aviso.id, erro: achou.erro });
    else if (achou.existe) r.iguais++;
    else r.semMensagem.push(aviso.id);
  }
  return r;
}
