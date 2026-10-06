import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { 
  FileText, 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Users, 
  Calendar,
  Eye,
  Settings,
  Tag,
  Clock
} from 'lucide-react';

interface ViewTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
}

const getIconByType = (type: string) => {
  const icons = {
    chart: BarChart3,
    table: FileText,
    dashboard: TrendingUp,
    financial: DollarSign,
    user: Users,
  };
  return icons[type as keyof typeof icons] || FileText;
};

const getColorByCategory = (category: string) => {
  const colors = {
    performance: 'bg-blue-100 text-blue-800',
    financeiro: 'bg-green-100 text-green-800',
    marketing: 'bg-purple-100 text-purple-800',
    trafego: 'bg-orange-100 text-orange-800',
    conversao: 'bg-red-100 text-red-800',
  };
  return colors[category as keyof typeof colors] || 'bg-gray-100 text-gray-800';
};

const translateCategory = (category: string) => {
  const translations = {
    performance: 'Performance',
    financeiro: 'Financeiro',
    marketing: 'Marketing',
    trafego: 'Tráfego',
    conversao: 'Conversão',
  };
  return translations[category as keyof typeof translations] || category;
};

export function ViewTemplateModal({ isOpen, onClose, template }: ViewTemplateModalProps) {
  if (!template) return null;

  const IconComponent = getIconByType(template.type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconComponent className="h-5 w-5" />
            Detalhes do Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5" />
                Informações Básicas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Nome</label>
                  <p className="mt-1 font-medium">{template.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Tipo</label>
                  <div className="mt-1 flex items-center gap-2">
                    <IconComponent className="h-4 w-4" />
                    <span className="capitalize">{template.type}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-500">Descrição</label>
                <p className="mt-1 text-gray-700">{template.description || 'Nenhuma descrição disponível'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">Categoria</label>
                  <div className="mt-1">
                    <Badge className={getColorByCategory(template.category)}>
                      <Tag className="w-3 h-3 mr-1" />
                      {translateCategory(template.category)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500">Visibilidade</label>
                  <div className="mt-1">
                    <Badge variant={template.is_public ? 'default' : 'secondary'}>
                      <Eye className="w-3 h-3 mr-1" />
                      {template.is_public ? 'Público' : 'Privado'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Estatísticas de Uso */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="h-5 w-5" />
                Estatísticas de Uso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{template.usage_count || 0}</div>
                  <div className="text-sm text-blue-600">Usos Totais</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{template.sections?.length || 0}</div>
                  <div className="text-sm text-green-600">Seções</div>
                </div>
                <div className="text-center p-4 bg-purple-50 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600">
                    {template.created_at ? format(new Date(template.created_at), 'dd/MM/yyyy', { locale: ptBR }) : 'N/A'}
                  </div>
                  <div className="text-sm text-purple-600">Criado em</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Configurações do Template */}
          {template.config && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Settings className="h-5 w-5" />
                  Configurações
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(template.config).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0">
                      <span className="text-sm font-medium text-gray-600 capitalize">
                        {key.replace(/_/g, ' ')}
                      </span>
                      <span className="text-sm text-gray-800">
                        {typeof value === 'boolean' ? (value ? 'Sim' : 'Não') : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Seções Configuradas */}
          {template.sections && template.sections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  Seções Configuradas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {template.sections.map((section: any, index: number) => (
                    <div key={index} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-gray-800">{section.title || `Seção ${index + 1}`}</h4>
                        <Badge variant="outline">{section.type || 'Padrão'}</Badge>
                      </div>
                      {section.description && (
                        <p className="text-sm text-gray-600">{section.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Informações de Sistema */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Clock className="h-5 w-5" />
                Informações do Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <label className="font-medium text-gray-500">ID do Template</label>
                  <p className="mt-1 font-mono text-gray-700">{template.id}</p>
                </div>
                <div>
                  <label className="font-medium text-gray-500">Última Atualização</label>
                  <p className="mt-1 text-gray-700">
                    {template.updated_at 
                      ? format(new Date(template.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })
                      : 'N/A'
                    }
                  </p>
                </div>
                {template.created_by && (
                  <div>
                    <label className="font-medium text-gray-500">Criado por</label>
                    <p className="mt-1 text-gray-700">{template.created_by}</p>
                  </div>
                )}
                {template.template_type && (
                  <div>
                    <label className="font-medium text-gray-500">Tipo de Template</label>
                    <p className="mt-1 text-gray-700 capitalize">{template.template_type}</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}