
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, BarChart3, PieChart, LineChart, TrendingUp, AlertCircle, X } from 'lucide-react';
import { useReportTemplates, useCreateReportTemplate } from '@/hooks/useReports';
import { useTenant } from '@/contexts/TenantContext';
import { Separator } from '@/components/ui/separator';

const availableMetrics = [
  { id: 'leads', name: 'Total de Leads', category: 'Volume' },
  { id: 'conversions', name: 'Conversões', category: 'Volume' },
  { id: 'conversion_rate', name: 'Taxa de Conversão', category: 'Performance' },
  { id: 'revenue', name: 'Receita Gerada', category: 'Financeiro' },
  { id: 'cac', name: 'Custo de Aquisição', category: 'Financeiro' },
  { id: 'ltv', name: 'Lifetime Value', category: 'Financeiro' },
  { id: 'roi', name: 'ROI', category: 'Performance' },
  { id: 'sources', name: 'Fontes de Tráfego', category: 'Tráfego' },
  { id: 'top_channels', name: 'Principais Canais', category: 'Tráfego' },
  { id: 'funnel_analysis', name: 'Análise do Funil', category: 'Conversão' },
  { id: 'time_to_convert', name: 'Tempo para Conversão', category: 'Conversão' },
  { id: 'geographic', name: 'Distribuição Geográfica', category: 'Demografia' }
];

const chartTypes = [
  { value: 'line', label: 'Gráfico de Linha' },
  { value: 'bar', label: 'Gráfico de Barras' },
  { value: 'pie', label: 'Gráfico de Pizza' },
  { value: 'table', label: 'Tabela' },
  { value: 'metric', label: 'Métrica Simples' }
];



export const ReportBuilder = () => {
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportCategory, setReportCategory] = useState('');
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>([]);
  const [sections, setSections] = useState([
    { id: '1', title: 'Visão Geral', metrics: [], chartType: 'metric' }
  ]);
  const { toast } = useToast();
  const { tenant } = useTenant();

  // Buscar templates de relatórios salvos
  const { data: savedReports = [], isLoading: reportsLoading } = useReportTemplates();

  // Mutation para salvar template de relatório
  const saveReportMutation = useCreateReportTemplate();

  // Adicionar callback de sucesso personalizado
  const handleSaveSuccess = () => {
    // Limpar formulário
    setReportName('');
    setReportDescription('');
    setReportCategory('');
    setSections([{ id: '1', title: 'Visão Geral', metrics: [], chartType: 'metric' }]);
  };

  const addSection = () => {
    const newSection = {
      id: Date.now().toString(),
      title: `Nova Seção ${sections.length + 1}`,
      metrics: [],
      chartType: 'bar'
    };
    setSections([...sections, newSection]);
  };

  const removeSection = (sectionId: string) => {
    setSections(sections.filter(s => s.id !== sectionId));
  };

  const updateSection = (sectionId: string, field: string, value: any) => {
    setSections(sections.map(s => 
      s.id === sectionId ? { ...s, [field]: value } : s
    ));
  };

  const toggleMetric = (metricId: string, sectionId: string) => {
    const section = sections.find(s => s.id === sectionId);
    if (!section) return;

    const updatedMetrics = section.metrics.includes(metricId)
      ? section.metrics.filter(m => m !== metricId)
      : [...section.metrics, metricId];

    updateSection(sectionId, 'metrics', updatedMetrics);
  };

  const getMetricsByCategory = () => {
    const grouped = availableMetrics.reduce((acc, metric) => {
      if (!acc[metric.category]) {
        acc[metric.category] = [];
      }
      acc[metric.category].push(metric);
      return acc;
    }, {} as Record<string, typeof availableMetrics>);
    
    return grouped;
  };

  const handleSaveReport = () => {
    if (!reportName.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome do relatório é obrigatório',
        variant: 'destructive'
      });
      return;
    }

    if (sections.length === 0) {
      toast({
        title: 'Erro',
        description: 'Adicione pelo menos uma seção ao relatório',
        variant: 'destructive'
      });
      return;
    }

    const reportData = {
      name: reportName,
      description: reportDescription,
      category: reportCategory,
      type: 'dashboard' as const,
      config: {
        sections: sections,
        metrics: selectedMetrics
      },
      is_public: false,
      tenant_id: tenant?.id
    };

    saveReportMutation.mutate(reportData, {
      onSuccess: handleSaveSuccess
    });
  };

  return (
    <div className="space-y-6">
      {/* Report Info */}
      <Card>
        <CardHeader>
          <CardTitle>Informações do Relatório</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportName">Nome do Relatório</Label>
              <Input
                id="reportName"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Ex: Relatório Semanal de Performance"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={reportCategory} onValueChange={setReportCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="financial">Financeiro</SelectItem>
                  <SelectItem value="traffic">Tráfego</SelectItem>
                  <SelectItem value="conversion">Conversão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              placeholder="Descreva o objetivo e conteúdo do relatório..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Report Sections */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Seções do Relatório</CardTitle>
            <Button onClick={addSection}>
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Seção
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {sections.map((section, index) => (
            <div key={section.id} className="p-4 border rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex-1 space-y-2">
                  <Label>Título da Seção</Label>
                  <Input
                    value={section.title}
                    onChange={(e) => updateSection(section.id, 'title', e.target.value)}
                    placeholder="Ex: Métricas Principais"
                  />
                </div>
                <div className="ml-4 space-y-2">
                  <Label>Tipo de Visualização</Label>
                  <Select
                    value={section.chartType}
                    onValueChange={(value) => updateSection(section.id, 'chartType', value)}
                  >
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {chartTypes.map(type => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {sections.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeSection(section.id)}
                    className="ml-2"
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>Métricas para esta seção</Label>
                {Object.entries(getMetricsByCategory()).map(([category, metrics]) => (
                  <div key={category} className="space-y-2">
                    <h4 className="font-medium text-sm text-muted-foreground">{category}</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {metrics.map(metric => (
                        <div key={metric.id} className="flex items-center space-x-2">
                          <Checkbox
                            id={`${section.id}-${metric.id}`}
                            checked={section.metrics.includes(metric.id)}
                            onCheckedChange={() => toggleMetric(metric.id, section.id)}
                          />
                          <label
                            htmlFor={`${section.id}-${metric.id}`}
                            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                          >
                            {metric.name}
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {section.metrics.length > 0 && (
                <div className="space-y-2">
                  <Label>Métricas selecionadas:</Label>
                  <div className="flex flex-wrap gap-2">
                    {section.metrics.map(metricId => {
                      const metric = availableMetrics.find(m => m.id === metricId);
                      return metric ? (
                        <Badge key={metricId} variant="secondary">
                          {metric.name}
                        </Badge>
                      ) : null;
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end space-x-2">
        <ComingSoonButton variant="outline" motivo="Pré-visualização em breve">
          <TrendingUp className="w-4 h-4 mr-2" />
          Visualizar Preview
        </ComingSoonButton>
        <Button 
          onClick={handleSaveReport}
          disabled={saveReportMutation.isPending}
        >
          <Plus className="w-4 h-4 mr-2" />
          {saveReportMutation.isPending ? 'Salvando...' : 'Salvar Relatório'}
        </Button>
      </div>
    </div>
  );
};
