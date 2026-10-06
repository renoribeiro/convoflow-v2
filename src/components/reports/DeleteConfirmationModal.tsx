import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useState } from 'react';

interface DeleteConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  template: any;
}

export function DeleteConfirmationModal({ isOpen, onClose, onConfirm, template }: DeleteConfirmationModalProps) {
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      // O erro será tratado pela função onConfirm
    } finally {
      setLoading(false);
    }
  };

  if (!template) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Confirmar Exclusão
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  Esta ação não pode ser desfeita!
                </p>
                <p className="text-sm text-muted-foreground">
                  Você está prestes a excluir permanentemente o template:
                </p>
              </div>
            </div>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">{template.name}</span>
              <Badge variant="outline">{template.type}</Badge>
            </div>
            
            {template.description && (
              <p className="text-sm text-muted-foreground">
                {template.description}
              </p>
            )}
            
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span>Criado em: {new Date(template.created_at).toLocaleDateString('pt-BR')}</span>
              {template.usage_count && (
                <span>Usado {template.usage_count} vez(es)</span>
              )}
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-800">Impactos da exclusão:</p>
                <ul className="mt-1 text-amber-700 space-y-1">
                  <li>• O template será removido permanentemente</li>
                  <li>• Relatórios baseados neste template podem ser afetados</li>
                  <li>• Configurações e seções serão perdidas</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button 
            variant="outline" 
            onClick={onClose}
            disabled={loading}
          >
            <X className="h-4 w-4 mr-2" />
            Cancelar
          </Button>
          <Button 
            variant="destructive" 
            onClick={handleConfirm}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            {loading ? 'Excluindo...' : 'Excluir Template'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}