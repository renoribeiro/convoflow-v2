import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
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
      <Alert className="border-info/30 bg-info/10">
        <ServerCog className="h-4 w-4 text-info" />
        <AlertTitle>QR Code no seu servidor WAHA</AlertTitle>
        <AlertDescription className="text-xs">
          Ao salvar, o servidor do ConvoFlow confere o endereço, cria (ou atualiza) a sessão no seu
          servidor WAHA e registra lá o endereço de entrega, com uma senha só deste número. O
          endereço e a chave ficam guardados no cofre do ConvoFlow e não aparecem mais em nenhuma
          tela. Depois é só clicar no QR Code do número na lista e ler com o celular.
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="waha-name">Nome do número *</Label>
        <Input
          id="waha-name"
          placeholder="Ex: WhatsApp Suporte"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={loading}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Label htmlFor="waha-url">Endereço do seu servidor WAHA *</Label>
          <DicaDoCampo rotulo="Endereço do servidor WAHA" texto="Troque o endereço que vem preenchido pelo do seu servidor. Antes de salvar, o ConvoFlow testa se ele responde. Endereço de rede interna é recusado." />
        </div>
        <Input
          id="waha-url"
          placeholder="https://waha.suaempresa.com.br"
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
        <div className="flex items-center gap-1.5">
          <Label htmlFor="waha-key">Chave do servidor WAHA (X-Api-Key)</Label>
          <DicaDoCampo rotulo="Chave do servidor WAHA" texto="Fica guardada no cofre do ConvoFlow e não aparece mais em nenhuma tela. Se o servidor recusar a chave, nada é salvo." />
        </div>
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
        <div className="flex items-center gap-1.5">
          <Label htmlFor="waha-session">Nome da sessão *</Label>
          <DicaDoCampo rotulo="Nome da sessão" texto="Use um nome que só este número tem em todo o ConvoFlow. Se outro número já usa esse nome, o cadastro é recusado. Evite deixar default." />
        </div>
        <Input
          id="waha-session"
          placeholder="default"
          value={values.sessionName}
          onChange={(e) => onChange({ sessionName: e.target.value })}
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Se o servidor WAHA também atende outros sistemas (por exemplo, n8n),{' '}
          use um nome que só este número usa, para um não desconectar o outro.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Como as mensagens chegam</AlertTitle>
        <AlertDescription className="text-xs space-y-1">
          <p>
            O ConvoFlow registra no seu servidor WAHA um endereço de entrega só deste número,
            protegido por senha. É por ele que as mensagens e as confirmações de leitura chegam.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};
