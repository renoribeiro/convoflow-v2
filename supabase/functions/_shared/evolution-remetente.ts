// =============================================================================
// evolution-remetente.ts — quem é a pessoa da conversa num evento do Evolution
// =============================================================================
// Correção de 2026-11-18. Até aqui o evolution-webhook tirava o telefone do
// campo `sender` do corpo do webhook. No Evolution v2 esse campo é o número do
// PRÓPRIO celular conectado (o wuid da instância), igual em todo evento: toda
// mensagem recebida num número QR Code virava um contato só (Loja Clínica
// Essence, 60 mensagens de pessoas diferentes num contato), e o bot respondia
// para o próprio número.
//
// A regra agora (conferida com mensagens reais via /chat/findMessages em
// 2026-11-18, Evolution v2.3.7):
//   - quem conversa é `key.remoteJid`;
//   - quando ele é um @lid (endereço sem telefone), o telefone vem em
//     `key.remoteJidAlt` (Baileys novo) ou `key.senderPn` (Baileys antigo);
//   - grupo (@g.us), status e listas (@broadcast) e canal (@newsletter) não são
//     pessoa: o evento é ignorado;
//   - o número da própria instância nunca vira contato (é a mensagem para si
//     mesmo, ou o `sender`, que só serve para reconhecer esse número).
//   - @lid sem telefone: não dá para saber quem é; ignora e avisa no log (usar
//     os dígitos do @lid como telefone mandaria resposta para outra pessoa).
//
// O mesmo vale para a mensagem que a Loja manda (fromMe): remoteJid é o
// destino. Sem I/O: o Vitest testa sem Deno.
// =============================================================================

export type TipoDoJid = 'pessoa' | 'lid' | 'grupo' | 'status' | 'canal' | 'outro';

export function tipoDoJid(jid: unknown): TipoDoJid {
  if (typeof jid !== 'string' || !jid.trim()) return 'outro';
  const j = jid.trim().toLowerCase();
  if (j.endsWith('@g.us')) return 'grupo';
  if (j.endsWith('@broadcast')) return 'status';
  if (j.endsWith('@newsletter')) return 'canal';
  if (j.endsWith('@lid')) return 'lid';
  if (j.endsWith('@s.whatsapp.net') || j.endsWith('@c.us')) return 'pessoa';
  if (/^\+?\d{8,15}$/.test(j)) return 'pessoa';
  return 'outro';
}

/** Os dígitos do telefone de um JID de pessoa (aparelho `:N` removido); null se não for pessoa. */
export function telefoneDoJid(jid: unknown): string | null {
  if (tipoDoJid(jid) !== 'pessoa') return null;
  const usuario = (String(jid).trim().split('@')[0] ?? '').split(':')[0] ?? '';
  const digitos = usuario.replace(/\D/g, '');
  return digitos.length >= 8 ? digitos : null;
}

/** Os números da própria instância: o `sender` do webhook e o phone_number da linha. */
export function numerosDaInstancia(sender: unknown, telefoneDaLinha: unknown): Set<string> {
  const proprios = new Set<string>();
  const doSender = telefoneDoJid(sender);
  if (doSender) proprios.add(doSender);
  if (typeof telefoneDaLinha === 'string') {
    const d = telefoneDaLinha.replace(/\D/g, '');
    if (d.length >= 8) proprios.add(d);
  }
  return proprios;
}

/** Os campos de remetente guardados em messages.metadata.evolution (sem nome, sem texto). */
export interface DadosDoRemetente {
  remoteJid: string | null;
  remoteJidAlt: string | null;
  participant: string | null;
  fromMe: boolean;
  instance: string;
}

export type MotivoParaIgnorar =
  | 'sem_remote_jid'
  | 'grupo'
  | 'status'
  | 'canal'
  | 'lid_sem_telefone'
  | 'sem_telefone'
  | 'numero_da_instancia';

export type Remetente =
  | { ok: true; telefone: string; dados: DadosDoRemetente }
  | { ok: false; motivo: MotivoParaIgnorar; dados: DadosDoRemetente };

type ChaveEvolution = {
  remoteJid?: unknown;
  remoteJidAlt?: unknown;
  senderPn?: unknown;
  participant?: unknown;
  fromMe?: unknown;
} | null | undefined;

const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Quem é a pessoa da conversa: o telefone, ou o motivo para ignorar o evento.
 * `sender` é o campo do corpo do webhook (o próprio número): só para excluir.
 */
export function resolverRemetenteEvolution(p: {
  key: ChaveEvolution;
  sender?: unknown;
  telefoneDaInstancia?: unknown;
  instancia: string;
}): Remetente {
  const key = p.key ?? {};
  const remoteJid = texto(key.remoteJid);
  const alternativo = texto(key.remoteJidAlt) ?? texto(key.senderPn);
  const dados: DadosDoRemetente = {
    remoteJid,
    remoteJidAlt: alternativo,
    participant: texto(key.participant),
    fromMe: key.fromMe === true,
    instance: p.instancia,
  };
  if (!remoteJid) return { ok: false, motivo: 'sem_remote_jid', dados };

  const tipo = tipoDoJid(remoteJid);
  if (tipo === 'grupo' || tipo === 'status' || tipo === 'canal') return { ok: false, motivo: tipo, dados };

  let telefone: string | null;
  if (tipo === 'pessoa') {
    telefone = telefoneDoJid(remoteJid);
  } else {
    telefone = telefoneDoJid(alternativo);
    if (!telefone) {
      return { ok: false, motivo: tipo === 'lid' ? 'lid_sem_telefone' : 'sem_telefone', dados };
    }
  }
  if (!telefone) return { ok: false, motivo: 'sem_telefone', dados };

  if (numerosDaInstancia(p.sender, p.telefoneDaInstancia).has(telefone)) {
    return { ok: false, motivo: 'numero_da_instancia', dados };
  }
  return { ok: true, telefone, dados };
}
