import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Save, X, Plus, Trash2, Edit } from 'lucide-react';

interface EditTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  template: any;
  onSave?: (updatedTemplate: any) => void;
}

const templateTypes = [
  { value: 'chart', label: 'Gráfico' },
  { value: 'table', label: 'Tabela' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'financial', label: 'Financeiro' },
  { value: 'user', label: 'Usuário' },
];

const templateCategories = [
  { value: 'performance', label: 'Performance' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'trafego', label: 'Tráfego' },
  { value: 'conversao', label: 'Conversão' },
];

export function EditTemplateModal({ isOpen, onClose, template, onSave }: EditTemplateModalProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    type: '',
    category: '',
    is_public: false,
    config: {},
    sections: [] as any[]
  });

  useEffect(() => {
    if (template && isOpen) {
      setFormData({
        name: template.name || '',
        description: template.description || '',
        type: template.type || '',
        category: template.category || '',
        is_public: template.is_public || false,
        config: template.config || {},
        sections: template.sections || []
      });
    }
  }, [template, isOpen]);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      toast({
        title: "Erro de validação",
        description: "O nome do template é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    if (!formData.type) {
      toast({
        title: "Erro de validação",
        description: "O tipo do template é obrigatório.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Simular salvamento (aqui você implementaria a lógica real de salvamento)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updatedTemplate = {
        ...template,
        ...formData,
        updated_at: new Date().toISOString()
      };

      if (onSave) {
        onSave(updatedTemplate);
      }

      toast({
        title: "Template atualizado",
        description: `O template "${formData.name}" foi atualizado com sucesso.`,
      });

      onClose();
    } catch (error) {
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as alterações do template.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const addSection = () => {
    setFormData(prev => ({
      ...prev,
      sections: [...prev.sections, {
        id: Date.now().toString(),
        title: '',
        description: '',
        type: 'default'
      }]
    }));
  };

  const removeSection = (index: number) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== index)
    }));
  };

  const updateSection = (index: number, field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      sections: prev.sections.map((section, i) => 
        i === index ? { ...section, [field]: value } : section
      )
    }));
  };

  if (!template) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Edit className="h-5 w-5" />
            Editar Template
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Informações Básicas */}
          <Card>
            <CardHeader>
              <CardTitle>Informações Básicas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome do Template *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Digite o nome do template"
                    disabled={loading}
                  />
                </div>
                <div>
                  <Label htmlFor="type">Tipo *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, type: value }))}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione o tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Descrição</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descreva o propósito e funcionalidade do template"
                  rows={3}
                  disabled={loading}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="category">Categoria</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                    disabled={loading}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {templateCategories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2 pt-6">
                  <Switch
                    id="is_public"
                    checked={formData.is_public}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_public: checked }))}
                    disabled={loading}
                  />
                  <Label htmlFor="is_public">Template Público</Label>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Seções do Template */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Seções do Template</CardTitle>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addSection}
                  disabled={loading}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Adicionar Seção
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {formData.sections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nenhuma seção configurada</p>
                  <p className="text-sm">Clique em "Adicionar Seção" para começar</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {formData.sections.map((section, index) => (
                    <div key={section.id || index} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <Badge variant="outline">Seção {index + 1}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeSection(index)}
                          disabled={loading}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Título da Seção</Label>
                          <Input
                            value={section.title || ''}
                            onChange={(e) => updateSection(index, 'title', e.target.value)}
                            placeholder="Digite o título da seção"
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <Label>Tipo da Seção</Label>
                          <Select
                            value={section.type || 'default'}
                            onValueChange={(value) => updateSection(index, 'type', value)}
                            disabled={loading}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default">Padrão</SelectItem>
                              <SelectItem value="chart">Gráfico</SelectItem>
                              <SelectItem value="table">Tabela</SelectItem>
                              <SelectItem value="text">Texto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="mt-3">
                        <Label>Descrição da Seção</Label>
                        <Textarea
                          value={section.description || ''}
                          onChange={(e) => updateSection(index, 'description', e.target.value)}
                          placeholder="Descreva o conteúdo desta seção"
                          rows={2}
                          disabled={loading}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Salvando...' : 'Salvar Alterações'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}