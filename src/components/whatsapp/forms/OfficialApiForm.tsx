import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ShieldCheck, Loader2, Zap } from 'lucide-react';
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
            Clique abaixo para conectar a conta do WhatsApp Business da empresa pela própria Meta.
            Você não precisa copiar nenhum código.
          </p>
          <p className="text-xs text-blue-800">
            O número já está aqui? O mesmo botão <strong>reconecta</strong>: o ConvoFlow reconhece
            o número, atualiza no lugar e o histórico fica onde está. Não exclua o número para
            reconectar.
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
            ou preencha os campos abaixo, se a empresa já tem um app próprio na Meta
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
            <p>A conexão automática com a Meta ainda não está ligada. Fale com o suporte do ConvoFlow.</p>
          </TooltipContent>
        </Tooltip>
      )}

      {/* O texto muda com o estado do botão: com a conexão automática no ar, os
          campos são a exceção; sem ela, continuam sendo o único caminho. */}
      <Alert className="border-emerald-200 bg-emerald-50/60">
        <ShieldCheck className="h-4 w-4 text-emerald-700" />
        <AlertTitle>API Oficial do WhatsApp</AlertTitle>
        <AlertDescription className="text-xs">
          {embeddedSignupAvailable ? (
            <>
              Você não precisa de app nem de chave: "Conectar com a Meta" abre uma janela da própria
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
              Antes de continuar, a empresa precisa de um app no{' '}
              <a
                href="https://developers.facebook.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                Meta for Developers
              </a>
              {' '}com o WhatsApp Business ligado e uma chave de acesso permanente (Access Token de um
              System User). As mensagens chegam pelo endereço de entrega que o ConvoFlow já
              configurou na Meta: você não precisa configurar isso.
            </>
          )}
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Label htmlFor="meta-name">Nome do número *</Label>
        <Input
          id="meta-name"
          placeholder="Ex: WhatsApp Vendas"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          disabled={isDisabled}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="meta-phone-id">Código do número na Meta (Phone Number ID) *</Label>
          <Input
            id="meta-phone-id"
            placeholder="123456789012345"
            value={values.phoneNumberId}
            onChange={(e) => onChange({ phoneNumberId: e.target.value })}
            disabled={isDisabled}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="meta-waba-id">Código da conta do WhatsApp Business (WABA ID) *</Label>
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
        <Label htmlFor="meta-token">Chave de acesso permanente (Access Token) *</Label>
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
          Use a chave de longa duração de um usuário do sistema da Meta (System User). O ConvoFlow guarda a chave cifrada, no cofre, e ela não aparece mais.
        </p>
      </div>

      {/* O endereço de entrega da Meta (Callback URL e Verify Token) é configurado UMA
          vez na instalação, por quem opera a plataforma, não pelo cliente:
          docs/RUNBOOK_troca_app_meta.md. Até o lote 3 do checkup isto aparecia
          aqui com nomes internos (VITE_*, secret do Supabase). */}
    </div>
  );
};
