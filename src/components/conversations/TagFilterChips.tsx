import { Tag } from 'lucide-react';
import { useTags } from '@/hooks/useTags';
import { TagBadge } from '@/components/etiquetas/TagBadge';
import { cn } from '@/lib/utils';

interface TagFilterChipsProps {
  /** Etiquetas ativas no modal "Filtros". Vazio = o componente não renderiza nada. */
  tagIds: string[];
  onRemove: (tagId: string) => void;
  className?: string;
}

/**
 * Sinal, fora do modal, de que a lista está recortada por etiqueta: os selos
 * das etiquetas marcadas, cada um com o "x" de tirar — o mesmo visual do
 * cartão da conversa e do painel do contato.
 *
 * Só o que existe na Loja aberta é mostrado: uma etiqueta apagada enquanto
 * estava marcada some daqui (e do filtro na próxima escolha), em vez de virar
 * um selo sem nome.
 */
export const TagFilterChips = ({ tagIds, onRemove, className }: TagFilterChipsProps) => {
  const { tags } = useTags();
  if (tagIds.length === 0) return null;

  const active = tags.filter((tag) => tagIds.includes(tag.id));
  if (active.length === 0) return null;

  return (
    <div
      data-testid="tag-filter-chips"
      className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      <Tag className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">Filtrando por etiqueta:</span>
      {active.map((tag) => (
        <TagBadge key={tag.id} name={tag.name} color={tag.color} onRemove={() => onRemove(tag.id)} />
      ))}
    </div>
  );
};
