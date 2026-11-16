import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { CLASSES_DE_SITUACAO } from '@/components/shared/StatusBadge';
import { HistoricoDoAviso } from '@/components/settings/HistoricoDoAviso';
import { useToast } from '@/hooks/use-toast';
import {
  CAMPOS_DO_LEAD_NOVO,
  TODAS_AS_LOJAS,
  WEBHOOK_EVENT_TYPES,
  fraseDoTeste,
  rotuloDoEvento,
  validateWebhookForm,
} from '@/lib/webhooks';
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';
import {
  useAvisos,
  useLojasDosAvisos,
  useMexerNosAvisos,
  type AvisoParaSistema,
} from '@/hooks/useAvisos';
import { Settings, Webhook, Copy, Send, Store } from 'lucide-react';

interface FormDoAviso {
  name: string;
  url: string;
  events: string[];
  secret: string;
  active: boolean;
  loja: string;
}

const FORM_VAZIO: FormDoAviso = { name: '', url: '', events: [], secret: '', active: true, loja: '' };

function frase(err: unknown): string {
  // "Nada foi gravado" vem do próprio gancho, já em português.
  if (err instanceof Error && err.message.startsWith('Nada foi gravado')) return err.message;
  return motivoDoErro(err);
}

export const IntegrationSettings = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { lojas, escolhe, lojaAberta, carregando: lojasCarregando } = useLojasDosAvisos();
  const { data: avisos = [], isLoading: avisosCarregando } = useAvisos(lojas);
  const { criar, salvar, remover, testar } = useMexerNosAvisos();

  const [form, setForm] = useState<FormDoAviso>(FORM_VAZIO);
  const [editando, setEditando] = useState<AvisoParaSistema | null>(null);
  const [removerAlvo, setRemoverAlvo] = useState<AvisoParaSistema | null>(null);
  const [testes, setTestes] = useState<Record<string, { aceito: boolean; texto: string }>>({});
  const [testando, setTestando] = useState<string | null>(null);

  // A Loja do formulário começa na Loja aberta no topo; com a Conta aberta,
  // em Todas as Lojas (ou na única Loja).
  const lojaPadrao = lojaAberta ?? (lojas.length > 1 ? TODAS_AS_LOJAS : lojas[0]?.id ?? '');
  useEffect(() => {
    setForm((f) => (f.loja ? f : { ...f, loja: lojaPadrao }));
  }, [lojaPadrao]);

  const nomeDaLoja = (id: string) => lojas.find((l) => l.id === id)?.name ?? '';
  const mostrarLoja = escolhe && lojas.length > 0;

  const limpar = () => {
    setForm({ ...FORM_VAZIO, loja: lojaPadrao });
    setEditando(null);
  };

  const handleSalvar = async () => {
    const validation = validateWebhookForm({ ...form, active: form.active });
    if (!validation.valid) {
      toast({ title: 'Confira o formulário', description: validation.error, variant: 'destructive' });
      return;
    }
    const dados = {
      name: form.name.trim(),
      url: form.url.trim(),
      events: form.events,
      secret: form.secret || null,
      is_active: form.active,
    };
    try {
      if (editando) {
        await salvar.mutateAsync({ id: editando.id, dados });
        toast({ title: 'Aviso salvo' });
      } else {
        const destino = form.loja === TODAS_AS_LOJAS ? lojas.map((l) => l.id) : [form.loja || lojas[0]?.id].filter(Boolean) as string[];
        if (destino.length === 0) {
          toast({ title: 'Escolha a Loja', description: 'O aviso fica numa Loja. Escolha em "Loja".', variant: 'destructive' });
          return;
        }
        await criar.mutateAsync({ lojas: destino, dados });
        toast({
          title: destino.length > 1 ? `Aviso criado em ${destino.length} Lojas` : 'Aviso criado',
        });
      }
      limpar();
    } catch (err) {
      toast({ title: 'Não foi possível salvar', description: frase(err), variant: 'destructive' });
    }
  };

  const handleEditar = (aviso: AvisoParaSistema) => {
    setEditando(aviso);
    setForm({
      name: aviso.name,
      url: aviso.url,
      events: aviso.events ?? [],
      secret: aviso.secret ?? '',
      active: aviso.is_active,
      loja: aviso.tenant_id,
    });
  };

  const handleTestar = async (aviso: AvisoParaSistema) => {
    setTestando(aviso.id);
    try {
      const r = await testar.mutateAsync(aviso.id);
      setTestes((t) => ({ ...t, [aviso.id]: fraseDoTeste(r) }));
    } finally {
      setTestando(null);
    }
  };

  const copiar = (texto: string) => {
    navigator.clipboard.writeText(texto);
    toast({ title: 'Endereço copiado' });
  };

  const salvando = criar.isPending || salvar.isPending;
  const semLoja = escolhe && !lojasCarregando && lojas.length === 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Avisos para outros sistemas
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="text-sm text-muted-foreground">
            O ConvoFlow avisa um sistema seu (uma planilha pelo Make ou pelo n8n, um CRM) no instante em que algo
            acontece aqui, como um lead novo. Esse aviso automático se chama webhook: você informa o endereço do
            outro sistema e escolhe quais acontecimentos ele recebe.
          </div>

          {semLoja ? (
            <EmptyState
              compacto
              icon={<Store />}
              title="A Conta ainda não tem Loja."
              description="O aviso fica numa Loja, porque é nela que chegam as mensagens. Crie a primeira Loja em Equipe."
              action={{ label: 'Criar Loja', onClick: () => navigate('/dashboard/team') }}
            />
          ) : (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">{editando ? 'Editar aviso' : 'Novo aviso'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {mostrarLoja && (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="webhook-loja">Loja</Label>
                      <DicaDoCampo
                        rotulo="Loja"
                        texto="O aviso só recebe o que acontece na Loja escolhida. Todas as Lojas cria um aviso em cada Loja, com o mesmo endereço."
                      />
                    </div>
                    {editando ? (
                      <p id="webhook-loja" className="mt-2 text-sm">{nomeDaLoja(editando.tenant_id)}</p>
                    ) : (
                      <Select value={form.loja} onValueChange={(v) => setForm((f) => ({ ...f, loja: v }))}>
                        <SelectTrigger id="webhook-loja" className="mt-1 md:w-80" data-testid="aviso-loja">
                          <SelectValue placeholder="Escolha a Loja" />
                        </SelectTrigger>
                        <SelectContent>
                          {lojas.length > 1 && <SelectItem value={TODAS_AS_LOJAS}>Todas as Lojas</SelectItem>}
                          {lojas.map((l) => (
                            <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="webhook-name">Nome *</Label>
                    <Input
                      id="webhook-name"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      placeholder="Ex: Planilha de contatos"
                    />
                  </div>

                  <div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="webhook-url">Endereço do outro sistema *</Label>
                      <DicaDoCampo rotulo="Endereço do outro sistema" texto="O ConvoFlow manda os dados para este endereço em até 5 minutos, sempre que acontecer o que você marcou em Avisar quando. Se der erro, ele tenta de novo, até 5 vezes." />
                    </div>
                    <Input
                      id="webhook-url"
                      value={form.url}
                      onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                      placeholder="https://exemplo.com/webhook"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <Label>Avisar quando</Label>
                    <DicaDoCampo rotulo="Avisar quando" texto="Lead novo manda data, nome, telefone e a primeira mensagem de quem escreveu pela primeira vez. Chega uma mensagem e Sai uma mensagem levam o texto das conversas." />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2">
                    {WEBHOOK_EVENT_TYPES.map((event) => (
                      // A linha inteira é o alvo do toque (lote 5 do checkup): a
                      // caixinha sozinha tinha 13 px.
                      <label key={event.id} htmlFor={event.id} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium md:min-h-0">
                        <input
                          type="checkbox"
                          id={event.id}
                          checked={form.events.includes(event.id)}
                          onChange={(e) => {
                            const marcado = e.target.checked;
                            setForm((f) => ({
                              ...f,
                              events: marcado ? [...f.events, event.id] : f.events.filter((id) => id !== event.id),
                            }));
                          }}
                          className="h-4 w-4 rounded"
                        />
                        {event.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="webhook-secret">Senha de conferência (opcional)</Label>
                    <DicaDoCampo rotulo="Senha de conferência" texto="Com ela, cada aviso vai assinado. O outro sistema refaz a assinatura com a mesma senha e confere que veio do ConvoFlow. O Make e o n8n funcionam sem ela." />
                  </div>
                  <Input
                    id="webhook-secret"
                    value={form.secret}
                    onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                    placeholder="O outro sistema usa para conferir que o aviso veio do ConvoFlow"
                    type="password"
                  />
                </div>

                <div className="flex items-center space-x-2">
                  <Switch
                    id="aviso-ligado"
                    checked={form.active}
                    onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
                  />
                  <Label htmlFor="aviso-ligado">Aviso ligado</Label>
                  <DicaDoCampo rotulo="Aviso ligado" texto="Desligado, o cadastro fica salvo, mas nada é enviado ao outro sistema enquanto estiver assim. O aviso de teste funciona mesmo desligado." />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSalvar} disabled={salvando || lojasCarregando}>
                    {salvando ? 'Salvando...' : editando ? 'Salvar aviso' : 'Criar aviso'}
                  </Button>
                  {editando && (
                    <Button variant="outline" onClick={limpar}>
                      Cancelar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <div>
            <h3 className="text-lg font-semibold mb-3">Avisos cadastrados</h3>
            {avisosCarregando || lojasCarregando ? (
              <div className="space-y-3">
                <Skeleton className="h-20 w-full rounded-md" />
                <Skeleton className="h-20 w-full rounded-md" />
              </div>
            ) : avisos.length === 0 ? (
              <Card>
                <CardContent className="p-2">
                  <EmptyState
                    compacto
                    icon={<Webhook />}
                    title="Nenhum aviso cadastrado ainda."
                    description="Preencha o formulário acima para criar o primeiro."
                  />
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {avisos.map((aviso) => {
                  const teste = testes[aviso.id];
                  return (
                    <Card key={aviso.id} data-testid="aviso-cadastrado">
                      <CardContent className="p-4 space-y-3">
                        {/* No celular os botões descem para baixo do endereço: lado a
                            lado, eles saíam do cartão (achado 121 do checkup). */}
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <h4 className="font-medium">{aviso.name}</h4>
                              {aviso.is_active ? (
                                <Badge variant="default" className="bg-success text-success-foreground">Ligado</Badge>
                              ) : (
                                <Badge variant="secondary">Desligado</Badge>
                              )}
                              {mostrarLoja && (
                                <Badge variant="outline" className="gap-1">
                                  <Store className="h-3 w-3" aria-hidden="true" />
                                  {nomeDaLoja(aviso.tenant_id)}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span className="min-w-0 break-all">{aviso.url}</span>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => copiar(aviso.url)}
                                className="h-6 w-6 p-0"
                                aria-label="Copiar endereço"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">
                              Avisa quando: {(aviso.events ?? []).map(rotuloDoEvento).join(', ') || 'nada marcado'}
                            </p>
                          </div>

                          <div className="flex shrink-0 flex-wrap gap-2">
                            <Button
                              size="sm"
                              onClick={() => handleTestar(aviso)}
                              disabled={testando === aviso.id}
                            >
                              <Send className="mr-2 h-4 w-4" aria-hidden="true" />
                              {testando === aviso.id ? 'Enviando...' : 'Enviar aviso de teste'}
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => handleEditar(aviso)}>
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setRemoverAlvo(aviso)}
                              disabled={remover.isPending}
                            >
                              Remover
                            </Button>
                          </div>
                        </div>

                        {teste && (
                          <p
                            role="status"
                            data-testid="resultado-do-teste"
                            className={`rounded-md border px-3 py-2 text-sm ${CLASSES_DE_SITUACAO[teste.aceito ? 'success' : 'danger']}`}
                          >
                            {teste.texto}
                          </p>
                        )}

                        <HistoricoDoAviso avisoId={aviso.id} />
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="bg-muted/50 p-4 rounded-lg space-y-2">
            <h4 className="font-medium">Como o aviso chega</h4>
            {/* O botão "Ver Documentação" ("em breve") saiu em 2026-10-25
                (achado 120 do checkup): não existe página com o formato dos
                avisos, e o texto mandava a pessoa consultá-la. */}
            <p className="text-sm text-muted-foreground">
              Cada aviso chega ao endereço cadastrado no formato que o n8n, o Make e o Zapier recebem sem configuração
              extra (para quem programa: um POST com os dados em JSON).
            </p>
            <p className="text-sm text-muted-foreground">
              O Lead novo traz só estes campos, prontos para virar colunas de uma planilha:{' '}
              {CAMPOS_DO_LEAD_NOVO.join(', ')}. A data vem no horário de Brasília e o telefone só com algarismos,
              com 55 e DDD. Para ver o formato sem esperar um cliente, use "Enviar aviso de teste".
            </p>
          </div>
        </div>
      </CardContent>

      <ConfirmationDialog
        isOpen={!!removerAlvo}
        onClose={() => setRemoverAlvo(null)}
        onConfirm={async () => {
          if (!removerAlvo) return;
          try {
            await remover.mutateAsync(removerAlvo.id);
            toast({ title: 'Aviso removido' });
            if (editando?.id === removerAlvo.id) limpar();
          } catch (err) {
            toast({ title: 'Não foi possível excluir', description: frase(err), variant: 'destructive' });
          }
        }}
        title={`Remover o aviso "${removerAlvo?.name ?? ''}"?`}
        description={`O endereço ${removerAlvo?.url ?? ''} para de receber os avisos do ConvoFlow agora. Se outro sistema depende deles (um CRM, uma automação), ele deixa de ser avisado.`}
        reversivel={false}
        confirmText="Remover aviso"
        variant="destructive"
        isLoading={remover.isPending}
      />
    </Card>
  );
};
