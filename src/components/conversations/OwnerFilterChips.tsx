import { UserRound, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useOwnerFilterOptions } from '@/hooks/useOwnerFilterOptions';
import { cn } from '@/lib/utils';

interface OwnerFilterChipsProps {
  /** Responsáveis ativos no modal "Filtros". Vazio = o componente não renderiza nada. */
  assignedProfileIds: string[];
  onRemove: (profileId: string) => void;
  className?: string;
}

/**
 * Sinal, fora do modal, de que a lista está recortada por responsável — o
 * irmão de `TagFilterChips`: um selo por pessoa marcada, cada um com o "x" de
 * tirar. Quem saiu do time aparece com o motivo, como no seletor.
 *
 * Só quem existe nas opções vira selo: um id que não está mais lá (por
 * exemplo, logo depois de trocar de Loja, antes do reset do pai) some daqui
 * em vez de virar um selo sem nome.
 */
export const OwnerFilterChips = ({ assignedProfileIds, onRemove, className }: OwnerFilterChipsProps) => {
  const { optionFor } = useOwnerFilterOptions();
  if (assignedProfileIds.length === 0) return null;

  const active = assignedProfileIds
    .map((id) => optionFor(id))
    .filter((option): option is NonNullable<typeof option> => !!option);
  if (active.length === 0) return null;

  return (
    <div
      data-testid="owner-filter-chips"
      className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      <UserRound className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Filtrando por responsável:</span>
      {active.map((option) => (
        <Badge
          key={option.id}
          variant="outline"
          className={cn('text-xs gap-1 font-normal', option.reason && 'border-dashed')}
        >
          {option.label}
          <X
            className="h-3 w-3 cursor-pointer hover:opacity-70"
            aria-label={`Tirar ${option.label} do filtro`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(option.id);
            }}
          />
        </Badge>
      ))}
    </div>
  );
};
