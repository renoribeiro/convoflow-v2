// =============================================================================
// evolution-apagada.ts: mensagem apagada pelo contato ("apagar para todos")
// =============================================================================
// Correção de 2026-11-24. Conferido no código do tag 2.3.7 do Evolution
// (whatsapp.baileys.service.ts). O apagar chega por dois caminhos:
//   - `messages.delete` (handler de 'messages.update', quando
//     `update.message === null && update.status === undefined`): o corpo é a
//     key solta, `{ ...key, status: 'DELETED' }` = { id, remoteJid, fromMe,
//     participant, status }. O Evolution pula este aviso quando guarda as
//     mensagens no banco dele e não acha a original;
//   - `messages.edited` (handler de 'messages.upsert'): toda mensagem de
//     protocolo vai com esse nome, com o protocolMessage cru no corpo. Apagar é
//     `type` REVOKE (0; em JSON sai "REVOKE" ou, por ser o valor padrão, nem
//     sai) com `key.id` da mensagem apagada. Edição de verdade é MESSAGE_EDIT
//     (14), com `editedMessage`: só registro, nada muda.
// Os dois podem chegar para o mesmo apagar; gravar de novo não muda nada.
//
// Decisão do dono (2026-11-24, opção a): o texto original não fica guardado.
// A linha fica com content "[Mensagem apagada]", metadata.deleted true e
// status 'deleted'. O status leva junto a prévia da lista de conversas (trigger
// sync_conversation_last_message), que senão continuaria com o texto; nenhum
// aviso de entrega volta uma linha 'deleted' (ANTERIORES em evolution-status.ts).
// A tela mostra "Esta mensagem foi apagada." (MessageBubble, metadata.deleted).
//
// O arquivo também não fica (2026-11-25, evolution-midia.ts): media_url é
// limpo e a foto, o áudio, o vídeo ou o documento guardado em
// <loja>/inbound/<id>.* ou <loja>/celular/<id>.* sai do bucket. Anexo enviado
// pela tela ou por campanha fica: o arquivo de campanha é o mesmo para muitas
// mensagens. Se o download ainda estiver em andamento, ele mesmo confere o
// status no fim e remove o que subiu.
//
// A busca e a gravação ficam na Loja do número. Sem Deno: o Vitest testa tudo,
// inclusive o filtro da Loja, por um cliente de mentira.
// =============================================================================

import { WHATSAPP_MEDIA_BUCKET } from './media-links.ts';
import { caminhosPossiveis } from './evolution-midia.ts';

export const TEXTO_DA_APAGADA = '[Mensagem apagada]';

const obj = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

const itensDe = (dados: unknown): unknown[] => (Array.isArray(dados) ? dados : dados == null ? [] : [dados]);

/** Id da mensagem apagada num item de `messages.delete` (2.3.7: key solta; antigo: `{ key: { id } }`). */
export function idDoMessagesDelete(item: unknown): string | null {
  const o = obj(item);
  if (!o) return null;
  return texto(obj(o.key)?.id) ?? texto(o.id);
}

/** O protocolMessage de `messages.edited` é um apagar? */
export function ehRevogacao(protocolo: Record<string, unknown>): boolean {
  const tipo = protocolo.type;
  if (tipo === 0 || tipo === '0') return true;
  if (typeof tipo === 'string') return tipo.trim().toUpperCase() === 'REVOKE';
  // REVOKE é o valor padrão do enum: o JSON pode vir sem `type`. Edição sempre
  // traz `type` 14 e `editedMessage`.
  return tipo == null && protocolo.editedMessage == null;
}

/** Id da mensagem apagada num item de `messages.edited`; null quando é edição ou não há id. */
export function idDoMessagesEdited(item: unknown): string | null {
  const o = obj(item);
  if (!o) return null;
  const protocolo = obj(o.protocolMessage) ?? o;
  if (!ehRevogacao(protocolo)) return null;
  return texto(obj(protocolo.key)?.id);
}

export type EventoDeApagada = 'messages.delete' | 'messages.edited';

export interface LinhaDaMensagem {
  id: string;
  metadata: unknown;
}

export interface DepsDaApagada {
  /** Mensagens da Loja com esse id do WhatsApp. */
  buscar(idDoWhatsapp: string): Promise<{ linhas: LinhaDaMensagem[]; erro: string | null }>;
  /** Marca uma linha como apagada, com a metadata já completa (e sem media_url). */
  marcar(linhaId: string, metadata: Record<string, unknown>): Promise<{ erro: string | null }>;
  /** Tira do bucket o arquivo guardado pelo servidor para esse id do WhatsApp. */
  removerArquivos(idDoWhatsapp: string): Promise<{ removidos: number; erro: string | null }>;
}

export interface ResultadoDaApagada {
  recebidos: number;
  /** Ids do WhatsApp lidos como apagar, na ordem em que chegaram. */
  ids: string[];
  /** Linhas marcadas como apagadas. */
  marcadas: number;
  /** Arquivos tirados do bucket. */
  arquivosRemovidos: number;
  /** Sem id, ou edição de verdade (messages.edited). */
  ignorados: number;
  /** Nenhuma mensagem com esse id na Loja do número. */
  semMensagem: string[];
  falhas: Array<{ id: string; erro: string }>;
}

/** O que gravar numa linha apagada: o texto sai, a metadata ganha `deleted: true`. */
export function gravacaoDaApagada(metadataAtual: unknown): { content: string; status: 'deleted'; metadata: Record<string, unknown> } {
  return {
    content: TEXTO_DA_APAGADA,
    status: 'deleted',
    metadata: { ...(obj(metadataAtual) ?? {}), deleted: true },
  };
}

export async function aplicarApagadas(
  evento: EventoDeApagada,
  dados: unknown,
  deps: DepsDaApagada,
): Promise<ResultadoDaApagada> {
  const itens = itensDe(dados);
  const ler = evento === 'messages.delete' ? idDoMessagesDelete : idDoMessagesEdited;
  const r: ResultadoDaApagada = { recebidos: itens.length, ids: [], marcadas: 0, arquivosRemovidos: 0, ignorados: 0, semMensagem: [], falhas: [] };

  for (const item of itens) {
    const id = ler(item);
    if (!id) { r.ignorados++; continue; }
    if (r.ids.includes(id)) continue;
    r.ids.push(id);

    const achou = await deps.buscar(id);
    if (achou.erro) { r.falhas.push({ id, erro: achou.erro }); continue; }
    if (achou.linhas.length === 0) { r.semMensagem.push(id); continue; }

    let marcouAlguma = false;
    for (const linha of achou.linhas) {
      const gravou = await deps.marcar(linha.id, gravacaoDaApagada(linha.metadata).metadata);
      if (gravou.erro) r.falhas.push({ id, erro: gravou.erro });
      else { r.marcadas++; marcouAlguma = true; }
    }
    // Depois de marcar: um download que termine agora já acha a linha apagada.
    if (marcouAlguma) {
      const removeu = await deps.removerArquivos(id);
      if (removeu.erro) r.falhas.push({ id, erro: `arquivo: ${removeu.erro}` });
      else r.arquivosRemovidos += removeu.removidos;
    }
  }
  return r;
}

/**
 * O mínimo do cliente do Supabase que a gravação usa (tipado à mão para o
 * Vitest não precisar do esm.sh).
 */
export interface ClienteDoBanco {
  // deno-lint-ignore no-explicit-any
  from(tabela: string): any;
  // deno-lint-ignore no-explicit-any
  storage: { from(bucket: string): any };
}

/** Busca e gravação reais, presas à Loja do número (`tenant_id`), como os avisos de status. */
export function depsDoBanco(supabase: ClienteDoBanco, tenantId: string): DepsDaApagada {
  return {
    async buscar(idDoWhatsapp) {
      const { data, error } = await supabase.from('messages')
        .select('id, metadata')
        .eq('tenant_id', tenantId)
        .eq('evolution_message_id', idDoWhatsapp);
      if (error) return { linhas: [], erro: String(error.message ?? error) };
      const linhas = (Array.isArray(data) ? data : []).map((l: { id: string; metadata: unknown }) => ({ id: l.id, metadata: l.metadata }));
      return { linhas, erro: null };
    },
    async marcar(linhaId, metadata) {
      const { data, error } = await supabase.from('messages')
        .update({ content: TEXTO_DA_APAGADA, status: 'deleted', metadata, media_url: null })
        .eq('tenant_id', tenantId)
        .eq('id', linhaId)
        .select('id');
      if (error) return { erro: String(error.message ?? error) };
      if (!Array.isArray(data) || data.length === 0) return { erro: 'nenhuma linha gravada' };
      return { erro: null };
    },
    async removerArquivos(idDoWhatsapp) {
      const caminhos = caminhosPossiveis(tenantId, idDoWhatsapp);
      if (caminhos.length === 0) return { removidos: 0, erro: null };
      const { data, error } = await supabase.storage.from(WHATSAPP_MEDIA_BUCKET).remove(caminhos);
      if (error) return { removidos: 0, erro: String(error.message ?? error) };
      return { removidos: Array.isArray(data) ? data.length : 0, erro: null };
    },
  };
}
