import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Wrench } from 'lucide-react';
import { useRole } from '@/contexts/TenantContext';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { formatarFaltando, formatarMomento } from '@/lib/maintenance/maintenanceState';

/**
 * O aviso que o superadmin não consegue não ver.
 *
 * POR QUE ELE EXISTE. O superadmin é a única pessoa que continua usando o
 * sistema normalmente durante a manutenção — telas abertas, dados carregando,
 * tudo como sempre. É exatamente esse "tudo como sempre" que faz alguém
 * esquecer a chave virada e ir dormir com a base de clientes trancada. O
 * bloqueio não avisa quem o ligou; esta barra avisa.
 *
 * POR QUE `sticky` E NÃO `fixed`. A barra lateral é `fixed left-0 top-0`
 * (Sidebar.tsx). Uma barra `fixed` no topo da janela cobriria o logo dela. Como
 * `sticky`, ela ocupa a largura da coluna de conteúdo (à direita da lateral),
 * empurra o Navbar para baixo sem sobrepor nada, e continua colada no topo da
 * janela quando a página rola. Some da vista nunca.
 *
 * DOIS TONS, DUAS URGÊNCIAS: âmbar quando a manutenção está EM CURSO (há
 * clientes trancados agora), azul quando está apenas agendada (ninguém foi
 * trancado ainda). Usar o mesmo tom para as duas ensinaria a ignorar as duas.
 *
 * Sem cargo nenhum além do superadmin chega a ver isto: quem não é superadmin
 * ou está bloqueado pelo MaintenanceGuard, ou a manutenção não está ligada.
 */
export const MaintenanceBanner = () => {
  const role = useRole();
  const { active, scheduled, reason, startsAt, endsAt } = useMaintenanceMode();

  // A contagem tem de andar sozinha — a aba do superadmin fica aberta horas.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (role !== 'superadmin') return null;
  if (!active && !scheduled) return null;

  const retorno = formatarMomento(endsAt, agora);
  const faltaRetorno = formatarFaltando(endsAt, agora);
  const inicio = formatarMomento(startsAt, agora);
  const faltaInicio = formatarFaltando(startsAt, agora);

  if (scheduled) {
    return (
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm text-blue-900 dark:text-blue-100 backdrop-blur">
        <CalendarClock className="h-4 w-4 flex-shrink-0" />
        <span className="font-medium">Manutenção agendada</span>
        <span className="text-blue-900/80 dark:text-blue-100/80">
          Começa {inicio ?? 'em breve'}
          {faltaInicio ? ` (${faltaInicio})` : ''}
          {retorno ? ` e termina ${retorno}` : ''}. Ninguém está bloqueado ainda.
        </span>
        <Link
          to="/dashboard/admin"
          className="ml-auto whitespace-nowrap font-medium underline underline-offset-2"
        >
          Ver ou cancelar
        </Link>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-sm text-amber-950 dark:text-amber-100 backdrop-blur">
      <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
        {/* O pulso é o que diferencia "está ligado AGORA" de mais uma faixa
            colorida na tela. Cliente trancado merece um aviso que se mexe. */}
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-600" />
      </span>
      <Wrench className="h-4 w-4 flex-shrink-0" />
      <span className="font-semibold">Manutenção LIGADA</span>
      <span className="text-amber-950/85 dark:text-amber-100/85">
        Todos os clientes estão bloqueados neste momento; só você entra.
        {retorno
          ? ` Volta sozinho ${retorno}${faltaRetorno ? ` (${faltaRetorno})` : ''}.`
          : ' Sem previsão de retorno: só desliga na mão.'}
        {reason ? ` Motivo: ${reason}` : ''}
      </span>
      <Link
        to="/dashboard/admin"
        className="ml-auto whitespace-nowrap font-semibold underline underline-offset-2"
      >
        Desligar
      </Link>
    </div>
  );
};
