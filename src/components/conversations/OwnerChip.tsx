import { UserRound } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  memberDisplayName,
  memberFirstName,
  memberInitials,
  type TeamMember,
} from '@/hooks/useTeamDirectory';

interface OwnerChipProps {
  /** Membro resolvido pelo diretório. `undefined` com `assignedProfileId` = pessoa fora do diretório. */
  member: TeamMember | undefined;
  /** profiles.id gravado na conversa; null = sem responsável. */
  assignedProfileId: string | null;
  /** 'sm' na lista, 'md' no cabeçalho do chat. */
  size?: 'sm' | 'md';
  /** Nome completo em vez do primeiro nome (cabeçalho). */
  fullName?: boolean;
  className?: string;
}

/**
 * Chip de responsável — a mesma cara na lista e no cabeçalho do chat.
 *
 * Três estados:
 *   - sem responsável → marcador neutro "Sem responsável" (outline, apagado);
 *   - responsável no diretório → avatar (ou iniciais) + primeiro nome;
 *   - responsável FORA do diretório (perfil suspenso, ou o diretório ainda
 *     não carregou) → "Responsável" com avatar genérico. Não some: a conversa
 *     está com alguém, só não sabemos o nome agora.
 *
 * Segue o visual das etiquetas (`TagBadge`): Badge outline, texto pequeno.
 * `OwnerInline` é o mesmo conteúdo sem a moldura de Badge — para dentro de um
 * botão (Badge é um <div>, e <div> dentro de <button> é HTML inválido).
 */
export const OwnerInline = ({
  member,
  assignedProfileId,
  size = 'md',
  fullName = false,
  className,
}: OwnerChipProps) => {
  const avatarClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const textClass = size === 'sm' ? 'text-[10px]' : 'text-xs';

  if (!assignedProfileId) {
    return (
      <span className={cn('inline-flex items-center gap-1 text-muted-foreground', textClass, className)}>
        <UserRound className={cn('flex-shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
        <span>Sem responsável</span>
      </span>
    );
  }

  const label = member
    ? fullName
      ? memberDisplayName(member)
      : memberFirstName(member)
    : 'Responsável';

  return (
    <span className={cn('inline-flex items-center gap-1 font-medium text-foreground', textClass, className)}>
      <Avatar className={cn('flex-shrink-0', avatarClass)}>
        {member?.avatar_url && <AvatarImage src={member.avatar_url} alt={memberDisplayName(member)} />}
        <AvatarFallback className={cn('bg-accent/20 text-accent', size === 'sm' ? 'text-[8px]' : 'text-[10px]')}>
          {member ? memberInitials(member) : '?'}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{label}</span>
    </span>
  );
};

export const OwnerChip = ({
  member,
  assignedProfileId,
  size = 'sm',
  fullName = false,
  className,
}: OwnerChipProps) => {
  const avatarClass = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  const textClass = size === 'sm' ? 'text-[10px]' : 'text-xs';

  if (!assignedProfileId) {
    return (
      <Badge
        variant="outline"
        className={cn(
          'gap-1 border-dashed font-normal text-muted-foreground',
          textClass,
          size === 'sm' ? 'px-1.5' : 'px-2',
          className,
        )}
        title="Ninguém assumiu esta conversa ainda"
      >
        <UserRound className={cn('flex-shrink-0', size === 'sm' ? 'h-3 w-3' : 'h-3.5 w-3.5')} aria-hidden />
        Sem responsável
      </Badge>
    );
  }

  const label = member
    ? fullName
      ? memberDisplayName(member)
      : memberFirstName(member)
    : 'Responsável';

  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1 border-accent/40 bg-accent/10 font-medium text-foreground',
        textClass,
        size === 'sm' ? 'px-1.5' : 'px-2',
        className,
      )}
      title={member ? `Responsável: ${memberDisplayName(member)}` : 'Responsável fora do diretório'}
    >
      <Avatar className={cn('flex-shrink-0', avatarClass)}>
        {member?.avatar_url && <AvatarImage src={member.avatar_url} alt={memberDisplayName(member)} />}
        <AvatarFallback className={cn('bg-accent/20 text-accent', size === 'sm' ? 'text-[8px]' : 'text-[10px]')}>
          {member ? memberInitials(member) : '?'}
        </AvatarFallback>
      </Avatar>
      <span className="truncate">{label}</span>
    </Badge>
  );
};
