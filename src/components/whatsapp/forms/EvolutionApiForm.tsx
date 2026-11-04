import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Info,
  Loader2,
  Webhook,
  XCircle,
} from 'lucide-react';
import { env } from '@/lib/env';
import { Avancado } from './Avancado';
import {
  gerarNomeNoServidor,
  normalizarNomeNoServidor,
  problemaNoNomeNoServidor,
  sufixoAleatorio,
} from '@/lib/whatsapp/nomeNoServidor';

export interface EvolutionFormValues {
  name: string;
  /** O nome no servidor de conexão (o do painel da Evolution). */
  instance_key: string;
  /** As 4 letras sorteadas no fim do nome no servidor; ficam as mesmas enquanto a pessoa digita. */
  sufixo: string;
  /** A pessoa mudou o nome no servidor em "Avançado": o nome do número para de reescrevê-lo. */
  nomeNoServidorManual: boolean;
  enableWebhookAutomation: boolean;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * O nome no servidor nasce do nome digitado ("WhatsApp Vendas" vira
 * "whatsapp_vendas_k3f9") e aparece logo abaixo do campo do nome; em
 * "Avançado" dá para trocar (decisão do dono, 2026-11-04). Até o lote 6e era
 * um código "instance_" com números, escondido.
 */
export const initialEvolutionValues = (): EvolutionFormValues => {
  const sufixo = sufixoAleatorio();
  return {
    name: '',
    instance_key: gerarNomeNoServidor('', sufixo),
    sufixo,
    nomeNoServidorManual: false,
    enableWebhookAutomation: true,
    retryAttempts: 3,
    retryDelay: 2000,
  };
};

export type EvolutionWebhookStatus = 'idle' | 'configuring' | 'success' | 'error';

interface Props {
  values: EvolutionFormValues;
  onChange: (patch: Partial<EvolutionFormValues>) => void;
  loading: boolean;
  webhookStatus?: EvolutionWebhookStatus;
  webhookError?: string | null;
  /** "Avançado" aberto: código interno e endereço de entrega (achado 106). */
  avancado: boolean;
  onAvancadoChange: (aberto: boolean) => void;
}

export const EvolutionApiForm = ({
  values,
  onChange,
  loading,
  webhookStatus = 'idle',
  webhookError = null,
  avancado,
  onAvancadoChange,
}: Props) => {
  const mudarNome = (name: string) =>
    onChange(
      values.nomeNoServidorManual ? { name } : { name, instance_key: gerarNomeNoServidor(name, values.sufixo) },
    );

  const gerarDeNovo = () => {
    const sufixo = sufixoAleatorio();
    onChange({ sufixo, nomeNoServidorManual: false, instance_key: gerarNomeNoServidor(values.name, sufixo) });
  };

  const problemaNoNome = values.nomeNoServidorManual ? problemaNoNomeNoServidor(values.instance_key) : null;
  const mostraNomeGerado = values.name.trim() !== '' || values.nomeNoServidorManual;

  // O webhook que a Evolution vai chamar e sempre a edge function do proprio
  // Supabase deste ambiente. Antes isto lia env.get('EVOLUTION_WEBHOOK_URL'),
  // uma chave que nao existe no EnvConfig: devolvia undefined e a URL saia
  // vazia na tela.
  const webhookUrl = `${env.get('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/evolution-webhook`;

  return (
    <div className="space-y-4">
      <Alert className="border-border bg-muted/60">
        <Info className="h-4 w-4 text-foreground" />
        <AlertDescription className="text-xs">
          Você não precisa configurar nada: o ConvoFlow já tem o servidor. Dê um nome ao número,
          clique em Criar e abrir QR Code e leia o QR Code com o celular dele.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="evo-name">Nome do número *</Label>
        <Input
          id="evo-name"
          placeholder="Ex: WhatsApp Vendas"
          value={values.name}
          onChange={(e) => mudarNome(e.target.value)}
          disabled={loading}
        />
        <div className="flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="nome-no-servidor-gerado">
          <p className="min-w-0">
            Nome no servidor de conexão:{' '}
            {mostraNomeGerado ? (
              <code className="rounded bg-muted px-1 py-0.5 text-foreground [overflow-wrap:anywhere]">{values.instance_key}</code>
            ) : (
              'aparece quando você digitar o nome.'
            )}{' '}
            É o nome do painel da Evolution. Para mudar, abra Avançado.
          </p>
          <DicaDoCampo
            rotulo="Nome no servidor de conexão"
            texto="É o nome deste número no painel da Evolution e nas automações de fora. Não é senha."
          />
        </div>
      </div>

      <Avancado
        id="evo-avancado"
        aberto={avancado}
        onAbertoChange={onAvancadoChange}
        resumo="Nome no servidor de conexão e entrega das mensagens. Já vem pronto: mude só se a sua agência usa outro padrão de nome."
      >
      <div className="space-y-2">
        <Label htmlFor="evo-key">Nome no servidor de conexão *</Label>
        <div className="flex gap-2">
          <Input
            id="evo-key"
            placeholder="Ex: whatsapp_vendas_k3f9"
            value={values.instance_key}
            onChange={(e) =>
              onChange({ instance_key: normalizarNomeNoServidor(e.target.value), nomeNoServidorManual: true })
            }
            aria-invalid={problemaNoNome ? true : undefined}
            disabled={loading}
          />
          <Button type="button" variant="outline" onClick={gerarDeNovo} disabled={loading}>
            Gerar de novo
          </Button>
        </div>
        {problemaNoNome ? (
          <p className="text-xs text-destructive">{problemaNoNome}</p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Letras minúsculas sem acento, números, _ e -. Ele não muda depois que o número é criado.
            Gerar de novo volta a montar o nome a partir do nome do número.
          </p>
        )}
      </div>

      <Card className="border-info/30 bg-info/10">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-info" />
              <CardTitle className="text-sm">Receber as mensagens automaticamente</CardTitle>
              <DicaDoCampo rotulo="Receber as mensagens automaticamente" texto="Ligado, o ConvoFlow registra no servidor o endereço de entrega deste número, e as mensagens entram assim que ele conectar. Deixe ligado." />
            </div>
            <Switch
              checked={values.enableWebhookAutomation}
              onCheckedChange={(v) => onChange({ enableWebhookAutomation: v })}
              disabled={loading}
            />
          </div>
          <CardDescription className="text-xs">
            Deixe ligado: assim as mensagens deste número entram no ConvoFlow assim que ele conectar.
          </CardDescription>
        </CardHeader>

        {values.enableWebhookAutomation && (
          <CardContent className="pt-0 space-y-3">
            <div className="flex items-center gap-2">
              <Label className="text-xs font-medium">Status:</Label>
              {webhookStatus === 'idle' && (
                <Badge variant="secondary" className="text-xs">
                  <Clock className="h-3 w-3 mr-1" /> Aguardando
                </Badge>
              )}
              {webhookStatus === 'configuring' && (
                <Badge variant="default" className="text-xs">
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Configurando
                </Badge>
              )}
              {webhookStatus === 'success' && (
                <Badge variant="default" className="text-xs bg-success">
                  <CheckCircle className="h-3 w-3 mr-1" /> Configurado
                </Badge>
              )}
              {webhookStatus === 'error' && (
                <Badge variant="destructive" className="text-xs">
                  <XCircle className="h-3 w-3 mr-1" /> Erro
                </Badge>
              )}
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-medium">Endereço de entrega no ConvoFlow:</Label>
              <div className="bg-card border rounded px-2 py-1">
                <code className="text-xs text-muted-foreground break-all">{webhookUrl}</code>
              </div>
            </div>

            <details className="group">
              <summary className="text-xs font-medium cursor-pointer text-info hover:text-info">
                Detalhes técnicos (para o suporte)
              </summary>
              <div className="mt-2 space-y-2 pl-4 border-l-2 border-info/30">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Tentativas de configurar:</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={values.retryAttempts}
                      onChange={(e) =>
                        onChange({ retryAttempts: parseInt(e.target.value, 10) || 3 })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Espera entre tentativas (milissegundos):</Label>
                    <Input
                      type="number"
                      min={1000}
                      max={10000}
                      step={500}
                      value={values.retryDelay}
                      onChange={(e) =>
                        onChange({ retryDelay: parseInt(e.target.value, 10) || 2000 })
                      }
                      className="h-7 text-xs"
                      disabled={loading}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Eventos: QRCODE_UPDATED, CONNECTION_UPDATE, MESSAGES_UPSERT, MESSAGES_UPDATE,
                  SEND_MESSAGE
                </p>
              </div>
            </details>
          </CardContent>
        )}
      </Card>
      </Avancado>

      {/* O erro fica FORA do cartão de webhook: quando a automação está
          desligada o cartão não renderiza o corpo, e era ali que a mensagem
          morava — falha silenciosa garantida. */}
      {webhookError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{webhookError}</AlertDescription>
        </Alert>
      )}
    </div>
  );
};
