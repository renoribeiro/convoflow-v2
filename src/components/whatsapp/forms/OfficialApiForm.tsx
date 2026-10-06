import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldCheck, Info, Loader2, Zap, Copy } from 'lucide-react';
import { env } from '@/lib/env';
import { useToast } from '@/hooks/use-toast';
import { useMetaEmbeddedSignup } from '@/hooks/useMetaEmbeddedSignup';

export interface OfficialFormValues {
  name: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
}

export const initialOfficialValues = (): OfficialFormValues => ({
  name: '',
  phoneNumberId: '',
  wabaId: '',
  accessToken: '',
});

interface Props {
  values: OfficialFormValues;
  onChange: (patch: Partial<OfficialFormValues>) => void;
  loading: boolean;
  onSignupSuccess?: () => void;
}

export const OfficialApiForm = ({ values, onChange, loading, onSignupSuccess }: Props) => {
  const { isAvailable: embeddedSignupAvailable, startSignup, loading: signupLoading } =
    useMetaEmbeddedSignup();
  const { toast } = useToast();

  const supabaseUrl = env.get('SUPABASE_URL') || '';
  const webhookUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/meta-webhook` : '';

  const copyWebhookUrl = () => {
    if (!webhookUrl) return;
    navigator.clipboard.writeText(webhookUrl);
    toast({
      title: 'Copiado!',
      description: 'Callback URL copiada para a área de transferência',
    });
  };

  const handleEmbeddedSignup = async () => {
    try {
      await startSignup(values.name || undefined);
      onSignupSuccess?.();
    } catch {
      // Toast already shown by the hook; swallow so it doesn't bubble to modal
    }
  };

  const isDisabled = loading || signupLoading;

  return (
    <div className="space-y-4">
      {embeddedSignupAvailable ? (
        <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-700" />
            <span className="text-sm font-medium text-blue-900">Conexão automática</span>
          </div>
          <p className="text-xs text-blue-800">
            Clique abaixo para conectar sua conta WhatsApp Business diretamente via Meta, sem
            precisar copiar IDs ou tokens manualmente.
          </p>
          <p className="text-xs text-blue-800">
            Número que já está cadastrado aqui? O mesmo botão <strong>reconecta</strong>: o
            ConvoFlow reconhece o número, atualiza a instância no lugar e o histórico fica onde
            está. Não exclua a instância para reconectar.
          </p>
          <Button
            type="button"
            className="w-full bg-blue-700 hover:bg-blue-800 text-white"
            onClick={handleEmbeddedSignup}
            disabled={isDisabled}
          >
            {signupLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conectar com a Meta
          </Button>
          <p className="text-xs text-muted-foreground text-center">
            ou preencha os campos abaixo manualmente
          </p>
        </div>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="w-full">
              <Button
                type="button"
                variant="outline"
                className="w-full opacity-50 cursor-not-allowed"
                disabled
              >
                Conectar com a Meta
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Configuração da Meta pendente (VITE_FACEBOOK_APP_ID / VITE_META_CONFIG_ID)</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* O texto muda com o estado do botão: com a conexão automática no ar, os
          campos são a exceção; sem ela, continuam sendo o único caminho. */}
      <Alert className="border-emerald-200 bg-emerald-50/60">
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        <AlertTitle>API Oficial do WhatsApp (Meta Cloud API)</AlertTitle>
        <AlertDescription className="text-xs">
          {embeddedSignupAvailable ? (
            <>
              Você não precisa de app nem de token: "Conectar com a Meta" abre uma janela da própria
              Meta, onde você entra com o login do Facebook da empresa, escolhe (ou cria) a conta do
              WhatsApp Business, informa o número e confirma o código. Tenha em mãos esse login e um
              número que receba SMS ou ligação e que não esteja em uso no aplicativo do WhatsApp.
              Os campos abaixo são só para quem já mantém um app próprio no{' '}
              <a
                href="https://developers.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Meta for Developers
              </a>
              .
            </>
          ) : (
            <>
              Antes de continuar, você precisa de um App configurado no{' '}
              <a
                href="https://developers.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Meta for Developers
              </a>
              {' '}com WhatsApp Business habilitado e um Access Token permanente (System User). O webhook
              do ConvoFlow é configurado uma única vez na instalação, não a cada número. Veja o aviso
              no fim do formulário.
            </>
          )}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="meta-name">Nome da Instância *</Label>
        <Input
          id="meta-name"
          placeholder="Ex: WhatsApp Vendas Oficial"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={isDisabled}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="meta-phone-id">Phone Number ID *</Label>
          <Input
            id="meta-phone-id"
            placeholder="123456789012345"
            value={values.phoneNumberId}
            onChange={(e) => onChange({ phoneNumberId: e.target.value })}
            disabled={isDisabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meta-waba-id">WhatsApp Business Account ID *</Label>
          <Input
            id="meta-waba-id"
            placeholder="123456789012345"
            value={values.wabaId}
            onChange={(e) => onChange({ wabaId: e.target.value })}
            disabled={isDisabled}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="meta-token">Access Token (permanente) *</Label>
        <Input
          id="meta-token"
          type="password"
          placeholder="EAAG..."
          value={values.accessToken}
          onChange={(e) => onChange({ accessToken: e.target.value })}
          disabled={isDisabled}
          autoComplete="off"
        />
        <p className="text-xs text-muted-foreground">
          Use um System User Token de longa duração. O token será armazenado de forma cifrada no Supabase Vault.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle className="text-sm">Webhook da Meta: configuração única da plataforma</AlertTitle>
        <AlertDescription className="text-xs space-y-2">
          <p>
            O webhook vale para a instalação inteira do ConvoFlow, não para cada número. Se algum
            número já recebe mensagens aqui, ele já está configurado e não há nada a fazer nesta
            etapa. Siga para "Validar e conectar".
          </p>
          <p>
            Na primeira instalação, quem opera a plataforma configura, no Meta App → Webhooks →
            WhatsApp Business Account:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Callback URL:</strong>{' '}
              <code className="bg-background border px-1.5 py-0.5 rounded text-[11px]">
                {webhookUrl || 'Configure VITE_SUPABASE_URL'}
              </code>
              {webhookUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 px-1.5 ml-1 align-middle"
                  onClick={copyWebhookUrl}
                >
                  <Copy className="h-3 w-3" />
                  <span className="sr-only">Copiar Callback URL</span>
                </Button>
              )}
            </li>
            <li>
              <strong>Verify Token:</strong> o token da instalação, guardado no secret{' '}
              <code className="bg-background border px-1.5 py-0.5 rounded text-[11px]">
                META_GLOBAL_VERIFY_TOKEN
              </code>{' '}
              do Supabase. Por segurança ele não é exibido aqui; quem administra a instalação lê o
              valor no painel do Supabase. Não use o token do campo acima.
            </li>
            <li>
              Subscreva os campos: <code>messages</code>, <code>message_template_status_update</code>.
            </li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
};
