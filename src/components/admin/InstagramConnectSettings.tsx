import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Instagram } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { setInstagramConnectEnabled } from '@/hooks/useInstagramConnect';
import { instagramConnectRows, type TenantRowForInstagram } from '@/lib/instagram/connectAdmin';

/**
 * Administração › Configurações › "Conectar Instagram por Loja" (fatia 4b).
 *
 * A chave que faz o botão "Conectar Instagram" aparecer numa Loja. Enquanto a
 * Meta não concede o acesso avançado ao app, só contas do Instagram com papel
 * no app conseguem entrar — um cliente de verdade bateria num erro da Meta. Por
 * isso nasce desligada e só o superadmin liga, Loja por Loja.
 *
 * LÊ direto (a tabela tem policy de SELECT só para superadmin) e ESCREVE pela
 * RPC set_instagram_connect_enabled, que confere superadmin e recusa Conta.
 */
export function InstagramConnectSettings() {
  const queryClient = useQueryClient();
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-instagram-connect-stores'],
    queryFn: async () => {
      const [tenants, chaves] = await Promise.all([
        supabase.from('tenants').select('id, name, kind, parent_tenant_id').order('name', { ascending: true }),
        // Tabela nova, fora dos tipos gerados — cast local.
        (supabase as any).from('instagram_connect_stores').select('tenant_id'),
      ]);
      if (tenants.error) throw tenants.error;
      if (chaves.error) throw chaves.error;
      return {
        tenants: (tenants.data ?? []) as TenantRowForInstagram[],
        enabled: new Set<string>(((chaves.data ?? []) as { tenant_id: string }[]).map((r) => r.tenant_id)),
      };
    },
  });

  const rows = useMemo(
    () => (data ? instagramConnectRows(data.tenants, data.enabled, busca) : []),
    [data, busca],
  );

  const alternar = async (tenantId: string, nome: string, ligar: boolean) => {
    setSalvando(tenantId);
    const r = await setInstagramConnectEnabled(tenantId, ligar);
    setSalvando(null);
    if (!r.ok) {
      toast.error(r.message);
      return;
    }
    toast.success(ligar ? `Conexão do Instagram liberada na Loja ${nome}.` : `Conexão do Instagram desligada na Loja ${nome}.`);
    queryClient.invalidateQueries({ queryKey: ['admin-instagram-connect-stores'] });
    queryClient.invalidateQueries({ queryKey: ['instagram-connect-enabled'] });
  };

  return (
    <Card data-testid="instagram-connect-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Instagram className="h-5 w-5 text-[#E4405F]" aria-hidden /> Conectar Instagram por Loja
        </CardTitle>
        <CardDescription>
          Ligue para a Loja ver o botão "Conectar Instagram" em Instâncias e APIs. Enquanto o app não tiver o acesso
          avançado da Meta, só contas do Instagram com papel no app conseguem entrar: ligue apenas em Lojas de teste.
          Desligar esconde o botão; contas já conectadas continuam funcionando.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          placeholder="Buscar Loja ou Conta..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-full sm:w-[300px]"
        />
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma Loja encontrada.</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="font-medium truncate">{r.name}</p>
                  {r.parentName && <p className="text-xs text-muted-foreground truncate">Conta {r.parentName}</p>}
                </div>
                <Switch
                  checked={r.enabled}
                  disabled={salvando === r.id}
                  onCheckedChange={(v) => alternar(r.id, r.name, v)}
                  aria-label={`Conectar Instagram na Loja ${r.name}`}
                />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
