import { useCallback, useMemo } from 'react';
import { memberDisplayName, useTeamDirectory, type TeamMember } from '@/hooks/useTeamDirectory';
import { useCanManageRotation, useIneligibleOwners } from '@/hooks/useConversationRotation';
import { ineligibleReasonLabel, type IneligibleOwner, type IneligibleReason } from '@/lib/conversations/rotation';

/**
 * Quem o filtro "Responsável" do modal "Filtros" oferece (só gestor/gerente).
 *
 * Duas fontes, na ordem:
 *   1. o diretório do time (`tenant_team_directory`): perfis ativos da Loja
 *      aberta mais o gerente da Conta pai — o mesmo `id` que `conversations.
 *      assigned_profile_id` guarda, então nada precisa ser traduzido;
 *   2. quem ainda tem conversa mas saiu do diretório (suspenso, convite
 *      pendente, excluído, fora da Loja), via `loja_ineligible_owners` — a
 *      mesma RPC da pílula "Responsável indisponível". Sem isto, as conversas
 *      presas com alguém suspenso seriam invisíveis para o filtro. Entram no
 *      fim, com o motivo no nome: "Maria (suspenso)".
 *
 * Quem está "em 0 %" no rodízio continua ativo na Loja, então já veio do
 * diretório e não é repetido nem marcado: 0 % é regra de distribuição, não
 * saída do time.
 *
 * O gate é `useCanManageRotation`, o mesmo da pílula "Responsável
 * indisponível": as duas vizinhas obedecem a UMA regra. Para o atendente
 * `canFilter` é false e a lista sai vazia — e o modal nem monta a seção.
 */
export interface OwnerFilterOption {
  /** profiles.id — o valor que vai para `assigned_profile_id=in.(...)`. */
  id: string;
  /** Nome como aparece no seletor e no selo: "Maria Souza" ou "Maria Souza (suspenso)". */
  label: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  /** Presente só para quem saiu do diretório. */
  reason?: IneligibleReason;
}

/** "Maria Souza (suspenso)" — o motivo em minúsculas, como a pílula já escreve. */
export const ownerFilterLabel = (
  member: Pick<TeamMember, 'first_name' | 'last_name'>,
  reason?: IneligibleReason,
): string => (reason ? `${memberDisplayName(member)} (${ineligibleReasonLabel(reason)})` : memberDisplayName(member));

/** Pura: diretório primeiro, depois os indisponíveis que não estão nele. */
export const buildOwnerFilterOptions = (
  members: ReadonlyArray<TeamMember>,
  ineligible: ReadonlyArray<IneligibleOwner>,
): OwnerFilterOption[] => {
  const options: OwnerFilterOption[] = members.map((m) => ({
    id: m.id,
    label: ownerFilterLabel(m),
    first_name: m.first_name,
    last_name: m.last_name,
    avatar_url: m.avatar_url,
  }));
  const known = new Set(options.map((o) => o.id));
  for (const owner of ineligible) {
    if (known.has(owner.profile_id)) continue;
    known.add(owner.profile_id);
    options.push({
      id: owner.profile_id,
      label: ownerFilterLabel(owner, owner.reason),
      first_name: owner.first_name,
      last_name: owner.last_name,
      avatar_url: null,
      reason: owner.reason,
    });
  }
  return options;
};

export const useOwnerFilterOptions = () => {
  const canFilter = useCanManageRotation();
  const directory = useTeamDirectory();
  const ineligible = useIneligibleOwners();

  const options = useMemo(
    () => (canFilter ? buildOwnerFilterOptions(directory.data ?? [], ineligible.owners) : []),
    [canFilter, directory.data, ineligible.owners],
  );

  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const optionFor = useCallback((profileId: string) => byId.get(profileId), [byId]);

  return {
    canFilter,
    options,
    optionFor,
    isLoading: directory.isLoading || (canFilter && ineligible.isLoading),
  };
};
