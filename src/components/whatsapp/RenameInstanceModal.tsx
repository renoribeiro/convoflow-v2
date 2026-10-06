import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Pencil } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { instanceNameSchema } from '@/lib/validations/whatsappInstance';

/**
 * Renomeia o rótulo de uma instância.
 *
 * O que muda é SÓ `whatsapp_instances.name`. A `instance_key` é a identidade da
 * instância — é ela que o servidor Evolution conhece, que chega nos webhooks e
 * que amarra conversas, campanhas e chatbots. Trocá-la seria criar uma
 * instância órfã no servidor e outra vazia aqui. Por isso o campo nem aparece.
 *
 * Quem pode: quem tem `whatsapp.configure` (gerente e gestor). A regra real é a
 * policy `whatsapp_instances_tenant_update` no banco; o botão que abre este
 * modal só se esconde de quem não pode, para não oferecer o que vai falhar.
 */

export interface RenameableInstance {
  id: string;
  name: string;
  instance_key: string;
  /** 'instagram' troca os textos: conta do Instagram não é "instância" nem tem "chave". */
  provider?: string | null;
}

/** Textos por canal. Os do WhatsApp são os de sempre, palavra por palavra. */
export const RENAME_TEXTS = {
  whatsapp: {
    title: 'Renomear instância',
    description: 'Muda só o nome que aparece nas telas. A conexão, as conversas e o número continuam os mesmos.',
    label: 'Nome da Instância',
    duplicate: 'Já existe uma instância com esse nome nesta Conta.',
    forbidden: 'Você não tem permissão para renomear esta instância.',
    renamed: (name: string) => `Agora a instância se chama "${name}".`,
  },
  instagram: {
    title: 'Renomear conta do Instagram',
    description: 'Muda só o nome que aparece nas telas. A conexão, as conversas e o @ da conta continuam os mesmos.',
    label: 'Nome da conta',
    duplicate: 'Já existe uma conexão com esse nome nesta Conta.',
    forbidden: 'Você não tem permissão para renomear esta conta.',
    renamed: (name: string) => `Agora a conta se chama "${name}".`,
  },
} as const;

interface RenameInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: RenameableInstance;
  /** Nomes das outras instâncias da mesma Conta, para barrar duplicata. */
  siblingNames?: string[];
  onSuccess?: () => void;
}

export const RenameInstanceModal = ({
  open,
  onOpenChange,
  instance,
  siblingNames = [],
  onSuccess,
}: RenameInstanceModalProps) => {
  const [name, setName] = useState(instance.name);
  const [saving, setSaving] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isInstagram = instance.provider === 'instagram';
  const texts = RENAME_TEXTS[isInstagram ? 'instagram' : 'whatsapp'];

  // Reabrir para outra instância tem que mostrar o nome dela, não o anterior.
  useEffect(() => {
    if (open) {
      setName(instance.name);
      setFieldError(null);
    }
  }, [open, instance.id, instance.name]);

  const normalizado = (s: string) => s.trim().toLocaleLowerCase('pt-BR');
  const semMudanca = name.trim() === instance.name;

  const handleSave = async () => {
    const parsed = instanceNameSchema.safeParse(name);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message || 'Nome inválido');
      return;
    }

    // Dois números com o mesmo nome na mesma Conta viram adivinhação no seletor
    // de Conversas e na hora de escolher a linha da campanha. Barrar aqui é
    // mais barato que explicar depois.
    const colide = siblingNames.some((n) => normalizado(n) === normalizado(parsed.data));
    if (colide) {
      setFieldError(texts.duplicate);
      return;
    }

    setSaving(true);
    try {
      // `.select()` no update: sem ele o PostgREST devolve 204 mesmo quando o
      // RLS descartou a linha, e a tela diria "renomeado" sem ter renomeado.
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .update({ name: parsed.data, updated_at: new Date().toISOString() })
        .eq('id', instance.id)
        .select('id')
        .maybeSingle();

      if (error) throw new Error(error.message);
      if (!data) {
        throw new Error(texts.forbidden);
      }

      queryClient.invalidateQueries({ queryKey: ['whatsapp-instances'] });
      toast({ title: 'Renomeado', description: texts.renamed(parsed.data) });
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Não foi possível renomear.';
      logger.error('Falha ao renomear instância', { instanceId: instance.id, error: message });
      toast({ title: 'Erro', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4" />
            {texts.title}
          </DialogTitle>
          <DialogDescription className="text-xs">{texts.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="rename-instance">{texts.label}</Label>
          <Input
            id="rename-instance"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (fieldError) setFieldError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !saving && !semMudanca) handleSave();
            }}
            disabled={saving}
            autoFocus
            maxLength={50}
          />
          {fieldError ? (
            <p className="text-xs text-destructive">{fieldError}</p>
          ) : isInstagram ? null : (
            <p className="text-xs text-muted-foreground">
              Chave técnica: <code className="px-1">{instance.instance_key}</code> (essa não muda).
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || semMudanca}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameInstanceModal;
