import { useEffect, useState } from 'react';
import { Bell, Search, User, ChevronDown, Menu, LogOut, Settings, Bug, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { BugReportButton, useRelatoDeProblemaLigado } from '@/components/bug-report/BugReportButton';
import { ThemeToggle } from '@/components/shared/ThemeToggle';
import { useTenant, useIsSuperAdmin } from '@/contexts/TenantContext';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AnyUserRole, roleLabel as roleLabelHelper } from '@/types/userHierarchy';
import { RoleBadge } from '@/components/users/RoleBadge';
import { CommandPalette } from '@/components/layout/CommandPalette';
import { TenantSwitcher } from '@/components/layout/TenantSwitcher';
import { StoreSwitcher } from '@/components/stores/StoreSwitcher';

interface NavbarProps {
  onMenuClick: () => void;
}

export const Navbar = ({ onMenuClick }: NavbarProps) => {
  const { tenant, profile, loading: tenantLoading } = useTenant();
  const { logout } = useAuth();
  const isSuperAdmin = useIsSuperAdmin();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [relatoAberto, setRelatoAberto] = useState(false);
  const relatoLigado = useRelatoDeProblemaLigado();
  const { theme, setTheme } = useTheme();

  // A tecla do atalho como ela aparece no teclado da pessoa (achado 27: o
  // topo mostrava "⌘K", tecla de Mac, também no Windows).
  const teclaDoAtalho = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

  // Atalho global ⌘K / Ctrl+K para abrir a busca.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((current) => !current);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const displayName = tenantLoading
    ? 'Carregando...'
    : (`${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || 'Usuário');

  const initials = (
    `${(profile?.first_name ?? '').charAt(0)}${(profile?.last_name ?? '').charAt(0)}`
      .toUpperCase() || 'U'
  );

  // Nada aqui pode empurrar a página para o lado. O grupo da esquerda é quem
  // cede (min-w-0 flex-1): dentro dele o seletor de Conta/Loja encolhe e trunca
  // o nome; busca e ícones são shrink-0. O grupo da direita nunca encolhe, mas
  // só carrega texto (nome do usuário, "Relatar problema") a partir de lg. Medido
  // antes: +197px a 390, +118 a 768, +38 a 1024 para o gerente — sino, tema e
  // menu do usuário saíam da tela.
  return (
    <header className="h-12 bg-card border-b border-border flex items-center justify-between gap-2 px-3 sm:px-4 flex-shrink-0">
      {/* Left */}
      <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
        <Button
          variant="ghost"
          size="icon"
          onClick={onMenuClick}
          className="md:hidden h-8 w-8 shrink-0"
          aria-label="Abrir menu"
        >
          <Menu className="h-4 w-4" />
        </Button>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          aria-label="Abrir busca (Ctrl+K)"
          className="relative hidden sm:flex shrink-0 items-center h-8 w-56 rounded-md bg-muted/50 hover:bg-muted text-sm text-muted-foreground transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:bg-background"
        >
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" />
          <span className="pl-8 pr-12">Buscar...</span>
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden lg:inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            {teclaDoAtalho}
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => setPaletteOpen(true)}
          aria-label="Abrir busca"
          className="sm:hidden h-8 w-8 shrink-0"
        >
          <Search className="h-4 w-4" />
        </Button>

        {/* Seletor de Conta ativa — visível apenas para superadmin */}
        <TenantSwitcher />
        {/* Seletor de Loja — visível apenas para gerente (troca a Loja ativa) */}
        <StoreSwitcher />
      </div>

      {/* Right */}
      {/* No celular, "Relatar problema" e o tema ficam no menu do usuário: os
          dois botões tomavam o espaço do seletor de Loja, que mostrava só
          "Cont..." (achado 25). */}
      <div className="flex items-center gap-1 shrink-0">
        <BugReportButton open={relatoAberto} onOpenChange={setRelatoAberto} className="hidden sm:inline-flex" />
        <NotificationCenter />
        <div className="hidden sm:block">
          <ThemeToggle />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 h-8 px-2"
              aria-label="Menu do usuário"
            >
              <Avatar className="h-7 w-7">
                <AvatarImage src={profile?.avatar_url ?? undefined} alt={displayName} />
                <AvatarFallback className="text-xs">{initials}</AvatarFallback>
              </Avatar>
              <div className="text-left hidden lg:block">
                <p className="text-xs font-medium leading-none">{displayName}</p>
                {!tenantLoading && profile?.role && (
                  <p className="text-[10px] text-muted-foreground leading-none mt-0.5">
                    {roleLabelHelper(profile.role as AnyUserRole | undefined)}
                  </p>
                )}
              </div>
              {/* No celular a seta é só enfeite e custa 20px que o seletor de Loja precisa. */}
              <ChevronDown className="h-3 w-3 text-muted-foreground hidden sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{displayName}</p>
                {!tenantLoading && profile?.role && (
                  <RoleBadge role={profile.role as AnyUserRole} />
                )}
                {tenant?.name && (
                  <p className="text-xs text-muted-foreground truncate">{tenant.name}</p>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/dashboard/profile" className="flex items-center gap-2">
                <User className="h-4 w-4" />
                Meu Perfil
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/notifications" className="flex items-center gap-2">
                <Bell className="h-4 w-4" />
                Notificações
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/dashboard/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configurações
              </Link>
            </DropdownMenuItem>
            {relatoLigado && (
              <DropdownMenuItem className="flex items-center gap-2 sm:hidden" onSelect={() => setRelatoAberto(true)}>
                <Bug className="h-4 w-4" />
                Relatar problema
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator className="sm:hidden" />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground sm:hidden">Tema</DropdownMenuLabel>
            {([
              ['light', 'Claro', Sun],
              ['dark', 'Escuro', Moon],
              ['system', 'Sistema', Monitor],
            ] as const).map(([valor, nome, Icone]) => (
              <DropdownMenuItem key={valor} className="flex items-center gap-2 sm:hidden" onSelect={() => setTheme(valor)}>
                <Icone className="h-4 w-4" />
                {nome}
                {theme === valor && <span className="ml-auto text-xs text-muted-foreground">✓</span>}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive gap-2"
              onClick={() => logout()}
            >
              <LogOut className="h-4 w-4" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </header>
  );
};
