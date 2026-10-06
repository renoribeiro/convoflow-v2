import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileText, FileSpreadsheet, File, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { AnalyticsFilters } from './AdvancedFilters';

interface ExportReportsProps {
  filters: AnalyticsFilters;
  data?: any;
}

interface ExportConfig {
  format: 'pdf' | 'excel' | 'csv';
  includeCharts: boolean;
  includeMetrics: boolean;
  includeRawData: boolean;
  dateRange: string;
  reportName: string;
  description: string;
  sections: {
    overview: boolean;
    metrics: boolean;
    charts: boolean;
    funnel: boolean;
    sources: boolean;
    campaigns: boolean;
    rawData: boolean;
  };
}

const ExportReports: React.FC<ExportReportsProps> = ({ filters, data }) => {
  const [isExporting, setIsExporting] = useState(false);
  const [exportConfig, setExportConfig] = useState<ExportConfig>({
    format: 'pdf',
    includeCharts: true,
    includeMetrics: true,
    includeRawData: false,
    dateRange: filters.quickDate || '30d',
    reportName: `Relatório de Análises - ${new Date().toLocaleDateString('pt-BR')}`,
    description: '',
    sections: {
      overview: true,
      metrics: true,
      charts: true,
      funnel: true,
      sources: true,
      campaigns: true,
      rawData: false,
    },
  });

  const handleQuickExport = async (format: 'pdf' | 'excel' | 'csv') => {
    setIsExporting(true);
    try {
      // Simular exportação
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Aqui seria a lógica real de exportação
      const exportData = {
        format,
        filters,
        data,
        timestamp: new Date().toISOString(),
      };
      
      // Simular download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: format === 'csv' ? 'text/csv' : 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `relatorio-${format}-${Date.now()}.${format === 'excel' ? 'xlsx' : format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Relatório ${format.toUpperCase()} exportado com sucesso!`);
    } catch (error) {
      toast.error('Erro ao exportar relatório');
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const handleCustomExport = async () => {
    setIsExporting(true);
    try {
      // Simular exportação customizada
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const exportData = {
        config: exportConfig,
        filters,
        data,
        timestamp: new Date().toISOString(),
      };
      
      // Simular download
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: exportConfig.format === 'csv' ? 'text/csv' : 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportConfig.reportName.replace(/\s+/g, '-').toLowerCase()}.${exportConfig.format === 'excel' ? 'xlsx' : exportConfig.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success(`Relatório customizado exportado com sucesso!`);
    } catch (error) {
      toast.error('Erro ao exportar relatório customizado');
      console.error('Custom export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const updateSection = (section: keyof ExportConfig['sections'], value: boolean) => {
    setExportConfig(prev => ({
      ...prev,
      sections: {
        ...prev.sections,
        [section]: value,
      },
    }));
  };

  return (
    <div className="flex items-center gap-2">
      {/* Exportação Rápida */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Exportar
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Exportação Rápida</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => handleQuickExport('pdf')}>
            <FileText className="h-4 w-4 mr-2" />
            PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleQuickExport('excel')}>
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Excel
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleQuickExport('csv')}>
            <File className="h-4 w-4 mr-2" />
            CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Exportação Customizada */}
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            Personalizar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Exportar Relatório Personalizado</DialogTitle>
            <DialogDescription>
              Configure as opções de exportação para gerar um relatório personalizado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Informações Básicas */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Informações do Relatório</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reportName">Nome do Relatório</Label>
                  <Input
                    id="reportName"
                    value={exportConfig.reportName}
                    onChange={(e) => setExportConfig(prev => ({ ...prev, reportName: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="format">Formato</Label>
                  <Select
                    value={exportConfig.format}
                    onValueChange={(value: 'pdf' | 'excel' | 'csv') => 
                      setExportConfig(prev => ({ ...prev, format: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pdf">PDF</SelectItem>
                      <SelectItem value="excel">Excel</SelectItem>
                      <SelectItem value="csv">CSV</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description">Descrição (Opcional)</Label>
                <Textarea
                  id="description"
                  placeholder="Adicione uma descrição para o relatório..."
                  value={exportConfig.description}
                  onChange={(e) => setExportConfig(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>
            </div>

            {/* Seções do Relatório */}
            <div className="space-y-4">
              <h4 className="text-sm font-medium">Seções do Relatório</h4>
              
              <div className="grid grid-cols-2 gap-4">
                {Object.entries({
                  overview: 'Visão Geral',
                  metrics: 'Métricas Principais',
                  charts: 'Gráficos e Visualizações',
                  funnel: 'Funil de Conversão',
                  sources: 'Fontes de Tráfego',
                  campaigns: 'Campanhas',
                  rawData: 'Dados Brutos',
                }).map(([key, label]) => (
                  <div key={key} className="flex items-center space-x-2">
                    <Checkbox
                      id={key}
                      checked={exportConfig.sections[key as keyof ExportConfig['sections']]}
                      onCheckedChange={(checked) => 
                        updateSection(key as keyof ExportConfig['sections'], checked as boolean)
                      }
                    />
                    <Label htmlFor={key} className="text-sm">
                      {label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            {/* Opções Avançadas */}
            {exportConfig.format === 'pdf' && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Opções PDF</h4>
                
                <div className="space-y-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeCharts"
                      checked={exportConfig.includeCharts}
                      onCheckedChange={(checked) => 
                        setExportConfig(prev => ({ ...prev, includeCharts: checked as boolean }))
                      }
                    />
                    <Label htmlFor="includeCharts" className="text-sm">
                      Incluir gráficos em alta resolução
                    </Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="includeMetrics"
                      checked={exportConfig.includeMetrics}
                      onCheckedChange={(checked) => 
                        setExportConfig(prev => ({ ...prev, includeMetrics: checked as boolean }))
                      }
                    />
                    <Label htmlFor="includeMetrics" className="text-sm">
                      Incluir tabelas de métricas detalhadas
                    </Label>
                  </div>
                </div>
              </div>
            )}

            {exportConfig.format === 'csv' && (
              <div className="space-y-4">
                <h4 className="text-sm font-medium">Opções CSV</h4>
                
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeRawData"
                    checked={exportConfig.includeRawData}
                    onCheckedChange={(checked) => 
                      setExportConfig(prev => ({ ...prev, includeRawData: checked as boolean }))
                    }
                  />
                  <Label htmlFor="includeRawData" className="text-sm">
                    Incluir dados brutos detalhados
                  </Label>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              onClick={handleCustomExport}
              disabled={isExporting}
              className="w-full sm:w-auto"
            >
              {isExporting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Exportando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Exportar Relatório
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExportReports;