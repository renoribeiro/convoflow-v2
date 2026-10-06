import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveTable, type ResponsiveColumn } from '@/components/shared/ResponsiveTable';
import { toast } from 'sonner';
import { QUERY_KEYS } from '@/lib/queryClient';
import { UserRole, roleLabel } from '@/types/userHierarchy';
import { PageHeader } from '@/components/shared/PageHeader';

interface UsageLimit {
  id: string;
  role: UserRole;
  limit_name: string;
  limit_value: { limit: number | null };
  description: string | null;
}

export default function UsageLimitsPage() {
  const qc = useQueryClient();
  const [edited, setEdited] = useState<Record<string, string>>({});

  const { data: limits = [], isLoading } = useQuery({
    queryKey: [QUERY_KEYS.USAGE_LIMITS],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from('usage_limits')
        .select('*')
        .order('role')
        .order('limit_name');
      if (error) throw error;
      return (data ?? []) as unknown as UsageLimit[];
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, limitValue }: { id: string; limitValue: number | null }) => {
      const { error } = await (supabase as any)
        .from('usage_limits')
        .update({ limit_value: { limit: limitValue } })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Limite atualizado.');
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.USAGE_LIMITS] });
    },
    onError: (e: Error) => toast.error(`Falha: ${e.message}`),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Limites de uso por nível"
        helpKey="page:admin-usage-limits"
        description="Configure os limites aplicados a cada nível da hierarquia. Deixe vazio para sem limite."
        breadcrumbs={[
          { label: 'Dashboard', href: '/dashboard' },
          { label: 'Administração', href: '/dashboard/admin' },
          { label: 'Limites de Uso' },
        ]}
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Configurações de limites</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : (
            // Cartão no celular: o nome do limite lidera, o nível vem
            // embaixo, a descrição e o campo de valor ocupam a linha toda e
            // "Salvar" fica no canto — o mesmo controle da tabela.
            <ResponsiveTable
              ariaLabel="Limites de uso"
              rows={limits}
              rowKey={(l) => l.id}
              columns={[
                { key: 'nivel', header: 'Nível', card: 'subtitle', cellClassName: 'font-medium', cell: (l) => roleLabel(l.role as any) },
                { key: 'limite', header: 'Limite', card: 'title', cell: (l) => l.limit_name },
                { key: 'descricao', header: 'Descrição', cardFull: true, cellClassName: 'text-muted-foreground text-sm', cell: (l) => l.description ?? '—' },
                {
                  key: 'valor',
                  header: 'Valor',
                  cardFull: true,
                  headClassName: 'w-[180px]',
                  cell: (l) => {
                    const editing = edited[l.id];
                    const currentValue =
                      editing !== undefined
                        ? editing
                        : l.limit_value?.limit?.toString() ?? '';
                    return (
                      <Input
                        type="number"
                        min={0}
                        value={currentValue}
                        placeholder="Sem limite"
                        aria-label={`Valor de ${l.limit_name}`}
                        className="h-8"
                        onChange={(e) =>
                          setEdited((prev) => ({ ...prev, [l.id]: e.target.value }))
                        }
                      />
                    );
                  },
                },
              ]}
              actions={(l) => {
                const editing = edited[l.id];
                return (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={editing === undefined || update.isPending}
                    onClick={() => {
                      const parsed = editing === '' ? null : Number(editing);
                      update.mutate(
                        { id: l.id, limitValue: parsed as number | null },
                        {
                          onSuccess: () =>
                            setEdited((prev) => {
                              const { [l.id]: _, ...rest } = prev;
                              return rest;
                            }),
                        },
                      );
                    }}
                  >
                    Salvar
                  </Button>
                );
              }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
