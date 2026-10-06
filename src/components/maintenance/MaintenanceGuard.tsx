import { ReactNode, useEffect, useState } from 'react';
import { useRole } from '@/contexts/TenantContext';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { MaintenanceScreen } from './MaintenanceScreen';

/**
 * Modo de manutenção: fecha o sistema para todo mundo, menos o superadmin.
 *
 * ONDE ELE MORA. Em App.tsx, entre o `AuthGuard` e o `DashboardLayout` — o
 * único nó por onde toda rota autenticada passa. Estar depois do `AuthGuard`
 * garante que o perfil já foi carregado quando este componente monta, então o
 * cargo é conhecido sem uma segunda espera.
 *
 * NÃO É O PAYWALL, e não encosta nele. `useTenantAccess` responde "esta Conta
 * pagou?"; isto responde "o sistema inteiro está parado?". As duas perguntas
 * têm donos, prazos e modos de falha diferentes. A manutenção é conferida
 * PRIMEIRO, e é o que deve acontecer: durante a manutenção nem o checkout do
 * paywall funcionaria direito, e mandar alguém pagar no meio dela seria pior
 * que dizer a verdade.
 *
 * O SUPERADMIN NUNCA É BLOQUEADO — nem espera. Ele sai daqui na primeira linha,
 * antes de qualquer consulta: quem liga a manutenção precisa conferir o
 * conserto antes de destrancar a porta para os outros, e um superadmin preso do
 * lado de fora não teria como desligar nada pela tela.
 *
 * ===========================================================================
 * FALHA ABERTA — a regra que manda em todas as outras
 * ===========================================================================
 * Esta trava fecha a base inteira de clientes de uma vez. O erro caro aqui não
 * é deixar alguém entrar durante a manutenção; é trancar todo mundo fora por
 * engano. Então TODO caminho de dúvida abre o sistema:
 *
 *   - RPC ausente (SQL não aplicado)  → passa
 *   - permissão negada                → passa
 *   - rede fora                       → passa
 *   - resposta sem sentido            → passa
 *   - consulta que nunca responde     → passa, depois de LIMITE_DE_ESPERA_MS
 *
 * Só um `active === true` explícito, vindo do servidor, bloqueia.
 *
 * O último caso é o que mais escapa. Sem o limite de espera, um `isLoading` que
 * nunca vira `false` — DNS travado, aba suspensa acordando, proxy engolindo a
 * requisição — deixaria a pessoa num carregando eterno. Um carregando eterno é
 * indistinguível de um bloqueio para quem está do outro lado, e é justamente o
 * modo de falha que esta trava não pode ter.
 */

/** Depois disto, o sistema abre mesmo sem resposta. Ver o bloco acima. */
const LIMITE_DE_ESPERA_MS = 6000;

const Carregando = () => (
  <div className="min-h-screen flex items-center justify-center bg-muted/30">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
  </div>
);

export const MaintenanceGuard = ({ children }: { children: ReactNode }) => {
  const role = useRole();
  const { loading, active, reason, endsAt, refetch } = useMaintenanceMode();

  const [esperaExpirou, setEsperaExpirou] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setEsperaExpirou(true), LIMITE_DE_ESPERA_MS);
    return () => clearTimeout(id);
  }, []);

  // Superadmin: passa direto, sem consulta e sem espera. O aviso de que a
  // manutenção está ligada chega a ele pelo MaintenanceBanner, no layout.
  if (role === 'superadmin') return <>{children}</>;

  // Primeira leitura no ar. `loading` só é true quando não há resposta nenhuma
  // em mãos — um refetch de fundo não devolve ninguém ao carregando.
  if (loading && !esperaExpirou) return <Carregando />;

  if (active) {
    return <MaintenanceScreen reason={reason} endsAt={endsAt} onRecheck={refetch} />;
  }

  return <>{children}</>;
};
