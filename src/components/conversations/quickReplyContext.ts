/**
 * Contexto de variáveis para inserir uma resposta rápida no compositor.
 *
 * Por que isto existe: o valor de uma resposta rápida está DENTRO da conversa.
 * Se o atendente escolhe "Olá {first_name}, tudo bem?" e o compositor mostra
 * literalmente `{first_name}`, ele tem que apagar o token na mão — e aí a
 * biblioteca não economiza nada. Trocando na inserção, ele vê "Olá Helena,
 * tudo bem?" já pronto e ainda pode editar antes de enviar.
 *
 * A substituição é a mesma do resto do sistema: `substituteVariables` de
 * `@/lib/chatbot/flowEngine`, chave SIMPLES (`{variavel}`), token desconhecido
 * fica literal. Não existe um segundo parser aqui de propósito — o atendente
 * que aprendeu `{first_name}` montando um chatbot usa o mesmo token aqui.
 */
import { firstName, type VariableContext } from '@/lib/chatbot/flowEngine';

/**
 * O atalho: digitar "/" com o campo VAZIO abre a paleta.
 *
 * A condição mora aqui, e não solta dentro do ChatWindow, porque é ela que
 * decide se uma barra vira comando ou vira texto. Com o campo já preenchido a
 * barra é só uma barra — quem escreve "9h/18h" não quer um menu no meio.
 */
export function shouldOpenQuickReplies(proximoValor: string, valorAtual: string): boolean {
  return proximoValor === '/' && valorAtual === '';
}

/**
 * O que a conversa aberta sabe sobre o contato. Tudo opcional.
 *
 * `custom_fields` é `unknown` porque no banco a coluna é `Json`, e Json inclui
 * string, número e array — não só objeto. Tipar como Record aqui obrigaria a
 * tela a fazer o estreitamento; a checagem mora em `buildQuickReplyContext`,
 * num lugar só.
 */
export interface QuickReplyContact {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  /** Campos personalizados gravados pelo chatbot/automação. */
  custom_fields?: unknown;
}

/** Só primitivo vira token; objeto aninhado é ignorado em vez de virar "[object Object]". */
function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return null;
  return String(value);
}

/**
 * Monta o contexto na MESMA forma que `buildAutomationVariableContext` do
 * `supabase/functions/_shared/variable-substitution.ts`, para que o mesmo texto
 * resolva igual sendo enviado à mão pelo atendente ou por uma automação.
 *
 * Precedência: campos personalizados vencem os campos de sistema, porque é o
 * que o chatbot acabou de capturar daquele lead.
 */
export function buildQuickReplyContext(
  contact: QuickReplyContact | null | undefined,
  now: Date = new Date(),
  timeZone = 'America/Sao_Paulo',
): VariableContext {
  const dateStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);

  const timeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now);

  // Só objeto vira variável: a coluna é Json, então pode chegar array ou string
  // e `Object.entries` num array daria tokens "0", "1", "2".
  const custom: VariableContext = {};
  const campos = contact?.custom_fields;
  if (campos && typeof campos === 'object' && !Array.isArray(campos)) {
    for (const [chave, valor] of Object.entries(campos as Record<string, unknown>)) {
      custom[chave] = stringify(valor);
    }
  }

  return {
    name: contact?.name ?? null,
    first_name: firstName(contact?.name),
    phone: contact?.phone ?? null,
    email: contact?.email ?? null,
    date: dateStr,
    time: timeStr,
    datetime: `${dateStr} ${timeStr}`,
    ...custom,
  };
}
