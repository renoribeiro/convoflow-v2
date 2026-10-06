
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ComingSoonButton } from '@/components/shared/ComingSoonButton';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { FileText, BarChart3, TrendingUp, DollarSign, Users, Download, Eye, Settings, AlertCircle, MoreVertical, Edit, Trash2 } from 'lucide-react';
import { useReportTemplates, useDeleteReportTemplate } from '@/hooks/useReports';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { NewReportModal } from './NewReportModal';
import { ViewTemplateModal } from './ViewTemplateModal';
import { EditTemplateModal } from './EditTemplateModal';
import { DeleteConfirmationModal } from './DeleteConfirmationModal';

// Mapeamento de ícones por tipo de relatório
const getIconByType = (type: string) => {
  switch (type) {
    case 'chart': return BarChart3;
    case 'table': return FileText;
    case 'metric': return TrendingUp;
    case 'dashboard': return Users;
    default: return FileText;
  }
};

// Mapeamento de cores por categoria
const getColorByCategory = (category: string) => {
  switch (category?.toLowerCase()) {
    case 'performance': return 'bg-blue-500';
    case 'financial':
    case 'financeiro': return 'bg-purple-500';
    case 'traffic':
    case 'tráfego': return 'bg-green-500';
    case 'conversion':
    case 'conversão': return 'bg-orange-500';
    case 'marketing': return 'bg-pink-500';
    case 'analytics': return 'bg-indigo-500';
    case 'crm': return 'bg-teal-500';
    default: return 'bg-gray-500';
  }
};

// Função para traduzir categorias para português
const translateCategory = (category: string) => {
  const translations: Record<string, string> = {
    'performance': 'Performance',
    'financial': 'Financeiro',
    'traffic': 'Tráfego',
    'conversion': 'Conversão',
    'marketing': 'Marketing',
    'analytics': 'Analytics',
    'crm': 'CRM'
  };
  return translations[category?.toLowerCase()] || category || 'Geral';
};

export const ReportTemplates = () => {
  const [selectedCategory, setSelectedCategory] = useState('Todos');
  const { toast } = useToast();
  const { tenant, loading: tenantLoading } = useTenant();
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [generateInitial, setGenerateInitial] = useState<any>(null);

  // Buscar todos os templates incluindo públicos
  const { data: templates = [], isLoading, error } = useReportTemplates({
    includePublic: true
  });
  
  // Considerar tanto o loading do tenant quanto dos templates
  const isLoadingData = tenantLoading || isLoading;
  
  // Mutations
  const deleteTemplateMutation = useDeleteReportTemplate();
  
  // Categorias disponíveis
  const categories = ['Todos', 'Performance', 'Financeiro', 'Marketing', 'Tráfego', 'Conversão'];
  
  // Mapeamento dos botões de filtro para o valor de `category` salvo no banco.
  const categoryMapping: Record<string, string> = {
    'Todos': 'all',
    'Performance': 'Performance',
    'Financeiro': 'Financeiro',
    'Marketing': 'Marketing',
    'Tráfego': 'Tráfego',
    'Conversão': 'Conversão'
  };
  
  const filteredTemplates = selectedCategory === 'Todos' 
    ? templates 
    : templates.filter(t => t.category === categoryMapping[selectedCategory]);

  // Gerar a partir de um template: abre o modal de Novo Relatório pré-preenchido
  // com a config do template, para o usuário completar destinatários e enviar.
  const handleGenerateReport = (template: any) => {
    const cfg = template.config || {};
    setGenerateInitial({
      name: template.name,
      description: template.description || '',
      type: cfg.reportType || 'general',
      format: cfg.format || 'pdf',
      metrics: Array.isArray(cfg.metrics) ? cfg.metrics : [],
      filters: { dateRange: cfg.dateRange || '30days', campaigns: [], contacts: [], status: [] },
      frequency: 'manual',
    });
    setGenerateModalOpen(true);
  };

  const handleViewTemplate = (template: any) => {
    setSelectedTemplate(template);
    setViewModalOpen(true);
  };

  const handleEditTemplate = (template: any) => {
    setSelectedTemplate(template);
    setEditModalOpen(true);
  };

  const handleSaveTemplate = (updatedTemplate: any) => {
    // TODO: Implementar lógica de salvamento real
    console.log('Template atualizado:', updatedTemplate);
    // Aqui você faria a chamada para a API para salvar as alterações
    // e depois atualizaria a lista de templates
  };

  const handleDeleteTemplate = (template: any) => {
    setSelectedTemplate(template);
    setDeleteModalOpen(true);
  };

  const confirmDeleteTemplate = async () => {
    if (!selectedTemplate) return;
    
    return new Promise<void>((resolve, reject) => {
      deleteTemplateMutation.mutate(selectedTemplate.id, {
        onSuccess: () => {
          toast({
            title: "Template excluído",
            description: `O template "${selectedTemplate.name}" foi excluído com sucesso.`,
          });
          resolve();
        },
        onError: (error) => {
          toast({
            title: "Erro ao excluir",
            description: "Não foi possível excluir o template.",
            variant: "destructive",
          });
          reject(error);
        }
      });
    });
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Erro ao carregar templates: {error.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Category Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map(category => (
          <Button
            key={category}
            variant={selectedCategory === category ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSelectedCategory(category)}
          >
            {category}
          </Button>
        ))}
      </div>

      {/* Loading State */}
      {isLoadingData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <Skeleton className="w-10 h-10 rounded-lg" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <div className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <div className="flex gap-1">
                    <Skeleton className="h-5 w-16" />
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-5 w-14" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-8 flex-1" />
                  <Skeleton className="h-8 w-10" />
                  <Skeleton className="h-8 w-10" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Templates Grid */}
      {!isLoadingData && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const IconComponent = getIconByType(template.type);
            const colorClass = getColorByCategory(template.category);
            
            return (
              <Card key={template.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${colorClass} rounded-lg flex items-center justify-center`}>
                        <IconComponent className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                        <Badge variant="outline" className="mt-1">
                          {translateCategory(template.category)}
                        </Badge>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {template.description || 'Sem descrição disponível'}
                  </p>
                  
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Tipo:</span>
                      <span className="font-medium capitalize">{template.type}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Criado em:</span>
                      <span className="font-medium">
                        {new Date(template.created_at).toLocaleDateString('pt-BR')}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Usos:</span>
                      <span className="font-medium">{template.usage_count || 0}</span>
                    </div>
                  </div>

                  {template.config?.sections && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Seções configuradas:</p>
                      <div className="flex flex-wrap gap-1">
                        {template.config.sections.slice(0, 3).map((section: any, index: number) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {section.title}
                          </Badge>
                        ))}
                        {template.config.sections.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{template.config.sections.length - 3} mais
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      onClick={() => handleGenerateReport(template)}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      Gerar
                    </Button>
                    <ComingSoonButton variant="outline" size="sm" motivo="Baixar modelo em breve">
                      <Download className="w-4 h-4" />
                    </ComingSoonButton>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="outline" 
                          size="sm"
                          disabled={deleteTemplateMutation.isPending}
                        >
                          <MoreVertical className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleViewTemplate(template)}>
                          <Eye className="w-4 h-4 mr-2" />
                          Visualizar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleEditTemplate(template)}>
                          <Edit className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteTemplate(template)}
                          className="text-red-600 focus:text-red-600"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Empty State */}
      {!isLoadingData && filteredTemplates.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum template encontrado</h3>
            <p className="text-muted-foreground mb-4">
              {selectedCategory === 'Todos' 
                ? 'Não há templates de relatórios criados ainda.' 
                : `Não há templates na categoria "${selectedCategory}".`
              }
            </p>
            <Button onClick={() => setSelectedCategory('Todos')}>
              Ver todos os templates
            </Button>
          </CardContent>
        </Card>
       )}
 
       {/* Gerar a partir de template → Novo Relatório pré-preenchido */}
       <NewReportModal
         isOpen={generateModalOpen}
         onClose={() => setGenerateModalOpen(false)}
         initialData={generateInitial}
       />

       {/* View Template Modal */}
       <ViewTemplateModal
        isOpen={viewModalOpen}
        onClose={() => setViewModalOpen(false)}
        template={selectedTemplate}
      />
      
      <EditTemplateModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        template={selectedTemplate}
        onSave={handleSaveTemplate}
      />
      
      <DeleteConfirmationModal
         isOpen={deleteModalOpen}
         onClose={() => setDeleteModalOpen(false)}
         onConfirm={confirmDeleteTemplate}
         template={selectedTemplate}
       />
     </div>
  );
};
