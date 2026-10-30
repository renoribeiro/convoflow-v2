import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { isWhatsAppConnectedStatus } from '@/lib/whatsapp/connectionSections';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Smartphone, KeyRound, Calendar, Phone, User, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react';
import { instanceAction } from '@/services/whatsapp/instanceActions';
import { useToast } from '@/hooks/use-toast';

interface ViewInstance {
  id: string;
  name: string;
  instance_key: string;
  provider?: string | null;
  phone_number?: string | null;
  profile_name?: string | null;
  status?: string | null;
  last_connected_at?: string | null;
  created_at: string;
}

interface ViewInstanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance: ViewInstance;
  /** Depois de trocar a chave com sucesso. */
  onKeyReplaced?: () => void;
}

/**
 * Detalhes de um número Evolution ou WAHA.
 *
 * Mostra se há chave salva ("Chave configurada: sim ou não") e deixa trocá-la.
 * Nunca mostra a chave nem o endereço do servidor, nem mascarados: os dois
 * moram no cofre e só o servidor os lê (whatsapp-instance-action, ações
 * `credential` e `replace_key`). A troca só vale se a chave nova abrir ESTE
 * número no servidor; senão nada muda.
 */
export const ViewInstanceModal = ({ open, onOpenChange, instance, onKeyReplaced }: ViewInstanceModalProps) => {
  const { toast } = useToast();
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [saving, setSaving] = useState(false);
  const isWaha = instance.provider === 'waha';

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setConfigured(null);
    setCheckError(null);
    setReplacing(false);
    setNewKey('');
    void instanceAction(instance.id, 'credential').then((r) => {
      if (!vivo) return;
      if (r.ok) setConfigured(r.credential_configured === true);
      else setCheckError(r.error || 'Não foi possível conferir a chave.');
    });
    return () => {
      vivo = false;
    };
  }, [open, instance.id]);

  const salvar = async () => {
    setSaving(true);
    const r = await instanceAction(instance.id, 'replace_key', { api_key: newKey.trim() });
    setSaving(false);
    if (!r.ok) {
      toast({ title: 'A chave não foi trocada', description: r.error, variant: 'destructive' });
      return;
    }
    setNewKey('');
    setReplacing(false);
    setConfigured(true);
    toast({ title: 'Chave trocada', description: 'O ConvoFlow conferiu a chave nova neste número e guardou no cofre.' });
    onKeyReplaced?.();
  };

  const conectado = isWhatsAppConnectedStatus(instance.status);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Smartphone className="h-5 w-5" />
            {instance.name}
          </DialogTitle>
          <DialogDescription>
            {isWaha ? 'Número WAHA (servidor seu)' : 'Número Evolution (servidor da plataforma)'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Card>
            <CardContent className="space-y-3 pt-6 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant={conectado ? 'default' : 'secondary'}>{conectado ? 'Conectado' : 'Desconectado'}</Badge>
              </div>
              <p>
                <span className="font-medium">Código interno do número:</span>{' '}
                <code className="bg-muted px-2 py-0.5 rounded text-xs">{instance.instance_key}</code>
              </p>
              {instance.profile_name && (
                <p className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  {instance.profile_name}
                </p>
              )}
              {instance.phone_number && (
                <p className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {instance.phone_number}
                </p>
              )}
              <p className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                Criado em {format(new Date(instance.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
              </p>
              {instance.last_connected_at && (
                <p className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  Última conexão em {format(new Date(instance.last_connected_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <KeyRound className="h-4 w-4" />
                Chave de acesso ao servidor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p data-testid="chave-configurada" className="flex items-center gap-2">
                {configured === null && !checkError && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Conferindo...
                  </>
                )}
                {configured === true && (
                  <>
                    <ShieldCheck className="h-4 w-4 text-success" /> Chave configurada: sim
                  </>
                )}
                {configured === false && (
                  <>
                    <ShieldAlert className="h-4 w-4 text-destructive" /> Chave configurada: não
                  </>
                )}
                {checkError && <span className="text-destructive">{checkError}</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                A chave fica guardada no cofre do ConvoFlow e nenhuma tela a mostra, nem em parte.
                {isWaha
                  ? ' É a API Key (X-Api-Key) do seu servidor WAHA.'
                  : ' É a chave deste número no servidor Evolution, não a chave do servidor inteiro.'}
              </p>

              {!replacing ? (
                <Button variant="outline" size="sm" onClick={() => setReplacing(true)} disabled={configured === null && !checkError}>
                  Substituir chave
                </Button>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="nova-chave">Chave nova</Label>
                  <Input
                    id="nova-chave"
                    type="password"
                    autoComplete="off"
                    value={newKey}
                    onChange={(e) => setNewKey(e.target.value)}
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    O ConvoFlow testa a chave neste número antes de guardar. Se o servidor recusar, nada muda.
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={salvar} disabled={saving || newKey.trim().length < 8}>
                      {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Testar e guardar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setReplacing(false);
                        setNewKey('');
                      }}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
};
