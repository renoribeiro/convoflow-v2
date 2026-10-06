import type { LojaConversationMetricsRow } from '@/hooks/useLojaStats';

/**
 * Números de atendimento do Dashboard — regras puras, sem React, para o
 * Vitest cobrir o que a tela escreve.
 *
 * Duas coisas são deliberadas aqui e não devem ser "simplificadas":
 *
 *   1. Bot e pessoa são DOIS números. O cartão antigo ("Tempo Médio de
 *      Resposta") somava os dois: na VagaCerta dava 8,4 min quando a 1ª
 *      resposta de uma pessoa levava, na mediana, 7,5 h. Um número que mistura
 *      os dois não diz nada a ninguém.
 *
 *   2. MEDIANA, não média. Meia dúzia de conversas esquecidas por dias puxam
 *      a média para ~52 h; a mediana (7,5 h) é o que acontece de fato na
 *      maior parte das conversas. O rótulo diz "na metade das conversas" para
 *      quem nunca ouviu a palavra mediana.
 */

/** "6 s", "12 min", "7 h 28 min", "2 d 3 h" — a unidade que cabe no número. */
export const formatMinutes = (minutes: number | null | undefined): string => {
  if (minutes === null || minutes === undefined || !Number.isFinite(minutes)) return '—';
  if (minutes < 1) return `${Math.max(1, Math.round(minutes * 60))} s`;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const totalMin = Math.round(minutes);
  const hours = Math.floor(totalMin / 60);
  const rest = totalMin % 60;
  if (hours < 24) return rest > 0 ? `${hours} h ${rest} min` : `${hours} h`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} d ${restHours} h` : `${days} d`;
};

/** Variação "menor é melhor": positiva quando ficou mais rápido. */
export const fasterPct = (current: number | null, previous: number | null): number | null => {
  if (current === null || previous === null) return null;
  if (previous === 0) return null;
  return ((previous - current) / previous) * 100;
};

/** Percentual inteiro de `part` em `total`; null sem base. */
export const sharePct = (part: number, total: number): number | null =>
  total > 0 ? Math.round((part / total) * 100) : null;

export interface AttendanceCardModel {
  key: 'bot' | 'human' | 'waiting' | 'noHuman' | 'botTouched' | 'duration';
  title: string;
  value: string;
  /** Uma frase curta: o que o número é — e o que ele não é. */
  description: string;
  /** Variação vs. período anterior, já no sentido "positivo = melhor"; null = não mostra. */
  deltaPct: number | null;
  href?: string;
  /** Número da Loja inteira (etiqueta "Toda a Loja" para atendente restrito). */
  lojaWide: boolean;
}

/**
 * Monta os seis cartões a partir da linha da RPC do período e da linha do
 * período anterior (para a variação das duas medianas). `current` null =
 * a RPC não devolveu nada (fora do alcance): tudo vira "—".
 */
export const buildAttendanceCards = (
  current: LojaConversationMetricsRow | null | undefined,
  previous: LojaConversationMetricsRow | null | undefined,
): AttendanceCardModel[] => {
  const c = current ?? null;
  const p = previous ?? null;

  const botTouched = c ? sharePct(c.n_bot_touched, c.n_conversations) : null;

  return [
    {
      key: 'bot',
      title: '1ª resposta do bot',
      value: formatMinutes(c?.median_first_bot_minutes),
      description: c && c.n_first_bot > 0
        ? `Na metade das ${c.n_first_bot} conversas o bot respondeu em até isso. Não conta pessoa.`
        : 'Quanto o cliente espera pela primeira mensagem do chatbot. Não conta pessoa.',
      deltaPct: fasterPct(c?.median_first_bot_minutes ?? null, p?.median_first_bot_minutes ?? null),
      lojaWide: true,
    },
    {
      key: 'human',
      title: '1ª resposta de uma pessoa',
      value: formatMinutes(c?.median_first_human_minutes),
      description: c && c.n_first_human > 0
        ? `Na metade das ${c.n_first_human} conversas alguém do time respondeu em até isso. Não conta bot.`
        : 'Quanto o cliente espera até alguém do time responder. Não conta bot nem campanha.',
      deltaPct: fasterPct(c?.median_first_human_minutes ?? null, p?.median_first_human_minutes ?? null),
      href: '/dashboard/conversations',
      lojaWide: true,
    },
    {
      key: 'waiting',
      title: 'Esperando uma pessoa agora',
      value: c ? String(c.n_waiting_human) : '—',
      description: c
        ? c.n_waiting_human_unowned > 0
          ? `Cliente falou por último e ninguém do time respondeu. ${c.n_waiting_human_unowned} sem responsável.`
          : 'Cliente falou por último e ninguém do time respondeu ainda.'
        : 'Conversas em que o cliente falou por último e ninguém do time respondeu.',
      deltaPct: null,
      href: '/dashboard/conversations',
      lojaWide: true,
    },
    {
      key: 'noHuman',
      title: 'Sem resposta de pessoa',
      value: c ? String(c.n_no_human_reply) : '—',
      description: 'Conversas do período em que só o bot falou (ou ninguém). Não conta como atendida.',
      deltaPct: null,
      href: '/dashboard/conversations',
      lojaWide: true,
    },
    {
      key: 'botTouched',
      title: 'Bot participou',
      value: botTouched === null ? '—' : `${botTouched}%`,
      description: c
        ? `${c.n_bot_touched} de ${c.n_conversations} conversas do período tiveram pelo menos uma mensagem do bot.`
        : 'Conversas do período com pelo menos uma mensagem do chatbot.',
      deltaPct: null,
      lojaWide: true,
    },
    {
      key: 'duration',
      title: 'Duração da conversa',
      value: formatMinutes(c?.median_duration_minutes),
      description: c && c.median_messages !== null
        ? `Da primeira à última mensagem, na metade das conversas. Mediana de ${Math.round(c.median_messages)} mensagens por conversa.`
        : 'Da primeira à última mensagem, na metade das conversas do período.',
      deltaPct: null,
      lojaWide: true,
    },
  ];
};
