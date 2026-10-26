import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ServerCog, Info } from 'lucide-react';

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
  return (
    <div className="space-y-4">
      <Alert className="border-sky-200 bg-sky-50/60">
        <ServerCog className="h-4 w-4 text-sky-700" />
        <AlertTitle>WAHA (servidor self-hosted)</AlertTitle>
        <AlertDescription className="text-xs">
          Ao salvar, o servidor do ConvoFlow confere o endereço, cria (ou atualiza) a sessão no seu
          servidor WAHA e registra lá o endereço de entrega, com uma senha só deste número. O
          endereço e a API Key ficam guardados no cofre do ConvoFlow e não aparecem mais em nenhuma
          tela. Depois é só clicar no QR Code do número na lista e ler com o celular.
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
          O endereço público do servidor, de preferência com HTTPS. Endereço de rede interna
          (localhost, 192.168..., 10...) é recusado.
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
        <AlertTitle className="text-sm">Endereço de entrega que será registrado</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>
            Eventos: <code className="px-1">message</code>,{' '}
            <code className="px-1">message.ack</code>,{' '}
            <code className="px-1">session.status</code>.
          </p>
          <p>
            O endereço é o do ConvoFlow, próprio deste número, e cada evento vai assinado com a senha
            dele. Evento sem a assinatura certa é recusado.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};
