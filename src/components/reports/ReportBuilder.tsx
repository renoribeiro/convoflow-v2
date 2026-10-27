import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus } from 'lucide-react';
import { useCreateReportTemplate } from '@/hooks/useReports';
import { useTenant } from '@/contexts/TenantContext';
import { REPORT_CONTENTS, REPORT_CONTENT_IDS, REPORT_NOT_INCLUDED } from '@/lib/reports/reportContents';

/**
 * Aba "Criar" de Relatórios: salva um MODELO (nome, descrição, categoria e
 * tipo) para gerar depois na aba de modelos, já preenchido.
 *
 * Até 2026-10-25 esta aba oferecia seções, tipos de gráfico e métricas
 * ("Lifetime Value", "ROI", "Custo de Aquisição", "Distribuição
 * Geográfica"...) que nunca entraram no relatório: o servidor manda sempre o
 * mesmo conjunto (REPORT_CONTENTS). E tinha um "Visualizar Preview" em breve.
 * Agora a aba mostra o que o relatório traz de verdade, e só isso (achado 72
 * do checkup, ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md).
 */

const TIPOS = [
  { value: 'general', label: 'Geral' },
  { value: 'conversations', label: 'Conversas' },
  { value: 'campaigns', label: 'Campanhas' },
  { value: 'funnel', label: 'Funil de Vendas' },
];

export const ReportBuilder = () => {
  const [reportName, setReportName] = useState('');
  const [reportDescription, setReportDescription] = useState('');
  const [reportCategory, setReportCategory] = useState('');
  const [reportType, setReportType] = useState('general');
  const { toast } = useToast();
  const { tenant } = useTenant();

  const saveReportMutation = useCreateReportTemplate();

  const limpar = () => {
    setReportName('');
    setReportDescription('');
    setReportCategory('');
    setReportType('general');
  };

  const handleSaveReport = () => {
    if (!reportName.trim()) {
      toast({
        title: 'Falta o nome',
        description: 'Dê um nome ao modelo, por exemplo "Resumo semanal da Loja".',
        variant: 'destructive',
      });
      return;
    }

    saveReportMutation.mutate(
      {
        name: reportName.trim(),
        description: reportDescription,
        category: reportCategory,
        type: 'dashboard' as const,
        config: {
          reportType,
          format: 'html',
          metrics: [...REPORT_CONTENT_IDS],
        },
        is_public: false,
        tenant_id: tenant?.id,
      } as never,
      { onSuccess: limpar },
    );
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Salvar um modelo de relatório</CardTitle>
          <p className="text-sm text-muted-foreground">
            O modelo guarda nome, descrição e tipo. Depois, na primeira aba, clique em "Gerar" para enviar sem preencher tudo de novo.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="reportName">Nome do modelo</Label>
              <Input
                id="reportName"
                value={reportName}
                onChange={(e) => setReportName(e.target.value)}
                placeholder="Ex: Resumo semanal da Loja"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Categoria</Label>
              <Select value={reportCategory} onValueChange={setReportCategory}>
                <SelectTrigger id="category">
                  <SelectValue placeholder="Escolha a categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="performance">Desempenho</SelectItem>
                  <SelectItem value="financial">Financeiro</SelectItem>
                  <SelectItem value="traffic">Tráfego</SelectItem>
                  <SelectItem value="conversion">Conversão</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="report-type">Tipo</Label>
            <Select value={reportType} onValueChange={setReportType}>
              <SelectTrigger id="report-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIPOS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">O tipo muda só o título do email. O conteúdo é o mesmo em todos.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              placeholder="Para quem é e para que serve este relatório"
            />
          </div>
        </CardContent>
      </Card>

      <Card data-testid="report-builder-contents">
        <CardHeader>
          <CardTitle>O que vai no relatório</CardTitle>
          <p className="text-sm text-muted-foreground">
            Todo relatório traz estes números da Loja inteira, no período escolhido na hora de gerar.
          </p>
        </CardHeader>
        <CardContent>
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {REPORT_CONTENTS.map((item) => (
              <li key={item.id} className="rounded-md border p-3">
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted-foreground">{REPORT_NOT_INCLUDED}</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSaveReport} disabled={saveReportMutation.isPending}>
          <Plus className="w-4 h-4 mr-2" />
          {saveReportMutation.isPending ? 'Salvando...' : 'Salvar modelo'}
        </Button>
      </div>
    </div>
  );
};
