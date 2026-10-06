import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Smartphone, Save, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { onlyWhatsApp } from '@/lib/whatsapp/connectionSections';

const REPORT_WA_KEY = 'report_whatsapp_instance_id';

const providerLabel = (p?: string) =>
  p === 'official' ? 'Meta (oficial)' : p === 'waha' ? 'WAHA' : 'Evolution';

/**
 * Configurações globais do sistema — acessível apenas por super admins
 * (gating na página Settings + RLS na tabela system_settings).
 *
 * Hoje: define a instância de WhatsApp de envio do sistema (relatórios).
 */
export const SystemSettings = () => {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>('');

  const { data: instances = [], isLoading: loadingInstances } = useQuery({
    queryKey: ['system-settings', 'whatsapp-instances'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_instances')
        .select('id, name, phone_number, provider, status')
        .order('created_at', { ascending: true });
      if (error) throw error;
      // Relatório sai por WhatsApp: a conta do Instagram não é opção.
      return onlyWhatsApp(data ?? []);
    },
  });

  const { data: current = '', isLoading: loadingCurrent } = useQuery({
    queryKey: ['system-settings', REPORT_WA_KEY],
    queryFn: async () => {
      // system_settings é uma tabela nova ainda fora dos tipos gerados — cast local.
      const { data, error } = await (supabase as any)
        .from('system_settings')
        .select('value')
        .eq('key', REPORT_WA_KEY)
        .maybeSingle();
      if (error) throw error;
      return ((data?.value as any)?.instanceId as string) ?? '';
    },
  });

  useEffect(() => {
    if (current) setSelected(current);
  }, [current]);

  const saveMutation = useMutation({
    mutationFn: async (instanceId: string) => {
      const { error } = await (supabase as any)
        .from('system_settings')
        .upsert(
          { key: REPORT_WA_KEY, value: { instanceId }, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Número de envio do sistema salvo.');
      queryClient.invalidateQueries({ queryKey: ['system-settings', REPORT_WA_KEY] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Erro ao salvar.'),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone className="w-5 h-5" /> Envio do Sistema (WhatsApp)
        </CardTitle>
        <CardDescription>
          Define qual número de WhatsApp o sistema usa para enviar relatórios. Apenas super admins têm acesso.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingInstances || loadingCurrent ? (
          <Skeleton className="h-10 w-full" />
        ) : instances.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Nenhuma instância de WhatsApp conectada. Conecte um número em <strong>Números WhatsApp</strong> antes
              de configurar o envio do sistema.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Número de envio dos relatórios</Label>
              <Select value={selected} onValueChange={setSelected}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma instância" />
                </SelectTrigger>
                <SelectContent>
                  {instances.map((i: any) => (
                    <SelectItem key={i.id} value={i.id}>
                      {(i.name || i.phone_number || i.id.slice(0, 8))} · {providerLabel(i.provider)}
                      {i.status ? ` (${i.status})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Números <strong>Meta (oficial)</strong> só enviam mensagem livre dentro da janela de 24h; fora disso é
                necessário um template aprovado. Para envio proativo de relatórios sem restrição, prefira uma instância
                Evolution/WAHA.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => saveMutation.mutate(selected)}
              disabled={!selected || saveMutation.isPending}
              className="gap-2"
            >
              <Save className="w-4 h-4" />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default SystemSettings;
