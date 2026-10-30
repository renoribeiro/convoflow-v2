import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { useMetaEmbeddedSignup } from '@/hooks/useMetaEmbeddedSignup';
import { Avancado } from './Avancado';

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
  /** "Avançado" aberto: os campos de quem já tem app próprio na Meta (achado 106). */
  avancado: boolean;
  onAvancadoChange: (aberto: boolean) => void;
}

/**
 * API oficial da Meta. O caminho principal é "Conectar com a Meta" (a janela
 * da própria Meta); os campos com os códigos da Meta e a chave de acesso são
 * para quem já mantém um app próprio e ficam em "Avançado" (lote 6e, D12).
 * Sem a conexão automática ligada, os campos são o único caminho e o
 * "Avançado" vem aberto (CreateInstanceModal).
 */
export const OfficialApiForm = ({ values, onChange, loading, onSignupSuccess, avancado, onAvancadoChange }: Props) => {
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
      <Alert className="border-success/30 bg-success/10">
        <ShieldCheck className="h-4 w-4 text-success" />
        <AlertTitle>API oficial da Meta</AlertTitle>
        <AlertDescription className="text-xs">
          {embeddedSignupAvailable ? (
            <>
              "Conectar com a Meta" abre uma janela da própria Meta: você entra com o login do Facebook
              da empresa, escolhe (ou cria) a conta do WhatsApp Business, informa o número e confirma o
              código. Tenha em mãos esse login e um número que receba SMS ou ligação e que não esteja em
              uso no aplicativo do WhatsApp.
            </>
          ) : (
            <>
              A conexão automática com a Meta ainda não está ligada. Por enquanto, conecte pelos campos
              em Avançado, se a empresa já tem um app próprio na Meta, ou fale com o suporte do ConvoFlow.
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

      {embeddedSignupAvailable && (
        <div className="space-y-2">
          <Button
            type="button"
            className="w-full bg-info hover:bg-info/90 text-info-foreground"
            onClick={handleEmbeddedSignup}
            disabled={isDisabled}
          >
            {signupLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conectar com a Meta
          </Button>
          <p className="text-xs text-muted-foreground">
            O número já está aqui? O mesmo botão <strong>reconecta</strong>: o ConvoFlow reconhece o
            número, atualiza no lugar e o histórico fica onde está. Não exclua o número para reconectar.
          </p>
        </div>
      )}

      <Avancado
        id="meta-avancado"
        aberto={avancado}
        onAbertoChange={onAvancadoChange}
        resumo="Para quem já tem um app próprio no Meta for Developers e a chave de acesso dele."
      >
        <p className="text-xs text-muted-foreground">
          A empresa precisa de um app no{' '}
          <a href="https://developers.facebook.com/" target="_blank" rel="noopener noreferrer" className="underline">
            Meta for Developers
          </a>{' '}
          com o WhatsApp Business ligado e uma chave de acesso permanente de um usuário do sistema. As
          mensagens chegam pelo endereço de entrega que o ConvoFlow já configurou na Meta.
        </p>

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
            Use a chave de longa duração de um usuário do sistema da Meta (System User). O ConvoFlow guarda
            a chave cifrada, no cofre, e ela não aparece mais. Preenchidos os campos, clique em Validar e
            conectar.
          </p>
        </div>
      </Avancado>

      {/* O endereço de entrega da Meta (Callback URL e Verify Token) é configurado UMA
          vez na instalação, por quem opera a plataforma, não pelo cliente:
          docs/RUNBOOK_troca_app_meta.md. Até o lote 3 do checkup isto aparecia
          aqui com nomes internos (VITE_*, secret do Supabase). */}
    </div>
  );
};
