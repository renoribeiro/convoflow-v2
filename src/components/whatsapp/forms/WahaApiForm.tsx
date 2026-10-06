import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCog, Info } from 'lucide-react';
import { env } from '@/lib/env';

export interface WahaFormValues {
  name: string;
  serverUrl: string;
  apiKey: string;
  sessionName: string;
}

export const initialWahaValues = (): WahaFormValues => ({
  name: '',
  serverUrl: 'https://waha.memudecore.com.br',
  apiKey: '',
  sessionName: 'default',
});

interface Props {
  values: WahaFormValues;
  onChange: (patch: Partial<WahaFormValues>) => void;
  loading: boolean;
}

export const WahaApiForm = ({ values, onChange, loading }: Props) => {
  const webhookUrl = `${env.get('SUPABASE_URL').replace(/\/+$/, '')}/functions/v1/waha-webhook`;

  return (
    <div className="space-y-4">
      <Alert className="border-sky-200 bg-sky-50/60">
        <ServerCog className="h-4 w-4 text-sky-700" />
        <AlertTitle>WAHA (servidor self-hosted)</AlertTitle>
        <AlertDescription className="text-xs">
          Ao salvar, o ConvoFlow cria/atualiza a sessão diretamente no servidor WAHA via{' '}
          <code className="px-1">POST /api/sessions</code>, registrando o webhook do Supabase
          automaticamente. Depois é só parear pelo Swagger <code className="px-1">/docs</code> do
          servidor WAHA.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="waha-name">Nome da Instância *</Label>
        <Input
          id="waha-name"
          placeholder="Ex: WhatsApp Suporte WAHA"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="waha-url">URL base do servidor WAHA *</Label>
        <Input
          id="waha-url"
          placeholder="https://waha.memudecore.com.br"
          value={values.serverUrl}
          onChange={(e) => onChange({ serverUrl: e.target.value })}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Use HTTPS sem porta (Traefik finaliza TLS). Swagger disponível em{' '}
          <code className="px-1">/docs</code>.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="waha-key">API Key (X-Api-Key)</Label>
        <Input
          id="waha-key"
          type="password"
          placeholder="Deixe em branco se o servidor não exigir"
          value={values.apiKey}
          onChange={(e) => onChange({ apiKey: e.target.value })}
          disabled={loading}
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="waha-session">Nome da sessão *</Label>
        <Input
          id="waha-session"
          placeholder="default"
          value={values.sessionName}
          onChange={(e) => onChange({ sessionName: e.target.value })}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Se o servidor WAHA já é compartilhado com outras integrações (ex.: n8n),{' '}
          escolha um nome único por Conta para evitar conflito de pareamento.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Webhook que será registrado</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>
            Eventos: <code className="px-1">message</code>,{' '}
            <code className="px-1">message.ack</code>,{' '}
            <code className="px-1">session.status</code>.
          </p>
          <p className="break-all">
            URL: <code className="bg-background border px-1.5 py-0.5 rounded text-[11px]">{webhookUrl}</code>
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};
