import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { supabase } from '@/integrations/supabase/client';
import { MAINTENANCE_QUERY_KEY } from '@/hooks/useMaintenanceMode';
import {
  MAINTENANCE_KEY,
  MAINTENANCE_OFF,
  formatarFaltando,
  formatarMomento,
  parseMaintenanceConfig,
  resolveMaintenance,
  serializeMaintenanceConfig,
  type MaintenanceConfig,
  type MaintenanceStatus,
} from '@/lib/maintenance/maintenanceState';
import { AlertCircle, CalendarClock, CheckCircle2, Power, Wrench } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Painel do modo de manutenção — Administração › Configurações.
 *
 * ESCREVE DIRETO EM `system_settings`. O RLS da tabela já é superadmin-only
 * para leitura e escrita, então não há RPC de escrita: a policy é a permissão.
 * Quem LÊ o estado é a função `maintenance_state()`, porque os outros cargos
 * não alcançam a tabela — mas isso é problema deles, não deste painel.
 *
 * UMA JANELA, NÃO DUAS DATAS SOLTAS. O fim da janela é ao mesmo tempo a
 * previsão de retorno mostrada ao cliente E o momento em que o bloqueio se
 * desfaz sozinho. Separar as duas coisas daria um campo "previsão" decorativo,
 * que mente quando a manutenção passa dele. Aqui a previsão é uma promessa que
 * o sistema cumpre: chegou a hora, a porta abre.
 *
 * O preço disso está dito na tela: se a manutenção passar do horário, os
 * clientes voltam no meio dela. O caminho é esticar a janela antes de ela
 * vencer — e a barra no topo mostra a contagem justamente para isso.
 */

const VAZIO: MaintenanceConfig = MAINTENANCE_OFF;

/** ISO → valor de <input type="datetime-local"> (hora local, sem fuso). */
function paraCampoLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Valor de <input type="datetime-local"> → ISO (UTC). */
function paraIso(campo: string): string | null {
  if (!campo) return null;
  const d = new Date(campo);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const ROTULO: Record<MaintenanceStatus, { texto: string; classe: string }> = {
  off: { texto: 'Desligada', classe: 'bg-muted text-muted-foreground' },
  scheduled: { texto: 'Agendada', classe: 'bg-blue-500/15 text-blue-700 dark:text-blue-300' },
  active: { texto: 'LIGADA: clientes bloqueados', classe: 'bg-amber-500/20 text-amber-800 dark:text-amber-200' },
  ended: { texto: 'Janela encerrada', classe: 'bg-muted text-muted-foreground' },
};

type Confirmacao = 'agora' | 'agendar' | null;

export const MaintenanceSettings = () => {
  const queryClient = useQueryClient();

  const [motivo, setMotivo] = useState('');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [confirmando, setConfirmando] = useState<Confirmacao>(null);

  // Relógio próprio: o estado derivado ('agendada' vira 'ligada' sozinha) tem de
  // aparecer sem a pessoa recarregar a página.
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const { data: config, isLoading } = useQuery({
    queryKey: ['maintenance', 'config'],
    staleTime: 15_000,
    queryFn: async (): Promise<MaintenanceConfig> => {
      // system_settings está fora dos tipos gerados — cast local, como em
      // SystemSettings.tsx.
      const { data, error } = await (supabase as any)
        .from('system_settings')
        .select('value')
        .eq('key', MAINTENANCE_KEY)
        .maybeSingle();
      if (error) throw error;
      return parseMaintenanceConfig(data?.value) ?? VAZIO;
    },
  });

  // Preenche o formulário com o que está gravado, para "esticar a janela" ser
  // editar o que já existe em vez de redigitar tudo.
  useEffect(() => {
    if (!config) return;
    setMotivo(config.reason ?? '');
    setInicio(paraCampoLocal(config.startsAt));
    setFim(paraCampoLocal(config.endsAt));
  }, [config]);

  const estado = resolveMaintenance(config, agora);

  const salvar = useMutation({
    mutationFn: async (novo: MaintenanceConfig) => {
      // `updated_by` importa aqui mais que nas outras chaves de system_settings:
      // quando alguém encontra a manutenção ligada e não sabe por quê, a
      // primeira pergunta é "quem deixou isso assim?".
      const { data: sessao } = await supabase.auth.getUser();

      const { error } = await (supabase as any).from('system_settings').upsert(
        {
          key: MAINTENANCE_KEY,
          value: serializeMaintenanceConfig(novo),
          updated_at: new Date().toISOString(),
          updated_by: sessao?.user?.id ?? null,
        },
        { onConflict: 'key' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance', 'config'] });
      queryClient.invalidateQueries({ queryKey: MAINTENANCE_QUERY_KEY });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.'),
  });

  const ligarAgora = () => {
    setConfirmando(null);
    salvar.mutate(
      { enabled: true, reason: motivo.trim() || null, startsAt: null, endsAt: paraIso(fim) },
      { onSuccess: () => toast.success('Manutenção LIGADA. Só superadmins entram agora.') },
    );
  };

  const agendar = () => {
    setConfirmando(null);
    salvar.mutate(
      {
        enabled: true,
        reason: motivo.trim() || null,
        startsAt: paraIso(inicio),
        endsAt: paraIso(fim),
      },
      { onSuccess: () => toast.success('Manutenção agendada. Ninguém foi bloqueado ainda.') },
    );
  };

  /** Desligar e cancelar agendamento são a mesma coisa: apagar a janela. */
  const desligar = () => {
    salvar.mutate(
      { enabled: false, reason: motivo.trim() || null, startsAt: null, endsAt: null },
      {
        onSuccess: () => {
          setInicio('');
          setFim('');
          toast.success('Manutenção desligada. Todo mundo já entra.');
        },
      },
    );
  };

  const inicioValido = !!paraIso(inicio);
  const fimValido = !!paraIso(fim);
  const janelaInvertida =
    inicioValido && fimValido && new Date(inicio).getTime() >= new Date(fim).getTime();
  const fimNoPassado = fimValido && new Date(fim).getTime() <= agora.getTime();

  const podeAgendar = inicioValido && fimValido && !janelaInvertida && !fimNoPassado;
  const podeLigarAgora = !fimValido || !fimNoPassado;

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-56" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={
        estado.status === 'active'
          ? 'border-amber-500/50'
          : estado.status === 'scheduled'
            ? 'border-blue-500/40'
            : undefined
      }
    >
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2">
              <Wrench className="h-5 w-5" /> Modo de manutenção
              <FeatureHelp helpKey="page:admin-maintenance" />
            </CardTitle>
            <CardDescription>
              Fecha o sistema inteiro de uma vez: todas as Contas, todas as Lojas. Superadmins
              continuam entrando normalmente.
            </CardDescription>
          </div>
          <Badge className={`${ROTULO[estado.status].classe} whitespace-nowrap`} variant="secondary">
            {ROTULO[estado.status].texto}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <EstadoAtual estado={estado.status} config={config ?? VAZIO} agora={agora} />

        <div className="space-y-2">
          <Label htmlFor="motivo-manutencao">
            Motivo <span className="text-muted-foreground font-normal">(o cliente lê este texto)</span>
          </Label>
          <Textarea
            id="motivo-manutencao"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="Ex.: Estamos atualizando o banco de dados para deixar as Conversas mais rápidas."
          />
          <p className="text-xs text-muted-foreground">
            Escreva como você explicaria por telefone. Este texto aparece na tela de bloqueio e
            também na tela de login, inclusive para quem ainda não entrou.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="inicio-manutencao">Início (só para agendar)</Label>
            <Input
              id="inicio-manutencao"
              type="datetime-local"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Deixe vazio para ligar na hora.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="fim-manutencao">Previsão de retorno</Label>
            <Input
              id="fim-manutencao"
              type="datetime-local"
              value={fim}
              onChange={(e) => setFim(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              O sistema abre sozinho neste horário, sem ninguém precisar lembrar.
            </p>
          </div>
        </div>

        {janelaInvertida ? (
          <Aviso>O fim tem de ser depois do início.</Aviso>
        ) : fimNoPassado ? (
          <Aviso>
            Essa previsão de retorno já passou. Do jeito que está, a manutenção terminaria antes de
            começar.
          </Aviso>
        ) : null}

        {!fimValido ? (
          <Aviso tom="neutro">
            Sem previsão de retorno, a manutenção fica ligada até alguém desligar na mão. Vale
            preencher: é a única rede que impede um bloqueio esquecido durante a noite.
          </Aviso>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {estado.status === 'active' || estado.status === 'scheduled' ? (
            <Button
              variant="default"
              onClick={desligar}
              disabled={salvar.isPending}
              className="gap-2 bg-green-600 hover:bg-green-700"
            >
              <Power className="h-4 w-4" />
              {estado.status === 'scheduled' ? 'Cancelar agendamento' : 'Desligar agora'}
            </Button>
          ) : null}

          <Button
            variant={estado.status === 'active' ? 'outline' : 'destructive'}
            onClick={() => setConfirmando('agora')}
            disabled={salvar.isPending || !podeLigarAgora}
            className="gap-2"
          >
            <Wrench className="h-4 w-4" />
            {estado.status === 'active' ? 'Atualizar motivo e previsão' : 'Ligar agora'}
          </Button>

          <Button
            variant="outline"
            onClick={() => setConfirmando('agendar')}
            disabled={salvar.isPending || !podeAgendar}
            className="gap-2"
          >
            <CalendarClock className="h-4 w-4" />
            {estado.status === 'scheduled' ? 'Reagendar' : 'Agendar'}
          </Button>

          {estado.status === 'ended' ? (
            <Button variant="ghost" onClick={desligar} disabled={salvar.isPending}>
              Limpar janela encerrada
            </Button>
          ) : null}
        </div>
      </CardContent>

      {/* ---------------------------------------------------- Confirmações */}
      <AlertDialog open={confirmando === 'agora'} onOpenChange={(o) => !o && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ligar a manutenção agora?</AlertDialogTitle>
            {/* A frase abaixo é o ponto inteiro desta confirmação: ela diz o
                efeito em gente, não em configuração. */}
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p className="font-medium text-foreground">
                  Assim que você confirmar, TODOS os usuários do ConvoFlow são bloqueados
                  imediatamente: gerentes, gestores e atendentes, de todas as Contas e todas as
                  Lojas. Quem estiver com o sistema aberto cai na tela de manutenção em até um
                  minuto.
                </p>
                <p>
                  Só superadmins continuam entrando. Você continua com acesso total para conferir o
                  que precisa ser conferido.
                </p>
                <p>
                  {paraIso(fim)
                    ? `O sistema volta sozinho ${formatarMomento(paraIso(fim), agora)}.`
                    : 'Sem previsão de retorno preenchida: o bloqueio só sai quando você desligar na mão.'}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não ligar</AlertDialogCancel>
            <AlertDialogAction
              onClick={ligarAgora}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              Sim, bloquear todo mundo agora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmando === 'agendar'} onOpenChange={(o) => !o && setConfirmando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Agendar a manutenção?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Ninguém é bloqueado agora. O bloqueio começa{' '}
                  <strong>{formatarMomento(paraIso(inicio), agora)}</strong> e termina sozinho{' '}
                  <strong>{formatarMomento(paraIso(fim), agora)}</strong>.
                </p>
                <p className="font-medium text-foreground">
                  Quando a janela abrir, todos os usuários exceto superadmins serão bloqueados, sem
                  aviso prévio dentro do sistema. Se o horário for em expediente, avise os clientes
                  antes.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Não agendar</AlertDialogCancel>
            <AlertDialogAction onClick={agendar}>Agendar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

// --------------------------------------------------------------------------

const Aviso = ({
  children,
  tom = 'alerta',
}: {
  children: React.ReactNode;
  tom?: 'alerta' | 'neutro';
}) => (
  <p
    className={`flex items-start gap-2 rounded-md border px-3 py-2 text-xs ${
      tom === 'alerta'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200'
        : 'border-border bg-muted/40 text-muted-foreground'
    }`}
  >
    <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
    <span>{children}</span>
  </p>
);

/**
 * O parágrafo que responde "e agora, o que está acontecendo?" sem obrigar a
 * pessoa a interpretar dois campos de data.
 */
const EstadoAtual = ({
  estado,
  config,
  agora,
}: {
  estado: MaintenanceStatus;
  config: MaintenanceConfig;
  agora: Date;
}) => {
  const inicio = formatarMomento(config.startsAt, agora);
  const fim = formatarMomento(config.endsAt, agora);
  const faltaInicio = formatarFaltando(config.startsAt, agora);
  const faltaFim = formatarFaltando(config.endsAt, agora);

  if (estado === 'off') {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Sistema aberto</p>
          <p className="text-xs text-muted-foreground">
            Nenhuma manutenção ligada nem agendada. Todo mundo entra normalmente.
          </p>
        </div>
      </div>
    );
  }

  if (estado === 'ended') {
    return (
      <div className="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 mt-0.5 text-green-600 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Sistema aberto: a janela já terminou</p>
          <p className="text-xs text-muted-foreground">
            A janela marcada terminava {fim ?? '—'} e passou. O bloqueio se desfez sozinho, sem
            ninguém precisar desligar. Você pode limpar a janela ou marcar uma nova.
          </p>
        </div>
      </div>
    );
  }

  if (estado === 'scheduled') {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-blue-500/40 bg-blue-500/10 px-4 py-3">
        <CalendarClock className="h-5 w-5 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium">Agendada: ninguém bloqueado ainda</p>
          <p className="text-xs text-muted-foreground">
            Começa {inicio ?? '—'}
            {faltaInicio ? ` (${faltaInicio})` : ''} e termina {fim ?? '—'}. Até lá o sistema segue
            aberto para todos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/50 bg-amber-500/15 px-4 py-3">
      <Wrench className="h-5 w-5 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
      <div>
        <p className="text-sm font-semibold">Manutenção LIGADA neste momento</p>
        <p className="text-xs text-muted-foreground">
          Todos os clientes estão bloqueados. {fim
            ? `O sistema volta sozinho ${fim}${faltaFim ? ` (${faltaFim})` : ''}.`
            : 'Não há previsão de retorno: o bloqueio só sai quando você desligar aqui.'}
        </p>
      </div>
    </div>
  );
};
