import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { QUERY_KEYS } from '@/lib/queryClient';

/** Mensagens com autor só existem desde 21/09/2026 (messages.sender_profile_id). */
export const SEM_MENSAGEM_DICA =
  'Nenhuma mensagem enviada pela pessoa desde 21/09/2026, quando o sistema passou a guardar quem enviou cada mensagem.';

/** Uma linha de public.admin_users_activity() (20261010000002). */
export interface UserActivity {
  profile_id: string;
  tenant_name: string | null;
  account_name: string | null;
  /** Entrada de verdade: senha, convite, nova senha. */
  last_sign_in_at: string | null;
  /** Última vez com o app aberto (precisão de cerca de 1 hora). */
  last_seen_at: string | null;
  /** Mensagens com autor só existem desde 21/09/2026. */
  last_message_at: string | null;
  messages_7d: number;
  messages_30d: number;
  conversations_7d: number;
  conversations_30d: number;
  last_login_ip: string | null;
  last_login_user_agent: string | null;
}

/**
 * Atividade de todo mundo, por perfil — SÓ para a tela do superadmin. A
 * função recusa (42501) qualquer outro cargo; não chame de outra tela.
 *
 * Chave dentro de QUERY_KEYS.USERS: suspender, reativar etc. já invalidam
 * [USERS] e, com isso, esta também.
 */
export function useAdminUsersActivity() {
  return useQuery({
    queryKey: [QUERY_KEYS.USERS, 'admin-activity'],
    queryFn: async (): Promise<Record<string, UserActivity>> => {
      const { data, error } = await supabase.rpc('admin_users_activity');
      if (error) throw error;
      const porPerfil: Record<string, UserActivity> = {};
      for (const linha of (data ?? []) as UserActivity[]) porPerfil[linha.profile_id] = linha;
      return porPerfil;
    },
  });
}
