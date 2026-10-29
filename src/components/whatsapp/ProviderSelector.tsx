import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldCheck, ServerCog, Smartphone, ExternalLink, Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Avancado } from './forms/Avancado';
import type { ProviderType } from '@/lib/validations/whatsappInstance';

interface ProviderOption {
  id: ProviderType;
  title: string;
  subtitle: string;
  description: string;
  docsUrl?: string;
  badge?: string;
  icon: React.ComponentType<{ className?: string }>;
}

/**
 * Duas opções com nome de tarefa (lote 6e, achado 106, decisão D12): ler o QR
 * Code (servidor Evolution do ConvoFlow, sem configurar nada) ou a API oficial
 * da Meta. O WAHA, que pede um servidor próprio, fica em "Avançado".
 */
const PRINCIPAIS: ProviderOption[] = [
  {
    id: 'evolution',
    title: 'Conectar pelo QR Code',
    subtitle: 'Pelo celular do número, como no WhatsApp Web',
    description:
      'O jeito mais rápido: você dá um nome ao número e lê o QR Code com o celular dele. Não precisa de servidor nem de conta na Meta. É uma conexão não oficial: para campanhas, prefira a API oficial.',
    icon: Smartphone,
  },
  {
    id: 'official',
    title: 'API oficial da Meta',
    subtitle: 'Direto com a Meta, a dona do WhatsApp',
    description:
      'O caminho mais estável e o único dentro das regras da Meta para campanhas e templates. Você entra com o login do Facebook da empresa e escolhe a conta do WhatsApp Business.',
    badge: 'Recomendado para campanhas',
    icon: ShieldCheck,
  },
];

const AVANCADAS: ProviderOption[] = [
  {
    id: 'waha',
    title: 'QR Code no seu servidor WAHA',
    subtitle: 'Só para quem já tem um servidor WAHA próprio',
    description:
      'Você informa o endereço e a chave do seu servidor WAHA e conecta o número lendo o QR Code com o celular.',
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
  // Abre sozinho quando a escolha já está lá dentro (voltar do formulário do WAHA).
  const [avancado, setAvancado] = useState(value === 'waha');
  const cartao = (option: ProviderOption) => (
    <OpcaoCard key={option.id} option={option} selected={value === option.id} onChange={onChange} disabled={disabled} />
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-1">{PRINCIPAIS.map(cartao)}</div>
      <Avancado
        id="conectar-avancado"
        aberto={avancado}
        onAbertoChange={setAvancado}
        resumo="Para quem já tem um servidor WAHA próprio."
      >
        {AVANCADAS.map(cartao)}
      </Avancado>
    </div>
  );
};

interface OpcaoCardProps {
  option: ProviderOption;
  selected: boolean;
  onChange: (provider: ProviderType) => void;
  disabled?: boolean;
}

const OpcaoCard = ({ option, selected: isSelected, onChange, disabled }: OpcaoCardProps) => {
  const Icon = option.icon;
  return (
    <Card
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
        isSelected ? 'ring-2 ring-primary border-primary' : 'hover:border-primary/40',
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
              <CardTitle className="text-base flex flex-wrap items-center gap-2">
                {option.title}
                {option.badge && (
                  <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white">{option.badge}</Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-0.5">{option.subtitle}</CardDescription>
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
        {option.docsUrl && (
          <a
            href={option.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            Saiba mais <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
};
