// =============================================================================
// public-signup (núcleo) — cadastro pelo site: Conta nova + convite de gerente
// =============================================================================
// Teste grátis, entrega 2. O index.ts da função só liga isto ao Deno, ao
// Supabase e ao Cloudflare; toda decisão mora aqui, sem nada do Deno, para o
// Vitest testar (src/lib/signup/publicSignupHandler.test.ts).
//
// O QUE NUNCA SAI DO PEDIDO
//   O corpo do formulário só fornece nome, e-mail, empresa, telefone, as
//   versões dos Termos/Política aceitas e o token do Turnstile. Cargo, Conta,
//   "pai" e status NÃO são lidos do pedido: o convite sai SEMPRE como gerente,
//   da Conta que o servidor acabou de criar (gerenteInviteMetadata). É o que
//   impede alguém de se cadastrar como superadmin ou dentro da Conta de outro —
//   o trigger handle_new_user confia no que vier no convite.
//
// A MESMA RESPOSTA PARA TODO DESFECHO
//   Todo pedido que passa pelas travas (formato, Turnstile, limite por IP)
//   recebe 202 {"ok":true}, sem esperar o resto: e-mail novo, e-mail que já
//   tem login, limite por e-mail estourado, convite recusado pelo envio de
//   e-mail — tudo igual, no mesmo tempo. O trabalho (Conta + convite) roda
//   depois da resposta. Assim o formulário não serve para descobrir quem é
//   cliente, nem pela resposta nem pelo tempo dela.
//   As respostas diferentes (400, 403, 409, 429, 503) dependem só do próprio
//   pedido, nunca de o e-mail existir.
//
// NADA SE PERDE
//   A ficha (signup_requests) é gravada ANTES da resposta. Se o convite falha,
//   a Conta é desfeita e a ficha fica com o motivo, para vendas ligar. Se o
//   processamento morre no meio, a limpeza de hora em hora fecha a ficha.
// =============================================================================

import { contaSlug } from './conta-slug.ts';
import {
  classifyAuthEmailError,
  isEmailSendFailure,
  type AuthEmailFailureReason,
  type AuthLikeError,
} from './auth-email-failures.ts';

// ---------------------------------------------------------------------------
// Constantes do contrato
// ---------------------------------------------------------------------------

/**
 * Versões dos Termos de Uso e da Política de Privacidade que o formulário mostra.
 * São a data de "Última atualização" das páginas. Cópia no front:
 * src/lib/legal/versions.ts — src/lib/signup/publicSignupHandler.test.ts exige
 * que as duas sejam iguais. Mudou a página, mude os dois.
 */
export const SIGNUP_TERMS_VERSION = '2026-09-28';
export const SIGNUP_PRIVACY_VERSION = '2026-09-12';

/** A ação declarada no widget do Turnstile; o servidor confere. */
export const TURNSTILE_ACTION = 'cadastro';

/** Tetos por IP e por e-mail (checkRateLimitDb). */
export const SIGNUP_RATE_LIMITS = {
  ip: { maxRequests: 5, windowMs: 60 * 60 * 1000 },
  email: { maxRequests: 3, windowMs: 24 * 60 * 60 * 1000 },
} as const;

/** A resposta única de todo pedido aceito. */
export const SIGNUP_ACCEPTED_STATUS = 202;
export const SIGNUP_ACCEPTED_BODY = { ok: true } as const;

export const MSG_INDISPONIVEL =
  'O cadastro pelo site não está disponível no momento. Fale com contato@convoflow.com.br.';
export const MSG_ROBO =
  'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente de novo.';
export const MSG_MUITAS_TENTATIVAS =
  'Muitas tentativas a partir desta conexão. Espere uma hora e tente de novo.';
export const MSG_TERMOS_MUDARAM =
  'Os Termos de Uso ou a Política de Privacidade foram atualizados. Recarregue a página e aceite a versão nova.';
export const MSG_TENTE_DE_NOVO =
  'Não foi possível registrar seu cadastro agora. Tente de novo em alguns minutos.';

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

export interface SignupFields {
  firstName: string;
  lastName: string;
  /** Sempre minúsculo e sem espaço nas pontas. */
  email: string;
  companyName: string;
  /** Só dígitos, 10 a 13. */
  phone: string;
  termsVersion: string;
  privacyVersion: string;
}

export type SignupValidation =
  | { ok: true; fields: SignupFields; turnstileToken: string }
  | { ok: false; field: string; message: string };

// Caractere de controle num nome não tem uso legítimo (e quebra e-mail e CSV).
// eslint-disable-next-line no-control-regex
const CONTROLE = /[\u0000-\u001f\u007f]/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function texto(v: unknown, min: number, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim().replace(/\s+/g, ' ');
  if (t.length < min || t.length > max || CONTROLE.test(t)) return null;
  return t;
}

/** Só os dígitos. "(11) 99999-0000" → "11999990000". */
export function normalizePhone(v: unknown): string {
  return typeof v === 'string' ? v.replace(/\D/g, '') : '';
}

/**
 * Lê SÓ os campos do formulário. Qualquer outra chave do corpo (role,
 * tenant_id, status, redirectTo...) é ignorada — não existe caminho para ela
 * chegar ao convite.
 */
export function validateSignupBody(body: unknown): SignupValidation {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, field: 'body', message: 'Pedido inválido.' };
  }
  const b = body as Record<string, unknown>;

  const firstName = texto(b.firstName, 1, 80);
  if (!firstName) return { ok: false, field: 'firstName', message: 'Informe seu nome.' };

  const lastName = texto(b.lastName, 1, 80);
  if (!lastName) return { ok: false, field: 'lastName', message: 'Informe seu sobrenome.' };

  const emailBruto = typeof b.email === 'string' ? b.email.trim().toLowerCase() : '';
  if (!emailBruto || emailBruto.length > 254 || !EMAIL.test(emailBruto)) {
    return { ok: false, field: 'email', message: 'Informe um e-mail válido.' };
  }

  const companyName = texto(b.companyName, 2, 120);
  if (!companyName) {
    return { ok: false, field: 'companyName', message: 'Informe o nome da empresa.' };
  }

  const phone = normalizePhone(b.phone);
  if (phone.length < 10 || phone.length > 13) {
    return { ok: false, field: 'phone', message: 'Informe um telefone com DDD.' };
  }

  if (b.acceptedTerms !== true) {
    return {
      ok: false,
      field: 'acceptedTerms',
      message: 'Para criar a conta, aceite os Termos de Uso e a Política de Privacidade.',
    };
  }

  const termsVersion = texto(b.termsVersion, 1, 40);
  const privacyVersion = texto(b.privacyVersion, 1, 40);
  if (!termsVersion || !privacyVersion) {
    return { ok: false, field: 'acceptedTerms', message: MSG_TERMOS_MUDARAM };
  }

  const turnstileToken =
    typeof b.turnstileToken === 'string' && b.turnstileToken.length > 0 && b.turnstileToken.length <= 2048
      ? b.turnstileToken
      : null;
  if (!turnstileToken) {
    return { ok: false, field: 'turnstileToken', message: MSG_ROBO };
  }

  return {
    ok: true,
    fields: { firstName, lastName, email: emailBruto, companyName, phone, termsVersion, privacyVersion },
    turnstileToken,
  };
}

// ---------------------------------------------------------------------------
// O convite
// ---------------------------------------------------------------------------

/**
 * O metadata do convite, lido pelo trigger handle_new_user. Cargo e Conta são
 * FIXOS aqui: gerente, da Conta criada pelo servidor. Nada vem do pedido.
 * O formato é o mesmo do manage-user ao convidar um gerente.
 */
export function gerenteInviteMetadata(fields: SignupFields, tenantId: string): Record<string, unknown> {
  return {
    first_name: fields.firstName,
    last_name: fields.lastName,
    phone: fields.phone,
    role: 'gerente',
    tenant_id: tenantId,
    parent_id: null,
    // Nasce 'pending'; vira 'active' quando a pessoa define a senha
    // (trigger on_auth_user_confirmed).
    status: 'pending',
    invite_intent_active: true,
    // Só para rastreio (e para um modelo de e-mail que queira distinguir).
    // Não é lido por nenhuma regra de acesso.
    signup_origin: 'site',
  };
}

/** Código da ficha para cada motivo de falha do convite. */
export function failureCodeFor(reason: AuthEmailFailureReason): string {
  switch (reason) {
    case 'quota':
      return 'email_quota';
    case 'not_authorized':
      return 'email_not_authorized';
    case 'email_exists':
      return 'email_exists';
    default:
      return 'invite_error';
  }
}

// ---------------------------------------------------------------------------
// Dependências (o index.ts as liga ao mundo real; o teste, a dublês)
// ---------------------------------------------------------------------------

export interface InviteResult {
  userId: string | null;
  error: AuthLikeError | null;
}

export interface PublicSignupDeps {
  /** Secret PUBLIC_SIGNUP_ENABLED === 'true'. Desligado → 503 para tudo. */
  enabled: boolean;
  /** Secret TURNSTILE_SECRET_KEY presente. Sem ele o cadastro NÃO abre. */
  turnstileConfigured: boolean;
  corsHeaders: Record<string, string>;
  clientIp: string | null;
  verifyTurnstile(token: string, ip: string | null): Promise<boolean>;
  /** true = pode seguir. Chave bruta; quem implementa faz o hash. */
  allowRequest(bucket: 'ip' | 'email', key: string): Promise<boolean>;
  insertLead(fields: SignupFields): Promise<string>;
  startSignup(leadId: string, slug: string): Promise<{ outcome: 'created' | 'email_exists'; tenantId: string | null }>;
  inviteGerente(email: string, metadata: Record<string, unknown>, redirectTo: string): Promise<InviteResult>;
  markInvited(leadId: string, userId: string): Promise<void>;
  markFailed(leadId: string, code: string, detail: string | null): Promise<void>;
  recordEmailFailure(err: AuthLikeError | null): Promise<void>;
  runInBackground(task: Promise<unknown>): void;
  redirectTo: string;
  slugSuffix(): string;
  log(level: 'info' | 'warn' | 'error', message: string, context?: Record<string, unknown>): void;
}

// ---------------------------------------------------------------------------
// O processamento (depois da resposta)
// ---------------------------------------------------------------------------

export type SignupOutcome =
  | 'invited'
  | 'email_exists'
  | 'email_quota'
  | 'email_not_authorized'
  | 'invite_error'
  | 'processing_error';

function mensagem(e: unknown): string {
  return (e instanceof Error ? e.message : String(e ?? '')).slice(0, 300);
}

async function falhar(
  deps: PublicSignupDeps,
  leadId: string,
  code: string,
  detail: string | null,
): Promise<void> {
  try {
    await deps.markFailed(leadId, code, detail);
  } catch (e) {
    // A ficha fica 'received' e a limpeza de hora em hora a fecha.
    deps.log('error', 'public-signup: não foi possível fechar a ficha como falha', {
      leadId,
      code,
      erro: mensagem(e),
    });
  }
}

export async function processSignup(
  leadId: string,
  fields: SignupFields,
  deps: PublicSignupDeps,
): Promise<SignupOutcome> {
  let inicio: { outcome: 'created' | 'email_exists'; tenantId: string | null };
  try {
    inicio = await deps.startSignup(leadId, contaSlug(fields.companyName, deps.slugSuffix()));
  } catch (e) {
    await falhar(deps, leadId, 'processing_error', mensagem(e));
    return 'processing_error';
  }

  // E-mail que já tem login: a ficha já foi fechada pelo banco; nada a enviar.
  if (inicio.outcome === 'email_exists' || !inicio.tenantId) return 'email_exists';

  let convite: InviteResult;
  try {
    convite = await deps.inviteGerente(
      fields.email,
      gerenteInviteMetadata(fields, inicio.tenantId),
      deps.redirectTo,
    );
  } catch (e) {
    convite = { userId: null, error: { message: mensagem(e) } };
  }

  if (convite.error || !convite.userId) {
    const erro = convite.error ?? { message: 'O convite não devolveu o login criado.' };
    const motivo = classifyAuthEmailError(erro);
    if (isEmailSendFailure(motivo, erro)) {
      try {
        await deps.recordEmailFailure(erro);
      } catch {
        // registrar a falha nunca vira uma segunda falha
      }
    }
    const code = failureCodeFor(motivo);
    await falhar(deps, leadId, code, erro.message ? erro.message.slice(0, 300) : null);
    return code as SignupOutcome;
  }

  try {
    await deps.markInvited(leadId, convite.userId);
  } catch (e) {
    // O convite caiu num login que não é o gerente desta Conta (ex.: login
    // antigo ainda não confirmado). A Conta é desfeita; a ficha fica.
    await falhar(deps, leadId, 'processing_error', mensagem(e));
    return 'processing_error';
  }
  return 'invited';
}

// ---------------------------------------------------------------------------
// O handler HTTP
// ---------------------------------------------------------------------------

function json(status: number, body: unknown, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

/** A resposta única de todo pedido aceito — construída num lugar só. */
export function acceptedResponse(cors: Record<string, string>): Response {
  return json(SIGNUP_ACCEPTED_STATUS, SIGNUP_ACCEPTED_BODY, cors);
}

export async function handlePublicSignup(req: Request, deps: PublicSignupDeps): Promise<Response> {
  const cors = deps.corsHeaders;

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

  // Chave geral: desligado, ninguém passa daqui — nem para validar.
  if (!deps.enabled) return json(503, { error: MSG_INDISPONIVEL }, cors);

  if (req.method !== 'POST') return json(405, { error: 'Método não permitido.' }, cors);

  // Sem o segredo do Turnstile o cadastro fica FECHADO (não aberto sem robô).
  if (!deps.turnstileConfigured) {
    deps.log('error', 'public-signup: TURNSTILE_SECRET_KEY ausente — cadastro recusado');
    return json(503, { error: MSG_INDISPONIVEL }, cors);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Pedido inválido.', field: 'body' }, cors);
  }

  const v = validateSignupBody(body);
  if (!v.ok) return json(400, { error: v.message, field: v.field }, cors);

  if (v.fields.termsVersion !== SIGNUP_TERMS_VERSION || v.fields.privacyVersion !== SIGNUP_PRIVACY_VERSION) {
    return json(409, { error: MSG_TERMOS_MUDARAM, field: 'acceptedTerms' }, cors);
  }

  let humano = false;
  try {
    humano = await deps.verifyTurnstile(v.turnstileToken, deps.clientIp);
  } catch (e) {
    deps.log('warn', 'public-signup: Turnstile não respondeu', { erro: mensagem(e) });
  }
  if (!humano) return json(403, { error: MSG_ROBO, field: 'turnstileToken' }, cors);

  if (!(await deps.allowRequest('ip', deps.clientIp ?? 'sem-ip'))) {
    return json(429, { error: MSG_MUITAS_TENTATIVAS }, cors);
  }

  // Limite por e-mail: a MESMA resposta de sucesso, sem trabalho nenhum. Um 429
  // aqui contaria que alguém tentou esse e-mail há pouco.
  if (!(await deps.allowRequest('email', v.fields.email))) {
    deps.log('info', 'public-signup: limite por e-mail atingido; pedido descartado');
    return acceptedResponse(cors);
  }

  let leadId: string;
  try {
    leadId = await deps.insertLead(v.fields);
  } catch (e) {
    // Falha de banco, antes de qualquer consulta ao e-mail: não revela nada.
    deps.log('error', 'public-signup: não gravou a ficha', { erro: mensagem(e) });
    return json(500, { error: MSG_TENTE_DE_NOVO }, cors);
  }

  deps.runInBackground(
    processSignup(leadId, v.fields, deps).then(
      (desfecho) => deps.log('info', 'public-signup: processado', { leadId, desfecho }),
      (e) => deps.log('error', 'public-signup: processamento quebrou', { leadId, erro: mensagem(e) }),
    ),
  );

  return acceptedResponse(cors);
}
