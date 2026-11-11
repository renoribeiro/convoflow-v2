// =============================================================================
// meta-numero-existente.ts — o número da API Oficial já funcionava em outra
// empresa? E o que fazer com o registro, o PIN e o aquecimento.
// =============================================================================
// Regra pura, zero I/O (mesma convenção de meta-signup.ts), para o Vitest
// testar sem Deno. Quem usa: meta-oauth-exchange (botão "Conectar com a Meta")
// e register-meta-number (ícone de chave "Registrar o número na API Oficial").
//
// POR QUÊ (modelo novo de contas da Meta, 2026-09/10): o número não muda mais
// de parceiro. O cliente compartilha a conta do WhatsApp dele com o ConvoFlow e
// o número continua registrado e ativo. Fontes oficiais:
//   - developers.facebook.com/documentation/business-messaging/whatsapp/account-model-evolution
//     ("Registration": registrar de novo um número já registrado passa sem
//     trocar o PIN; "2FA PIN": continue mandando um PIN de 6 dígitos);
//   - .../business-phone-numbers/phone-numbers ("Status": o número precisa
//     estar "connected" para enviar e receber pela API) e a referência
//     .../reference/whatsapp-business-phone-number/whatsapp-business-account-phone-number-api
//     (valores de status: CONNECTED, DISCONNECTED, PENDING, FLAGGED,
//     RESTRICTED, RATE_LIMITED, ...; quality_rating GREEN/YELLOW/RED/NA);
//   - .../messaging-limits (o limite se lê em
//     whatsapp_business_manager_messaging_limit, da v24.0 em diante).
//
// A REGRA: antes de o ConvoFlow registrar, a Meta já dá o número como em uso
// (status CONNECTED, FLAGGED, RESTRICTED ou RATE_LIMITED) => ele veio de outra
// empresa. Número novo, saído agora da janela da Meta, ainda não foi
// registrado por ninguém e não está nesses estados. Sem status na resposta, a
// nota de qualidade decide (GREEN/YELLOW/RED só existe em número que já
// enviou). Sem nada => desconhecido, e vale o comportamento de sempre.
// =============================================================================

/** Campos do número pedidos à Meta antes do registro. */
export const CAMPOS_DO_NUMERO_NA_META =
  'display_phone_number,verified_name,status,quality_rating,whatsapp_business_manager_messaging_limit';
/** Se a Meta recusar o pedido completo, o ConvoFlow tenta só estes. */
export const CAMPOS_BASICOS_DO_NUMERO_NA_META = 'display_phone_number,verified_name,status';

/** Estados em que a Meta dá o número como registrado e em uso. */
export const STATUS_DE_NUMERO_EM_USO = ['CONNECTED', 'FLAGGED', 'RESTRICTED', 'RATE_LIMITED'] as const;
const NOTAS_DE_QUEM_JA_ENVIOU = ['GREEN', 'YELLOW', 'RED'];

/** Códigos de erro do registro na Meta que o ConvoFlow trata. */
export const META_ERRO_JA_REGISTRADO = 133015;
export const META_ERRO_PIN_JA_DEFINIDO = 136024;

export interface DetalhesDoNumeroNaMeta {
  status?: unknown;
  quality_rating?: unknown;
  whatsapp_business_manager_messaging_limit?: unknown;
}

export type EstadoDoNumeroNaMeta = 'ja_em_uso' | 'novo' | 'desconhecido';

function texto(v: unknown): string {
  return typeof v === 'string' ? v.trim().toUpperCase() : '';
}

export function estadoDoNumeroNaMeta(d: DetalhesDoNumeroNaMeta | null | undefined): EstadoDoNumeroNaMeta {
  if (!d) return 'desconhecido';
  const status = texto(d.status);
  if (status) {
    return (STATUS_DE_NUMERO_EM_USO as readonly string[]).includes(status) ? 'ja_em_uso' : 'novo';
  }
  if (NOTAS_DE_QUEM_JA_ENVIOU.includes(texto(d.quality_rating))) return 'ja_em_uso';
  return 'desconhecido';
}

/** O limite que a Meta informa, como texto (TIER_250, TIER_2K, TIER_UNLIMITED...), ou null. */
export function limiteInformadoPelaMeta(d: DetalhesDoNumeroNaMeta | null | undefined): string | null {
  const v = texto(d?.whatsapp_business_manager_messaging_limit);
  return /^TIER_[A-Z0-9]+$/.test(v) ? v : null;
}

/** A nota de qualidade que a Meta informa (GREEN, YELLOW, RED, NA), ou null. */
export function notaInformadaPelaMeta(d: DetalhesDoNumeroNaMeta | null | undefined): string | null {
  const v = texto(d?.quality_rating);
  return ['GREEN', 'YELLOW', 'RED', 'NA'].includes(v) ? v : null;
}

// ------------------------------------------------------------------- PIN

export type OrigemDoPin = 'digitado' | 'guardado' | 'sorteado';

const SEIS_DIGITOS = /^[0-9]{6}$/;

export const MENSAGEM_PIN_DESCONHECIDO =
  'Este número já funcionava em outra empresa quando foi conectado, e o ConvoFlow não sabe o PIN de verificação em duas etapas dele. ' +
  'Peça o PIN a quem cuidava do número antes, ou troque o PIN no WhatsApp Manager da Meta (nas configurações do número, em verificação em duas etapas), e digite os 6 números aqui. ' +
  'Se o WhatsApp Manager não mostra a verificação em duas etapas desse número, a Meta já dispensou o PIN dele: digite quaisquer 6 números.';

/**
 * Qual PIN mandar no registro. O que a pessoa digitou vale primeiro; depois o
 * guardado. Sem nenhum dos dois: número novo sorteia (como sempre); número que
 * veio de outra empresa NÃO sorteia, a tela pede o PIN.
 */
export function escolherPinDoRegistro(i: {
  pinDigitado?: string | null;
  pinGuardado?: string | null;
  deOutraEmpresa: boolean;
}): { origem: OrigemDoPin } | { pedirPin: true } {
  if (typeof i.pinDigitado === 'string' && SEIS_DIGITOS.test(i.pinDigitado)) return { origem: 'digitado' };
  if (typeof i.pinGuardado === 'string' && SEIS_DIGITOS.test(i.pinGuardado)) return { origem: 'guardado' };
  if (i.deOutraEmpresa) return { pedirPin: true };
  return { origem: 'sorteado' };
}

// -------------------------------------------------------------- registro

export interface RespostaDoRegistro {
  /** A Meta respondeu success sem erro. */
  ok: boolean;
  /** error.code da Meta, quando houve erro. */
  codigoDeErro?: number | null;
}

export interface DesfechoDoRegistro {
  /** O número fica pronto para enviar pela API. */
  registrado: boolean;
  /** O PIN mandado é o verdadeiro e vai para whatsapp_instance_register_pins. */
  guardarPin: boolean;
  /** Começa hoje o aquecimento da primeira semana (registered_at = agora). */
  carimbarRegistradoEm: boolean;
  /** whatsapp_instances.registered_elsewhere = true. */
  marcarDeOutraEmpresa: boolean;
}

/**
 * O que gravar depois de chamar o registro na Meta.
 *
 *   número em uso antes do registro (ja_em_uso): ele já estava pronto. A Meta
 *     não troca o PIN de número já registrado, então um PIN sorteado não é o
 *     verdadeiro e não é guardado; não começa aquecimento; marca.
 *   133015 (já registrado) com PIN sorteado: mesma coisa, o número veio pronto.
 *   número novo com sucesso: o de sempre (guarda o PIN, começa o aquecimento).
 *   136024 (PIN já definido) em número novo: o de sempre (a tela pede o PIN).
 */
export function desfechoDoRegistro(
  plano: { origem: OrigemDoPin; numeroJaEmUso: boolean },
  r: RespostaDoRegistro,
): DesfechoDoRegistro {
  const jaRegistrado = !r.ok && r.codigoDeErro === META_ERRO_JA_REGISTRADO;
  const aceito = r.ok || jaRegistrado;
  const veioPronto = plano.numeroJaEmUso || (jaRegistrado && plano.origem === 'sorteado');

  if (veioPronto) {
    return {
      registrado: true,
      // Só o PIN que alguém conhece é verdadeiro; o sorteado a Meta não aplicou.
      guardarPin: aceito && plano.origem !== 'sorteado',
      carimbarRegistradoEm: false,
      marcarDeOutraEmpresa: true,
    };
  }
  return {
    registrado: aceito,
    guardarPin: aceito,
    carimbarRegistradoEm: aceito,
    marcarDeOutraEmpresa: false,
  };
}
