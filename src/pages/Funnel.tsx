
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FunnelBoard } from '@/components/funnel/FunnelBoard';
import { StageConfigModal } from '@/components/funnel/StageConfigModal';
import { NewLeadModal } from '@/components/funnel/NewLeadModal';
import { Plus, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EstadoVazioFunil } from '@/components/funnel/EstadoVazioFunil';
import { useRole, useTenant } from '@/contexts/TenantContext';
import { podeConfigurarEtapas } from '@/lib/funnel/permissoes';
import { consumirAcaoFunil } from '@/lib/funnel/funilPendente';

export default function Funnel() {
  const [showStageConfig, setShowStageConfig] = useState(false);
  const [showNewLead, setShowNewLead] = useState(false);
  // Atendente vê as etapas e move os cards; configurar é do Gestor e do
  // Gerente (20261021000003). Sem o botão, sem a janela.
  const role = useRole();
  const { tenant } = useTenant();
  const podeConfigurar = podeConfigurarEtapas(role);
  // O funil é de cada Loja: com a Conta em foco, o Gerente escolhe a Loja antes
  // de configurar (src/lib/funnel/estadoVazio.ts).
  const gerenteNaConta = role === 'gerente' && (tenant as { kind?: string | null } | null)?.kind === 'account';
  const [showEscolherLoja, setShowEscolherLoja] = useState(false);

  // Voltou da troca de Loja: reabre a janela que estava aberta.
  useEffect(() => {
    const acao = consumirAcaoFunil();
    if (acao === 'novo-lead') setShowNewLead(true);
    if (acao === 'configurar-etapas' && podeConfigurar) setShowStageConfig(true);
    // Só ao montar: a troca de Loja remonta a tela inteira.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const configurarEtapas = () => {
    if (gerenteNaConta) setShowEscolherLoja(true);
    else setShowStageConfig(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Funil de Vendas"
        helpKey="page:funnel"
        description="Visualize e gerencie o progresso dos seus leads através do funil"
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Funil de Vendas' }
        ]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {podeConfigurar && (
              <Button
                variant="outline"
                size="sm"
                onClick={configurarEtapas}
                data-tour="funil-configurar-estagios"
              >
                <Settings className="w-4 h-4 mr-2" />
                Configurar Estágios
              </Button>
            )}
            <Button size="sm" onClick={() => setShowNewLead(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Novo Lead
            </Button>
          </div>
        }
      />

      {/* O botão "Mostrar Métricas" e a aba "Métricas & Relatórios" saíram em
          2026-10-25 (achado 56 do checkup, ops-privado/checkup-ux/
          RELATORIO_CHECKUP_UX.md): todos os números eram fixos no código
          (28 leads, 18,5%, vendedores inventados). Números reais do funil
          estão no Dashboard e no relatório por email. */}
      <FunnelBoard />

      {podeConfigurar && !gerenteNaConta && (
        <StageConfigModal
          isOpen={showStageConfig}
          onClose={() => setShowStageConfig(false)}
        />
      )}

      {gerenteNaConta && (
        <Dialog open={showEscolherLoja} onOpenChange={setShowEscolherLoja}>
          <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Configurar Estágios</DialogTitle>
              <DialogDescription>O funil é de cada Loja.</DialogDescription>
            </DialogHeader>
            <EstadoVazioFunil situacao="conta" acaoDepoisDaLoja="configurar-etapas" />
          </DialogContent>
        </Dialog>
      )}
      
      <NewLeadModal
        isOpen={showNewLead}
        onClose={() => setShowNewLead(false)}
        onConfigurarEtapas={() => {
          setShowNewLead(false);
          setShowStageConfig(true);
        }}
      />
    </div>
  );
}
