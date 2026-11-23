// =============================================================================
// aviso-de-espera.ts — o texto e a marca do aviso de espera (2026-11-23)
// =============================================================================
// Quando a última mensagem da conversa é da paciente, o bot não está esperando
// resposta dela e ninguém da equipe respondeu em N minutos, sai UMA vez este
// texto. Só sai de novo depois que uma pessoa da equipe responder.
//
// Por Loja, em tenants.settings, ajustadas no cartão "Aviso quando ninguém
// responde" da aba Automação (Gerente e Gestor, pela RPC set_tenant_settings):
//   waiting_notice_enabled        (true liga; ausente = desligado)
//   waiting_notice_minutes        (1 a 240; padrão 5)
//   waiting_notice_text           (1 a 1000 letras; ausente = o texto abaixo)
//   waiting_notice_respect_hours  (false ignora o horário; ausente = respeita)
// Respeitando o horário e com business_hours salvo, só sai dentro do horário
// (e só conta minuto aberto); sem horário salvo, sai a qualquer hora.
// Quem decide é public.aviso_de_espera_pendentes() (migrações 20261123000001 e
// 20261123000002); quem envia é a edge function aviso-de-espera.
// =============================================================================

export const FONTE_DO_AVISO = 'aviso_espera';

export const TEXTO_DO_AVISO_DE_ESPERA =
  'Recebemos sua mensagem! Estamos com uma demanda alta agora e, como aqui o atendimento é feito por pessoas, com toda a atenção que você merece, pode levar só alguns minutinhos. Já já falo com você!';

/** Tamanho máximo do texto do aviso (o CHECK do banco diz o mesmo). */
export const LIMITE_DO_TEXTO_DO_AVISO = 1000;
/** Minutos aceitos pelo cartão e pelo banco. */
export const MINUTOS_DO_AVISO = { min: 1, max: 240, padrao: 5 } as const;

/** O texto que sai na Loja: o do cartão, ou o padrão quando não há texto salvo. */
export function textoDoAviso(settings: unknown): string {
  const t = (settings as { waiting_notice_text?: unknown } | null | undefined)?.waiting_notice_text;
  if (typeof t === 'string') {
    const limpo = t.trim();
    if (limpo && limpo.length <= LIMITE_DO_TEXTO_DO_AVISO) return limpo;
  }
  return TEXTO_DO_AVISO_DE_ESPERA;
}
