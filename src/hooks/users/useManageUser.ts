import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { QUERY_KEYS } from '@/lib/queryClient';
import { UserRole } from '@/types/userHierarchy';
import { mensagemDaEdgeFunction } from '@/lib/edgeFunctionError';

type Action =
  | 'create'
  | 'update'
  | 'suspend'
  | 'reactivate'
  | 'reset_password'
  | 'soft_delete'
  | 'transfer';

interface ManageUserPayload {
  action: Action;
  // create
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  tenantId?: string | null;
  parentId?: string | null;
  affiliateId?: string | null;
  redirectTo?: string;
  /**
   * Nome da Conta a criar junto com um GERENTE. Gerente e dono de uma Conta,
   * nao funcionario de uma Loja -- sem isto o manage-user recusa o convite com
   * "Informe o nome da Conta do gerente." (o modal nunca mandava este campo).
   */
  newTenantName?: string;
  // target-bound
  targetProfileId?: string;
  patch?: Record<string, unknown>;
  newParentId?: string;
}

async function invokeManageUser(payload: ManageUserPayload) {
  const { data, error } = await supabase.functions.invoke('manage-user', {
    body: payload,
  });
  // O erro do servidor vem no corpo do Response, nao na `message` do erro do
  // supabase-js -- sem abrir o corpo, todo 4xx/5xx vira "non-2xx status code"
  // e a frase em pt-BR que explica o problema e jogada fora.
  if (error) {
    throw new Error(
      await mensagemDaEdgeFunction(error, 'Nao foi possivel concluir a acao.'),
    );
  }
  if (data && typeof data === 'object' && 'error' in data) {
    throw new Error((data as { error: { message?: string } }).error?.message ?? 'Erro desconhecido');
  }
  return data;
}

function invalidateUserLists(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.USERS] });
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.TEAM] });
  qc.invalidateQueries({ queryKey: [QUERY_KEYS.USER_DETAILS] });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Omit<ManageUserPayload, 'action'>) =>
      invokeManageUser({ ...payload, action: 'create' }),
    onSuccess: () => {
      toast.success('Convite enviado por e-mail.');
      invalidateUserLists(qc);
    },
    onError: (err: Error) => toast.error(`Falha ao convidar: ${err.message}`),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { targetProfileId: string; patch: Record<string, unknown> }) =>
      invokeManageUser({ ...payload, action: 'update' }),
    onSuccess: () => {
      toast.success('Usuário atualizado.');
      invalidateUserLists(qc);
    },
    onError: (err: Error) => toast.error(`Falha ao atualizar: ${err.message}`),
  });
}

export function useSuspendUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetProfileId: string) =>
      invokeManageUser({ targetProfileId, action: 'suspend' }),
    onSuccess: () => {
      toast.success('Usuário suspenso (descendentes também).');
      invalidateUserLists(qc);
    },
    onError: (err: Error) => toast.error(`Falha ao suspender: ${err.message}`),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetProfileId: string) =>
      invokeManageUser({ targetProfileId, action: 'reactivate' }),
    onSuccess: () => {
      toast.success('Usuário reativado.');
      invalidateUserLists(qc);
    },
    onError: (err: Error) => toast.error(`Falha ao reativar: ${err.message}`),
  });
}

export function useSoftDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (targetProfileId: string) =>
      invokeManageUser({ targetProfileId, action: 'soft_delete' }),
    onSuccess: () => {
      toast.success('Usuário excluído (descendentes suspensos).');
      invalidateUserLists(qc);
    },
    onError: (err: Error) => toast.error(`Falha ao excluir: ${err.message}`),
  });
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: (targetProfileId: string) =>
      invokeManageUser({
        targetProfileId,
        action: 'reset_password',
        redirectTo: `${window.location.origin}/definir-senha`,
      }),
    onSuccess: () => {
      toast.success('Link de redefinição de senha enviado por e-mail.');
    },
    onError: (err: Error) => toast.error(`Falha ao gerar reset: ${err.message}`),
  });
}

export function useTransferUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { targetProfileId: string; newParentId: string }) =>
      invokeManageUser({ ...payload, action: 'transfer' }),
    onSuccess: () => {
      toast.success('Usuário transferido para novo responsável.');
      invalidateUserLists(qc);
    },
    onError: (err: Error) => toast.error(`Falha ao transferir: ${err.message}`),
  });
}
