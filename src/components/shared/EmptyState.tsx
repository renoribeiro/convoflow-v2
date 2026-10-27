import { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description?: string;
  /** A primeira ação de quem chega na lista vazia ("Novo chatbot", "Conectar número"). */
  action?: EmptyStateAction;
  /** Cartões pequenos (os do Dashboard): menos espaço em volta. */
  compacto?: boolean;
  className?: string;
}

/**
 * O vazio do sistema inteiro (lote 5 do checkup): ícone, título, uma frase e,
 * quando existe, a primeira ação. Lista vazia feita à mão ("Nenhum..." solto
 * num parágrafo) usa este componente; o texto continua o do lote 3.
 */
export const EmptyState = ({ icon, title, description, action, compacto, className }: EmptyStateProps) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center px-4 text-center',
        compacto ? 'py-6' : 'py-16',
        className,
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'flex items-center justify-center text-muted-foreground/60 [&_svg]:h-full [&_svg]:w-full',
          compacto ? 'mb-2 h-8 w-8' : 'mb-4 h-12 w-12',
        )}
      >
        {icon}
      </div>
      <h3 className={cn('font-semibold text-foreground mb-1', compacto ? 'text-sm' : 'text-base')}>{title}</h3>
      {description && (
        <p className={cn('text-sm text-muted-foreground max-w-sm', action ? (compacto ? 'mb-3' : 'mb-6') : '')}>
          {description}
        </p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.icon}
          {action.label}
        </Button>
      )}
    </div>
  );
};
