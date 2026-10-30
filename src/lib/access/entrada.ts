/**
 * A porta de entrada do painel, numa regra só (lote 6f do checkup, B14).
 *
 * Antes, quem abria o painel passava por até seis esperas em fila, cada uma com
 * o seu carregando: sessão (AuthGuard), perfil e Loja (TenantContext),
 * manutenção (MaintenanceGuard, que só perguntava depois da sessão), acesso
 * pago (DashboardLayout, que só perguntava depois da manutenção), módulos
 * (TelaGuard) e a tela em si. Agora as perguntas saem juntas e a resposta vem
 * desta função, uma vez, com um esqueleto só enquanto falta alguma.
 *
 * AS REGRAS NÃO MUDARAM, só a ordem em que se espera por elas:
 *   1. Sem sessão → login.
 *   2. Perfil suspenso ou excluído → sai (o componente derruba a sessão).
 *      Perfil pendente (convite não concluído) → tela de cadastro incompleto.
 *   3. Superadmin → entra. Não espera a manutenção nem o pagamento: quem liga
 *      a manutenção precisa conferir o conserto, e quem conserta o bloqueio não
 *      pode ficar trancado por ele.
 *   4. Manutenção: só um `active === true` vindo do servidor bloqueia. Erro,
 *      resposta estranha ou espera longa demais abrem o sistema (falha aberta,
 *      ver MaintenanceGuard no histórico e useMaintenanceMode). A manutenção é
 *      conferida ANTES do pagamento: mandar alguém pagar no meio dela seria
 *      pior que dizer a verdade.
 *   5. Paywall: Conta sem acesso liberado vê a tela de bloqueio. A tela é a
 *      mesma para todos; o Gerente recebe dentro dela o caminho de pagamento
 *      (bloqueio parcial), Gestor e Atendente só o aviso (bloqueio total). Isso
 *      é decidido na PaywallScreen, não aqui.
 *
 * Esta função não fala com o banco: recebe o que os ganchos já sabem.
 */

export type DecisaoDaEntrada =
  | 'carregando'
  | 'login'
  | 'sair'
  | 'pendente'
  | 'manutencao'
  | 'bloqueio'
  | 'liberado';

export interface EstadoDaEntrada {
  /** Sessão ainda sendo lida do navegador. */
  sessaoCarregando: boolean;
  temSessao: boolean;
  /** Perfil e Loja da primeira carga ainda no ar. */
  perfilCarregando: boolean;
  /** `profiles.status`, ou null se não há perfil. */
  statusDoPerfil: string | null;
  /** Cargo normalizado, ou null enquanto não se sabe. */
  papel: string | null;
  manutencao: {
    /** Primeira leitura no ar (sem resposta nenhuma em mãos). */
    carregando: boolean;
    /** O limite de espera passou: o sistema abre sem resposta. */
    esperaExpirou: boolean;
    /** Só `true` vindo do servidor bloqueia. */
    ligada: boolean;
  };
  acesso: {
    carregando: boolean;
    bloqueado: boolean;
  };
  /**
   * Módulos ligados ainda no ar. Não decidem nada aqui (quem decide é a
   * TelaGuard); a porta só espera por eles para a tela não trocar um
   * esqueleto por outro logo em seguida.
   */
  modulosCarregando: boolean;
}

export function decidirEntrada(e: EstadoDaEntrada): DecisaoDaEntrada {
  if (e.sessaoCarregando) return 'carregando';
  if (!e.temSessao) return 'login';
  if (e.perfilCarregando) return 'carregando';

  if (e.statusDoPerfil === 'suspended' || e.statusDoPerfil === 'deleted') return 'sair';
  if (e.statusDoPerfil === 'pending') return 'pendente';

  if (e.papel === 'superadmin') return 'liberado';

  if (e.manutencao.carregando && !e.manutencao.esperaExpirou) return 'carregando';
  if (e.manutencao.ligada) return 'manutencao';

  if (e.acesso.carregando) return 'carregando';
  if (e.acesso.bloqueado) return 'bloqueio';

  if (e.modulosCarregando) return 'carregando';
  return 'liberado';
}

/**
 * Depois disto, a manutenção para de ser esperada e o sistema abre mesmo sem
 * resposta. Um carregando eterno é indistinguível de um bloqueio para quem está
 * do outro lado, e é o modo de falha que esta trava não pode ter.
 */
export const LIMITE_DE_ESPERA_DA_MANUTENCAO_MS = 6000;
