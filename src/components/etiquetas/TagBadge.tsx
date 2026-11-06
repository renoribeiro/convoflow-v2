import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { CLASSE_DA_TINTA, estiloDaTinta } from '@/lib/cores/tintaLegivel';

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
 * Contatos, Conversas e no gerenciador. O texto usa a mesma cor ajustada para
 * passar no contraste mínimo (lote 5 do checkup, src/lib/cores/tintaLegivel.ts).
 */
export const TagBadge = ({ name, color, onRemove, className }: TagBadgeProps) => {
  return (
    <Badge
      variant="outline"
      title={name}
      className={cn('max-w-full text-xs gap-1', CLASSE_DA_TINTA, className)}
      style={{
        backgroundColor: `${color}20`,
        borderColor: color,
        ...estiloDaTinta(color),
      }}
    >
      {/* Texto solto dentro de flex não ganha reticências: precisa do span. */}
      <span className="min-w-0 truncate">{name}</span>
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
