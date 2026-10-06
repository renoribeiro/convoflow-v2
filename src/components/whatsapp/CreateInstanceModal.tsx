import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, QrCode } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';
import { useEvolutionApi } from '@/hooks/useEvolutionApi';
import { useWahaApi } from '@/hooks/useWahaApi';
import { useMetaApi } from '@/hooks/useMetaApi';
import { newInstanceSchema, type ProviderType } from '@/lib/validations/whatsappInstance';
import { ProviderSelector } from './ProviderSelector';
import {
  OfficialApiForm,
  initialOfficialValues,
  type OfficialFormValues,
} from './forms/OfficialApiForm';
import {
  WahaApiForm,
  initialWahaValues,
  type WahaFormValues,
} from './forms/WahaApiForm';
import {
  EvolutionApiForm,
  initialEvolutionValues,
  type EvolutionFormValues,
  type EvolutionWebhookStatus,
} from './forms/EvolutionApiForm';
import { QRCodeModal } from './QRCodeModal';

interface CreateInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

type WizardStep = 'select-provider' | 'configure';

export const CreateInstanceModal = ({ open, onOpenChange, onSuccess }: CreateInstanceModalProps) => {
  const [step, setStep] = useState<WizardStep>('select-provider');
  const [provider, setProvider] = useState<ProviderType | null>(null);
  const [loading, setLoading] = useState(false);

  const [officialValues, setOfficialValues] = useState<OfficialFormValues>(initialOfficialValues);
  const [wahaValues, setWahaValues] = useState<WahaFormValues>(initialWahaValues);
  const [evolutionValues, setEvolutionValues] = useState<EvolutionFormValues>(initialEvolutionValues);

  const [evolutionWebhookStatus, setEvolutionWebhookStatus] =
    useState<EvolutionWebhookStatus>('idle');
  const [evolutionWebhookError, setEvolutionWebhookError] = useState<string | null>(null);

  const [showQRModal, setShowQRModal] = useState(false);
  const [createdInstanceEvolution, setCreatedInstanceEvolution] = useState<{
    instanceName: string;
  } | null>(null);

  const { toast } = useToast();
  const { createInstance: createEvolution } = useEvolutionApi();
  const { createInstance: createWaha } = useWahaApi();
  const { createInstance: createMeta } = useMetaApi();

  const resetWizard = () => {
    setStep('select-provider');
    setProvider(null);
    setOfficialValues(initialOfficialValues());
    setWahaValues(initialWahaValues());
    setEvolutionValues(initialEvolutionValues());
    setEvolutionWebhookStatus('idle');
    setEvolutionWebhookError(null);
  };

  const handleClose = (next: boolean) => {
    if (loading) return;
    onOpenChange(next);
    if (!next) {
      resetWizard();
    }
  };

  const goToConfigure = () => {
    if (!provider) return;
    setStep('configure');
  };

  const goBackToSelect = () => {
    if (loading) return;
    setStep('select-provider');
  };

  const buildPayload = () => {
    if (provider === 'official') {
      return { provider: 'official', ...officialValues } as const;
    }
    if (provider === 'waha') {
      return { provider: 'waha', ...wahaValues } as const;
    }
    if (provider === 'evolution') {
      return { provider: 'evolution', ...evolutionValues } as const;
    }
    return null;
  };

  const handleSubmit = async () => {
    const payload = buildPayload();
    if (!payload) {
      toast({ title: 'Erro', description: 'Selecione um provider', variant: 'destructive' });
      return;
    }

    const parsed = newInstanceSchema.safeParse(payload);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      toast({
        title: 'Verifique os campos',
        description: firstIssue?.message || 'Dados inválidos',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    try {
      if (parsed.data.provider === 'evolution') {
        setEvolutionWebhookStatus(parsed.data.enableWebhookAutomation ? 'configuring' : 'idle');
        setEvolutionWebhookError(null);

        try {
          // A URL do webhook é montada pela edge function, com o SUPABASE_URL
          // do próprio servidor — o navegador não precisa (nem deve) opinar.
          await createEvolution(parsed.data.instance_key, undefined, {
            enableWebhookAutomation: parsed.data.enableWebhookAutomation,
            retryAttempts: parsed.data.retryAttempts,
            retryDelay: parsed.data.retryDelay,
            displayName: parsed.data.name,
          });
          if (parsed.data.enableWebhookAutomation) setEvolutionWebhookStatus('success');
        } catch (err: any) {
          // Qualquer falha marca erro, não só a que mencionar "webhook". Filtrar
          // pela palavra era o que deixava a tela travada em "Configurando"
          // quando o problema era outro — credencial ausente, por exemplo.
          setEvolutionWebhookStatus('error');
          setEvolutionWebhookError(err?.message || 'Não foi possível criar a instância.');
          throw err;
        }

        // Sem credenciais aqui: o QRCodeModal lê a chave DA INSTÂNCIA do
        // connection_config que a edge function acabou de gravar.
        setCreatedInstanceEvolution({ instanceName: parsed.data.instance_key });
        setShowQRModal(true);
      } else if (parsed.data.provider === 'waha') {
        await createWaha(parsed.data);
      } else if (parsed.data.provider === 'official') {
        await createMeta(parsed.data);
      }

      onSuccess();
      onOpenChange(false);
      resetWizard();
    } catch (err) {
      logger.error('Falha ao criar instância', {
        provider: parsed.data.provider,
        error: err instanceof Error ? err.message : err,
      });
      // toast já é exibido pelo hook subjacente
    } finally {
      setLoading(false);
    }
  };

  const renderForm = () => {
    if (provider === 'official') {
      return (
        <OfficialApiForm
          values={officialValues}
          onChange={(patch) => setOfficialValues((prev) => ({ ...prev, ...patch }))}
          loading={loading}
          onSignupSuccess={() => {
            onSuccess();
            onOpenChange(false);
            resetWizard();
          }}
        />
      );
    }
    if (provider === 'waha') {
      return (
        <WahaApiForm
          values={wahaValues}
          onChange={(patch) => setWahaValues((prev) => ({ ...prev, ...patch }))}
          loading={loading}
        />
      );
    }
    if (provider === 'evolution') {
      return (
        <EvolutionApiForm
          values={evolutionValues}
          onChange={(patch) => setEvolutionValues((prev) => ({ ...prev, ...patch }))}
          loading={loading}
          webhookStatus={evolutionWebhookStatus}
          webhookError={evolutionWebhookError}
        />
      );
    }
    return null;
  };

  return (
    <>
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-[640px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {step === 'select-provider' ? 'Nova Instância de WhatsApp' : 'Configurar API'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {step === 'select-provider'
                ? 'Escolha qual API o ConvoFlow vai usar para esta instância.'
                : 'Preencha os dados de acesso. Os campos sensíveis serão protegidos.'}
            </DialogDescription>
          </DialogHeader>

          {step === 'select-provider' ? (
            <ProviderSelector value={provider} onChange={setProvider} disabled={loading} />
          ) : (
            renderForm()
          )}

          <DialogFooter className="gap-2 sm:gap-2">
            {step === 'select-provider' ? (
              <>
                <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={goToConfigure} disabled={!provider || loading}>
                  Continuar
                </Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={goBackToSelect} disabled={loading}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Voltar
                </Button>
                <div className="flex-1" />
                <Button variant="outline" onClick={() => handleClose(false)} disabled={loading}>
                  Cancelar
                </Button>
                <Button onClick={handleSubmit} disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {provider === 'evolution' && (
                    <>
                      <QrCode className="mr-2 h-4 w-4" />
                      Criar e abrir QR Code
                    </>
                  )}
                  {provider === 'waha' && 'Salvar instância'}
                  {provider === 'official' && 'Validar e conectar'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createdInstanceEvolution && (
        <QRCodeModal
          open={showQRModal}
          onOpenChange={(next) => {
            setShowQRModal(next);
            if (!next) setCreatedInstanceEvolution(null);
          }}
          instanceName={createdInstanceEvolution.instanceName}
          onSuccess={onSuccess}
        />
      )}
    </>
  );
};

export default CreateInstanceModal;
