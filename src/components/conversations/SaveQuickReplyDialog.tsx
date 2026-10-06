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
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useQuickReplies } from '@/hooks/useQuickReplies';

/** Igual ao limite do compositor: uma resposta que não caberia numa mensagem não serve. */
const MAX_CONTENT = 4096;
const MAX_NAME = 60;

interface SaveQuickReplyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Texto da mensagem que originou o salvamento. */
  initialContent: string;
}

/**
 * "Salvar como resposta rápida" a partir de uma mensagem já enviada.
 *
 * É assim que uma biblioteca de respostas nasce de verdade: o atendente percebe
 * que digitou a mesma coisa pela terceira vez. Pedir que ele vá até
 * Configurações e redigite tudo é a diferença entre a biblioteca existir e não
 * existir.
 *
 * O corpo vem preenchido mas EDITÁVEL de propósito — é o momento certo de
 * trocar "Oi Helena" por "Oi {first_name}" e tornar o trecho reutilizável.
 */
export function SaveQuickReplyDialog({
  open,
  onOpenChange,
  initialContent,
}: SaveQuickReplyDialogProps) {
  const { criar } = useQuickReplies();
  const [name, setName] = useState('');
  const [content, setContent] = useState(initialContent);

  // O diálogo é montado uma vez e reaproveitado para cada mensagem: sem isto, a
  // segunda vez abriria com o texto da primeira.
  useEffect(() => {
    if (open) {
      setName('');
      setContent(initialContent);
    }
  }, [open, initialContent]);

  const nomeOk = name.trim().length > 0;
  const conteudoOk = content.trim().length > 0;
  const podeSalvar = nomeOk && conteudoOk && !criar.isPending;

  const handleSave = async () => {
    if (!podeSalvar) return;
    try {
      await criar.mutateAsync({ name, content });
      toast.success('Resposta rápida salva. Já está disponível no botão de raio.');
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4" />
            Salvar como resposta rápida
          </DialogTitle>
          <DialogDescription>
            Fica disponível para toda a Loja, no botão de raio do compositor e pelo atalho
            &quot;/&quot;.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="quick-reply-name">Nome</Label>
            <Input
              id="quick-reply-name"
              value={name}
              maxLength={MAX_NAME}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Horário de funcionamento"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              É por este nome que você encontra a resposta na busca.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="quick-reply-content">Mensagem</Label>
            <Textarea
              id="quick-reply-content"
              value={content}
              maxLength={MAX_CONTENT}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              className="resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Aproveite para trocar o nome do cliente por{' '}
              <code className="px-1 rounded bg-muted">{'{first_name}'}</code>: na hora de
              inserir, o sistema coloca o nome de quem está na conversa.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={criar.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={!podeSalvar}>
            {criar.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
