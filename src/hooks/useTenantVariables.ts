import { useMemo } from 'react';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';

/**
 * Variáveis personalizadas disponíveis na conta (tenant) para uso nas automações.
 *
 * IMPORTANTE: a fonte da verdade são os PRÓPRIOS NÓS dos chatbots — o nome da
 * variável é definido inline no nó "Fazer Pergunta" (data.save_to_variable) e no
 * nó "Salvar Variável" (data.variable_name). A tabela `chatbot_variables` é um
 * registro opcional que nem sempre é populado, então não dá para depender só dela.
 *
 * Agregamos por nome (deduplicado) os dois: variáveis usadas nos nós + as
 * registradas em `chatbot_variables`. Ambas as queries são tenant-scoped pelo
 * useSupabaseQuery.
 */
export function useTenantVariables() {
  // Variáveis usadas de fato nos nós (ask_question / set_variable).
  const { data: nodeRows = [], isLoading: loadingNodes } = useSupabaseQuery({
    table: 'chatbot_nodes',
    queryKey: ['tenant-variable-nodes'],
    select: 'node_type, data',
    filters: [{ column: 'node_type', operator: 'in', value: ['ask_question', 'set_variable'] }],
  });

  // Registro opcional (caso algum bot tenha gravado lá).
  const { data: regRows = [], isLoading: loadingReg } = useSupabaseQuery({
    table: 'chatbot_variables',
    queryKey: ['tenant-variables-registry'],
    select: 'name',
  });

  const customVariables = useMemo(() => {
    const set = new Set<string>();

    for (const r of nodeRows as { node_type: string; data: Record<string, unknown> | null }[]) {
      const d = r?.data ?? {};
      const raw = r?.node_type === 'ask_question' ? d['save_to_variable'] : d['variable_name'];
      if (typeof raw === 'string' && raw.trim() !== '') set.add(raw.trim());
    }

    for (const r of regRows as { name: string }[]) {
      if (typeof r?.name === 'string' && r.name.trim() !== '') set.add(r.name.trim());
    }

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [nodeRows, regRows]);

  return { customVariables, isLoading: loadingNodes || loadingReg };
}
