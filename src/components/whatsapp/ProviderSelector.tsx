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
    subtitle: 'Direto com a Meta, a dona do WhatsApp',
    description:
      'O caminho mais estável e o único dentro das regras da Meta para campanhas. Você entra com o login do Facebook da empresa e escolhe a conta do WhatsApp Business.',
    docsUrl: 'https://developers.facebook.com/docs/whatsapp/cloud-api/get-started',
    recommended: true,
    icon: ShieldCheck,
  },
  {
    id: 'evolution',
    title: 'QR Code pelo ConvoFlow (Evolution)',
    subtitle: 'Conexão não oficial, no servidor do ConvoFlow',
    description:
      'Você lê o QR Code com o celular do número, como no WhatsApp Web. Não precisa configurar servidor nenhum.',
    docsUrl: 'https://doc.evolution-api.com/',
    icon: Smartphone,
  },
  {
    id: 'waha',
    title: 'QR Code no seu servidor (WAHA)',
    subtitle: 'Conexão não oficial, num servidor WAHA seu',
    description:
      'Para quem já tem um servidor WAHA. Você informa o endereço e a chave dele e conecta o número lendo o QR Code com o celular.',
    docsUrl: 'https://waha.devlike.pro/',
    icon: ServerCog,
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
                Saiba mais <ExternalLink className="h-3 w-3" />
              </a>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};
