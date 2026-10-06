import { useState } from 'react';
import { CHART_STATUS } from '@/lib/chartColors';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { User, Phone, Mail, Building, DollarSign, Calendar, X } from 'lucide-react';
import { toast } from 'sonner';

interface NewLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface LeadData {
  name: string;
  email: string;
  phone: string;
  company: string;
  position: string;
  value: string;
  source: string;
  stage_id: string;
  notes: string;
}

export const NewLeadModal = ({ isOpen, onClose }: NewLeadModalProps) => {
  const [leadData, setLeadData] = useState<LeadData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    position: '',
    value: '',
    source: '',
    stage_id: '',
    notes: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  // Mock data para estágios do funil
  const funnelStages = [
    { id: '1', name: 'Novo Lead', color: CHART_STATUS.info },
    { id: '2', name: 'Qualificado', color: CHART_STATUS.neutral },
    { id: '3', name: 'Proposta', color: CHART_STATUS.warning },
    { id: '4', name: 'Negociação', color: CHART_STATUS.error },
    { id: '5', name: 'Fechado', color: CHART_STATUS.success }
  ];

  const leadSources = [
    'Website',
    'Redes Sociais',
    'Indicação',
    'Google Ads',
    'Facebook Ads',
    'Email Marketing',
    'Evento',
    'Cold Call',
    'WhatsApp',
    'Outros'
  ];

  const handleInputChange = (field: keyof LeadData, value: string) => {
    setLeadData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    // Validação básica
    if (!leadData.name || !leadData.email || !leadData.phone || !leadData.stage_id) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    // Validação de email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadData.email)) {
      toast.error('Digite um email válido');
      return;
    }

    setIsLoading(true);

    try {
      // Simular salvamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('Novo lead criado:', leadData);
      toast.success('Lead criado com sucesso!');
      
      // Reset form
      setLeadData({
        name: '',
        email: '',
        phone: '',
        company: '',
        position: '',
        value: '',
        source: '',
        stage_id: '',
        notes: ''
      });
      
      onClose();
    } catch (error) {
      console.error('Erro ao criar lead:', error);
      toast.error('Erro ao criar lead. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (!isLoading) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Novo Lead
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={handleClose} disabled={isLoading}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Pessoais */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <User className="h-4 w-4" />
                Informações Pessoais
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input
                    id="name"
                    value={leadData.name}
                    onChange={(e) => handleInputChange('name', e.target.value)}
                    placeholder="Digite o nome completo"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={leadData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="email@exemplo.com"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label htmlFor="phone">Telefone *</Label>
                  <Input
                    id="phone"
                    value={leadData.phone}
                    onChange={(e) => handleInputChange('phone', e.target.value)}
                    placeholder="(11) 99999-9999"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label htmlFor="position">Cargo</Label>
                  <Input
                    id="position"
                    value={leadData.position}
                    onChange={(e) => handleInputChange('position', e.target.value)}
                    placeholder="Ex: Gerente de Marketing"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Informações da Empresa */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Building className="h-4 w-4" />
                Informações da Empresa
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="company">Empresa</Label>
                  <Input
                    id="company"
                    value={leadData.company}
                    onChange={(e) => handleInputChange('company', e.target.value)}
                    placeholder="Nome da empresa"
                    disabled={isLoading}
                  />
                </div>
                
                <div>
                  <Label htmlFor="value">Valor Estimado (R$)</Label>
                  <Input
                    id="value"
                    type="number"
                    value={leadData.value}
                    onChange={(e) => handleInputChange('value', e.target.value)}
                    placeholder="0,00"
                    disabled={isLoading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configurações do Lead */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Configurações
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="stage">Estágio Inicial *</Label>
                  <Select value={leadData.stage_id} onValueChange={(value) => handleInputChange('stage_id', value)} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um estágio" />
                    </SelectTrigger>
                    <SelectContent>
                      {funnelStages.map((stage) => (
                        <SelectItem key={stage.id} value={stage.id}>
                          <div className="flex items-center gap-2">
                            <div 
                              className="w-3 h-3 rounded-full" 
                              style={{ backgroundColor: stage.color }}
                            />
                            {stage.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="source">Origem do Lead</Label>
                  <Select value={leadData.source} onValueChange={(value) => handleInputChange('source', value)} disabled={isLoading}>
                    <SelectTrigger>
                      <SelectValue placeholder="Como chegou até nós?" />
                    </SelectTrigger>
                    <SelectContent>
                      {leadSources.map((source) => (
                        <SelectItem key={source} value={source}>
                          {source}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div>
                <Label htmlFor="notes">Observações</Label>
                <Textarea
                  id="notes"
                  value={leadData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Adicione observações sobre este lead..."
                  rows={3}
                  disabled={isLoading}
                />
              </div>
            </CardContent>
          </Card>

          {/* Botões de Ação */}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose} disabled={isLoading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={isLoading}>
              {isLoading ? 'Criando...' : 'Criar Lead'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};