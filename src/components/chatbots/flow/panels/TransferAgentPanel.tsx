import React, { useState, useEffect, useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useTenant } from '@/contexts/TenantContext';
import { ROLE_LABELS, type UserRole } from '@/types/userHierarchy';
import type { TransferAgentNodeData } from '@/types/chatbot-flow.types';

interface Props {
  data: TransferAgentNodeData;
  onChange: (patch: Partial<TransferAgentNodeData>) => void;
}

/**
 * Quem o bloco pode nomear: gente ATIVA da Loja do bot, nos cargos que atendem
 * conversa. É a mesma régua que o motor aplica na hora de entregar
 * (resolveTransferTarget em supabase/functions/_shared/chatbot-engine.ts) —
 * o painel não deve oferecer quem o motor vai recusar.
 *
 * Por que não a RPC tenant_team_directory (a lista do "Transferir…" do inbox):
 * ela devolve profiles.id, e este nó guarda profiles.user_id desde sempre. Os
 * nós já publicados têm user_id, o motor traduz user_id → profiles.id em tempo
 * de execução, e trocar a forma guardada exigiria migrar dado de nó. Ler
 * `profiles` filtrado mantém uma forma só. O RLS de profiles já recorta por
 * cargo: gestor lê os atendentes da própria Loja, gerente lê as Lojas da Conta
 * — com o filtro de tenant, os dois veem só a Loja deste bot.
 *
 * A Loja do bot é o tenant ativo: o construtor carrega o chatbot com
 * `.eq('tenant_id', tenant.id)` (useChatbotFlowFull), então ele não abriria
 * se fosse outra.
 */
const ELIGIBLE_ROLES: UserRole[] = ['atendente', 'gestor'];

interface EligibleProfile {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  role: UserRole | null;
}

interface StoredProfile extends EligibleProfile {
  status: string | null;
  tenant_id: string | null;
}

const displayName = (p: Pick<EligibleProfile, 'first_name' | 'last_name' | 'user_id'>): string =>
  [p.first_name, p.last_name].filter(Boolean).join(' ') || p.user_id;

const STATUS_LABEL: Record<string, string> = {
  suspended: 'suspensa',
  deleted: 'excluída',
  pending: 'pendente',
};

/** Por que a pessoa guardada no nó não pode mais receber — para o gestor ler. */
function unavailableReason(stored: StoredProfile | undefined, tenantId: string | undefined): string {
  if (!stored) return 'não encontrada';
  if (stored.tenant_id !== tenantId) return 'fora desta Loja';
  if (stored.status !== 'active') return STATUS_LABEL[stored.status ?? ''] ?? `status "${stored.status}"`;
  return 'cargo que não atende conversa';
}

const TransferAgentPanel: React.FC<Props> = ({ data, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { tenant } = useTenant();

  const { data: eligible = [], isLoading: eligibleLoading } = useSupabaseQuery({
    table: 'profiles',
    queryKey: ['profiles', 'transfer-agent-eligible', tenant?.id],
    select: 'user_id, first_name, last_name, role',
    filters: [
      { column: 'tenant_id', operator: 'eq', value: tenant?.id },
      { column: 'status', operator: 'eq', value: 'active' },
      { column: 'role', operator: 'in', value: ELIGIBLE_ROLES },
    ],
    order: { column: 'first_name', ascending: true },
    enabled: !!tenant?.id,
  });
  const profiles = eligible as EligibleProfile[];

  const storedId = data.assign_to === 'specific_user' ? data.user_id ?? null : null;
  const storedIsEligible = useMemo(
    () => !!storedId && profiles.some((p) => p.user_id === storedId),
    [profiles, storedId],
  );
  // Só vale a pena procurar a pessoa guardada quando ela NÃO está na lista —
  // e só depois de a lista chegar, para o aviso não piscar no primeiro render.
  const lookupStored = !!storedId && !eligibleLoading && !storedIsEligible;

  const { data: storedRows = [] } = useSupabaseQuery({
    table: 'profiles',
    queryKey: ['profiles', 'transfer-agent-stored', storedId],
    select: 'user_id, first_name, last_name, role, status, tenant_id',
    filters: [{ column: 'user_id', operator: 'eq', value: storedId }],
    enabled: lookupStored,
    silent: true,
  });
  const stored = (storedRows as StoredProfile[]).find((p) => p.tenant_id === tenant?.id)
    ?? (storedRows as StoredProfile[])[0];
  const storedUnavailable = lookupStored;

  const validate = (d: TransferAgentNodeData) => {
    const r = validateNodeData('transfer_agent', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<TransferAgentNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Mensagem de transferência</Label>
        <Textarea
          value={data.message ?? ''}
          onChange={(e) => emit({ message: e.target.value })}
          placeholder="Transferindo para um atendente..."
          rows={3}
        />
      </div>

      <div className="space-y-1">
        <Label>Transferir para</Label>
        <Select value={data.assign_to} onValueChange={(v) => emit({ assign_to: v as any, user_id: null })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Qualquer atendente disponível</SelectItem>
            <SelectItem value="specific_user">Atendente específico</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {data.assign_to === 'specific_user'
            ? 'A conversa passa a ser dessa pessoa, se ela ainda não tiver responsável. Conversa que já tem responsável fica com quem está.'
            : 'A conversa segue para o rodízio da Loja, se ele estiver ligado; senão fica sem responsável, na fila.'}
        </p>
      </div>

      {data.assign_to === 'specific_user' && (
        <div className="space-y-1">
          <Label>Atendente *</Label>
          <Select
            value={data.user_id ?? ''}
            onValueChange={(v) => emit({ user_id: v || null })}
          >
            <SelectTrigger className={errors.user_id || storedUnavailable ? 'border-destructive' : ''}>
              <SelectValue placeholder="Selecione o atendente" />
            </SelectTrigger>
            <SelectContent>
              {/* A pessoa guardada que saiu da lista continua visível — marcada,
                  nunca apagada em silêncio: o gestor precisa ver que o bloco
                  aponta para alguém que se foi. */}
              {storedUnavailable && storedId && (
                <SelectItem value={storedId} className="text-destructive">
                  ⚠ {stored ? displayName(stored) : 'Pessoa não encontrada'}: {unavailableReason(stored, tenant?.id)}
                </SelectItem>
              )}
              {profiles.map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {displayName(p)}
                  {p.role && p.role !== 'atendente' ? ` (${ROLE_LABELS[p.role]})` : ''}
                </SelectItem>
              ))}
              {!eligibleLoading && profiles.length === 0 && (
                <SelectItem value="__none__" disabled>
                  Nenhuma pessoa ativa nesta Loja
                </SelectItem>
              )}
            </SelectContent>
          </Select>
          {errors.user_id && <p className="text-xs text-destructive">{errors.user_id}</p>}
          {storedUnavailable && (
            <p className="flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              <span>
                Este bloco aponta para alguém que não pode mais receber conversas ({unavailableReason(stored, tenant?.id)}).
                Enquanto ficar assim, a conversa vai para o rodízio da Loja, ou fica sem responsável, se ele
                estiver desligado. Escolha outra pessoa.
              </span>
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default TransferAgentPanel;
