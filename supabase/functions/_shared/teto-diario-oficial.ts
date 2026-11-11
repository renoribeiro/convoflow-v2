// =============================================================================
// teto-diario-oficial.ts — quantas mensagens um número da API Oficial manda
// por dia nas campanhas (process-campaign-dispatch, "Gate A").
// =============================================================================
// Regra pura, zero I/O, para o Vitest testar sem Deno.
//
//   número novo (conectado e registrado pelo ConvoFlow): o aquecimento da
//     primeira semana, contado de registered_at: 50 por dia nos dois primeiros
//     dias, 250 até o quarto, 1.000 até o sétimo; depois, sem teto nosso.
//   número que já funcionava em outra empresa (registered_elsewhere): SEM
//     aquecimento. O teto é o limite que a Meta informa para ele
//     (whatsapp_business_manager_messaging_limit, gravado em
//     messaging_limit_tier pela conexão e pelos avisos da Meta). Limite
//     desconhecido ou ilimitado: sem teto nosso; a Meta segue valendo.
//
// O contador é o mesmo do aquecimento (instance_outbound_today: tudo o que
// saiu pelo número desde a meia noite de Brasília). A Meta conta pessoas
// diferentes fora da janela de 24 horas, numa janela móvel; o nosso é mais
// cauteloso, nunca mais solto.
// Fonte do limite: developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
// =============================================================================

export type MotivoDoTeto = 'aquecimento' | 'limite_da_meta';

export interface TetoDiario {
  /** Máximo de mensagens no dia; null = sem teto do ConvoFlow. */
  teto: number | null;
  motivo: MotivoDoTeto | null;
  /** Dias desde o registro (só faz sentido no aquecimento). */
  dias: number;
}

/** TIER_250 → 250, TIER_2K → 2000, TIER_100K → 100000, TIER_UNLIMITED → null. */
export function limiteDaMetaEmMensagens(tier: string | null | undefined): number | null {
  const m = /^TIER_(\d+)(K?)$/.exec(String(tier ?? '').trim().toUpperCase());
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === 'K' ? 1000 : 1);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function tetoDiarioDoNumeroOficial(i: {
  registeredElsewhere?: boolean | null;
  registeredAt?: string | null;
  createdAt?: string | null;
  messagingLimitTier?: string | null;
  agoraMs: number;
}): TetoDiario {
  if (i.registeredElsewhere === true) {
    const teto = limiteDaMetaEmMensagens(i.messagingLimitTier);
    return { teto, motivo: teto === null ? null : 'limite_da_meta', dias: 999 };
  }

  const base = i.registeredAt || i.createdAt;
  const dias = base ? Math.floor((i.agoraMs - new Date(base).getTime()) / 86_400_000) : 999;
  let teto: number | null = null;
  if (dias < 2) teto = 50;
  else if (dias < 4) teto = 250;
  else if (dias < 7) teto = 1000;
  return { teto, motivo: teto === null ? null : 'aquecimento', dias };
}

/** O motivo que fica na execução pulada (aparece no relatório da campanha). */
export function motivoDoTetoAtingido(t: TetoDiario): string {
  if (t.motivo === 'limite_da_meta') {
    return (
      `Limite do dia que a Meta informa para este número: até ${t.teto} mensagens por dia. ` +
      'Ele já funcionava em outra empresa, então não passa pelo aquecimento. O dia vira à meia noite de Brasília.'
    );
  }
  return (
    `Teto de aquecimento do dia: o número foi registrado há ${t.dias} dia(s) e nesta fase manda até ${t.teto} mensagens por dia. ` +
    'O dia vira à meia noite de Brasília.'
  );
}
