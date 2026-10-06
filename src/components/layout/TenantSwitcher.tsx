import { useState } from 'react';
import { Check, ChevronsUpDown, Building2, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useLocation } from 'react-router-dom';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useTenant, useIsSuperAdmin } from '@/contexts/TenantContext';

interface TenantRow {
  id: string;
  name: string | null;
}

/**
 * Seletor de Conta ativa para superadmin.
 *
 * Um superadmin não pertence a nenhuma Conta, então as telas operacionais
 * (Funil, Conversas, Contatos, ...) — que filtram tudo por tenant_id — ficam
 * vazias por padrão. Este seletor deixa o superadmin "entrar" numa Conta
 * específica; o TenantContext passa a usar esse tenant e o RLS já libera o
 * superadmin a ler os dados dela.
 *
 * Renderiza `null` para qualquer usuário que não seja superadmin.
 */
export const TenantSwitcher = () => {
  const isSuperAdmin = useIsSuperAdmin();
  const { tenantId, isImpersonating, setActiveTenant } = useTenant();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // O seletor é uma ferramenta do Dashboard (escolher de qual cliente ver as
  // estatísticas). Só aparece lá — não polui o topo nas outras telas.
  const onDashboard = location.pathname === '/dashboard';

  // `tenants` é tenant-agnostic no useSupabaseQuery; para superadmin o RLS
  // retorna todas as Contas (policy "tenants_super_admin_all").
  const { data, isLoading } = useSupabaseQuery({
    table: 'tenants',
    select: 'id, name',
    orderBy: [{ column: 'name', ascending: true }],
    enabled: isSuperAdmin && onDashboard,
    staleTime: 5 * 60 * 1000,
  });
  const tenants = (data ?? []) as unknown as TenantRow[];

  if (!isSuperAdmin || !onDashboard) return null;

  const activeTenant = tenants.find((t) => t.id === tenantId);
  const label = isImpersonating
    ? (activeTenant?.name || 'Conta selecionada')
    : 'Selecionar Conta';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          aria-label="Selecionar Conta ativa"
          className={cn(
            // min-w-0: é o item que cede quando a Navbar fica apertada (o nome trunca).
            'h-8 gap-2 min-w-0 max-w-[200px]',
            isImpersonating && 'border-primary/50 bg-primary/5 text-foreground',
          )}
        >
          <Building2 className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
          <span className="truncate text-xs">{label}</span>
          <ChevronsUpDown className="h-3 w-3 flex-shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar Conta..." className="h-9" />
          <CommandList>
            <CommandEmpty>
              {isLoading ? 'Carregando...' : 'Nenhuma Conta encontrada.'}
            </CommandEmpty>

            {isImpersonating && (
              <CommandGroup>
                <CommandItem
                  value="__sair__"
                  onSelect={() => {
                    setActiveTenant(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair da Conta
                </CommandItem>
              </CommandGroup>
            )}

            <CommandGroup heading="Contas">
              {tenants.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`${t.name ?? ''} ${t.id}`}
                  onSelect={() => {
                    setActiveTenant(t.id);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      tenantId === t.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <span className="truncate">{t.name || t.id}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};
