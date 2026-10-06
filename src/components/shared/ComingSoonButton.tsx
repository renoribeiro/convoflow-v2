import type { ComponentProps, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface ComingSoonButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick' | 'disabled'> {
  children: ReactNode;
  /** Texto do tooltip. O padrão serve para controle ainda não implementado. */
  motivo?: string;
}

/**
 * Botão que ainda não faz nada — e diz isso.
 *
 * Existe porque botão sem handler é pior que botão desabilitado: o usuário
 * clica, nada acontece e ele não sabe se quebrou, se demorou ou se ele errou.
 * O projeto já resolvia isso em dois lugares na mão (BuilderHeader "Testar" e
 * OfficialApiForm "Conectar com a Meta"); aqui o padrão fica num lugar só.
 *
 * Não use para esconder trabalho: use quando a decisão de produto é que o
 * controle aparece antes da funcionalidade existir.
 */
export const ComingSoonButton = ({
  children,
  motivo = 'Em breve',
  ...props
}: ComingSoonButtonProps) => (
  <Tooltip>
    <TooltipTrigger asChild>
      {/* O <span> recebe o hover: botão desabilitado não dispara ponteiro. */}
      <span tabIndex={0} className="inline-flex">
        <Button {...props} disabled>
          {children}
        </Button>
      </span>
    </TooltipTrigger>
    <TooltipContent className="text-xs">{motivo}</TooltipContent>
  </Tooltip>
);
