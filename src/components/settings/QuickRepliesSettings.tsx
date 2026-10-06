import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Loader2, Pencil, Plus, Search, Trash2, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { useQuickReplies, type QuickReply } from '@/hooks/useQuickReplies';

const MAX_CONTENT = 4096;
const MAX_NAME = 60;

/** Remove acento para a busca casar "saudacao" com "Saudação". */
function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function Autoria({ reply }: { reply: QuickReply }) {
  const criador = reply.created_by_name?.trim();
  const editor = reply.updated_by_name?.trim();
  // Editado depois de criado, e por outra pessoa: é o único caso em que mostrar
  // os dois nomes acrescenta informação.
  const houveEdicao = reply.updated_at !== reply.created_at && editor && editor !== criador;

  return (
    <p className="text-xs text-muted-foreground">
      {criador ? `Criado por ${criador}` : 'Criado pela Loja'}
      {houveEdicao && ` · Editado por ${editor}`}
    </p>
  );
}

/**
 * Respostas rápidas da Loja — criar, editar, apagar e buscar.
 *
 * TODO CARGO edita, por decisão de produto: quem atende o dia inteiro é quem
 * sabe qual trecho falta. Não há capability no meio, nem aqui nem no RLS
 * (`quick_replies_tenant_all` só compara a Conta).
 *
 * As duas proteções que existem são baratas e existem justamente PORQUE a
 * biblioteca é compartilhada: apagar pede confirmação nomeando a resposta, e a
 * lista mostra quem criou e quem editou por último. Os nomes vêm gravados na
 * própria linha (`created_by_name`), carimbados pelo gatilho no banco — o RLS
 * de `profiles` não deixaria o atendente resolver o nome de um colega na
 * leitura.
 */
export const QuickRepliesSettings = () => {
  const { quickReplies, isLoading, criar, atualizar, remover } = useQuickReplies();

  const [busca, setBusca] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [emEdicao, setEmEdicao] = useState<QuickReply | null>(null);
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [paraApagar, setParaApagar] = useState<QuickReply | null>(null);

  const filtradas = useMemo(() => {
    const termo = normalizar(busca.trim());
    if (!termo) return quickReplies;
    return quickReplies.filter(
      (r) => normalizar(r.name).includes(termo) || normalizar(r.content).includes(termo),
    );
  }, [quickReplies, busca]);

  const abrirNova = () => {
    setEmEdicao(null);
    setName('');
    setContent('');
    setFormOpen(true);
  };

  const abrirEdicao = (reply: QuickReply) => {
    setEmEdicao(reply);
    setName(reply.name);
    setContent(reply.content);
    setFormOpen(true);
  };

  const salvando = criar.isPending || atualizar.isPending;
  const podeSalvar = name.trim().length > 0 && content.trim().length > 0 && !salvando;

  const handleSalvar = async () => {
    if (!podeSalvar) return;
    try {
      if (emEdicao) {
        await atualizar.mutateAsync({ id: emEdicao.id, name, content });
        toast.success('Resposta rápida atualizada.');
      } else {
        await criar.mutateAsync({ name, content });
        toast.success('Resposta rápida criada.');
      }
      setFormOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    }
  };

  const handleApagar = async () => {
    if (!paraApagar) return;
    try {
      await remover.mutateAsync(paraApagar.id);
      toast.success(`"${paraApagar.name}" foi removida.`);
      setParaApagar(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível remover.');
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              Respostas rápidas
            </CardTitle>
            <CardDescription>
              Trechos que o time reaproveita durante o atendimento. Dentro da conversa, o
              atendente insere pelo botão de raio ou digitando &quot;/&quot; no campo vazio.
            </CardDescription>
          </div>
          <Button onClick={abrirNova}>
            <Plus className="w-4 h-4 mr-2" />
            Nova resposta
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {quickReplies.length > 0 && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por nome ou conteúdo..."
              className="pl-9"
              aria-label="Buscar respostas rápidas"
            />
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : quickReplies.length === 0 ? (
          <div className="text-center py-10 space-y-3">
            <Zap className="w-8 h-8 mx-auto text-muted-foreground" />
            <div className="space-y-1">
              <p className="font-medium">Nenhuma resposta rápida ainda</p>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Comece pelas mensagens que o time mais repete: saudação, horário de
                funcionamento, dados para pagamento. Você também pode salvar uma mensagem já
                enviada direto da conversa, pelo raio que aparece ao passar o mouse nela.
              </p>
            </div>
            <Button onClick={abrirNova} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              Criar a primeira
            </Button>
          </div>
        ) : filtradas.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Nenhuma resposta encontrada para &quot;{busca}&quot;.
          </p>
        ) : (
          <ul className="space-y-3">
            {filtradas.map((reply) => (
              <li
                key={reply.id}
                className="flex items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-sm">{reply.name}</p>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-3">
                    {reply.content}
                  </p>
                  <Autoria reply={reply} />
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => abrirEdicao(reply)}
                    aria-label={`Editar ${reply.name}`}
                  >
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setParaApagar(reply)}
                    aria-label={`Excluir ${reply.name}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {/* Criar / editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{emEdicao ? 'Editar resposta rápida' : 'Nova resposta rápida'}</DialogTitle>
            <DialogDescription>
              Fica disponível para toda a Loja, no compositor de qualquer conversa.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="qr-name">Nome</Label>
              <Input
                id="qr-name"
                value={name}
                maxLength={MAX_NAME}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex.: Horário de funcionamento"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="qr-content">Mensagem</Label>
              <Textarea
                id="qr-content"
                value={content}
                maxLength={MAX_CONTENT}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                className="resize-none"
                placeholder="Olá {first_name}! Atendemos de segunda a sexta, das 9h às 18h."
              />
              <p className="text-xs text-muted-foreground">
                Use <code className="px-1 rounded bg-muted">{'{first_name}'}</code>,{' '}
                <code className="px-1 rounded bg-muted">{'{name}'}</code>,{' '}
                <code className="px-1 rounded bg-muted">{'{phone}'}</code>,{' '}
                <code className="px-1 rounded bg-muted">{'{date}'}</code>, a mesma escrita de
                chave simples do chatbot e das automações. Na hora de inserir, o sistema troca
                pelos dados de quem está na conversa; o que ele não reconhecer fica como está.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button onClick={handleSalvar} disabled={!podeSalvar}>
              {salvando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {emEdicao ? 'Salvar alterações' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação de exclusão — nomeando a resposta, porque a biblioteca é
          compartilhada e quem apaga pode não ter sido quem criou. */}
      <AlertDialog open={!!paraApagar} onOpenChange={(open) => !open && setParaApagar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir &quot;{paraApagar?.name}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              A resposta sai para toda a Loja e não dá para desfazer.
              {paraApagar?.created_by_name
                ? ` Ela foi criada por ${paraApagar.created_by_name}.`
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={remover.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Sem isto o AlertDialog fecha antes do await e o toast de erro
                // apareceria sozinho, sem contexto nenhum na tela.
                e.preventDefault();
                void handleApagar();
              }}
              disabled={remover.isPending}
            >
              {remover.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};
