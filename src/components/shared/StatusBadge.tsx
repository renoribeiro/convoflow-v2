import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

interface StatusBadgeProps {
  status: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const STATUS_CLASSES: Record<StatusVariant, string> = {
  success: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warning: 'bg-amber-50 text-amber-700 border-amber-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
};

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
