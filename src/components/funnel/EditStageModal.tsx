import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useSupabaseMutation } from '@/hooks/useSupabaseMutation';
import { useToast } from '@/hooks/use-toast';
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';
import { CORES_DE_ETAPA } from '@/lib/funnel/corDaEtapa';

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

// Uma lista só de cores de etapa (src/lib/funnel/corDaEtapa.ts, achado 54).
const colorOptions = CORES_DE_ETAPA;

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
        description: 'Etapa atualizada.' 
      });
      onStageUpdated?.();
      onClose();
    },
    onError: (error) => {
      toast({ 
        title: 'Não deu certo', 
        description: motivoDoErro(error), 
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
        title: 'Não deu certo',
        description: 'Dê um nome à etapa.',
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
          <DialogTitle>Editar etapa</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Card>
            <CardContent className="p-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="stage-name">Nome da etapa</Label>
                  <Input
                    id="stage-name"
                    value={stageName}
                    onChange={(e) => setStageName(e.target.value)}
                    placeholder="Ex: Qualificado"
                    className="mt-1"
                  />
                </div>
                
                <div>
                  <Label>Cor da etapa</Label>
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