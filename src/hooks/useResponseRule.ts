import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { QUERY_KEYS } from '@/lib/queryClient';
import { useCanManageRotation } from '@/hooks/useConversationRotation';
import {
  parseResponseRuleSettings,
  type BusinessHours,
  type ResponseRuleSettings,
} from '@/lib/conversations/responseRule';

/**
 * Regra de tempo de resposta (migração 20260916000001) — a leitura das quatro
 * preferências e a prévia com o histórico da Loja, sempre pela Loja ATIVA
 * (`tenant.id`, não a do perfil: o gerente que entrou numa Loja pelo seletor
 * configura aquela Loja).
 *
 * A prévia é SECURITY DEFINER e decide o alcance no banco (gestor da Loja,
 * gerente da Conta acima, superadmin — o mesmo de rotation_admin_scope_ok).
 * Fora do alcance devolve vazio; por isso o hook só liga a query para quem
 * administra, para não fazer pergunta que se sabe vazia.
 *
 * Cast `(supabase as any).rpc`: função nova, fora dos tipos gerados — o mesmo
 * padrão de `useConversationRotation`.
 */

/** As quatro chaves de `tenants.settings`, com os defaults (nada gravado = desligada, 60 min, 3, seg–sex 09–18). */
export const useResponseRuleSettings = (): ResponseRuleSettings & { isLoading: boolean } => {
  const { tenant, loading } = useTenant();
  const parsed = useMemo(() => parseResponseRuleSettings(tenant?.settings), [tenant?.settings]);
  return { ...parsed, isLoading: loading };
};

export interface ResponseRulePreview {
  turns: number;
  breached: number;
  never_replied: number;
}

/** Valor com atraso: a prévia só consulta o banco quando o gestor para de digitar. */
export const useDebounced = <T,>(value: T, delayMs: number): T => {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
};

/** Dias de histórico que a prévia olha. */
export const RESPONSE_RULE_PREVIEW_DAYS = 30;

/**
 * "Com X minutos e este horário, quantas das esperas dos últimos 30 dias
 * teriam passado do limite". `businessHours` é o RASCUNHO da tela (o banco
 * recebe e usa em vez do salvo), então o gestor vê o efeito antes de salvar.
 * A chave de cache carrega minutos e horário: cada combinação é lembrada por
 * 5 min (faixa semiStatic).
 */
export const useResponseRulePreview = (
  minutes: number,
  businessHours: BusinessHours,
  enabled: boolean,
) => {
  const { tenant } = useTenant();
  const canManage = useCanManageRotation();
  const debouncedMinutes = useDebounced(minutes, 500);
  const hoursKey = JSON.stringify(businessHours);
  const debouncedHoursKey = useDebounced(hoursKey, 500);
  const validMinutes = Number.isInteger(debouncedMinutes) && debouncedMinutes >= 1;

  return useQuery<ResponseRulePreview | null>({
    queryKey: [QUERY_KEYS.RESPONSE_RULE_PREVIEW, tenant?.id, debouncedMinutes, debouncedHoursKey],
    enabled: !!tenant?.id && canManage && enabled && validMinutes,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('loja_response_rule_preview', {
        p_tenant_id: tenant!.id,
        p_minutes: debouncedMinutes,
        p_days: RESPONSE_RULE_PREVIEW_DAYS,
        p_business_hours: JSON.parse(debouncedHoursKey),
      });
      if (error) throw error;
      const row = (data as ResponseRulePreview[] | null)?.[0];
      if (!row) return null;
      return {
        turns: Number(row.turns ?? 0),
        breached: Number(row.breached ?? 0),
        never_replied: Number(row.never_replied ?? 0),
      };
    },
  });
};
