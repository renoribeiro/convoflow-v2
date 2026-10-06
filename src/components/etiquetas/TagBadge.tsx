import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TagBadgeProps {
  name: string;
  color: string;
  /** Quando fornecido, exibe um "x" para remover a etiqueta. */
  onRemove?: () => void;
  className?: string;
}

/**
 * Visual padrão de etiqueta (label estilo WhatsApp): fundo translúcido na cor da
 * etiqueta, texto e borda na cor cheia. Fonte única de verdade do visual usado em
 * Contatos, Conversas e no gerenciador.
 */
export const TagBadge = ({ name, color, onRemove, className }: TagBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={cn('text-xs gap-1', className)}
      style={{
        backgroundColor: `${color}20`,
        color,
        borderColor: color,
      }}
    >
      {name}
      {onRemove && (
        <X
          className="h-3 w-3 cursor-pointer hover:opacity-70"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
        />
      )}
    </Badge>
  );
};
