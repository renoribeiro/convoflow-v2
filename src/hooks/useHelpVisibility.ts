/**
 * Quais entradas de ajuda e tutoriais o usuário atual deve ver.
 *
 * Não existe fonte de permissão nova aqui: a decisão sai dos MESMOS primitivos
 * que o menu lateral e os guards já usam —
 *  - módulos  → `useModules().isModuleVisible` (o mesmo helper que o ModuleGuard
 *               e o Sidebar consultam);
 *  - cargos   → `useRole()` + `roleAtLeast()` (a mesma escala do RoleGuard).
 *
 * O requisito de cada tela está declarado na própria entrada
 * (`moduleName` / `minRole`), em src/lib/help/featureHelp.ts. Os tutoriais
 * declaram do mesmo jeito, em src/lib/help/tutorials.ts, e passam pela mesma
 * checagem — daí `canAccess` ser genérico.
 */
import { useCallback } from 'react';
import { useModules } from '@/hooks/useModules';
import { useRole } from '@/contexts/TenantContext';
import { roleAtLeast, type UserRole } from '@/types/userHierarchy';
import type { FeatureHelpEntry } from '@/lib/help/featureHelp';
import type { Tutorial } from '@/lib/help/tutorials';

/** O que qualquer conteúdo pode declarar sobre o acesso à tela que descreve. */
export interface HelpAccessDeclaration {
  moduleName?: string;
  minRole?: UserRole;
}

export function useHelpVisibility() {
  const { isModuleVisible, isLoading } = useModules();
  const role = useRole();
  const isSuperAdmin = role === 'superadmin';

  const canAccess = useCallback(
    (requirement: HelpAccessDeclaration): boolean => {
      // Mesmo bypass que ModuleGuard e RoleGuard aplicam ao superadmin. Ele
      // opera a plataforma e dá suporte sobre todas as telas, inclusive as que
      // o DashboardLayout bloqueia por privacidade (LOJA_ONLY_SEGMENTS) — ler a
      // documentação não é acessar dado de cliente.
      if (isSuperAdmin) return true;

      if (requirement.minRole && !roleAtLeast(role, requirement.minRole)) return false;

      // Enquanto os módulos carregam, não esconde nada — é a mesma tolerância
      // do menu lateral, que evita a lista "piscar" no primeiro render.
      if (requirement.moduleName && !isLoading && !isModuleVisible(requirement.moduleName)) {
        return false;
      }

      return true;
    },
    [isModuleVisible, isLoading, isSuperAdmin, role],
  );

  const canSeeHelpEntry = useCallback(
    (entry: FeatureHelpEntry): boolean => {
      // Chatbot, automações e conceitos não são presos a tela: valem para todos.
      if (entry.category !== 'tela') return true;
      return canAccess(entry);
    },
    [canAccess],
  );

  /** Tutorial atravessa telas, então o requisito dele sempre é avaliado. */
  const canSeeTutorial = useCallback(
    (tutorial: Tutorial): boolean => canAccess(tutorial),
    [canAccess],
  );

  return { canAccess, canSeeHelpEntry, canSeeTutorial, isLoading };
}

export default useHelpVisibility;
