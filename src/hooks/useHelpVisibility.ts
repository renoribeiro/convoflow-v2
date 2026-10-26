/**
 * Quais entradas de ajuda e tutoriais o usuário atual deve ver.
 *
 * Não existe fonte de permissão nova aqui.
 *  - A entrada de uma TELA do painel (`page:<tela>`) segue o registro único de
 *    telas (src/lib/access/telas.ts), o mesmo do menu, da busca rápida e da
 *    TelaGuard: quem não alcança a tela não lê a ajuda dela.
 *  - O resto (abas de Configurações, tutoriais, tours, passos da lista) declara
 *    o próprio requisito: `moduleName`, `minRole` e, desde 2026-10-26,
 *    `capacidade` (a matriz DEFAULT_CAPABILITIES).
 */
import { useCallback } from 'react';
import { useModules } from '@/hooks/useModules';
import { useCapabilities, useRole } from '@/contexts/TenantContext';
import { roleAtLeast, type Capability, type UserRole } from '@/types/userHierarchy';
import { useAcessoTelas } from '@/hooks/useAcessoTelas';
import { TELAS, acessoATela, chaveDeAjudaDaTela, type Tela } from '@/lib/access/telas';
import type { FeatureHelpEntry } from '@/lib/help/featureHelp';
import type { Tutorial } from '@/lib/help/tutorials';

/** O que qualquer conteúdo pode declarar sobre o acesso à tela que descreve. */
export interface HelpAccessDeclaration {
  moduleName?: string;
  minRole?: UserRole;
  /** Capacidade da matriz DEFAULT_CAPABILITIES que o conteúdo exige. */
  capacidade?: Capability;
}


const TELA_DA_AJUDA: ReadonlyMap<string, Tela> = new Map(TELAS.map((t) => [chaveDeAjudaDaTela(t), t]));

export function useHelpVisibility() {
  const { isModuleVisible, isLoading } = useModules();
  const role = useRole();
  const capacidades = useCapabilities();
  const { ctx } = useAcessoTelas();
  const isSuperAdmin = role === 'superadmin';

  const canAccess = useCallback(
    (requirement: HelpAccessDeclaration): boolean => {
      // Mesmo bypass que ModuleGuard e RoleGuard aplicam ao superadmin. Ele
      // opera a plataforma e dá suporte sobre todas as telas, inclusive as que
      // o DashboardLayout bloqueia por privacidade (LOJA_ONLY_SEGMENTS) — ler a
      // documentação não é acessar dado de cliente.
      if (isSuperAdmin) return true;

      if (requirement.minRole && !roleAtLeast(role, requirement.minRole)) return false;
      if (requirement.capacidade && capacidades[requirement.capacidade] !== true) return false;

      // Enquanto os módulos carregam, não esconde nada — é a mesma tolerância
      // do menu lateral, que evita a lista "piscar" no primeiro render.
      if (requirement.moduleName && !isLoading && !isModuleVisible(requirement.moduleName)) {
        return false;
      }

      return true;
    },
    [isModuleVisible, isLoading, isSuperAdmin, role, capacidades],
  );

  const canSeeHelpEntry = useCallback(
    (entry: FeatureHelpEntry & { key?: string }): boolean => {
      // Chatbot, automações e conceitos não são presos a tela: valem para todos.
      if (entry.category !== 'tela') return true;
      // Superadmin lê tudo (mesmo bypass de sempre: ler a documentação não é
      // acessar dado de cliente).
      if (isSuperAdmin) return true;
      const t = entry.key ? TELA_DA_AJUDA.get(entry.key) : undefined;
      if (t) return acessoATela(t, ctx) === 'liberado';
      return canAccess(entry);
    },
    [canAccess, ctx, isSuperAdmin],
  );

  /** Tutorial atravessa telas, então o requisito dele sempre é avaliado. */
  const canSeeTutorial = useCallback(
    (tutorial: Tutorial): boolean => canAccess(tutorial),
    [canAccess],
  );

  return { canAccess, canSeeHelpEntry, canSeeTutorial, isLoading };
}

export default useHelpVisibility;
