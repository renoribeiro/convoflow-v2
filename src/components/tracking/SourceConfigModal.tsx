
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Copy, Link } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TrafficSource {
  id?: string;
  name: string;
  type: 'organic' | 'paid' | 'social' | 'direct' | 'referral';
  isActive: boolean;
  leadsCount?: number;
  conversionRate?: number;
  lastActivity?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
}

interface SourceConfigModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  source?: TrafficSource | null;
  onSave: (source: TrafficSource) => void;
}

/**
 * Formulário de fonte de tráfego: nome, tipo, ativa e etiquetas UTM, com o link
 * montado para copiar.
 *
 * Até 2026-10-25 tinha também "Código de Rastreamento" (um script apontando
 * para um endereço que não existe) e "Webhook URL" (que nunca era gravado).
 * Saíram (achado 64 do checkup).
 */
export const SourceConfigModal = ({ open, onOpenChange, source, onSave }: SourceConfigModalProps) => {
  const { toast } = useToast();
  const [formData, setFormData] = useState<TrafficSource>({
    name: '',
    type: 'organic',
    isActive: true,
    utmSource: '',
    utmMedium: '',
    utmCampaign: '',
  });

  useEffect(() => {
    if (source) {
      setFormData(source);
    } else {
      setFormData({
        name: '',
        type: 'organic',
        isActive: true,
        utmSource: '',
        utmMedium: '',
        utmCampaign: '',
      });
    }
  }, [source, open]);

  const generateUTMParameters = () => {
    const baseUrl = 'https://seusite.com.br';
    const utmParams = new URLSearchParams({
      utm_source: formData.utmSource || '',
      utm_medium: formData.utmMedium || '',
      utm_campaign: formData.utmCampaign || '',
    });
    return `${baseUrl}?${utmParams.toString()}`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Link copiado",
    });
  };

  const handleSave = () => {
    if (!formData.name.trim()) {
      toast({
        title: "Confira o formulário",
        description: "Dê um nome à fonte.",
        variant: "destructive",
      });
      return;
    }

    // Sem aviso de sucesso aqui: quem avisa é o hook de gravação, depois que o
    // banco confirma (antes saía "criada com sucesso" ANTES de gravar).
    onSave(formData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {source ? 'Editar Fonte de Tráfego' : 'Nova Fonte de Tráfego'}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Configurações Básicas */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Configurações Básicas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Nome da Fonte</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="Ex: Facebook Ads - Campanha Black Friday"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="type">Tipo de Tráfego</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value: any) => setFormData({...formData, type: value})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="organic">Orgânico</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="social">Social</SelectItem>
                      <SelectItem value="direct">Direto</SelectItem>
                      <SelectItem value="referral">Referência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="active"
                    checked={formData.isActive}
                    onCheckedChange={(checked) => setFormData({...formData, isActive: checked})}
                  />
                  <Label htmlFor="active">Fonte ativa</Label>
                </div>
              </CardContent>
            </Card>

            {/* Parâmetros UTM */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Parâmetros UTM</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="utmSource">Origem (utm_source)</Label>
                  <Input
                    id="utmSource"
                    value={formData.utmSource}
                    onChange={(e) => setFormData({...formData, utmSource: e.target.value})}
                    placeholder="Ex: facebook, google, instagram"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="utmMedium">Meio (utm_medium)</Label>
                  <Input
                    id="utmMedium"
                    value={formData.utmMedium}
                    onChange={(e) => setFormData({...formData, utmMedium: e.target.value})}
                    placeholder="Ex: cpc, banner, email"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="utmCampaign">Campanha (utm_campaign)</Label>
                  <Input
                    id="utmCampaign"
                    value={formData.utmCampaign}
                    onChange={(e) => setFormData({...formData, utmCampaign: e.target.value})}
                    placeholder="Ex: black-friday-2024"
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Link com as etiquetas UTM */}
          <div className="space-y-4">
            {/* URL de Rastreamento */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Link className="w-4 h-4" />
                  URL de Rastreamento
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label>URL Gerada</Label>
                  <div className="flex items-center space-x-2">
                    <Input
                      value={generateUTMParameters()}
                      readOnly
                      className="bg-muted"
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => copyToClipboard(generateUTMParameters())}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    O começo do link é um exemplo: troque https://seusite.com.br pelo endereço da sua página antes de usar.
                  </p>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>

        <Separator />

        <div className="flex justify-end space-x-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave}>
            {source ? 'Atualizar' : 'Criar'} Fonte
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
