/**
 * Modo de manutenção — a regra, num lugar só.
 *
 * Este arquivo não fala com o banco. Ele é o espelho em TypeScript da função
 * `public.maintenance_state()` (migração 20260901000001) e existe por dois
 * motivos:
 *
 *   1. o painel do superadmin precisa mostrar o estado da janela que ELE está
 *      montando, antes de salvar — e não dá para perguntar ao servidor sobre
 *      uma janela que ainda não existe;
 *   2. a regra fica testável sem banco (ver maintenanceState.test.ts).
 *
 * QUEM DECIDE DE VERDADE É O SERVIDOR. Para bloquear alguém, quem manda é o
 * `active` que a RPC devolveu, calculado com o relógio do servidor. Este módulo
 * nunca é usado para trancar ninguém — só para exibir. A diferença importa: o
 * relógio do computador do cliente pode estar em 2019, e isso não pode ligar
 * nem desligar a manutenção de ninguém.
 *
 * FALHA ABERTA. Toda entrada que este módulo não entende vira "desligado".
 */

/** O que fica gravado em `system_settings.value` na chave 'maintenance_mode'. */
export interface MaintenanceConfig {
  /** Interruptor mestre. `false` desliga tudo, independente da janela. */
  enabled: boolean;
  /** Texto em pt-BR que o usuário bloqueado lê. */
  reason: string | null;
  /** Início da janela (ISO). `null` = começa na hora em que foi ligada. */
  startsAt: string | null;
  /** Fim da janela (ISO) — é também a previsão de retorno mostrada na tela. */
  endsAt: string | null;
}

/** Chave da linha em `public.system_settings`. */
export const MAINTENANCE_KEY = 'maintenance_mode';

export const MAINTENANCE_OFF: MaintenanceConfig = {
  enabled: false,
  reason: null,
  startsAt: null,
  endsAt: null,
};

/**
 * Situação em que a configuração se encontra AGORA.
 *
 *   off       — desligada.
 *   scheduled — ligada, mas a janela ainda não começou. Sistema aberto.
 *   active    — bloqueando todo mundo menos o superadmin.
 *   ended     — a janela passou do fim. Sistema aberto, sem ninguém ter mexido.
 *
 * `ended` e `off` bloqueiam igual (não bloqueiam). São estados separados porque
 * o painel precisa dizer ao superadmin "aquela janela que você marcou já
 * acabou" em vez de fingir que nunca existiu.
 */
export type MaintenanceStatus = 'off' | 'scheduled' | 'active' | 'ended';

export interface MaintenanceResolution {
  status: MaintenanceStatus;
  /** Bloqueia quem não é superadmin. Só `status === 'active'`. */
  active: boolean;
}

/** Data ISO válida vira Date; qualquer outra coisa vira null. */
function paraData(iso: string | null | undefined): Date | null {
  if (!iso || typeof iso !== 'string') return null;
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * Lê o JSONB cru de `system_settings.value`.
 *
 * Devolve `null` quando o valor não é uma configuração reconhecível — e quem
 * chama trata `null` como desligado. É o mesmo contrato do lado do banco: o que
 * não dá para entender não tranca ninguém.
 */
export function parseMaintenanceConfig(value: unknown): MaintenanceConfig | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const bruto = value as Record<string, unknown>;
  const texto = (campo: unknown): string | null => {
    if (typeof campo !== 'string') return null;
    const limpo = campo.trim();
    return limpo === '' ? null : limpo;
  };

  return {
    enabled: bruto.enabled === true,
    reason: texto(bruto.reason),
    // Data impossível vira null em vez de derrubar a leitura: uma janela sem
    // fim reconhecível é melhor que uma tela em branco.
    startsAt: paraData(texto(bruto.starts_at))?.toISOString() ?? null,
    endsAt: paraData(texto(bruto.ends_at))?.toISOString() ?? null,
  };
}

/** Serializa de volta para o formato que o banco e a RPC esperam. */
export function serializeMaintenanceConfig(config: MaintenanceConfig): Record<string, unknown> {
  return {
    enabled: config.enabled,
    reason: config.reason,
    starts_at: config.startsAt,
    ends_at: config.endsAt,
  };
}

/**
 * A regra. Mesma ordem de avaliação da função SQL — mudou aqui, muda lá.
 *
 * O fim da janela é conferido ANTES do início de propósito: uma janela
 * inteiramente no passado tem de resolver para `ended`, não para `active`.
 */
export function resolveMaintenance(
  config: MaintenanceConfig | null | undefined,
  now: Date,
): MaintenanceResolution {
  if (!config || !config.enabled) return { status: 'off', active: false };

  const fim = paraData(config.endsAt);
  if (fim && now.getTime() >= fim.getTime()) {
    return { status: 'ended', active: false };
  }

  const inicio = paraData(config.startsAt);
  if (inicio && now.getTime() < inicio.getTime()) {
    return { status: 'scheduled', active: false };
  }

  return { status: 'active', active: true };
}

// ---------------------------------------------------------------- Formatação

const FORMATO_COMPLETO = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});

const FORMATO_HORA = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * "hoje às 14:30" quando é hoje, "05/09 às 14:30" quando não é.
 *
 * Vale a distinção: numa manutenção que termina daqui a 40 minutos, ler "hoje
 * às 14:30" responde a pergunta na hora; ler "01/09 às 14:30" obriga a pessoa a
 * conferir que dia é hoje antes de saber se pode esperar.
 */
export function formatarMomento(iso: string | null | undefined, now = new Date()): string | null {
  const data = paraData(iso ?? null);
  if (!data) return null;

  const mesmoDia =
    data.getDate() === now.getDate() &&
    data.getMonth() === now.getMonth() &&
    data.getFullYear() === now.getFullYear();

  return mesmoDia
    ? `hoje às ${FORMATO_HORA.format(data)}`
    : `${FORMATO_COMPLETO.format(data).replace(', ', ' às ')}`;
}

/**
 * "em 1h20" / "em 12 min" / "a qualquer momento".
 *
 * Menos de um minuto vira "a qualquer momento" em vez de "em 0 min": a pessoa
 * está esperando, e um zero na tela parece defeito.
 */
export function formatarFaltando(iso: string | null | undefined, now = new Date()): string | null {
  const data = paraData(iso ?? null);
  if (!data) return null;

  const minutos = Math.round((data.getTime() - now.getTime()) / 60000);
  if (minutos <= 0) return 'a qualquer momento';
  if (minutos < 60) return `em ${minutos} min`;

  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  if (horas >= 24) {
    const dias = Math.floor(horas / 24);
    return `em ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  }
  return resto === 0 ? `em ${horas}h` : `em ${horas}h${String(resto).padStart(2, '0')}`;
}
