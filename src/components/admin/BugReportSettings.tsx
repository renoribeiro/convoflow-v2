import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Bug, Info, Save } from 'lucide-react';
import { toast } from 'sonner';

import { supabase } from '@/integrations/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';

/** Chave em public.system_settings. Lida pela Edge Function send-report. */
const BUG_RECIPIENTS_KEY = 'bug_report_recipients';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Aceita vírgula, ponto e vírgula, quebra de linha ou espaço como separador. */
const parseEmails = (raw: string): string[] =>
  raw
    .split(/[,;\s\n]+/)
    .map((e) => e.trim())
    .filter(Boolean);

/**
 * Destinatários dos relatos de bug — apenas super admins.
 *
 * O REMETENTE continua sendo o secret REPORT_FROM_EMAIL (o mesmo dos
 * relatórios); aqui se define apenas QUEM RECEBE. Lista vazia faz a Edge
 * Function cair no fallback: envia para o próprio REPORT_FROM_EMAIL, que era o
 * comportamento anterior.
 *
 * Duplo gating: rota /dashboard/admin com RoleGuard role="superadmin" + RLS de
 * superadmin na tabela system_settings (20260601000000).
 */
export const BugReportSettings = () => {
  const queryClient = useQueryClient();
  const [value, setValue] = useState('');

  const { data: saved = [], isLoading } = useQuery({
    queryKey: ['system-settings', BUG_RECIPIENTS_KEY],
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await (supabase as any)
        .from('system_settings')
        .select('value')
        .eq('key', BUG_RECIPIENTS_KEY)
        .maybeSingle();
      if (error) throw error;
      const emails = (data?.value as { emails?: unknown } | null)?.emails;
      return Array.isArray(emails) ? emails.map(String) : [];
    },
  });

  useEffect(() => {
    setValue(saved.join('\n'));
  }, [saved]);

  const parsed = parseEmails(value);
  const invalid = parsed.filter((e) => !EMAIL_RE.test(e));
  const isDirty = parsed.join('\n') !== saved.join('\n');

  const saveMutation = useMutation({
    mutationFn: async (emails: string[]) => {
      const { error } = await (supabase as any).from('system_settings').upsert(
        {
          key: BUG_RECIPIENTS_KEY,
          value: { emails },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' },
      );
      if (error) throw error;
    },
    onSuccess: (_data, emails) => {
      toast.success(
        emails.length
          ? `Destinatários salvos (${emails.length}).`
          : 'Lista limpa. Os relatos voltam para o email dos relatórios.',
      );
      queryClient.invalidateQueries({ queryKey: ['system-settings', BUG_RECIPIENTS_KEY] });
    },
    onError: (e) => toast.error(`Não foi possível salvar. ${motivoDoErro(e)}`),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bug className="w-5 h-5" /> Quem recebe os relatos de problema
        </CardTitle>
        <CardDescription>
          Escolha quem recebe por email os relatos enviados pelo botão "Relatar problema". Só o
          Superadmin vê esta tela.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="bug-recipients">Emails (um por linha)</Label>
              <Textarea
                id="bug-recipients"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={5}
                placeholder={'suporte@convoflow.com.br\ndev@convoflow.com.br'}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                {parsed.length === 0
                  ? 'Nenhum email definido. Será usado o remetente dos relatórios.'
                  : `${parsed.length} destinatário(s).`}
              </p>
            </div>

            {invalid.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  Email que não vale: <strong>{invalid.join(', ')}</strong>. Corrija antes de salvar.
                </AlertDescription>
              </Alert>
            )}

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Quem <strong>envia</strong> é o mesmo endereço dos relatórios por email; aqui você
                escolhe só quem recebe. Com a lista vazia, os relatos vão para o próprio endereço dos
                relatórios. Todo relato fica guardado no ConvoFlow, mesmo que o email não chegue.
              </AlertDescription>
            </Alert>

            <Button
              onClick={() => saveMutation.mutate(parsed)}
              disabled={invalid.length > 0 || !isDirty || saveMutation.isPending}
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

export default BugReportSettings;
