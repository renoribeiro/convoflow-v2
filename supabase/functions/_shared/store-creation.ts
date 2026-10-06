// =============================================================================
// store-creation.ts — regras puras da criação de Loja
// =============================================================================
// Tudo o que decide "pode?", "cabe?" e "qual slug?" mora aqui, sem tocar em
// rede nem em banco. A edge function `create-store` só orquestra: busca as
// linhas, chama estas funções e devolve a resposta.
//
// O motivo de separar é o mesmo de `capabilities.ts`: assim o Vitest (Node)
// consegue importar e testar a regra sem subir o Deno. O único import é
// `./capabilities.ts`, que também não tem dependências.
//
// A matriz de permissões NÃO é reescrita aqui — quem responde "esta role pode?"
// continua sendo `can()`. Ver STORE_CREATE_CAPABILITY abaixo.
// =============================================================================

import { can, normalizeRole, type Capability } from './capabilities.ts';

// -----------------------------------------------------------------------------
// Permissão
// -----------------------------------------------------------------------------

/**
 * Criar Loja é operação de quem administra a Conta inteira — exatamente o
 * mesmo conjunto de `stores.switch`: verdadeiro para superadmin e gerente,
 * falso para gestor e atendente.
 *
 * NÃO foi criada uma capability `stores.create` de propósito. A matriz existe
 * em TRÊS lugares que precisam concordar (src/types/userHierarchy.ts,
 * _shared/capabilities.ts e a função SQL public.has_capability). Os dois
 * primeiros são TypeScript e o teste de paridade os cobre; o terceiro só muda
 * por migração. Acrescentar a capability apenas nos dois lados de TS deixaria o
 * SQL divergente em silêncio — o preço não compensa, já que o recorte de
 * `stores.switch` é o mesmo que este fluxo precisa.
 */
export const STORE_CREATE_CAPABILITY: Capability = 'stores.switch';

/** Negação de permissão, escrita para o fluxo de Loja (não para "alternar"). */
export const STORE_CREATE_DENIAL =
  'Apenas Gerente pode criar Lojas na Conta. Fale com o Gerente responsável.';

export interface StoreCreationCaller {
  role: string | null | undefined;
  tenant_id: string | null;
  capabilities: Record<string, unknown> | null;
}

export type StoreCreationAuthz =
  | { ok: true; accountId: string }
  | { ok: false; status: number; error: string };

/**
 * Decide sob QUAL Conta a Loja será criada, ou nega.
 *
 *   superadmin → a Conta que ele indicar no corpo (ele não tem Conta própria).
 *   gerente    → sempre a própria Conta. Pedir outra é 403, não silêncio.
 *   demais     → barrados pela capability.
 *
 * O `accountId` devolvido é o único valor que a edge function usa como pai —
 * nada vindo do corpo da requisição chega ao INSERT sem passar por aqui.
 */
export function authorizeStoreCreation(
  caller: StoreCreationCaller,
  requestedAccountId: string | null | undefined,
): StoreCreationAuthz {
  if (!can(caller.role, STORE_CREATE_CAPABILITY, caller.capabilities)) {
    return { ok: false, status: 403, error: STORE_CREATE_DENIAL };
  }

  if (normalizeRole(caller.role) === 'superadmin') {
    const target = requestedAccountId ?? caller.tenant_id ?? null;
    if (!target) {
      return {
        ok: false,
        status: 400,
        error: 'Informe a Conta em que a Loja será criada.',
      };
    }
    return { ok: true, accountId: target };
  }

  if (!caller.tenant_id) {
    return {
      ok: false,
      status: 403,
      error: 'Seu usuário não está vinculado a uma Conta.',
    };
  }

  if (requestedAccountId && requestedAccountId !== caller.tenant_id) {
    return {
      ok: false,
      status: 403,
      error: 'Você só pode criar Lojas na sua própria Conta.',
    };
  }

  return { ok: true, accountId: caller.tenant_id };
}

// -----------------------------------------------------------------------------
// A Conta que vai receber a Loja
// -----------------------------------------------------------------------------

export interface ParentAccountRow {
  id: string;
  name: string | null;
  kind: string | null;
  store_slots_included: number | null;
  store_slots_extra: number | null;
}

export type ParentAccountCheck = { ok: true } | { ok: false; status: number; error: string };

/**
 * A Loja só pode pendurar em uma linha `kind='account'`.
 *
 * Existe em produção pelo menos uma Conta gravada como `kind='store'` (herança
 * de antes da hierarquia V2). Se deixássemos passar, nasceria Loja de Loja: a
 * árvore ganharia um nível que nenhuma tela entende e o trigger de vagas
 * passaria a contar contra os slots da Loja-pai. Melhor falhar dizendo o que
 * está errado do que criar dado torto.
 */
export function checkParentAccount(parent: ParentAccountRow | null): ParentAccountCheck {
  if (!parent) {
    return { ok: false, status: 404, error: 'Conta não encontrada.' };
  }
  if (parent.kind !== 'account') {
    return {
      ok: false,
      status: 409,
      error:
        'Esta Conta está cadastrada como Loja e por isso não pode ter Lojas abaixo dela. ' +
        'Fale com quem opera a plataforma para regularizar o cadastro.',
    };
  }
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Vagas de Loja
// -----------------------------------------------------------------------------

/** Capacidade da Conta = incluídas no plano + extras contratadas. */
export function storeCapacity(account: Pick<ParentAccountRow, 'store_slots_included' | 'store_slots_extra'>): number {
  return (account.store_slots_included ?? 0) + (account.store_slots_extra ?? 0);
}

export function hasFreeStoreSlot(used: number, capacity: number): boolean {
  return used < capacity;
}

/** Mensagem de "não cabe mais", com a capacidade escrita por extenso. */
export function noFreeSlotMessage(capacity: number): string {
  if (capacity <= 0) {
    return 'Sua Conta não tem nenhuma loja disponível. Contrate lojas adicionais para criar a primeira.';
  }
  if (capacity === 1) {
    return 'Sua Conta já usa a única loja disponível. Contrate lojas adicionais para criar mais.';
  }
  return `Sua Conta já usa as ${capacity} lojas disponíveis. Contrate lojas adicionais para criar mais.`;
}

/**
 * O trigger `enforce_store_slot_capacity_trg` é o guarda final e fala inglês
 * cru ("Account X has no free store slots"). Se ele disparar — corrida entre
 * duas criações simultâneas, que a checagem prévia não cobre — traduzimos para
 * a mesma mensagem que o usuário veria pelo caminho normal.
 */
export function isCapacityViolation(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '23514') return true;
  return typeof error.message === 'string' && error.message.includes('no free store slots');
}

/** Violação de UNIQUE (slug repetido) — vale uma nova tentativa de slug. */
export function isUniqueViolation(
  error: { code?: string | null; message?: string | null } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === '23505') return true;
  return typeof error.message === 'string' && error.message.includes('duplicate key value');
}

// -----------------------------------------------------------------------------
// Nome e slug
// -----------------------------------------------------------------------------

export const STORE_NAME_MIN = 2;
export const STORE_NAME_MAX = 60;

export const STORE_NAME_MESSAGES = {
  required: 'Informe o nome da loja.',
  tooShort: `O nome da loja precisa ter pelo menos ${STORE_NAME_MIN} caracteres.`,
  tooLong: `O nome da loja pode ter no máximo ${STORE_NAME_MAX} caracteres.`,
  noAlphanumeric: 'O nome da loja precisa ter ao menos uma letra ou um número.',
} as const;

export type StoreNameCheck =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Valida e normaliza o nome. Espaços das pontas somem e espaços repetidos no
 * meio viram um só — assim "Loja  Centro " e "Loja Centro" não viram duas
 * lojas com nomes visualmente iguais.
 */
export function validateStoreName(input: unknown): StoreNameCheck {
  if (typeof input !== 'string') {
    return { ok: false, error: STORE_NAME_MESSAGES.required };
  }
  const value = input.trim().replace(/\s+/g, ' ');
  if (value.length === 0) {
    return { ok: false, error: STORE_NAME_MESSAGES.required };
  }
  if (value.length < STORE_NAME_MIN) {
    return { ok: false, error: STORE_NAME_MESSAGES.tooShort };
  }
  if (value.length > STORE_NAME_MAX) {
    return { ok: false, error: STORE_NAME_MESSAGES.tooLong };
  }
  // Nome só de pontuação ("---") slugifica para vazio e cairia no fallback
  // genérico, produzindo uma Loja sem identidade nenhuma na URL.
  if (!/[\p{L}\p{N}]/u.test(value)) {
    return { ok: false, error: STORE_NAME_MESSAGES.noAlphanumeric };
  }
  return { ok: true, value };
}

/**
 * Base do slug — mesmo algoritmo de `criarConta` (manage-user/index.ts):
 * decompõe em NFD, remove os acentos, baixa a caixa, troca o que não é
 * alfanumérico por hífen, apara os hífens das pontas e corta em 40.
 *
 * A faixa U+0300..U+036F é o bloco Combining Diacritical Marks — os acentos que
 * o NFD separou da letra. Em `criarConta` esses caracteres estão escritos
 * literalmente dentro da regex; aqui vão por código, que sobrevive a qualquer
 * conversão de encoding do arquivo.
 *
 * O corte em 40 acontece DEPOIS de aparar, igual ao original, então um nome
 * muito longo pode terminar em hífen e gerar "nome--sufixo". É cosmético e
 * fica assim de propósito: as duas funções geram slug pela mesma regra.
 */
export function storeSlugBase(name: string): string {
  return (
    name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'loja'
  );
}

/** Sufixo aleatório de 8 caracteres, extraído de um UUID. */
export function storeSlugSuffix(uuid: string): string {
  return uuid.replace(/-/g, '').slice(0, 8);
}

/** Slug final: base do nome + sufixo. `tenants.slug` é UNIQUE e NOT NULL. */
export function buildStoreSlug(name: string, uuid: string): string {
  return `${storeSlugBase(name)}-${storeSlugSuffix(uuid)}`;
}
