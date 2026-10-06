import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';

interface Stage {
  id: string;
  name: string;
  color: string;
  order: number;
}

interface EditStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: Stage | null;
  onStageUpdated?: () => void;
}

const colorOptions = [
  { name: 'Azul', class: 'bg-blue-100 text-blue-800', value: 'blue' },
  { name: 'Verde', class: 'bg-green-100 text-green-800', value: 'green' },
  { name: 'Amarelo', class: 'bg-yellow-100 text-yellow-800', value: 'yellow' },
  { name: 'Laranja', class: 'bg-orange-100 text-orange-800', value: 'orange' },
  { name: 'Roxo', class: 'bg-purple-100 text-purple-800', value: 'purple' },
  { name: 'Rosa', class: 'bg-pink-100 text-pink-800', value: 'pink' },
];

export const EditStageModal = ({ isOpen, onClose, stage, onStageUpdated }: EditStageModalProps) => {
  const [stageName, setStageName] = useState('');
  const [stageColor, setStageColor] = useState('blue');
  const { toast } = useToast();

  // Mutation para atualizar estágio
  const updateStageMutation = useSupabaseMutation({
    table: 'funnel_stages',
    operation: 'update',
    invalidateQueries: [['funnel_stages'], ['contacts']],
    onSuccess: () => {
      toast({ 
        title: 'Sucesso!', 
        description: 'Estágio atualizado com sucesso!' 
      });
      onStageUpdated?.();
      onClose();
    },
    onError: (error) => {
      toast({ 
        title: 'Erro', 
        description: error.message || 'Erro ao atualizar estágio', 
        variant: 'destructive' 
      });
    }
  });

  // Atualizar campos quando o estágio mudar
  useEffect(() => {
    if (stage) {
      setStageName(stage.name);
      setStageColor(stage.color || 'blue');
    }
  }, [stage]);

  const handleSave = () => {
    if (!stage || !stageName.trim()) {
      toast({
        title: 'Erro',
        description: 'Nome do estágio é obrigatório',
        variant: 'destructive'
      });
      return;
    }

    updateStageMutation.mutate({
      data: {
        name: stageName.trim(),
        color: stageColor
      },
      options: {
        filter: {
          column: 'id',
          operator: 'eq',
          value: stage.id
        }
      }
    });
  };

  const handleClose = () => {
    if (stage) {
      setStageName(stage.name);
      setStageColor(stage.color || 'blue');
    }
    onClose();
  };

  if (!stage) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Estágio</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="stage-name">Nome do Estágio</Label>
                  <Input
                    id="stage-name"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    placeholder="Ex: Qualificado"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label>Cor do Estágio</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {colorOptions.map((color) => (
                      <Badge
                        key={color.value}
                        className={`cursor-pointer ${color.class} ${
                          stageColor === color.value ? 'ring-2 ring-primary' : ''
                        }`}
                        onClick={() => setStageColor(color.value)}
                      >
                        {color.name}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSave}
              disabled={updateStageMutation.isPending || !stageName.trim()}
            >
              {updateStageMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};