// =============================================================================
// login-ban.ts — bloquear e liberar o LOGIN de quem é suspenso (manage-user)
// =============================================================================
// Item 14, lote 4 (H5). Mudar profiles.status para 'suspended' fecha o banco
// (as policies só contam perfil ativo), mas não impedia a pessoa de entrar de
// novo nem de renovar a sessão. O ban do Supabase Auth faz as duas coisas:
// login e refresh token passam a ser recusados. O access token já emitido
// segue válido até expirar (até 1 h) — nesse intervalo é o status no banco e
// nas edge functions que segura.
//
// A ORDEM importa, e quem chama segue esta regra:
//   suspender / excluir → grava o status PRIMEIRO, depois bane. Se o ban
//     falhar, o banco já está fechado; a ação devolve erro e pode ser repetida.
//   reativar            → tira o ban PRIMEIRO, depois grava 'active'. Se tirar
//     o ban falhar, nada mudou. O contrário deixaria alguém "ativo" que não
//     consegue entrar.
//
// Sem Deno e sem import por URL: o Vitest importa este arquivo
// (src/lib/users/loginBan.test.ts). Quem chama passa admin.auth.admin.
// =============================================================================

/** ~100 anos: o Supabase Auth não tem "para sempre"; 'none' tira o ban. */
export const LOGIN_BAN_DURATION = '876000h';

export interface AuthAdminLike {
  updateUserById(
    uid: string,
    attributes: { ban_duration: string },
  ): PromiseLike<{ error: { message: string } | null }>;
}

export interface LoginBanResult {
  done: string[];
  failed: Array<{ userId: string; error: string }>;
}

/** Bane (true) ou libera (false) cada usuário; nunca para no primeiro erro. */
export async function setLoginBan(
  auth: AuthAdminLike,
  userIds: Array<string | null | undefined>,
  banned: boolean,
): Promise<LoginBanResult> {
  const ids = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0))];
  const result: LoginBanResult = { done: [], failed: [] };
  for (const id of ids) {
    try {
      const { error } = await auth.updateUserById(id, {
        ban_duration: banned ? LOGIN_BAN_DURATION : 'none',
      });
      if (error) result.failed.push({ userId: id, error: error.message });
      else result.done.push(id);
    } catch (err) {
      result.failed.push({ userId: id, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return result;
}

/** Status que tiram o login (suspender e excluir). */
export function statusBansLogin(status: string): boolean {
  return status === 'suspended' || status === 'deleted';
}
