import { useState } from 'react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useTags, type Tag } from '@/hooks/useTags';
import { ColorPaletteInput, TAG_COLORS, isValidHex } from './ColorPaletteInput';
import { TagBadge } from './TagBadge';
import { toast } from 'sonner';

interface EtiquetasManagerSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Gerenciador independente de etiquetas (estilo WhatsApp Labels): criar, renomear,
 * recolorir e excluir. Aberto a partir do header da aba de Conversas.
 */
export const EtiquetasManagerSheet = ({ open, onOpenChange }: EtiquetasManagerSheetProps) => {
  const { tags, isLoading, createTag, updateTag, deleteTag } = useTags();

  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Tag | null>(null);

  const isEditing = editingId !== null;
  const isSaving = createTag.isPending || updateTag.isPending;

  const resetForm = () => {
    setName('');
    setColor(TAG_COLORS[0]);
    setEditingId(null);
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setName(tag.name);
    setColor(tag.color);
  };

  const handleSubmit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Dê um nome à etiqueta');
      return;
    }
    if (!isValidHex(color)) {
      toast.error('Cor inválida. Use o formato #RRGGBB');
      return;
    }

    try {
      if (isEditing && editingId) {
        await updateTag.mutateAsync({ id: editingId, name: trimmed, color });
      } else {
        await createTag.mutateAsync({ name: trimmed, color });
      }
      resetForm();
    } catch {
      // toast já tratado no hook
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      await deleteTag.mutateAsync(pendingDelete.id);
      if (editingId === pendingDelete.id) resetForm();
    } catch {
      // toast já tratado no hook
    } finally {
      setPendingDelete(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md flex flex-col">
        <SheetHeader>
          <SheetTitle>Etiquetas</SheetTitle>
          <SheetDescription>
            Crie e organize etiquetas para classificar seus leads.
          </SheetDescription>
        </SheetHeader>

        {/* Formulário de criação / edição */}
        <div className="space-y-3 border rounded-lg p-3 mt-4">
          <div>
            <Label htmlFor="tag-name">{isEditing ? 'Editar etiqueta' : 'Nova etiqueta'}</Label>
            <Input
              id="tag-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da etiqueta..."
              disabled={isSaving}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
            />
          </div>

          <ColorPaletteInput value={color} onChange={setColor} />

          {/* Pré-visualização */}
          {name.trim() && isValidHex(color) && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Prévia:</span>
              <TagBadge name={name.trim()} color={color} />
            </div>
          )}

          <div className="flex gap-2">
            <Button onClick={handleSubmit} disabled={isSaving} size="sm">
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isEditing ? (
                <Pencil className="h-4 w-4" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {isEditing ? 'Salvar' : 'Criar etiqueta'}
            </Button>
            {isEditing && (
              <Button onClick={resetForm} variant="ghost" size="sm" disabled={isSaving}>
                <X className="h-4 w-4" /> Cancelar
              </Button>
            )}
          </div>
        </div>

        {/* Lista de etiquetas */}
        <div className="flex-1 overflow-y-auto mt-4 space-y-2">
          {isLoading ? (
            <>
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </>
          ) : tags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              Nenhuma etiqueta ainda. Crie a primeira acima.
            </p>
          ) : (
            tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
              >
                <TagBadge name={tag.name} color={tag.color} />
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => startEdit(tag)}
                    aria-label={`Editar ${tag.name}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => setPendingDelete(tag)}
                    aria-label={`Excluir ${tag.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </SheetContent>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir etiqueta?</AlertDialogTitle>
            <AlertDialogDescription>
              A etiqueta <strong>{pendingDelete?.name}</strong> será removida de todos os leads
              que a possuem. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTag.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmDelete();
              }}
              disabled={deleteTag.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTag.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
};
