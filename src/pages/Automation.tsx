import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { AutomationBuilder } from '@/components/automation/AutomationBuilder';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { getCatalogEntry, CATEGORY_STYLES } from '@/components/automation/automationCatalog';
import { useAutomationStats, relativeTime, type FlowStat } from '@/components/automation/useAutomationStats';
import { cn } from '@/lib/utils';
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Edit,
  Trash2,
  Copy,
  Search,
  Settings,
  TrendingUp,
  LayoutGrid,
  List,
  Activity,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface AutomationFlow {
  id: string;
  name: string;
  description: string;
  active: boolean;
  trigger_type: string;
  trigger_config: any;
  steps: any;
  created_at: string;
  updated_at: string;
}

type SortKey = 'updated' | 'name' | 'executions';

const Automation = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterTrigger, setFilterTrigger] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('updated');
  const [view, setView] = useState<'cards' | 'table'>('cards');
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingFlow, setEditingFlow] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AutomationFlow | null>(null);

  const { toast } = useToast();
  const { byFlow } = useAutomationStats();

  const { data: flows = [], isLoading } = useSupabaseQuery({
    table: 'automation_flows',
    queryKey: ['automation-flows'],
    select: 'id, name, description, active, trigger_type, trigger_config, steps, created_at, updated_at',
  });

  const deleteFlowMutation = useSupabaseMutation({ table: 'automation_flows', operation: 'delete', invalidateQueries: [['automation-flows']], successMessage: 'Fluxo excluído com sucesso!' });
  const toggleFlowMutation = useSupabaseMutation({ table: 'automation_flows', operation: 'update', invalidateQueries: [['automation-flows']], successMessage: 'Status do fluxo atualizado!' });
  const duplicateFlowMutation = useSupabaseMutation({ table: 'automation_flows', operation: 'insert', invalidateQueries: [['automation-flows']], successMessage: 'Fluxo duplicado com sucesso!' });

  const triggerTypesPresent = useMemo(
    () => Array.from(new Set(flows.map((f) => f.trigger_type).filter(Boolean))),
    [flows],
  );

  const visibleFlows = useMemo(() => {
    const filtered = flows.filter((flow) => {
      const matchesSearch =
        flow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        flow.description?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus =
        filterStatus === 'all' || (filterStatus === 'active' && flow.active) || (filterStatus === 'inactive' && !flow.active);
      const matchesTrigger = filterTrigger === 'all' || flow.trigger_type === filterTrigger;
      return matchesSearch && matchesStatus && matchesTrigger;
    });
    return filtered.sort((a, b) => {
      if (sortKey === 'name') return a.name.localeCompare(b.name);
      if (sortKey === 'executions') return (byFlow.get(b.id)?.executions ?? 0) - (byFlow.get(a.id)?.executions ?? 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
  }, [flows, searchTerm, filterStatus, filterTrigger, sortKey, byFlow]);

  const handleDeleteFlow = async () => {
    if (!deleteTarget) return;
    try {
      await deleteFlowMutation.mutateAsync({ data: deleteTarget.id, options: { filter: { column: 'id', operator: 'eq', value: deleteTarget.id } } } as any);
      setDeleteTarget(null);
    } catch {
      toast({ title: 'Erro', description: 'Erro ao excluir fluxo', variant: 'destructive' });
    }
  };

  const handleToggleFlow = async (flowId: string, currentStatus: boolean) => {
    try {
      await toggleFlowMutation.mutateAsync({ data: { active: !currentStatus }, options: { filter: { column: 'id', operator: 'eq', value: flowId } } });
    } catch {
      toast({ title: 'Erro', description: 'Erro ao alterar status do fluxo', variant: 'destructive' });
    }
  };

  const handleDuplicateFlow = async (flow: AutomationFlow) => {
    try {
      await duplicateFlowMutation.mutateAsync({
        data: { name: `${flow.name} (Cópia)`, description: flow.description, active: false, trigger_type: flow.trigger_type, trigger_config: flow.trigger_config, steps: flow.steps },
      });
    } catch {
      toast({ title: 'Erro', description: 'Erro ao duplicar fluxo', variant: 'destructive' });
    }
  };

  const getStepsCount = (steps: any) => {
    try {
      const parsed = typeof steps === 'string' ? JSON.parse(steps) : steps;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch {
      return 0;
    }
  };

  const openEdit = (id: string) => { setEditingFlow(id); setShowBuilder(true); };

  const totalFlows = flows.length;
  const activeFlows = flows.filter((f) => f.active).length;
  const inactiveFlows = totalFlows - activeFlows;
  const overallSuccess = useMemo(() => {
    let exec = 0, ok = 0;
    byFlow.forEach((s) => { exec += s.executions; ok += s.completed; });
    return exec > 0 ? `${Math.round((ok / exec) * 100)}%` : '--';
  }, [byFlow]);

  const statusBadge = (flow: AutomationFlow, stat?: FlowStat) => {
    if (!flow.active) return <Badge variant="secondary" className="text-xs">Inativo</Badge>;
    if (stat && stat.failed > 0) return <Badge className="bg-red-100 text-red-700 text-xs hover:bg-red-100 dark:bg-red-950 dark:text-red-300">Com erros</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 text-xs hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">Ativo</Badge>;
  };

  if (showBuilder) {
    return <AutomationBuilder flowId={editingFlow || undefined} onClose={() => { setShowBuilder(false); setEditingFlow(null); }} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automação"
        helpKey="page:automation"
        description="Crie e gerencie fluxos de automação para otimizar seu atendimento"
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Automação' }]}
        actions={<Button size="sm" onClick={() => setShowBuilder(true)}><Plus className="h-4 w-4 mr-2" />Novo Fluxo</Button>}
      />

      {/* Métricas */}
      <div className="grid gap-4 md:grid-cols-4">
        {[
          { title: 'Total de Fluxos', value: totalFlows, icon: Workflow, color: 'text-muted-foreground', hint: 'Fluxos criados' },
          { title: 'Fluxos Ativos', value: activeFlows, icon: Play, color: 'text-emerald-600', hint: 'Executando automaticamente' },
          { title: 'Fluxos Inativos', value: inactiveFlows, icon: Pause, color: 'text-amber-600', hint: 'Pausados ou em configuração' },
          { title: 'Taxa de Sucesso', value: overallSuccess, icon: TrendingUp, color: 'text-sky-600', hint: 'Execuções bem-sucedidas' },
        ].map((m) => (
          <Card key={m.title}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{m.title}</CardTitle>
              <m.icon className={cn('h-4 w-4', m.color)} />
            </CardHeader>
            <CardContent>
              <div className={cn('text-2xl font-bold', m.title !== 'Total de Fluxos' && m.color)}>{m.value}</div>
              <p className="text-xs text-muted-foreground">{m.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar fluxos..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
          </div>

          <div className="flex items-center gap-1 rounded-md border p-0.5">
            {(['all', 'active', 'inactive'] as const).map((status) => (
              <Button key={status} variant={filterStatus === status ? 'default' : 'ghost'} size="sm" className="h-7" onClick={() => setFilterStatus(status)}>
                {status === 'all' ? 'Todos' : status === 'active' ? 'Ativos' : 'Inativos'}
              </Button>
            ))}
          </div>

          <Select value={filterTrigger} onValueChange={setFilterTrigger}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Gatilho" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os gatilhos</SelectItem>
              {triggerTypesPresent.map((t) => (
                <SelectItem key={t} value={t}>{getCatalogEntry(t)?.label || t}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="updated">Mais recentes</SelectItem>
              <SelectItem value="name">Nome (A–Z)</SelectItem>
              <SelectItem value="executions">Mais execuções</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 rounded-md border p-0.5">
            <Button variant={view === 'cards' ? 'default' : 'ghost'} size="icon" className="h-7 w-7" title="Cards" aria-label="Ver em cards" onClick={() => setView('cards')}><LayoutGrid className="h-4 w-4" /></Button>
            <Button variant={view === 'table' ? 'default' : 'ghost'} size="icon" className="h-7 w-7" title="Tabela" aria-label="Ver em tabela" onClick={() => setView('table')}><List className="h-4 w-4" /></Button>
          </div>
        </CardContent>
      </Card>

      {/* Conteúdo */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardHeader><Skeleton className="h-5 w-3/4 rounded" /><Skeleton className="h-4 w-1/2 rounded" /></CardHeader><CardContent><Skeleton className="h-4 w-full rounded" /></CardContent></Card>
          ))}
        </div>
      ) : visibleFlows.length === 0 ? (
        <Card>
          <CardContent className="py-0">
            <EmptyState
              icon={<Workflow className="h-10 w-10" />}
              title={searchTerm || filterStatus !== 'all' || filterTrigger !== 'all' ? 'Nenhum fluxo encontrado' : 'Nenhum fluxo de automação criado'}
              description={searchTerm || filterStatus !== 'all' || filterTrigger !== 'all' ? 'Tente ajustar os filtros' : 'Crie seu primeiro fluxo para automatizar o atendimento'}
              action={!searchTerm && filterStatus === 'all' && filterTrigger === 'all' ? { label: 'Criar Primeiro Fluxo', onClick: () => setShowBuilder(true), icon: <Plus className="h-4 w-4 mr-2" /> } : undefined}
            />
          </CardContent>
        </Card>
      ) : view === 'cards' ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {visibleFlows.map((flow) => {
            const entry = getCatalogEntry(flow.trigger_type);
            const Icon = entry?.Icon ?? Settings;
            const stat = byFlow.get(flow.id);
            const stepsCount = getStepsCount(flow.steps);
            const s = CATEGORY_STYLES.trigger;
            return (
              <Card key={flow.id} className="group transition-shadow hover:shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-start gap-3">
                    <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white', s.iconBg)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <CardTitle className="truncate text-sm font-semibold">{flow.name}</CardTitle>
                        {statusBadge(flow, stat)}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{entry?.label || 'Personalizado'}</p>
                    </div>
                  </div>
                  {flow.description && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{flow.description}</p>}
                </CardHeader>

                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/50 py-1.5">
                      <p className="text-sm font-semibold">{stepsCount}</p>
                      <p className="text-[10px] text-muted-foreground">etapas</p>
                    </div>
                    <div className="rounded-md bg-muted/50 py-1.5">
                      <p className="text-sm font-semibold">{stat?.executions ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">execuções</p>
                    </div>
                    <div className="rounded-md bg-muted/50 py-1.5">
                      <p className="text-sm font-semibold">{stat && stat.executions > 0 ? `${stat.successRate}%` : '--'}</p>
                      <p className="text-[10px] text-muted-foreground">sucesso</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">Última execução: {relativeTime(stat?.lastRun ?? null)}</p>

                  <Separator />

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" onClick={() => openEdit(flow.id)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar" onClick={() => handleDuplicateFlow(flow)} disabled={duplicateFlowMutation.isPending}><Copy className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" title="Excluir" onClick={() => setDeleteTarget(flow)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                    <Button size="sm" variant={flow.active ? 'outline' : 'default'} className="h-7 text-xs" onClick={() => handleToggleFlow(flow.id, flow.active)} disabled={toggleFlowMutation.isPending}>
                      {flow.active ? <><Pause className="mr-1 h-3 w-3" /> Pausar</> : <><Play className="mr-1 h-3 w-3" /> Ativar</>}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Cartão no celular: nome + gatilho lideram, status vira chip,
                as quatro métricas viram campos e as ações ficam no canto. */}
            <ResponsiveTable
              ariaLabel="Fluxos de automação"
              rows={visibleFlows as unknown as AutomationFlow[]}
              rowKey={(flow) => flow.id}
              onRowClick={(flow) => openEdit(flow.id)}
              actionsHeader="Ações"
              columns={[
                {
                  key: 'fluxo',
                  header: 'Fluxo',
                  card: 'title',
                  cell: (flow) => {
                    const entry = getCatalogEntry(flow.trigger_type);
                    const Icon = entry?.Icon ?? Settings;
                    const s = CATEGORY_STYLES.trigger;
                    return (
                      <div className="flex items-center gap-2.5">
                        <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white', s.iconBg)}><Icon className="h-4 w-4" /></div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{flow.name}</p>
                          <p className="text-xs text-muted-foreground">{entry?.label || 'Personalizado'}</p>
                        </div>
                      </div>
                    );
                  },
                },
                { key: 'status', header: 'Status', card: 'badge', cell: (flow) => statusBadge(flow, byFlow.get(flow.id)) },
                { key: 'etapas', header: 'Etapas', headClassName: 'text-center', cellClassName: 'text-center text-sm', cell: (flow) => getStepsCount(flow.steps) },
                {
                  key: 'execucoes',
                  header: 'Execuções',
                  headClassName: 'text-center',
                  cellClassName: 'text-center text-sm',
                  cell: (flow) => <span className="inline-flex items-center gap-1"><Activity className="h-3 w-3 text-muted-foreground" />{byFlow.get(flow.id)?.executions ?? 0}</span>,
                },
                {
                  key: 'sucesso',
                  header: 'Sucesso',
                  headClassName: 'text-center',
                  cellClassName: 'text-center text-sm',
                  cell: (flow) => {
                    const stat = byFlow.get(flow.id);
                    return stat && stat.executions > 0 ? (
                      <span className={cn('inline-flex items-center gap-1', stat.failed > 0 ? 'text-amber-600' : 'text-emerald-600')}>
                        {stat.failed > 0 ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}{stat.successRate}%
                      </span>
                    ) : <span className="text-muted-foreground">--</span>;
                  },
                },
                { key: 'ultima', header: 'Última', cellClassName: 'text-sm text-muted-foreground', cell: (flow) => relativeTime(byFlow.get(flow.id)?.lastRun ?? null) },
              ]}
              actions={(flow) => (
                <div className="flex items-center justify-end gap-1">
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Editar" aria-label="Editar" onClick={() => openEdit(flow.id)}><Edit className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title="Duplicar" aria-label="Duplicar" onClick={() => handleDuplicateFlow(flow)}><Copy className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" title="Excluir" aria-label="Excluir" onClick={() => setDeleteTarget(flow)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" title={flow.active ? 'Pausar' : 'Ativar'} aria-label={flow.active ? 'Pausar' : 'Ativar'} onClick={() => handleToggleFlow(flow.id, flow.active)}>
                    {flow.active ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              )}
            />
          </CardContent>
        </Card>
      )}

      <ConfirmationDialog
        isOpen={deleteTarget !== null}
        onConfirm={handleDeleteFlow}
        onClose={() => setDeleteTarget(null)}
        title="Excluir Fluxo"
        description={`Tem certeza que deseja excluir o fluxo "${deleteTarget?.name}"? Esta ação não pode ser desfeita.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={deleteFlowMutation.isPending}
      />
    </div>
  );
};

export default Automation;
