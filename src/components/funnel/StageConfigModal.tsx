
import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Edit, Trash2, GripVertical } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { useQueryClient } from '@tanstack/react-query';

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface StageConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const colorOptions = [
  { name: 'Azul', class: 'bg-blue-100 text-blue-800', value: 'blue' },
  { name: 'Verde', class: 'bg-green-100 text-green-800', value: 'green' },
  { name: 'Amarelo', class: 'bg-yellow-100 text-yellow-800', value: 'yellow' },
  { name: 'Laranja', class: 'bg-orange-100 text-orange-800', value: 'orange' },
  { name: 'Roxo', class: 'bg-purple-100 text-purple-800', value: 'purple' },
  { name: 'Rosa', class: 'bg-pink-100 text-pink-800', value: 'pink' },
];

const SortableStageItem = ({ stage, onEdit, onDelete }: { stage: Stage; onEdit: (stage: Stage) => void; onDelete: (stage: Stage) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: stage.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const colorClass = colorOptions.find(c => c.value === stage.color)?.class || 'bg-gray-100 text-gray-800';

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <Card className="mb-3">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div {...listeners} className="cursor-grab">
                <GripVertical className="w-4 h-4 text-muted-foreground" />
              </div>
              <Badge className={colorClass}>
                {stage.name}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => onEdit(stage)}>
                <Edit className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(stage)} aria-label={`Apagar a etapa ${stage.name}`}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export const StageConfigModal = ({ isOpen, onClose }: StageConfigModalProps) => {
  const [editingStage, setEditingStage] = useState<Stage | null>(null);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('blue');
  const { toast } = useToast();
  const { tenantId } = useTenant();
  const queryClient = useQueryClient();
  // Apagar etapa pede confirmação e diz para onde vão os contatos (achado 58
  // do checkup: a lixeira apagava na hora). contatos=null enquanto conta.
  const [apagarAlvo, setApagarAlvo] = useState<{ stage: Stage; contatos: number | null } | null>(null);

  // Buscar estágios do Supabase
  const { data: stagesData = [], isLoading, refetch } = useSupabaseQuery({
    table: 'funnel_stages',
    select: 'id, name, color, order',
    orderBy: [{ column: 'order', ascending: true }],
    enabled: isOpen
  });

  // Mutation para criar estágio
  const createStageMutation = useSupabaseMutation({
    table: 'funnel_stages',
    operation: 'insert',
    invalidateQueries: [['funnel_stages']],
    onSuccess: () => {
      toast({ title: 'Sucesso!', description: 'Estágio criado com sucesso!' });
      setNewStageName('');
      setNewStageColor('blue');
      refetch();
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Erro ao criar estágio', variant: 'destructive' });
    }
  });

  // Mutation para atualizar estágio
  const updateStageMutation = useSupabaseMutation({
    table: 'funnel_stages',
    operation: 'update',
    invalidateQueries: [['funnel_stages']],
    onSuccess: () => {
      toast({ title: 'Sucesso!', description: 'Estágio atualizado com sucesso!' });
      setEditingStage(null);
      refetch();
    },
    onError: () => {
      toast({ title: 'Erro', description: 'Erro ao atualizar estágio', variant: 'destructive' });
    }
  });

  // Mutation para deletar estágio
  const deleteStageMutation = useSupabaseMutation({
    table: 'funnel_stages',
    operation: 'delete',
    invalidateQueries: [['funnel_stages']],
    onSuccess: () => {
      toast({ title: 'Sucesso!', description: 'Estágio excluído com sucesso!' });
      refetch();
    },
    onError: (error: { code?: string } | null) => {
      // 23503: etapa com lead dentro (contacts.current_stage_id) ou usada numa
      // sequência de follow-up. O banco recusa de propósito.
      const description = error?.code === '23503'
        ? 'Esta etapa tem leads ou é usada numa sequência de follow-up. Mova os cards para outra etapa antes de excluir.'
        : 'Erro ao excluir estágio';
      toast({ title: 'Erro', description, variant: 'destructive' });
    }
  });

  const stages = stagesData.map(stage => ({
    id: stage.id,
    name: stage.name,
    color: stage.color || 'blue',
    order: stage.order
  }));

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = async (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = stages.findIndex((stage) => stage.id === active.id);
      const newIndex = stages.findIndex((stage) => stage.id === over.id);
      
      const reorderedStages = arrayMove(stages, oldIndex, newIndex);
      
      // Atualizar a ordem no banco, UMA etapa por vez, pelo id. Até 2026-10-26
      // esta chamada passava `id` a um hook que o ignorava: o UPDATE saía sem
      // filtro e, com o RLS da Loja, gravava a mesma ordem em todas as etapas,
      // com um aviso de "atualizado" por etapa (achado 59 do checkup).
      try {
        for (let i = 0; i < reorderedStages.length; i++) {
          const { error } = await supabase
            .from('funnel_stages')
            .update({ order: i + 1 })
            .eq('id', reorderedStages[i].id);
          if (error) throw error;
        }
        await queryClient.invalidateQueries({ queryKey: ['funnel_stages'] });
        refetch();
        toast({ title: 'Ordem das etapas salva' });
      } catch (error) {
        refetch();
        toast({ title: 'Não foi possível salvar a nova ordem', description: 'Tente arrastar de novo.', variant: 'destructive' });
      }
    }
  };

  const addStage = () => {
    if (newStageName.trim() && tenantId) {
      const maxOrder = Math.max(...stages.map(s => s.order), 0);
      createStageMutation.mutate({
        data: {
          name: newStageName.trim(),
          color: newStageColor,
          order: maxOrder + 1,
          tenant_id: tenantId
        }
      });
    }
  };

  const updateStage = (updatedStage: Stage) => {
    updateStageMutation.mutate({
      data: {
        name: updatedStage.name,
        color: updatedStage.color
      },
      options: {
        filter: {
          column: 'id',
          operator: 'eq',
          value: updatedStage.id
        }
      }
    });
  };

  const pedirParaApagar = async (stage: Stage) => {
    setApagarAlvo({ stage, contatos: null });
    const { count, error } = await supabase
      .from('contacts')
      .select('id', { count: 'exact', head: true })
      .eq('current_stage_id', stage.id);
    // Sem conseguir contar, trata como "tem contatos": melhor não oferecer
    // apagar do que deixar o banco recusar no meio.
    setApagarAlvo({ stage, contatos: error ? -1 : count ?? 0 });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Configurar Estágios do Funil</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Lista de estágios com drag & drop */}
          <div>
            <h3 className="text-lg font-semibold mb-4">Estágios Atuais</h3>
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={stages.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  {stages.map((stage) => (
                    <SortableStageItem
                      key={stage.id}
                      stage={stage}
                      onEdit={setEditingStage}
                      onDelete={pedirParaApagar}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>

          {/* Adicionar novo estágio */}
          <Card>
            <CardContent className="p-4">
              <h3 className="text-lg font-semibold mb-4">Adicionar Novo Estágio</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="stage-name">Nome do Estágio</Label>
                  <Input
                    id="stage-name"
                    value={newStageName}
                    onChange={(e) => setNewStageName(e.target.value)}
                    placeholder="Ex: Qualificado"
                  />
                </div>
                <div>
                  <Label htmlFor="stage-color">Cor</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {colorOptions.map((color) => (
                      <Badge
                        key={color.value}
                        className={`cursor-pointer ${color.class} ${
                          newStageColor === color.value ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setNewStageColor(color.value)}
                      >
                        {color.name}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="flex items-end">
                  <Button 
                    onClick={addStage} 
                    className="w-full"
                    disabled={createStageMutation.isPending || !newStageName.trim()}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    {createStageMutation.isPending ? 'Adicionando...' : 'Adicionar'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Modal de edição */}
          {editingStage && (
            <Card>
              <CardContent className="p-4">
                <h3 className="text-lg font-semibold mb-4">Editar Estágio</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="edit-stage-name">Nome</Label>
                    <Input
                      id="edit-stage-name"
                      value={editingStage.name}
                      onChange={(e) => setEditingStage({ ...editingStage, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Cor</Label>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {colorOptions.map((color) => (
                        <Badge
                          key={color.value}
                          className={`cursor-pointer ${color.class} ${
                            editingStage.color === color.value ? 'ring-2 ring-primary' : ''
                          }`}
                          onClick={() => setEditingStage({ ...editingStage, color: color.value })}
                        >
                          {color.name}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-end gap-2">
                    <Button 
                      onClick={() => updateStage(editingStage)} 
                      className="flex-1"
                      disabled={updateStageMutation.isPending}
                    >
                      {updateStageMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </Button>
                    <Button variant="outline" onClick={() => setEditingStage(null)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button onClick={onClose}>
              Salvar Configurações
            </Button>
          </div>
        </div>

        <ConfirmationDialog
          isOpen={!!apagarAlvo}
          onClose={() => setApagarAlvo(null)}
          onConfirm={() =>
            new Promise<void>((resolve, reject) => {
              if (!apagarAlvo) return resolve();
              deleteStageMutation.mutate(
                { data: {}, options: { filter: { column: 'id', operator: 'eq', value: apagarAlvo.stage.id } } },
                { onSuccess: () => resolve(), onError: (e) => reject(e) },
              );
            })
          }
          {...(apagarAlvo && apagarAlvo.contatos !== null && apagarAlvo.contatos !== 0
            ? {
                title: apagarAlvo.contatos > 0
                  ? `A etapa "${apagarAlvo.stage.name}" tem ${apagarAlvo.contatos} contato${apagarAlvo.contatos === 1 ? '' : 's'}`
                  : `Não deu para conferir a etapa "${apagarAlvo.stage.name}"`,
                description: apagarAlvo.contatos > 0
                  ? 'Antes de apagar, leve esses contatos para outra etapa: feche esta janela e, no quadro do funil, arraste cada cartão para a coluna certa. O sistema não apaga uma etapa com contatos dentro.'
                  : 'Não foi possível contar os contatos desta etapa agora. Feche e tente de novo em instantes.',
                apenasAviso: true,
                cancelText: 'Entendi',
              }
            : {
                title: `Apagar a etapa "${apagarAlvo?.stage.name ?? ''}"?`,
                description: apagarAlvo?.contatos === null
                  ? 'Conferindo se há contatos nesta etapa...'
                  : 'A etapa sai do funil. Nenhum contato está nela agora. Se ela for usada numa sequência de follow up, o sistema avisa e não apaga.',
                reversivel: false,
                comoDesfazer: undefined,
                confirmText: 'Apagar etapa',
                variant: 'destructive' as const,
                isLoading: apagarAlvo?.contatos === null || deleteStageMutation.isPending,
              })}
        />
      </DialogContent>
    </Dialog>
  );
};
