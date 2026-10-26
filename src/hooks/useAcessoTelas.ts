/**
 * O contexto de acesso da pessoa atual (cargo, capacidades, módulos ligados),
 * com as perguntas que o menu, a busca rápida, a guarda de rota e a Ajuda
 * fazem. A regra mora em src/lib/access/telas.ts; este gancho só junta os
 * dados que ela precisa.
 */
import { useCallback, useMemo } from 'react';
import { useModules } from '@/hooks/useModules';
import { useCapabilities, useRole } from '@/contexts/TenantContext';
import { acessoATela, tela, telaNoMenu, type AcessoATela, type ContextoDeAcesso } from '@/lib/access/telas';

export function useAcessoTelas() {
  const papel = useRole();
  const capacidades = useCapabilities();
  const { isModuleVisible, isLoading } = useModules();

  // Enquanto os módulos carregam, null: nada some do menu e a guarda espera.
  // isModuleVisible é o mesmo helper que o resto do sistema usa (superadmin vê
  // todo módulo; os demais, só os ligados).
  const ctx: ContextoDeAcesso = useMemo(
    () => ({ papel, capacidades, moduloLigado: isLoading ? null : isModuleVisible }),
    [papel, capacidades, isModuleVisible, isLoading],
  );

  const acesso = useCallback((chave: string): AcessoATela => acessoATela(tela(chave), ctx), [ctx]);
  const noMenu = useCallback((chave: string): boolean => telaNoMenu(tela(chave), ctx), [ctx]);

  return { ctx, acesso, noMenu, carregandoModulos: isLoading };
}
