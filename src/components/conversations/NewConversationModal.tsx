import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, MessageSquarePlus, Phone, RefreshCw, Send } from 'lucide-react';
import { useWhatsAppInstancesWithAdapter } from '@/hooks/useWhatsAppApi';
import { useMetaTemplates } from '@/hooks/useMetaTemplates';
import { useToast } from '@/hooks/use-toast';
import { useTenant } from '@/contexts/TenantContext';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { WhatsAppAdapterError, type SendResult } from '@/services/whatsapp';
import {
  chaveDoTemplate,
  normalizarTelefoneDigitado,
  podeTextoLivre,
  resumoDoTemplate,
  telefoneDoContatoNovo,
  telefoneValido,
  templatesParaIniciar,
  variantesDoTelefone,
} from '@/lib/conversations/startConversation';

interface NewConversationModalProps {
  onConversationCreated?: (contactId: string) => void;
}

type Modo = 'template' | 'texto';

interface ContatoAlvo {
  id: string;
  phone: string;
}

interface Alvo {
  contato: ContatoAlvo | null;
  /** Última mensagem que este telefone mandou para ESTE número da Loja. */
  ultimaEntradaEm: string | null;
}

/**
 * O telefone já é contato da Loja? E quando ele escreveu pela última vez para o
 * número escolhido? Contato é único por Loja + telefone (não por número), então
 * a busca é na Loja toda e nas duas formas do celular brasileiro.
 */
async function buscarAlvo(tenantId: string, instanceId: string, variantes: string[]): Promise<Alvo> {
  const { data: contatos, error } = await supabase
    .from('contacts')
    .select('id, phone')
    .eq('tenant_id', tenantId)
    .eq('channel', 'whatsapp')
    .in('phone', variantes);
  if (error) throw error;
  const lista = (contatos ?? []) as ContatoAlvo[];
  if (!lista.length) return { contato: null, ultimaEntradaEm: null };

  const { data: entradas, error: erroEntradas } = await supabase
    .from('messages')
    .select('contact_id, created_at')
    .in(
      'contact_id',
      lista.map((c) => c.id),
    )
    .eq('whatsapp_instance_id', instanceId)
    .eq('direction', 'inbound')
    .order('created_at', { ascending: false })
    .limit(1);
  if (erroEntradas) throw erroEntradas;

  const ultima = (entradas ?? [])[0] as { contact_id: string; created_at: string } | undefined;
  const contato =
    (ultima && lista.find((c) => c.id === ultima.contact_id)) ||
    lista.find((c) => c.phone === variantes[0]) ||
    (lista[0] ?? null);
  return { contato, ultimaEntradaEm: ultima?.created_at ?? null };
}

export const NewConversationModal = ({ onConversationCreated }: NewConversationModalProps) => {
  const [open, setOpen] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [message, setMessage] = useState('');
  const [modo, setModo] = useState<Modo>('template');
  const [templateKey, setTemplateKey] = useState('');
  const [params, setParams] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const { toast } = useToast();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  // O mesmo caminho da tela da conversa: um adapter por número, escolhido pelo
  // `provider` da instância (Meta pelo servidor, QR Code pela própria Evolution).
  const { instances, isLoading: instancesLoading, error: instancesError } =
    useWhatsAppInstancesWithAdapter();
  const disponiveis = useMemo(
    () =>
      instances.filter(
        (i) => i.adapter.type !== 'instagram' && i.row.is_active !== false && i.adapter.isReadyToSend(),
      ),
    [instances],
  );
  const selecionada = disponiveis.find((i) => i.row.id === selectedInstance) ?? null;
  const exigeTemplate = !!selecionada?.adapter.getCapabilities().requiresTemplateOutsideWindow;

  // Um número só: já vem escolhido.
  useEffect(() => {
    if (open && !selectedInstance && disponiveis.length === 1) {
      setSelectedInstance(disponiveis[0]!.row.id);
    }
  }, [open, selectedInstance, disponiveis]);

  const digitos = normalizarTelefoneDigitado(phoneNumber);
  const telefoneOk = telefoneValido(digitos);
  const variantes = useMemo(() => variantesDoTelefone(digitos), [digitos]);

  const alvoQuery = useQuery({
    queryKey: ['start-conversation-target', tenant?.id, selecionada?.row.id, variantes.join(',')],
    enabled: open && !!tenant?.id && !!selecionada && telefoneOk,
    staleTime: 30 * 1000,
    queryFn: () => buscarAlvo(tenant!.id, selecionada!.row.id, variantes),
  });
  const alvo = alvoQuery.data ?? null;

  const textoLivreLiberado =
    !!selecionada &&
    telefoneOk &&
    alvoQuery.isSuccess &&
    podeTextoLivre({
      exigeTemplateForaDaJanela: exigeTemplate,
      ultimaEntradaEm: alvo?.ultimaEntradaEm,
      agora: new Date(),
    });
  const modoEfetivo: Modo = !exigeTemplate ? 'texto' : textoLivreLiberado ? modo : 'template';

  const templatesQuery = useMetaTemplates(exigeTemplate && open ? selecionada!.row.id : null);
  const { usaveis, foraDoAlcance } = useMemo(
    () => templatesParaIniciar(templatesQuery.data ?? []),
    [templatesQuery.data],
  );
  const template = usaveis.find((t) => chaveDoTemplate(t) === templateKey) ?? null;

  const resetForm = () => {
    setSelectedInstance('');
    setPhoneNumber('');
    setMessage('');
    setModo('template');
    setTemplateKey('');
    setParams([]);
    setErroEnvio(null);
  };

  const handleOpenChange = (next: boolean) => {
    if (loading) return;
    setOpen(next);
    if (!next) resetForm();
  };

  const handleSelectInstance = (id: string) => {
    setSelectedInstance(id);
    setModo('template');
    setTemplateKey('');
    setParams([]);
    setErroEnvio(null);
  };

  const handleSelectTemplate = (key: string) => {
    setTemplateKey(key);
    const t = usaveis.find((x) => chaveDoTemplate(x) === key);
    setParams(Array.from({ length: t?.paramCount ?? 0 }, () => ''));
    setErroEnvio(null);
  };

  const handlePhoneChange = (value: string) => {
    // Aplicar máscara de telefone brasileiro
    const cleaned = value.replace(/\D/g, '');
    let formatted = cleaned;

    if (cleaned.length >= 2) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2)}`;
    }
    if (cleaned.length >= 7) {
      formatted = `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7, 11)}`;
    }

    setPhoneNumber(formatted);
    setErroEnvio(null);
  };

  const falhar = (motivo: string) => {
    setErroEnvio(motivo);
    toast({ title: 'Mensagem não enviada', description: motivo, variant: 'destructive' });
  };

  /** Contato que a conversa usa: o que já existia, ou um novo com o telefone confirmado. */
  const garantirContato = async (resultado: SendResult): Promise<string | null> => {
    if (alvo?.contato) {
      await supabase
        .from('contacts')
        .update({ last_interaction_at: new Date().toISOString() })
        .eq('id', alvo.contato.id);
      return alvo.contato.id;
    }

    const phone = telefoneDoContatoNovo({
      digitado: digitos,
      confirmadoPeloProvider: resultado.recipientId,
    });
    const { data, error } = await supabase
      .from('contacts')
      .insert({
        phone,
        name: `Contato ${phone}`,
        tenant_id: tenant!.id,
        whatsapp_instance_id: selecionada!.row.id,
        last_interaction_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!error && data) return data.id;

    // Alguém criou o mesmo contato entre a busca e agora: usa o que existe.
    const { data: existente } = await supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenant!.id)
      .eq('channel', 'whatsapp')
      .eq('phone', phone)
      .maybeSingle();
    if (existente?.id) return existente.id;

    logger.error('[NewConversationModal] mensagem enviada, contato não gravado', {
      error: error?.message,
    });
    return null;
  };

  const handleStartConversation = async () => {
    setErroEnvio(null);
    if (!selecionada) {
      falhar('Selecione o número da Loja que vai enviar.');
      return;
    }
    if (!telefoneOk) {
      falhar('Número de telefone inválido. Use o formato: (11) 99999-9999');
      return;
    }
    if (!alvoQuery.isSuccess) {
      falhar('Ainda estou conferindo este telefone. Tente de novo em instantes.');
      return;
    }
    if (modoEfetivo === 'template') {
      if (!template) {
        falhar('Escolha um template aprovado.');
        return;
      }
      if (params.some((p) => !p.trim())) {
        falhar('Preencha todas as variáveis do template.');
        return;
      }
    } else if (!message.trim()) {
      falhar('Digite uma mensagem para iniciar a conversa.');
      return;
    }

    // Contato que já existe recebe no telefone em que está gravado: é o que
    // casa com a janela de 24h que o servidor confere.
    const destino = alvo?.contato?.phone ?? digitos;
    const adapter = selecionada.adapter;

    setLoading(true);
    try {
      let resultado: SendResult;
      try {
        if (modoEfetivo === 'template') {
          if (typeof adapter.sendTemplate !== 'function') {
            throw new WhatsAppAdapterError('Este número não envia template.', 'CAPABILITY_UNSUPPORTED');
          }
          resultado = await adapter.sendTemplate(destino, {
            templateName: template!.name,
            language: template!.language,
            bodyParams: params.map((p) => p.trim()),
          });
        } else {
          resultado = await adapter.sendText(destino, message.trim());
        }
      } catch (e) {
        resultado = { status: 'failed', error: e instanceof Error ? e.message : String(e) };
      }

      if (resultado.status !== 'sent' && resultado.status !== 'pending') {
        falhar(resultado.error || 'O envio falhou sem motivo informado.');
        return;
      }

      // Só agora, com a mensagem entregue ao WhatsApp, o contato passa a existir.
      const contactId = await garantirContato(resultado);
      if (!contactId) {
        toast({
          title: 'Mensagem enviada',
          description: 'Mas não consegui cadastrar o contato. Ele aparece quando o cliente responder.',
        });
        setOpen(false);
        resetForm();
        return;
      }

      const { error: erroMensagem } = await supabase.from('messages').insert({
        contact_id: contactId,
        tenant_id: tenant!.id,
        whatsapp_instance_id: selecionada.row.id,
        direction: 'outbound',
        message_type: 'text',
        content: modoEfetivo === 'template' ? resumoDoTemplate(template!.name) : message.trim(),
        status: 'sent',
        is_from_bot: false,
        evolution_message_id: resultado.providerMessageId ?? null,
      });
      if (erroMensagem) {
        logger.warn('[NewConversationModal] mensagem enviada, histórico não gravado', {
          error: erroMensagem.message,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['conversations', tenant!.id] });
      queryClient.invalidateQueries({ queryKey: ['messages', contactId, tenant!.id] });
      toast({ title: 'Sucesso', description: 'Conversa iniciada com sucesso!' });
      setOpen(false);
      resetForm();
      onConversationCreated?.(contactId);
    } finally {
      setLoading(false);
    }
  };

  const prontoParaEnviar =
    !!selecionada &&
    telefoneOk &&
    alvoQuery.isSuccess &&
    (modoEfetivo === 'texto' ? !!message.trim() : !!template && params.every((p) => !!p.trim()));

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {/* Ocupa a linha inteira: o espaçamento fica por conta de quem usa. */}
        <Button className="w-full" data-new-conversation>
          <MessageSquarePlus className="w-4 h-4 mr-2" />
          Nova Conversa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5" />
            Iniciar Nova Conversa
            <FeatureHelp helpKey="page:conversations-new" />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="instance">Instância do WhatsApp</Label>
            <Select value={selectedInstance} onValueChange={handleSelectInstance} disabled={instancesLoading}>
              <SelectTrigger id="instance">
                <SelectValue placeholder={instancesLoading ? 'Carregando instâncias...' : 'Selecione uma instância'} />
              </SelectTrigger>
              <SelectContent>
                {disponiveis.map(({ row, providerLabel }) => (
                  <SelectItem key={row.id} value={row.id}>
                    <div className="flex items-center gap-2">
                      <Phone className="w-4 h-4" />
                      <span>{row.name}</span>
                      {row.phone_number && (
                        <span className="text-muted-foreground text-sm">({row.phone_number})</span>
                      )}
                      <span className="text-muted-foreground text-xs">{providerLabel}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {instancesError && (
              <p className="text-sm text-destructive">Erro ao carregar instâncias do WhatsApp. Tente novamente.</p>
            )}
            {!instancesLoading && !instancesError && disponiveis.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhuma instância do WhatsApp conectada encontrada.</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Número do WhatsApp</Label>
            <Input
              id="phone"
              placeholder="(11) 99999-9999"
              value={phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              maxLength={15}
            />
            <p className="text-sm text-muted-foreground">Digite o número com DDD (apenas números brasileiros)</p>
          </div>

          {exigeTemplate && telefoneOk && alvoQuery.isSuccess && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground" data-testid="aviso-janela">
                {textoLivreLiberado
                  ? 'Este telefone escreveu para este número nas últimas 24 horas: você pode mandar texto livre ou um template.'
                  : 'Este telefone não escreveu para este número nas últimas 24 horas. Pela regra da Meta, a primeira mensagem tem de ser um template aprovado.'}
              </p>
              <div className="flex gap-2" role="group" aria-label="Tipo da primeira mensagem">
                <Button
                  type="button"
                  size="sm"
                  variant={modoEfetivo === 'template' ? 'default' : 'outline'}
                  aria-pressed={modoEfetivo === 'template'}
                  onClick={() => setModo('template')}
                >
                  Template aprovado
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={modoEfetivo === 'texto' ? 'default' : 'outline'}
                  aria-pressed={modoEfetivo === 'texto'}
                  disabled={!textoLivreLiberado}
                  onClick={() => setModo('texto')}
                >
                  Texto livre
                </Button>
              </div>
            </div>
          )}
          {telefoneOk && alvoQuery.isError && (
            <p className="text-sm text-destructive">
              Não consegui conferir este telefone.{' '}
              <button type="button" className="underline" onClick={() => alvoQuery.refetch()}>
                Tentar de novo
              </button>
            </p>
          )}

          {exigeTemplate && modoEfetivo === 'template' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="template">Template</Label>
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-primary inline-flex items-center gap-1 disabled:opacity-50"
                  onClick={() => templatesQuery.refetch()}
                  disabled={templatesQuery.isFetching || loading}
                >
                  <RefreshCw className={`h-3 w-3 ${templatesQuery.isFetching ? 'animate-spin' : ''}`} />
                  Atualizar
                </button>
              </div>

              {templatesQuery.isLoading && <p className="text-sm text-muted-foreground">Carregando templates...</p>}

              {templatesQuery.isError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Não consegui carregar os templates deste número: {(templatesQuery.error as Error).message}
                  </AlertDescription>
                </Alert>
              )}

              {templatesQuery.isSuccess && usaveis.length === 0 && (
                <Alert data-testid="sem-template">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm space-y-1">
                    <span className="block font-medium">Nenhum template aprovado neste número.</span>
                    <span className="block">
                      A Meta só deixa começar a conversa com um template aprovado. Crie um no Gerenciador do
                      WhatsApp Business e acompanhe a aprovação na tela{' '}
                      <Link to="/dashboard/templates" className="underline" onClick={() => handleOpenChange(false)}>
                        Templates
                      </Link>
                      .
                    </span>
                    {foraDoAlcance > 0 && (
                      <span className="block">
                        {foraDoAlcance === 1
                          ? '1 template aprovado não aparece aqui porque tem imagem, vídeo, documento ou variável no cabeçalho ou no botão.'
                          : `${foraDoAlcance} templates aprovados não aparecem aqui porque têm imagem, vídeo, documento ou variável no cabeçalho ou no botão.`}
                      </span>
                    )}
                  </AlertDescription>
                </Alert>
              )}

              {usaveis.length > 0 && (
                <>
                  <Select value={templateKey} onValueChange={handleSelectTemplate} disabled={loading}>
                    <SelectTrigger id="template">
                      <SelectValue placeholder="Escolha um template aprovado" />
                    </SelectTrigger>
                    <SelectContent>
                      {usaveis.map((t) => (
                        <SelectItem key={chaveDoTemplate(t)} value={chaveDoTemplate(t)}>
                          {t.name} <span className="text-xs text-muted-foreground">({t.language})</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {foraDoAlcance > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {foraDoAlcance === 1
                        ? '1 template aprovado não aparece aqui porque tem mídia ou variável no cabeçalho ou no botão.'
                        : `${foraDoAlcance} templates aprovados não aparecem aqui porque têm mídia ou variável no cabeçalho ou no botão.`}
                    </p>
                  )}
                  {template?.bodyText && (
                    <p className="text-xs text-muted-foreground border rounded p-2 bg-muted/30 whitespace-pre-wrap">
                      {template.bodyText}
                    </p>
                  )}
                  {params.map((valor, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <span className="text-xs text-muted-foreground w-8 shrink-0">{`{{${idx + 1}}}`}</span>
                      <Input
                        aria-label={`Variável {{${idx + 1}}}`}
                        value={valor}
                        placeholder={`Valor de {{${idx + 1}}}`}
                        onChange={(e) =>
                          setParams((prev) => prev.map((p, i) => (i === idx ? e.target.value : p)))
                        }
                        disabled={loading}
                      />
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {modoEfetivo === 'texto' && (
            <div className="space-y-2">
              <Label htmlFor="message">Mensagem inicial</Label>
              <Textarea
                id="message"
                placeholder="Digite sua mensagem para iniciar a conversa..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                maxLength={1000}
              />
              <p className="text-sm text-muted-foreground">{message.length}/1000 caracteres</p>
            </div>
          )}

          {erroEnvio && (
            <Alert variant="destructive" data-testid="erro-envio">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">{erroEnvio}</AlertDescription>
            </Alert>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleStartConversation} disabled={loading || !prontoParaEnviar}>
            {loading ? (
              'Enviando...'
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Iniciar Conversa
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
