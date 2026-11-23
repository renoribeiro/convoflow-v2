// =============================================================================
// aviso-de-espera.ts — o texto e a marca do aviso de espera (2026-11-23)
// =============================================================================
// Quando a última mensagem da conversa é da paciente, o bot não está esperando
// resposta dela e ninguém da equipe respondeu em N minutos, sai UMA vez este
// texto. Só sai de novo depois que uma pessoa da equipe responder.
//
// Por Loja, em tenants.settings:
//   waiting_notice_enabled  (true liga; ausente = desligado)
//   waiting_notice_minutes  (1 a 240; padrão 5)
// Com business_hours salvo, só sai dentro do horário (e só conta minuto
// aberto); sem horário salvo, sai a qualquer hora.
// Quem decide é public.aviso_de_espera_pendentes() (migração 20261123000001);
// quem envia é a edge function aviso-de-espera.
// =============================================================================

export const FONTE_DO_AVISO = 'aviso_espera';

export const TEXTO_DO_AVISO_DE_ESPERA =
  'Recebemos sua mensagem! Estamos com uma demanda alta agora e, como aqui o atendimento é feito por pessoas, com toda a atenção que você merece, pode levar só alguns minutinhos. Já já falo com você!';
