import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FileText, BarChart3, Users, MessageSquare, Calendar, X, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/contexts/TenantContext';
import { REPORT_CONTENTS, REPORT_CONTENT_IDS, REPORT_NOT_INCLUDED } from '@/lib/reports/reportContents';

interface NewReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Dados iniciais (ex.: ao gerar a partir de um template). */
  initialData?: Partial<ReportData>;
}

interface ReportData {
  name: string;
  description: string;
  type: string;
  frequency: string;
  format: string;
  metrics: string[];
  filters: {
    dateRange: string;
    campaigns: string[];
    contacts: string[];
    status: string[];
  };
  delivery: {
    email: boolean;
    whatsapp: boolean;
    recipients: string[];
  };
}

export const NewReportModal = ({ isOpen, onClose, initialData }: NewReportModalProps) => {
  // A Loja aberta no seletor: é dela que o relatório sai (revalidado no
  // servidor). Sem isto um gerente olhando uma Loja filha recebia os números
  // da própria Conta.
  const { tenant } = useTenant();
  const [reportData, setReportData] = useState<ReportData>({
    name: '',
    description: '',
    type: '',
    frequency: 'manual',
    format: 'pdf',
    // O conteúdo é fixo (ver REPORT_CONTENTS): a lista vai no corpo só como
    // registro do que foi pedido, não como seleção.
    metrics: [...REPORT_CONTENT_IDS],
    filters: {
      dateRange: '30days',
      campaigns: [],
      contacts: [],
      status: []
    },
    delivery: {
      email: false,
      whatsapp: false,
      recipients: []
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  // Campo de destinatários (e-mails separados por vírgula). Mantido como string
  // crua porque o usuário digita livremente; o parsing/validação ocorre no envio.
  const [recipientsRaw, setRecipientsRaw] = useState('');

  // Ao abrir com dados iniciais (gerar a partir de um template), pré-preenche o form.
  useEffect(() => {
    if (isOpen && initialData) {
      setReportData((prev) => ({
        ...prev,
        ...initialData,
        // Templates antigos guardam ids de métricas que o servidor nunca
        // calculou ('satisfaction', 'revenue'...): o conteúdo real é sempre o mesmo.
        metrics: [...REPORT_CONTENT_IDS],
        filters: { ...prev.filters, ...(initialData.filters ?? {}) },
        delivery: { ...prev.delivery, ...(initialData.delivery ?? {}) },
      }));
      setCurrentStep(1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const reportTypes = [
    { value: 'campaigns', label: 'Campanhas', icon: MessageSquare, description: 'Performance de campanhas de marketing' },
    { value: 'conversations', label: 'Conversas', icon: Users, description: 'Análise de conversas e atendimentos' },
    { value: 'funnel', label: 'Funil de Vendas', icon: BarChart3, description: 'Progresso e conversões no funil' },
    { value: 'general', label: 'Geral', icon: FileText, description: 'Relatório geral do sistema' }
  ];

  const frequencies = [
    { value: 'manual', label: 'Manual' },
    { value: 'daily', label: 'Diário' },
    { value: 'weekly', label: 'Semanal' },
    { value: 'monthly', label: 'Mensal' },
    { value: 'quarterly', label: 'Trimestral' }
  ];

  const formats = [
    { value: 'pdf', label: 'PDF' },
    { value: 'excel', label: 'Excel' },
    { value: 'csv', label: 'CSV' },
    { value: 'html', label: 'HTML' }
  ];

  const handleNext = () => {
    if (currentStep < 3) {
      setCurrentStep(prev => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(prev => prev - 1);
    }
  };

  const resetForm = () => {
    setReportData({
      name: '',
      description: '',
      type: '',
      frequency: 'manual',
      format: 'pdf',
      metrics: [...REPORT_CONTENT_IDS],
      filters: { dateRange: '30days', campaigns: [], contacts: [], status: [] },
      delivery: { email: false, whatsapp: false, recipients: [] }
    });
    setRecipientsRaw('');
    setCurrentStep(1);
  };

  const handleSubmit = async () => {
    if (!reportData.name || !reportData.type) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    // Validação por canal: e-mail exige e-mail válido; WhatsApp exige número.
    const parts = recipientsRaw.split(/[,;\n]/).map((r) => r.trim()).filter(Boolean);
    const hasEmail = parts.some((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r));
    const hasPhone = parts.some((r) => r.replace(/\D/g, '').length >= 10);

    if (!reportData.delivery.email && !reportData.delivery.whatsapp) {
      toast.error('Selecione ao menos um canal de entrega (e-mail ou WhatsApp)');
      return;
    }
    if (reportData.delivery.email && !hasEmail) {
      toast.error('Informe ao menos um e-mail de destinatário válido');
      return;
    }
    if (reportData.delivery.whatsapp && !hasPhone) {
      toast.error('Informe ao menos um número de WhatsApp válido (com DDD)');
      return;
    }

    setIsLoading(true);

    try {
      // Gera o relatório com dados reais e envia por e-mail via Edge Function.
      const { data, error } = await supabase.functions.invoke('send-report', {
        body: {
          ...reportData,
          tenant_id: tenant?.id ?? null,
          delivery: { ...reportData.delivery, recipients: recipientsRaw },
        },
      });

      // invoke() trata status != 2xx como erro; tenta extrair a mensagem do corpo.
      if (error) {
        let message = error.message;
        try {
          const ctx = await (error as any).context?.json?.();
          if (ctx?.error?.message) message = ctx.error.message;
        } catch { /* mantém a mensagem padrão */ }
        throw new Error(message);
      }
      if (data && data.success === false) {
        throw new Error(data?.error?.message || 'Falha ao gerar o relatório');
      }

      const delivered: Array<{ channel: string }> = data?.delivered ?? [];
      const channels = delivered.map((d) => (d.channel === 'email' ? 'e-mail' : 'WhatsApp'));
      toast.success(channels.length ? `Relatório enviado por ${channels.join(' e ')}!` : 'Relatório enviado!');
      if (Array.isArray(data?.warnings) && data.warnings.length) {
        toast.warning(data.warnings.join(' | '));
      }
      resetForm();
      onClose();
    } catch (error) {
      console.error('Erro ao gerar relatório:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao gerar relatório. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      setCurrentStep(1);
      onClose();
    }
  };

  const canProceed = () => {
    switch (currentStep) {
      case 1:
        return reportData.name && reportData.type;
      case 2:
        return true;
      case 3:
        return true;
      default:
        return false;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Novo Relatório
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mt-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep >= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}>
                  {step}
                </div>
                {step < 3 && (
                  <div className={`w-12 h-0.5 mx-2 ${
                    currentStep > step ? 'bg-primary' : 'bg-muted'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Etapa 1: Informações Básicas */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Informações Básicas</h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Nome do Relatório *</Label>
                    <Input
                      id="name"
                      value={reportData.name}
                      onChange={(e) => setReportData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Ex: Relatório Mensal de Campanhas"
                      disabled={isLoading}
                    />
                  </div>
                  
                  <div>
                    <Label htmlFor="description">Descrição</Label>
                    <Textarea
                      id="description"
                      value={reportData.description}
                      onChange={(e) => setReportData(prev => ({ ...prev, description: e.target.value }))}
                      placeholder="Descreva o objetivo deste relatório..."
                      rows={3}
                      disabled={isLoading}
                    />
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Tipo de Relatório *</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {reportTypes.map((type) => {
                    const Icon = type.icon;
                    return (
                      <Card 
                        key={type.value}
                        className={`cursor-pointer transition-all hover:shadow-md ${
                          reportData.type === type.value ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setReportData(prev => ({ ...prev, type: type.value }))}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <Icon className="h-6 w-6 text-primary mt-1" />
                            <div>
                              <h4 className="font-medium">{type.label}</h4>
                              <p className="text-sm text-muted-foreground">{type.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Frequência</Label>
                  <Select value={reportData.frequency} onValueChange={(value) => setReportData(prev => ({ ...prev, frequency: value }))} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {frequencies.map((freq) => (
                        <SelectItem key={freq.value} value={freq.value}>
                          {freq.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Formato</Label>
                  <Select value={reportData.format} onValueChange={(value) => setReportData(prev => ({ ...prev, format: value }))} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {formats.map((format) => (
                        <SelectItem key={format.value} value={format.value}>
                          {format.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          )}

          {/* Etapa 2: O que vai no relatório (conteúdo fixo — ver REPORT_CONTENTS) */}
          {currentStep === 2 && reportData.type && (
            <div className="space-y-6" data-testid="report-contents-step">
              <div>
                <h3 className="text-lg font-semibold mb-1">O que vai no relatório</h3>
                <p className="text-muted-foreground mb-4">
                  Todo relatório traz estes números da Loja inteira, no período escolhido. O tipo muda só o título do e-mail.
                </p>

                <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {REPORT_CONTENTS.map((item) => (
                    <li key={item.id} data-testid={`report-content-${item.id}`}>
                      <Card>
                        <CardContent className="p-4">
                          <p className="font-medium">{item.label}</p>
                          <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>

                <p className="mt-4 text-xs text-muted-foreground" data-testid="report-not-included">
                  {REPORT_NOT_INCLUDED}
                </p>
              </div>
            </div>
          )}

          {/* Etapa 3: Configurações de Entrega */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold mb-4">Configurações de Entrega</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="email"
                      checked={reportData.delivery.email}
                      onCheckedChange={(checked) => setReportData(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, email: checked as boolean }
                      }))}
                    />
                    <Label htmlFor="email">Enviar por Email</Label>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="whatsapp"
                      checked={reportData.delivery.whatsapp}
                      onCheckedChange={(checked) => setReportData(prev => ({
                        ...prev,
                        delivery: { ...prev.delivery, whatsapp: checked as boolean }
                      }))}
                    />
                    <Label htmlFor="whatsapp">Enviar por WhatsApp</Label>
                  </div>
                  
                  {(reportData.delivery.email || reportData.delivery.whatsapp) && (
                    <div>
                      <Label htmlFor="recipients">Destinatários</Label>
                      <Input
                        id="recipients"
                        placeholder="E-mails e/ou números com DDD, separados por vírgula"
                        value={recipientsRaw}
                        onChange={(e) => setRecipientsRaw(e.target.value)}
                        disabled={isLoading}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <h4 className="font-medium mb-3">Resumo do Relatório</h4>
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Nome:</span>
                      <span className="font-medium">{reportData.name}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="font-medium">
                        {reportTypes.find(t => t.value === reportData.type)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Frequência:</span>
                      <span className="font-medium">
                        {frequencies.find(f => f.value === reportData.frequency)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Formato:</span>
                      <span className="font-medium">
                        {formats.find(f => f.value === reportData.format)?.label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Conteúdo:</span>
                      <span className="font-medium">{REPORT_CONTENTS.length} números da Loja inteira</span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Botões de Navegação */}
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={handlePrevious}
              disabled={currentStep === 1 || isLoading}
            >
              Anterior
            </Button>
            
            <div className="flex gap-2">
              {currentStep < 3 ? (
                <Button 
                  onClick={handleNext}
                  disabled={!canProceed() || isLoading}
                >
                  Próximo
                </Button>
              ) : (
                <Button 
                  onClick={handleSubmit}
                  disabled={!canProceed() || isLoading}
                >
                  {isLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Criando...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Criar Relatório
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};