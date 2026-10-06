// Reserva de uma linha de campaign_executions pelo process-campaign-dispatch.
//
// Item 14, lote 2 (2026-09-29): a reserva era um UPDATE só por id, sem olhar o
// status. Duas execuções sobrepostas (o cron e uma chamada extra) liam a mesma
// linha 'pending', as duas "reservavam" e as duas enviavam — mensagem em
// dobro para o mesmo contato. Agora o UPDATE só pega a linha se ela ainda está
// 'pending', e quem não recebe a linha de volta pula.
//
// Sem Deno e sem import por URL: o Vitest importa este arquivo
// (src/lib/campaigns/campaignClaim.test.ts).

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

export type ClaimResult = 'claimed' | 'taken' | 'error';

export async function claimExecution(
  db: Db,
  executionId: string,
  nowIso: string = new Date().toISOString(),
): Promise<{ result: ClaimResult; error?: string }> {
  const { data, error } = await db
    .from('campaign_executions')
    .update({ status: 'processing', updated_at: nowIso })
    .eq('id', executionId)
    .eq('status', 'pending')
    .select('id');

  if (error) return { result: 'error', error: error.message ?? String(error) };
  if (!Array.isArray(data) || data.length === 0) return { result: 'taken' };
  return { result: 'claimed' };
}
