import type { UserStatus } from '@/types/userHierarchy';

/**
 * Estado da conta de usuário — `profiles.status` é a FONTE DA VERDADE.
 *
 *   pending    convidado, ainda não concluiu o cadastro
 *   active     conta normal, em uso   ← único estado que dá acesso
 *   suspended  bloqueada por um administrador
 *   deleted    lápide do soft delete (manage-user action='soft_delete')
 *
 * `profiles.is_active` é ESPELHO DERIVADO: vale exatamente
 * `status === 'active'`. Não escreva nele — desde a migração 20260813000004 o
 * banco descarta escrita direta (trigger force_profile_is_active) e recalcula
 * a partir de status.
 *
 * As regras aqui são as mesmas que o banco aplica. Ficam neste módulo para
 * serem testáveis e para não se espalharem por componente.
 */

/** Espelho derivado — a mesma conta do trigger sync_profile_is_active. */
export const deriveIsActive = (status: string | null | undefined): boolean =>
  status === 'active';

/** Só 'active' usa o sistema. */
export const canAccessApp = (status: string | null | undefined): boolean =>
  status === 'active';

/**
 * Normaliza o estado vindo da `admin_users_view` para exibição.
 *
 * A coluna `status` só existe na view a partir da migração 20260813000004; o
 * fallback por `is_active` cobre o intervalo entre o deploy do front e a
 * aplicação do SQL. Sem ele, "Pendente" (convidado, não aceitou) e "Suspenso"
 * (bloqueado pelo admin) apareceriam os dois como um único "Inativo".
 */
export const profileStatusOf = (
  row: { status?: string | null; is_active?: boolean | null },
): UserStatus => {
  const raw = row.status;
  if (raw === 'active' || raw === 'pending' || raw === 'suspended' || raw === 'deleted') {
    return raw;
  }
  return row.is_active ? 'active' : 'suspended';
};

/**
 * O que gravar quando o admin salva o modal de edição com a caixa
 * "Usuário ativo" marcada ou não.
 *
 * Convite ainda não aceito NÃO vira 'suspended' só porque a caixa está
 * desmarcada: quem ainda não concluiu o cadastro continua 'pending' e o que
 * muda é a INTENÇÃO, aplicada no aceite pelo trigger on_auth_user_confirmed.
 * Sem essa distinção, editar o telefone de um convidado cancelaria o convite
 * em silêncio.
 */
export const accountStatePatch = (
  checked: boolean,
  currentStatus: string | null | undefined,
): { status: string } | { invite_intent_active: boolean } =>
  currentStatus === 'pending'
    ? { invite_intent_active: checked }
    : { status: checked ? 'active' : 'suspended' };

/**
 * Valor inicial da caixa "Usuário ativo" ao abrir o modal de edição.
 *
 * Convite pendente entra MARCADO: é a intenção padrão de um convite
 * (invite_intent_active NULL = ativa ao aceitar). Assim salvar o modal sem
 * tocar na caixa não muda nada.
 */
export const checkboxValueFor = (
  row: { status?: string | null; is_active?: boolean | null },
): boolean => {
  const status = profileStatusOf(row);
  return status !== 'suspended' && status !== 'deleted';
};
