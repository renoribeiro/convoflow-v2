// Lógica PURA das ações de automação, compartilhada entre a Edge Function
// `automation-processor` (Deno) e os testes Vitest (Node).
//
// IMPORTANTE: não importe nada específico de Deno aqui — este módulo precisa ser
// importável nos dois runtimes (igual a `followup-logic.ts`). Mantém os contratos
// frágeis (ex.: o shape do job que o job-worker consome) num único lugar testável.

export interface SendMessageJobData {
  // == whatsapp_instances.instance_key. O job-worker (processSendMessage) resolve
  // a instância por `instance_key`, NÃO pelo UUID — por isso o campo se chama
  // `instanceName` e carrega a instance_key.
  instanceName: string;
  phone: string;
  message: string;
  contactId: string;
  source: string;
}

/**
 * Monta o `job_data` do job 'send_message' no shape EXATO que o `job-worker`
 * consome. Centralizar aqui evita divergência silenciosa com o worker.
 */
export function buildSendMessageJobData(opts: {
  instanceKey: string;
  phone: string;
  message: string;
  contactId: string;
}): SendMessageJobData {
  return {
    instanceName: opts.instanceKey,
    phone: opts.phone,
    message: opts.message,
    contactId: opts.contactId,
    source: 'automation',
  };
}

/** Normaliza o nome da tag (trim). Retorna '' quando ausente/branco. */
export function normalizeTagName(raw: string | null | undefined): string {
  return (raw ?? '').trim();
}
