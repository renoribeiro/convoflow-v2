/**
 * Instâncias e APIs em duas seções (fatia 4a do Instagram): instâncias de
 * WhatsApp e contas do Instagram. Puro, para o teste provar que as contagens
 * do topo continuam certas com as duas seções.
 *
 * Instagram nunca é "instância" nem tem "chave" para quem usa a tela.
 */
import { channelOfProvider } from '@/lib/conversations/channel';
import { instagramConnectionIsUsable, instagramConnectionView } from '@/lib/instagram/connection';

export interface ConnectionRow {
  provider?: string | null;
  status?: string | null;
  is_active?: boolean | null;
  connection_config?: unknown;
  profile_name?: string | null;
}

export function splitByChannel<T extends ConnectionRow>(rows: readonly T[]): { whatsapp: T[]; instagram: T[] } {
  const whatsapp: T[] = [];
  const instagram: T[] = [];
  for (const r of rows) (channelOfProvider(r.provider) === 'instagram' ? instagram : whatsapp).push(r);
  return { whatsapp, instagram };
}

/**
 * Só as instâncias de WhatsApp. Todo seletor de "Instância do WhatsApp"
 * (campanha, chatbot, número de envio do sistema, nova conversa) passa por
 * aqui: a conta do Instagram mora na mesma tabela, mas não envia campanha,
 * não roda chatbot e não manda mensagem de WhatsApp. Provider nulo (legado) é
 * WhatsApp.
 */
export function onlyWhatsApp<T extends { provider?: string | null }>(rows: readonly T[]): T[] {
  return rows.filter((r) => channelOfProvider(r.provider) === 'whatsapp');
}

/**
 * Status de WhatsApp que quer dizer "conectado". 'open' é o da Evolution e da
 * API Oficial; 'connected' é o do WAHA (o waha-webhook grava WORKING assim).
 * Até 2026-10-21 as telas só aceitavam 'open' e um número WAHA funcionando
 * aparecia como "Desconectado". A função onboarding_checklist (SQL) usa a
 * mesma dupla: mudou aqui, muda lá.
 */
export function isWhatsAppConnectedStatus(status: string | null | undefined): boolean {
  return status === 'open' || status === 'connected';
}

/**
 * Conectado = WhatsApp com status de conectado (ver acima) ou Instagram LIGADO
 * (fatia 4b: desligada não recebe nada) com acesso que atende (válido,
 * vencendo, ou sem validade legível).
 */
export function isConnected(row: ConnectionRow, now: Date): boolean {
  if (channelOfProvider(row.provider) === 'instagram') {
    if (row.is_active === false) return false;
    return instagramConnectionIsUsable(instagramConnectionView(row.connection_config, now));
  }
  return isWhatsAppConnectedStatus(row.status);
}

export interface ConnectionSummary {
  total: number;
  connected: number;
  disconnected: number;
  whatsapp: number;
  instagram: number;
}

export function connectionSummary(rows: readonly ConnectionRow[], now: Date): ConnectionSummary {
  const { whatsapp, instagram } = splitByChannel(rows);
  const connected = rows.filter((r) => isConnected(r, now)).length;
  return {
    total: rows.length,
    connected,
    disconnected: rows.length - connected,
    whatsapp: whatsapp.length,
    instagram: instagram.length,
  };
}

/**
 * Rótulo do primeiro contador. Sem Instagram, o de sempre ("Total de
 * Instâncias"); com Instagram, "Total de conexões" e a divisão por canal.
 */
export function totalCardTexts(summary: ConnectionSummary): { label: string; breakdown: string | null } {
  if (summary.instagram === 0) return { label: 'Total de números', breakdown: null };
  const wa = summary.whatsapp === 1 ? '1 número de WhatsApp' : `${summary.whatsapp} números de WhatsApp`;
  const ig = summary.instagram === 1 ? '1 conta do Instagram' : `${summary.instagram} contas do Instagram`;
  return { label: 'Total de conexões', breakdown: `${wa} · ${ig}` };
}

/**
 * O @ da conta do Instagram: `connection_config.igUsername` (gravado na
 * conexão) e, sem ele, `profile_name`. Sempre com um "@" só.
 */
export function instagramAccountHandle(row: ConnectionRow): string | null {
  const cfg =
    row.connection_config && typeof row.connection_config === 'object' && !Array.isArray(row.connection_config)
      ? (row.connection_config as Record<string, unknown>)
      : {};
  const raw = typeof cfg.igUsername === 'string' && cfg.igUsername.trim() ? cfg.igUsername : row.profile_name;
  const clean = (raw ?? '').trim().replace(/^@+/, '');
  return clean ? `@${clean}` : null;
}

/** Estado do número em português (o banco guarda em inglês: open, close...). */
export function estadoDoNumeroTexto(status: string | null | undefined): string {
  const s = (status ?? '').toLowerCase();
  if (s === 'open' || s === 'connected' || s === 'working') return 'Conectado';
  if (s === 'connecting' || s === 'starting') return 'Conectando';
  if (s === 'qrcode' || s === 'scan_qr_code') return 'Esperando o QR Code';
  return 'Desconectado';
}
