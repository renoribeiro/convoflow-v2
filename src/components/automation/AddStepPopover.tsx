/**
 * Popover categorizado com busca para inserir uma etapa. Grupos AÇÕES /
 * CONDIÇÕES / TIMING. Itens sem suporte no motor não aparecem.
 * Ao escolher, devolve o subtipo (ex.: 'send_message').
 */
import React, { useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ACTIONS, CONDITIONS, TIMINGS, CATEGORY_STYLES, type CatalogEntry } from './automationCatalog';

interface AddStepPopoverProps {
  onSelect: (subtypeKey: string) => void;
  children: React.ReactNode;
  align?: 'center' | 'start' | 'end';
}

// Itens `comingSoon` (sem suporte no motor) NÃO aparecem: até 2026-10-25 eles
// ficavam na lista, desativados, com o selo "Em breve" (achado 85 do checkup,
// ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md). Continuam no catálogo para
// uma etapa antiga, se existir, ainda ter nome na tela.
const disponivel = (item: CatalogEntry) => !item.comingSoon;

const GROUPS: { heading: string; items: CatalogEntry[] }[] = [
  { heading: 'Ações', items: ACTIONS.filter(disponivel) },
  { heading: 'Condições', items: CONDITIONS.filter(disponivel) },
  { heading: 'Timing', items: TIMINGS.filter(disponivel) },
];

export const AddStepPopover: React.FC<AddStepPopoverProps> = ({ onSelect, children, align = 'center' }) => {
  const [open, setOpen] = useState(false);

  const handlePick = (key: string) => {
    onSelect(key);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-80 p-0" sideOffset={8}>
        <Command>
          <CommandInput placeholder="Buscar etapa..." />
          <CommandList className="max-h-80">
            <CommandEmpty>Nenhuma etapa encontrada.</CommandEmpty>
            {GROUPS.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map((item) => {
                  const s = CATEGORY_STYLES[item.category];
                  return (
                    <CommandItem
                      key={item.key}
                      value={`${item.label} ${item.description}`}
                      onSelect={() => handlePick(item.key)}
                      className="flex items-start gap-2.5 py-2"
                    >
                      <div className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white', s.iconBg)}>
                        <item.Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-medium">{item.label}</span>
                        </div>
                        <p className="truncate text-xs text-muted-foreground">{item.description}</p>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export default AddStepPopover;
