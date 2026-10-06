import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ChevronRight, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ResponsiveTable } from '@/components/shared/ResponsiveTable';
import { cn } from '@/lib/utils';
import { useAttendantMetrics } from '@/hooks/useAttendantMetrics';
import { attendantLabel, obtainedLabel, unownedNotice } from '@/lib/dashboard/attendantMetrics';

const numberFmt = new Intl.NumberFormat('pt-BR');

/**
 * Seção "Por atendente" do Dashboard — só para gestor e gerente (o hook não
 * consulta para os outros cargos; e o banco, pelo gate rotation_admin_scope_ok,
 * devolve zero linhas a quem não administra, mesmo chamando a RPC na mão).
 *
 * É por POSSE, não por autoria: quem ESTÁ COM a conversa. O aviso de "sem
 * responsável" vem ANTES da tabela e não some quando é zero — sem ele, uma
 * Loja com 92 conversas esperando resposta e nenhuma com dono pareceria em dia.
 */
export const AttendantMetricsSection = () => {
  const navigate = useNavigate();
  const { view, isLoading, canManage } = useAttendantMetrics();

  if (!canManage) return null;

  const notice = view ? unownedNotice(view) : null;
  const warn = !!view && view.unowned.n_waiting > 0;

  return (
    <Card data-testid="attendant-metrics-section">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Users className="h-5 w-5 text-muted-foreground" />
            Por atendente
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Quem está com cada conversa aberta agora. Mostra quem é o responsável, não quem respondeu.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => navigate('/dashboard/conversations?quick=sem-responsavel')}
        >
          Ver sem responsável
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isLoading && view === null ? (
          <p className="text-sm text-muted-foreground" data-testid="attendant-metrics-unavailable">
            Sem números por pessoa para esta Conta.
          </p>
        ) : (
          <>
            {notice && (
              <div
                data-testid="attendant-unowned-notice"
                role={warn ? 'alert' : undefined}
                className={cn(
                  'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
                  warn
                    ? 'border-status-warning/40 bg-status-warning/10 text-foreground'
                    : 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                {warn && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-status-warning" aria-hidden />}
                <span>{notice}</span>
              </div>
            )}

            <ResponsiveTable
              ariaLabel="Conversas por atendente"
              loading={isLoading}
              rows={view?.people ?? []}
              rowKey={(r) => r.profile_id ?? 'sem-responsavel'}
              empty={
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Ninguém está com conversa aberta. Tudo o que existe está sem responsável.
                </p>
              }
              columns={[
                {
                  key: 'pessoa',
                  header: 'Pessoa',
                  card: 'title',
                  cellClassName: 'font-medium',
                  cell: (r) => attendantLabel(r),
                },
                {
                  key: 'posse',
                  header: 'Com a pessoa',
                  headClassName: 'text-right',
                  cellClassName: 'text-right',
                  card: 'field',
                  cell: (r) => numberFmt.format(r.n_held),
                },
                {
                  key: 'origem',
                  header: 'Como chegaram',
                  card: 'subtitle',
                  cellClassName: 'text-muted-foreground',
                  cell: (r) => obtainedLabel(r),
                },
                {
                  key: 'esperando',
                  header: 'Esperando resposta',
                  headClassName: 'text-right',
                  cellClassName: 'text-right',
                  card: 'field',
                  cell: (r) => (
                    <span className={cn(r.n_waiting > 0 && 'font-semibold text-status-warning')}>
                      {numberFmt.format(r.n_waiting)}
                    </span>
                  ),
                },
                {
                  key: 'sem-pessoa',
                  header: 'Sem resposta de pessoa',
                  headClassName: 'text-right',
                  cellClassName: 'text-right',
                  card: 'field',
                  cell: (r) => numberFmt.format(r.n_no_human_reply),
                },
                {
                  key: 'regra',
                  header: 'Regra de tempo (perdeu / recebeu)',
                  headClassName: 'text-right',
                  cellClassName: 'text-right',
                  card: 'field',
                  hideBelow: 'xl',
                  cell: (r) => `${numberFmt.format(r.n_rule_transfers_suffered)} / ${numberFmt.format(r.n_rule_transfers_received)}`,
                },
              ]}
            />
          </>
        )}
      </CardContent>
    </Card>
  );
};
