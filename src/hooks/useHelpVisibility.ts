/**
 * Quais entradas de ajuda e tutoriais o usuário atual deve ver.
 *
 * A regra mora em src/lib/help/acesso.ts (sem React, para a matriz de
 * cobertura e os testes usarem a mesma). Este gancho só junta o contexto da
 * pessoa: cargo, capacidades e módulos ligados (useAcessoTelas).
 */
import { useCallback } from 'react';
import { useAcessoTelas } from '@/hooks/useAcessoTelas';
import { podeAcessarConteudo, podeLerEntrada, type HelpAccessDeclaration } from '@/lib/help/acesso';
import type { FeatureHelpEntry } from '@/lib/help/featureHelp';
import type { Tutorial } from '@/lib/help/tutorials';

export type { HelpAccessDeclaration } from '@/lib/help/acesso';

export function useHelpVisibility() {
  const { ctx, carregandoModulos } = useAcessoTelas();

  const canAccess = useCallback(
    (requirement: HelpAccessDeclaration): boolean => podeAcessarConteudo(requirement, ctx),
    [ctx],
  );

  const canSeeHelpEntry = useCallback(
    (entry: FeatureHelpEntry & { key?: string }): boolean => podeLerEntrada(entry, ctx),
    [ctx],
  );

  /** Tutorial atravessa telas, então o requisito dele sempre é avaliado. */
  const canSeeTutorial = useCallback((tutorial: Tutorial): boolean => podeAcessarConteudo(tutorial, ctx), [ctx]);

  return { canAccess, canSeeHelpEntry, canSeeTutorial, isLoading: carregandoModulos };
}

export default useHelpVisibility;
