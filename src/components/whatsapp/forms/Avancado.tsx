import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * "Avançado" da janela de conectar número (lote 6e, achado 106, decisão D12):
 * o que é técnico (WAHA, código interno, endereço de entrega, campos manuais
 * da Meta) fica guardado aqui, fechado por padrão. Quem só quer ler o QR Code
 * ou entrar com a Meta não precisa abrir.
 */
interface Props {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  /** Uma frase do que tem dentro, ao lado de "Avançado". */
  resumo: string;
  id: string;
  children: ReactNode;
}

export const Avancado = ({ aberto, onAbertoChange, resumo, id, children }: Props) => (
  <div className="rounded-md border border-border">
    <Button
      type="button"
      variant="ghost"
      className="h-auto w-full justify-between gap-3 whitespace-normal px-3 py-2 text-left"
      aria-expanded={aberto}
      aria-controls={id}
      onClick={() => onAbertoChange(!aberto)}
    >
      <span>
        <span className="block text-sm font-medium">Avançado</span>
        <span className="block text-xs font-normal text-muted-foreground">{resumo}</span>
      </span>
      <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
    </Button>
    {aberto && (
      <div id={id} className="space-y-4 border-t border-border p-3">
        {children}
      </div>
    )}
  </div>
);
