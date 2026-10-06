import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ServerCog, Smartphone, ExternalLink, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProviderType } from '@/lib/validations/whatsappInstance';

interface ProviderOption {
  id: ProviderType;
  title: string;
  subtitle: string;
  description: string;
  docsUrl: string;
  recommended?: boolean;
  icon: React.ComponentType<{ className?: string }>;
}

const OPTIONS: ProviderOption[] = [
  {
    id: 'official',
    title: 'API Oficial do WhatsApp',
    subtitle: 'Meta Cloud API',
    description:
      'Integração direta com a Meta. Maior estabilidade, conformidade e limites oficiais. Requer conta WhatsApp Business e App configurado no Meta for Developers.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    recommended: true,
    icon: ShieldCheck,
  },
  {
    id: 'waha',
    title: 'WAHA API',
    subtitle: 'Auto-hospedada / self-hosted',
    description:
      'Servidor WAHA próprio (Docker). Boa opção para quem já mantém uma instância WAHA dedicada com sessões controladas.',
    docsUrl: 'https://waha.devlike.pro/',
    icon: ServerCog,
  },
  {
    id: 'evolution',
    title: 'Evolution API',
    subtitle: 'Multi-instância via servidor Evolution',
    description:
      'Provedor já em uso no ConvoFlow. Espelhamento, QR Code e gerenciamento de instâncias funcionam como hoje.',
    docsUrl: 'https://doc.evolution-api.com/',
    icon: Smartphone,
  },
];

interface ProviderSelectorProps {
  value: ProviderType | null;
  onChange: (provider: ProviderType) => void;
  disabled?: boolean;
}

export const ProviderSelector = ({ value, onChange, disabled }: ProviderSelectorProps) => {
  return (
    <div className="grid gap-3 md:grid-cols-1">
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isSelected = value === option.id;

        return (
          <Card
            key={option.id}
            role="button"
            tabIndex={disabled ? -1 : 0}
            onClick={() => !disabled && onChange(option.id)}
            onKeyDown={(e) => {
              if (disabled) return;
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onChange(option.id);
              }
            }}
            className={cn(
              'cursor-pointer transition-all border',
              isSelected
                ? 'ring-2 ring-primary border-primary'
                : 'hover:border-primary/40',
              disabled && 'opacity-60 cursor-not-allowed',
            )}
            aria-pressed={isSelected}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="rounded-md bg-muted p-2">
                    <Icon className="h-5 w-5 text-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      {option.title}
                      {option.recommended && (
                        <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">
                          Recomendado
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {option.subtitle}
                    </CardDescription>
                  </div>
                </div>
                {isSelected && (
                  <div className="rounded-full bg-primary text-primary-foreground p-1">
                    <Check className="h-3 w-3" />
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <p className="text-sm text-muted-foreground">{option.description}</p>
              <a
                href={option.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Documentação <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
