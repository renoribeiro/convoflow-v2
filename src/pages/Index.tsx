import { useState } from 'react';
import { MessageCircle, UserPlus, TrendingUp, Send, ChevronDown } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

import { DashboardHeader } from '@/components/dashboard/DashboardHeader';
import { OnboardingTutorialsCard } from '@/components/dashboard/OnboardingTutorialsCard';
import { EnhancedMetricCard } from '@/components/dashboard/EnhancedMetricCard';
import { AttentionPanel } from '@/components/dashboard/AttentionPanel';
import { AttendanceMetrics } from '@/components/dashboard/AttendanceMetrics';
import { AttendantMetricsSection } from '@/components/dashboard/AttendantMetricsSection';
import { ActivityChart } from '@/components/dashboard/ActivityChart';
import { FunnelMini } from '@/components/dashboard/FunnelMini';
import { ActivityFeed } from '@/components/dashboard/ActivityFeed';
import { WhatsAppStatusCompact } from '@/components/dashboard/WhatsAppStatusCompact';
import { LeadSourcesChart } from '@/components/dashboard/LeadSourcesChart';
import { AutomationsSummary } from '@/components/dashboard/AutomationsSummary';

import { usePeriodFilter } from '@/hooks/usePeriodFilter';
import { useDashboardKpis } from '@/hooks/useDashboardKpis';
import { useRealTimeUpdates } from '@/hooks/useRealTimeUpdates';

const numberFmt = new Intl.NumberFormat('pt-BR');

const Index = () => {
  const period = usePeriodFilter('7d');
  const kpis = useDashboardKpis(period);

  // Invalidação automática a cada 30s (polling/realtime via Evolution store).
  useRealTimeUpdates();

  // Seção de gráficos secundários: aberta por padrão em desktop, fechada em mobile.
  const [secondaryOpen, setSecondaryOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  );

  const cards = [
    {
      title: 'Conversas Ativas',
      value: numberFmt.format(kpis.activeConversations.value),
      icon: <MessageCircle />,
      metric: kpis.activeConversations,
      href: '/dashboard/conversations',
      lojaWide: true,
    },
    {
      title: 'Novos Contatos',
      value: numberFmt.format(kpis.newContacts.value),
      icon: <UserPlus />,
      metric: kpis.newContacts,
      href: '/dashboard/contacts',
    },
    {
      title: 'Taxa de Conversão',
      value: `${kpis.conversionRate.value.toFixed(1)}%`,
      icon: <TrendingUp />,
      metric: kpis.conversionRate,
      href: '/dashboard/funnel',
    },
    {
      title: 'Mensagens Enviadas',
      value: numberFmt.format(kpis.messagesSent.value),
      icon: <Send />,
      metric: kpis.messagesSent,
      lojaWide: true,
    },
  ];

  return (
    <div className="space-y-6">
      <DashboardHeader period={period} />

      {/* Seção 1.5 — Convite aos tutoriais, só enquanto a Conta está no zero.
          Único ponto de descoberta dos tutoriais no produto. */}
      <OnboardingTutorialsCard />

      {/* Seção 2 — KPI cards com sparkline + variação. O "Tempo Médio de
          Resposta" saiu daqui: misturava bot e pessoa. Virou a seção
          Atendimento, logo abaixo, com os dois números separados. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, i) => (
          <EnhancedMetricCard
            key={card.title}
            index={i}
            title={card.title}
            value={card.value}
            icon={card.icon}
            metric={card.metric}
            href={card.href}
            lojaWide={card.lojaWide}
          />
        ))}
      </div>

      {/* Seção 2.5 — Atendimento: 1ª resposta do bot × de uma pessoa (medianas),
          esperando agora, sem resposta de pessoa, bot participou, duração. */}
      <AttendanceMetrics period={period} />

      {/* Seção 2.6 — Por atendente (posse), só gestor/gerente. Renderiza nada
          para os outros cargos; o banco devolve zero linhas a quem não administra. */}
      <AttendantMetricsSection />

      {/* Seção 3 — Precisa de Atenção */}
      <AttentionPanel />

      {/* Seção 4 — Grid principal */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <ActivityChart period={period} />
          <FunnelMini />
        </div>
        <div className="space-y-6 lg:col-span-1">
          <ActivityFeed />
          <WhatsAppStatusCompact />
        </div>
      </div>

      {/* Seção 5 — Gráficos secundários (colapsável) */}
      <Collapsible open={secondaryOpen} onOpenChange={setSecondaryOpen}>
        <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/50">
          <span>Análise detalhada</span>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform duration-200',
              secondaryOpen && 'rotate-180',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="grid grid-cols-1 gap-6 lg:grid-cols-2"
          >
            <LeadSourcesChart period={period} />
            <AutomationsSummary period={period} />
          </motion.div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

export default Index;
