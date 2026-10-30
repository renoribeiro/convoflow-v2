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
    performance: 'bg-info/10 text-info',
    financeiro: 'bg-success/10 text-success',
    marketing: 'bg-accent/10 text-accent',
    trafego: 'bg-warning/10 text-warning',
    conversao: 'bg-destructive/10 text-destructive',
  };
  return colors[category as keyof typeof colors] || 'bg-muted text-foreground';
};

// O banco guarda a categoria em inglês (o construtor grava `performance`,
// `financial`...) ou em português (modelos antigos): as duas viram o mesmo nome.
const translateCategory = (category: string | null | undefined) => {
  const chave = (category ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const translations: Record<string, string> = {
    performance: 'Desempenho',
    financeiro: 'Financeiro',
    financial: 'Financeiro',
    marketing: 'Marketing',
    trafego: 'Tráfego',
    traffic: 'Tráfego',
    conversao: 'Conversão',
    conversion: 'Conversão',
  };
  return translations[chave] || category || 'Geral';
};

// Tipo gravado em inglês ("chart", "table"); a tela mostra o nome.
const NOME_DO_TIPO: Record<string, string> = {
  chart: 'Gráfico',
  table: 'Tabela',
  metric: 'Número',
  dashboard: 'Painel',
  financial: 'Financeiro',
  user: 'Pessoas',
  text: 'Texto',
};
const nomeDoTipo = (tipo: string | null | undefined) => (tipo && NOME_DO_TIPO[tipo]) || 'Relatório';

export function ViewTemplateModal({ isOpen, onClose, template }: ViewTemplateModalProps) {
  if (!template) return null;

  const IconComponent = getIconByType(template.type);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <IconComponent className="h-5 w-5" />
            Detalhes do modelo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5" />
                Sobre o modelo
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Nome</label>
                  <p className="mt-1 font-medium">{template.name}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Tipo</label>
                  <div className="mt-1 flex items-center gap-2">
                    <IconComponent className="h-4 w-4" />
                    <span>{nomeDoTipo(template.type)}</span>
                  </div>
                </div>
              </div>
              
              <div>
                <label className="text-sm font-medium text-muted-foreground">Descrição</label>
                <p className="mt-1 text-foreground">{template.description || 'Nenhuma descrição disponível'}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Categoria</label>
                  <div className="mt-1">
                    <Badge className={getColorByCategory(template.category)}>
                      <Tag className="w-3 h-3 mr-1" />
                      {translateCategory(template.category)}
                    </Badge>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground">Visibilidade</label>
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
                Uso
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-info/10 rounded-lg">
                  <div className="text-2xl font-bold text-info">{template.usage_count || 0}</div>
                  <div className="text-sm text-info">Vezes usado</div>
                </div>
                <div className="text-center p-4 bg-success/10 rounded-lg">
                  <div className="text-2xl font-bold text-success">{template.sections?.length || 0}</div>
                  <div className="text-sm text-success">Seções</div>
                </div>
                <div className="text-center p-4 bg-accent/10 rounded-lg">
                  <div className="text-2xl font-bold text-accent">
                    {template.created_at ? format(new Date(template.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}
                  </div>
                  <div className="text-sm text-accent">Criado em</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seções Configuradas */}
          {template.sections && template.sections.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5" />
                  Seções
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {template.sections.map((section: any, index: number) => (
                    <div key={index} className="p-3 bg-muted rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="font-medium text-foreground">{section.title || `Seção ${index + 1}`}</h4>
                        <Badge variant="outline">{nomeDoTipo(section.type)}</Badge>
                      </div>
                      {section.description && (
                        <p className="text-sm text-muted-foreground">{section.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Só o que ajuda a pessoa: id, autor (um código) e tipo interno saíram (achado 74). */}
          {template.updated_at && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Última atualização: {format(new Date(template.updated_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}