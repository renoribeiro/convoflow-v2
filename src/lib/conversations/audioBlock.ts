/**
 * Por que o microfone da conversa está travado (null = liberado).
 *
 * A regra é "não deixar gravar para falhar depois": se o envio já vai ser
 * recusado (número desconectado, janela de 24 h da Meta fechada, contato sem
 * telefone), o botão avisa ANTES de a pessoa falar.
 */
export const MOTIVOS_AUDIO_BLOQUEADO = {
  semInstancia: 'Nenhuma instância de WhatsApp disponível para enviar áudio.',
  desconectada: (nome: string) => `A instância "${nome}" não está conectada. Reconecte antes de enviar áudio.`,
  janelaFechada:
    'Fora da janela de 24h: o cliente não escreve há mais de 24 horas. Envie um template aprovado para reabrir a conversa.',
  semTelefone: 'Este contato não tem número de WhatsApp para receber o áudio.',
} as const;

export type EstadoEnvioAudio = {
  /** Há instância de WhatsApp para esta conversa. */
  temInstancia: boolean;
  nomeInstancia?: string | null;
  /** `adapter.isReadyToSend()`. */
  conectada: boolean;
  /** Número oficial (Meta) e o cliente não escreve há mais de 24 h. */
  foraDaJanela24h: boolean;
  temTelefone: boolean;
};

export function motivoAudioBloqueado(e: EstadoEnvioAudio): string | null {
  if (!e.temInstancia) return MOTIVOS_AUDIO_BLOQUEADO.semInstancia;
  if (!e.conectada) return MOTIVOS_AUDIO_BLOQUEADO.desconectada(e.nomeInstancia || 'WhatsApp');
  if (!e.temTelefone) return MOTIVOS_AUDIO_BLOQUEADO.semTelefone;
  if (e.foraDaJanela24h) return MOTIVOS_AUDIO_BLOQUEADO.janelaFechada;
  return null;
}
