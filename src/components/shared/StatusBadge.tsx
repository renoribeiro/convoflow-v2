import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * O selo de situação do sistema inteiro (lote 5 do checkup): cores da marca,
 * texto com contraste AA nos dois temas. Telas que pintam um selo à mão usam
 * estas classes (`CLASSES_DE_SITUACAO`) em vez de verde, amarelo e vermelho
 * fixos, que somem no tema escuro.
 */
export const CLASSES_DE_SITUACAO: Record<StatusVariant, string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/15 text-warning border-warning/40',
  danger: 'bg-destructive/10 text-destructive border-destructive/30',
  info: 'bg-accent/10 text-accent border-accent/30',
  neutral: 'bg-muted text-muted-foreground border-border',
};
const STATUS_CLASSES = CLASSES_DE_SITUACAO;

export const StatusBadge = ({ status, children, className }: StatusBadgeProps) => {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_CLASSES[status], className)}
    >
      {children}
    </Badge>
  );
};
