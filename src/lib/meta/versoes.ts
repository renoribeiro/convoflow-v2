/**
 * As versões da Meta que o ConvoFlow inteiro usa. UM lugar só:
 *   - o navegador: o botão "Conectar com a Meta" (src/hooks/useMetaEmbeddedSignup.tsx);
 *   - o servidor: TODA chamada à Graph API das edge functions, por
 *     supabase/functions/_shared/meta-versoes.ts, que reexporta daqui.
 *
 * Arquivo puro, sem import de nada: o Deno das edge functions lê este mesmo
 * arquivo. Não acrescente import aqui.
 *
 * A versão gravada em `connection_config.graphApiVersion` de cada número é só
 * histórico: o servidor NÃO a usa mais (até 2026-11 ela vencia a constante e
 * os números antigos falavam com a v20.0 vencida).
 *
 * src/lib/meta/versoesNoServidor.test.ts falha se alguma chamada à Graph API
 * escrever a versão à mão.
 */

/**
 * Graph API (graph.facebook.com e graph.instagram.com).
 *
 * Fonte oficial: https://developers.facebook.com/docs/graph-api/changelog/versions
 * Conferida em 2026-11-11: v26.0 lançada em 29/07/2026, a mais nova da página,
 * sem data de fim ainda (a v25.0 vale até 29/07/2028). A v20.0, que o código
 * usava, venceu em 24/09/2026; a Meta passou a encaminhar essas chamadas para
 * a versão mais antiga ainda no ar.
 *
 * Mudanças da v24.0 em diante que valem para nós (changelog do WhatsApp,
 * 08/10/2025): o limite de envio passou a ser do portfólio e se lê em
 * `whatsapp_business_manager_messaging_limit` (`messaging_limit_tier` saiu);
 * a lista de templates recusa cursor de página inválido (não usamos cursor).
 */
export const META_GRAPH_VERSION = 'v26.0';

/**
 * Embedded Signup (a janela da Meta aberta pelo botão "Conectar com a Meta").
 *
 * Fonte oficial: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/versions
 * As versões 2 e 3 foram desligadas em 15/10/2026. A versão 4 NÃO tem valor
 * no campo `version`: ela vem da configuração de login da Meta (o
 * VITE_META_CONFIG_ID, criada com os produtos escolhidos) e de um `extras`
 * sem `version`, sem `featureType` e sem `sessionInfoVersion` (a Meta ignora
 * os dois últimos na versão 4). Ela devolve `waba_id` (hoje o código da conta
 * de mensagens) e `phone_number_id` no evento FINISH. A versão 5 troca
 * `waba_id` por `messaging_account_ids`: mudar para ela é mudar também a
 * leitura do evento em useMetaEmbeddedSignup.
 */
export const META_EMBEDDED_SIGNUP_VERSION = 'v4' as const;

/** O `extras` do FB.login para a versão fixada acima (forma documentada da v4). */
export function extrasDoEmbeddedSignup(): { setup: Record<string, never> } {
  return { setup: {} };
}

/** Raiz das chamadas à Graph API do Facebook (WhatsApp Cloud API, Meta). */
export const META_GRAPH_ROOT = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

/** Raiz das chamadas à API do Instagram com login do Instagram. */
export const INSTAGRAM_GRAPH_ROOT = `https://graph.instagram.com/${META_GRAPH_VERSION}`;
