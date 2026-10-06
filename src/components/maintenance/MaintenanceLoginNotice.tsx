import { Wrench } from 'lucide-react';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { formatarMomento } from '@/lib/maintenance/maintenanceState';

/**
 * Aviso de manutenção nas telas de entrada (/auth e /login).
 *
 * AVISA, NÃO BLOQUEIA — e isso não é meio-termo, é a única opção possível: o
 * superadmin precisa fazer login para conferir o conserto. Bloquear a tela de
 * login bloquearia justamente quem tem de passar por ela.
 *
 * Já que o formulário tem de continuar aberto, a escolha real é entre avisar
 * aqui ou deixar a pessoa digitar a senha, acertar, e só então descobrir a
 * parede. O aviso na porta é mais barato para ela e para o suporte.
 *
 * A LANDING NÃO RECEBE ISTO, de propósito. Ela é a página de vendas: um visitante
 * que nunca teve conta não ganha nada sabendo que o sistema está parado, e
 * cobrir a oferta com um aviso de manutenção custa cliente por uma janela de
 * meia hora.
 *
 * O texto vem da RPC, que tem GRANT para `anon` — aqui não existe sessão. Falha
 * aberta como em todo lugar: se a leitura não vier, não aparece aviso nenhum e
 * o login segue normal.
 */
export const MaintenanceLoginNotice = () => {
  const { active, reason, endsAt } = useMaintenanceMode();

  if (!active) return null;

  const retorno = formatarMomento(endsAt);

  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <p className="flex items-center gap-2 font-medium text-amber-950 dark:text-amber-100">
        <Wrench className="h-4 w-4 flex-shrink-0" />
        Sistema em manutenção
      </p>
      <p className="mt-1 text-amber-950/85 dark:text-amber-100/85">
        {reason ? `${reason} ` : 'Estamos trabalhando no sistema neste momento. '}
        {retorno
          ? `A previsão de retorno é ${retorno}.`
          : 'Ainda não há previsão de retorno.'}{' '}
        Você pode entrar, mas o sistema só abre quando a manutenção terminar.
      </p>
    </div>
  );
};
