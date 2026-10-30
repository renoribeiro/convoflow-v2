import { useEffect } from 'react';
import { NavLink, useMatch } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useAcessoTelas } from '@/hooks/useAcessoTelas';
import { TELAS, caminhoDaTela, telaNoMenu, type GrupoDoMenu } from '@/lib/access/telas';
import { ChevronLeft, FileText, X } from 'lucide-react';
import { ICONES_DAS_TELAS } from '@/lib/access/iconesDasTelas';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import logoHorizontal from '@/assets/logos/logo-horizontal.svg';
import logoHorizontalDark from '@/assets/logos/logo-horizontal-dark.svg';
import iconGreen from '@/assets/logos/icon-green.svg';
import iconWhite from '@/assets/logos/icon-white.svg';

interface SidebarProps {
  /** Estado expandido/recolhido da barra fixa (só tem efeito no desktop, lg+). */
  isOpen: boolean;
  onToggle: () => void;
  /** Drawer do mobile (< md). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  /** Marca para os tours do onboarding (src/lib/onboarding/tours.ts). */
  dataTour?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Modo de exibição dos itens:
 * - `drawer`    → mobile, sempre com rótulo (sem tooltip)
 * - `expanded`  → barra fixa expandida: só ícone no tablet (md), ícone + rótulo no desktop (lg)
 * - `collapsed` → barra fixa recolhida: só ícone em qualquer largura
 */
type SidebarMode = 'drawer' | 'expanded' | 'collapsed';

/**
 * Os itens do menu saem do registro único de telas (src/lib/access/telas.ts):
 * nome, grupo e quem vê. Aqui ficam só o ícone e a marca de tour de cada um.
 * Até 2026-10-26 o menu tinha listas próprias e olhava só o módulo; o
 * atendente via Campanhas, Instâncias e outras telas que não podia usar.
 */
// O ícone de cada tela é o mesmo do menu e da busca rápida (src/lib/access/iconesDasTelas.ts).

// Escrito como `dataTour: '...'` para a varredura de src/lib/onboarding/tours.test.ts achar a marca.
const MARCAS_DE_TOUR: Record<string, { dataTour: string }> = { help: { dataTour: 'menu-ajuda' } };

const itensDoGrupo = (grupo: GrupoDoMenu, visivel: (chave: string) => boolean): NavItem[] =>
  TELAS.filter((t) => t.grupo === grupo && visivel(t.chave)).map((t) => ({
    name: t.nome,
    href: caminhoDaTela(t),
    icon: ICONES_DAS_TELAS[t.chave] ?? FileText,
    dataTour: MARCAS_DE_TOUR[t.chave]?.dataTour,
  }));

const NavItemLink = ({
  item,
  mode,
  onNavigate,
}: {
  item: NavItem;
  mode: SidebarMode;
  onNavigate?: () => void;
}) => {
  // O estado ativo é resolvido aqui em vez de pela função `className` do
  // NavLink. Motivo: quando o item vai embrulhado em `<TooltipTrigger asChild>`,
  // o Radix mescla as props fazendo `[classNameDoTrigger, classNameDoFilho]
  // .join(' ')`. Com uma função, o `join` a converte em texto e despeja o
  // código-fonte dentro do atributo `class`. Os trechos separados por espaço
  // viram classes de verdade — `text-primary-foreground` (quase preto) e os
  // `before:*` da barra do item ativo passavam a valer para todos os itens.
  // Item com outro item embaixo do mesmo caminho só acende no próprio
  // endereço: Administração não acende em Gestão de Usuários (achado 133).
  const exato = item.href === '/dashboard' || item.href === '/dashboard/admin';
  const isActive = !!useMatch({
    path: item.href,
    end: exato,
  });

  const inner = (
    <NavLink
      to={item.href}
      end={exato}
      onClick={onNavigate}
      // No tablet e com a barra recolhida só o ícone aparece: o nome vai para
      // o leitor de tela por aqui (antes o link ficava sem nome nenhum).
      aria-label={item.name}
      data-tour={item.dataTour}
      className={cn(
        'relative flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150 group',
        isActive
          ? 'bg-primary text-primary-foreground font-semibold shadow-sm before:absolute before:left-0 before:top-1.5 before:bottom-1.5 before:w-1 before:bg-primary-foreground/40 before:rounded-r'
          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        // Tablet: só ícone, centralizado. Desktop: volta ao layout normal.
        mode === 'expanded' && 'justify-center px-2 lg:justify-start lg:px-3',
        mode === 'collapsed' && 'justify-center px-2',
      )}
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      <span
        className={cn(
          'truncate',
          mode === 'expanded' && 'hidden lg:inline',
          mode === 'collapsed' && 'hidden',
        )}
      >
        {item.name}
      </span>
    </NavLink>
  );

  // No drawer o rótulo está sempre visível — tooltip seria redundante.
  if (mode === 'drawer') return inner;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{inner}</TooltipTrigger>
      <TooltipContent
        side="right"
        // Quando expandida, o rótulo já aparece no desktop: tooltip só no tablet.
        className={cn('text-xs', mode === 'expanded' && 'lg:hidden')}
      >
        {item.name}
      </TooltipContent>
    </Tooltip>
  );
};

const SectionLabel = ({ label, mode }: { label: string; mode: SidebarMode }) => {
  if (mode === 'collapsed') return <div className="my-1" />;

  return (
    <>
      {/* No tablet o rótulo da seção some e vira apenas um respiro entre grupos. */}
      {mode === 'expanded' && <div className="my-1 lg:hidden" />}
      <p
        className={cn(
          'px-3 pt-4 pb-1 text-[10px] font-semibold uppercase tracking-widest text-sidebar-foreground',
          mode === 'expanded' && 'hidden lg:block',
        )}
      >
        {label}
      </p>
    </>
  );
};

const SidebarLogos = ({ mode }: { mode: SidebarMode }) => (
  <>
    {/* Logo horizontal: drawer (mobile) e desktop expandido */}
    {mode !== 'collapsed' && (
      <span className={cn('block', mode === 'expanded' && 'hidden lg:block')}>
        <img src={logoHorizontal} alt="ConvoFlow" className="h-7 w-auto dark:hidden" />
        <img src={logoHorizontalDark} alt="ConvoFlow" className="h-7 w-auto hidden dark:block" />
      </span>
    )}
    {/* Ícone: tablet (md) e desktop recolhido */}
    {mode !== 'drawer' && (
      <span className={cn('block', mode === 'expanded' && 'lg:hidden')}>
        <img src={iconGreen} alt="ConvoFlow" className="h-7 w-7 dark:hidden" />
        <img src={iconWhite} alt="ConvoFlow" className="h-7 w-7 hidden dark:block" />
      </span>
    )}
  </>
);

export const Sidebar = ({ isOpen, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const { ctx } = useAcessoTelas();

  // Esc fecha o drawer do mobile.
  useEffect(() => {
    if (!mobileOpen) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onMobileClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mobileOpen, onMobileClose]);

  const visivel = (chave: string) => telaNoMenu(TELAS.find((t) => t.chave === chave)!, ctx);
  const visibleOperation = itensDoGrupo('operacao', visivel);
  const visibleMarketing = itensDoGrupo('marketing', visivel);
  const visibleConfig = itensDoGrupo('configuracao', visivel);
  const visibleTeam = itensDoGrupo('equipe', visivel);
  const visibleAdmin = itensDoGrupo('admin', visivel);
  const showTeam = visibleTeam.length > 0;
  const showAdmin = visibleAdmin.length > 0;

  const renderNav = (mode: SidebarMode, onNavigate?: () => void) => (
    <nav className="flex-1 overflow-y-auto py-2 px-2">
      {visibleOperation.length > 0 && (
        <>
          <SectionLabel label="Operação" mode={mode} />
          <div className="space-y-0.5">
            {visibleOperation.map((item) => (
              <NavItemLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      {visibleMarketing.length > 0 && (
        <>
          <SectionLabel label="Marketing" mode={mode} />
          <div className="space-y-0.5">
            {visibleMarketing.map((item) => (
              <NavItemLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      <SectionLabel label="Configuração" mode={mode} />
      <div className="space-y-0.5">
        {visibleConfig.map((item) => (
          <NavItemLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
        ))}
      </div>

      {showTeam && (
        <>
          <SectionLabel label="Equipe" mode={mode} />
          <div className="space-y-0.5">
            {visibleTeam.map((item) => (
              <NavItemLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}

      {showAdmin && (
        <>
          <SectionLabel label="Admin" mode={mode} />
          <div className="space-y-0.5">
            {visibleAdmin.map((item) => (
              <NavItemLink key={item.href} item={item} mode={mode} onNavigate={onNavigate} />
            ))}
          </div>
        </>
      )}
    </nav>
  );

  const fixedMode: SidebarMode = isOpen ? 'expanded' : 'collapsed';

  return (
    <>
      {/* ------------------------------------------------------------------ */}
      {/* Tablet (md) e desktop (lg): barra fixa. Escondida no mobile.        */}
      {/* ------------------------------------------------------------------ */}
      <div
        className={cn(
          // Só a largura anima. Com `transition-all`, a cor de fundo também
          // animava e o menu ficava 300ms atrasado ao trocar de tema.
          'hidden md:flex fixed left-0 top-0 h-full bg-sidebar border-r border-sidebar-border transition-[width] duration-300 z-40 flex-col',
          // Tablet sempre em modo ícone (64px); desktop respeita o toggle.
          'md:w-16',
          isOpen ? 'lg:w-60' : 'lg:w-14',
        )}
      >
        {/* Logo + toggle */}
        <div className="flex items-center h-12 px-3 border-b border-sidebar-border flex-shrink-0">
          {isOpen ? (
            <>
              <NavLink
                to="/dashboard"
                className="flex items-center justify-center lg:justify-start flex-1 min-w-0"
                aria-label="ConvoFlow"
              >
                <SidebarLogos mode="expanded" />
              </NavLink>
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggle}
                className="hidden lg:inline-flex h-8 w-8 flex-shrink-0"
                aria-label="Recolher menu lateral"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <button
              onClick={onToggle}
              className="mx-auto flex items-center justify-center"
              aria-label="Expandir menu lateral"
            >
              <SidebarLogos mode="collapsed" />
            </button>
          )}
        </div>

        {renderNav(fixedMode)}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Mobile (< md): drawer sobreposto, animado a partir da esquerda.     */}
      {/* ------------------------------------------------------------------ */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              key="sidebar-backdrop"
              className="fixed inset-0 z-40 bg-overlay/40 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              aria-hidden="true"
              onClick={onMobileClose}
            />
            <motion.aside
              key="sidebar-drawer"
              className="fixed left-0 top-0 z-50 h-full w-60 max-w-[85vw] bg-sidebar border-r border-sidebar-border flex flex-col md:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'tween', ease: 'easeOut', duration: 0.25 }}
              role="dialog"
              aria-modal="true"
              aria-label="Menu de navegação"
            >
              <div className="flex items-center h-12 px-3 border-b border-sidebar-border flex-shrink-0">
                <NavLink
                  to="/dashboard"
                  onClick={onMobileClose}
                  className="flex items-center flex-1 min-w-0"
                  aria-label="ConvoFlow"
                >
                  <SidebarLogos mode="drawer" />
                </NavLink>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onMobileClose}
                  className="h-8 w-8 flex-shrink-0"
                  aria-label="Fechar menu lateral"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {renderNav('drawer', onMobileClose)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
