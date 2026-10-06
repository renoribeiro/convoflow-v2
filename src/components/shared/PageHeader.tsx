import { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { FeatureHelp } from '@/components/shared/FeatureHelp';

interface Crumb {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  description?: string;
  breadcrumbs?: Crumb[];
  actions?: ReactNode;
  /**
   * Chave de ajuda contextual em src/lib/help/featureHelp.ts (ex.:
   * 'page:conversations'). Renderiza o botão (?) ao lado do título. Toda tela
   * nova deve passar a sua — é o único acoplamento necessário para ter ajuda.
   */
  helpKey?: string;
}

export const PageHeader = ({
  title,
  subtitle,
  description,
  breadcrumbs,
  actions,
  helpKey,
}: PageHeaderProps) => {
  return (
    <div className="flex flex-col gap-3 pb-5 border-b border-border">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <div key={index} className="flex items-center">
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link to={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {index < breadcrumbs.length - 1 && <BreadcrumbSeparator />}
              </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      )}

      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h1 className="text-xl font-semibold text-foreground leading-tight truncate min-w-0">{title}</h1>
            {helpKey && <FeatureHelp helpKey={helpKey} className="flex-shrink-0" />}
          </div>
          {subtitle && (
            <p className="text-sm font-medium text-muted-foreground mt-0.5">{subtitle}</p>
          )}
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
};
