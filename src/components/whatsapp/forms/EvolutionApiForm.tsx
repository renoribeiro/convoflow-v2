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

export interface EvolutionFormValues {
  name: string;
  instance_key: string;
  enableWebhookAutomation: boolean;
  retryAttempts: number;
  retryDelay: number;
}

/** Código interno pronto: quem só quer ler o QR Code não precisa abrir "Avançado" (lote 6e). */
export const gerarCodigoInterno = () =>
  `instance_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

export const initialEvolutionValues = (): EvolutionFormValues => ({
  name: '',
  instance_key: gerarCodigoInterno(),
  enableWebhookAutomation: true,
  retryAttempts: 3,
  retryDelay: 2000,
});

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
  const generateInstanceKey = () => onChange({ instance_key: gerarCodigoInterno() });

  // O webhook que a Evolution vai chamar e sempre a edge function do proprio
  // Supabase deste ambiente. Antes isto lia env.get('EVOLUTION_WEBHOOK_URL'),
  // uma chave que nao existe no EnvConfig: devolvia undefined e a URL saia
  // vazia na tela.
  const webhookUrl = `${env.get('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/evolution-webhook`;

  return (
    <div className="space-y-4">
      <Alert className="border-slate-200 bg-slate-50/60">
        <Info className="h-4 w-4 text-slate-700" />
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
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={loading}
        />
      </div>

      <Avancado
        id="evo-avancado"
        aberto={avancado}
        onAbertoChange={onAvancadoChange}
        resumo="Código interno e entrega das mensagens. Já vem pronto: só mexa se o suporte pedir."
      >
      <div className="space-y-2">
        <Label htmlFor="evo-key">Código interno do número *</Label>
        <div className="flex gap-2">
          <Input
            id="evo-key"
            placeholder="Ex: vendas_001"
            value={values.instance_key}
            onChange={(e) => onChange({ instance_key: e.target.value })}
            disabled={loading}
          />
          <Button type="button" variant="outline" onClick={generateInstanceKey} disabled={loading}>
            Gerar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Um código só deste número, que o ConvoFlow usa por dentro. Clique em Gerar ou use letras, números, _ e -.
        </p>
      </div>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-4 w-4 text-blue-600" />
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
                <Badge variant="default" className="text-xs bg-green-600">
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
              <div className="bg-white border rounded px-2 py-1">
                <code className="text-xs text-gray-600 break-all">{webhookUrl}</code>
              </div>
            </div>

            <details className="group">
              <summary className="text-xs font-medium cursor-pointer text-blue-600 hover:text-blue-800">
                Detalhes técnicos (para o suporte)
              </summary>
              <div className="mt-2 space-y-2 pl-4 border-l-2 border-blue-200">
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
                <p className="text-xs text-gray-500">
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
