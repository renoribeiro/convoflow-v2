import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useTags } from '@/hooks/useTags';
import { TagBadge } from './TagBadge';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

interface LeadTagsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  /** IDs das etiquetas já aplicadas ao lead. */
  currentTagIds: string[];
}

/**
 * Aplica/remove etiquetas de um lead específico (estilo "etiquetar conversa" do
 * WhatsApp). Salva o delta em contact_tags via cliente autenticado.
 */
export const LeadTagsDialog = ({
  open, onOpenChange, contactId, currentTagIds,
}: LeadTagsDialogProps) => {
  const { tags, isLoading } = useTags();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string[]>(currentTagIds);
  const [isSaving, setIsSaving] = useState(false);

  // Re-sincroniza ao abrir / quando as etiquetas do lead mudam.
  useEffect(() => {
    if (open) setSelected(currentTagIds);
  }, [open, currentTagIds]);

  const currentSet = useMemo(() => new Set(currentTagIds), [currentTagIds]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const isDirty =
    selected.length !== currentTagIds.length ||
    selected.some((id) => !currentSet.has(id));

  const toggle = (tagId: string) => {
    setSelected((prev) =>
      prev.includes(tagId) ? prev.filter((id) => id !== tagId) : [...prev, tagId],
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const toInsert = selected.filter((id) => !currentSet.has(id));
      const toDelete = currentTagIds.filter((id) => !selectedSet.has(id));

      if (toInsert.length > 0) {
        const { error } = await supabase
          .from('contact_tags')
          .insert(toInsert.map((tag_id) => ({ contact_id: contactId, tag_id })));
        if (error) throw error;
      }

      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('contact_tags')
          .delete()
          .eq('contact_id', contactId)
          .in('tag_id', toDelete);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['conversation'] });
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      toast.success('Etiquetas do lead atualizadas!');
      onOpenChange(false);
    } catch (error) {
      logger.error('Erro ao etiquetar lead', { error, contactId });
      toast.error('Erro ao atualizar etiquetas do lead');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Etiquetar lead</DialogTitle>
          <DialogDescription>
            Selecione as etiquetas que se aplicam a este contato.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[50vh] overflow-y-auto space-y-2 py-1">
          {isLoading ? (
            <>
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              Nenhuma etiqueta criada ainda. Use o botão "Etiquetas" no topo das Conversas.
            </p>
          ) : (
            tags.map((tag) => {
              const isOn = selectedSet.has(tag.id);
              return (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => toggle(tag.id)}
                  className={cn(
                    'w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                    isOn ? 'bg-accent border-ring' : 'hover:bg-accent/50',
                  )}
                >
                  <TagBadge name={tag.name} color={tag.color} />
                  {isOn && <Check className="h-4 w-4 text-foreground shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || !isDirty}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
