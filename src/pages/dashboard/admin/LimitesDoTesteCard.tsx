import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { DicaDoCampo } from '@/components/shared/DicaDoCampo';
import { QUERY_KEYS } from '@/lib/queryClient';
import { motivoDoErro } from '@/lib/errors/mensagemDoErro';
import {
  CAMPOS_DOS_LIMITES,
  type CampoDoLimite,
  useLimitesDaPlataforma,
} from '@/lib/billing/limitesDoTeste';

/**
 * Os limites do teste grátis e do cadastro pelo site (sessão 2, migração
 * 20261109000001). Diferente da tabela de baixo desta tela, estes VALEM: o
 * servidor confere cada um (public.teste_limite e public_signup_registrar).
 * Só o superadmin muda, por public.definir_limites_da_plataforma.
 */

const ROTULOS: Record<CampoDoLimite, string> = {
  teste_lojas: 'Lojas por Conta',
  teste_numeros: 'Números de WhatsApp por Conta',
  teste_numeros_qr: 'Desses, por QR Code',
  teste_mensagens_dia: 'Mensagens enviadas por dia',
  teste_contatos_campanha: 'Contatos por disparo de campanha',
  cadastro_por_hora: 'Cadastros por hora',
  cadastro_por_dia: 'Cadastros por dia',
};

function Dica({ campo }: { campo: CampoDoLimite }) {
  // Texto literal em cada dica: o teste de cobertura confere tamanho e hífen.
  switch (campo) {
    case 'teste_lojas':
      return <DicaDoCampo rotulo="Lojas por Conta" texto="Vale só para Conta em teste grátis. Depois do primeiro pagamento, a Conta segue as Lojas do plano." />;
    case 'teste_numeros':
      return <DicaDoCampo rotulo="Números de WhatsApp por Conta" texto="Soma os números de todas as Lojas da Conta, por qualquer conexão. O Instagram não entra na conta." />;
    case 'teste_numeros_qr':
      return <DicaDoCampo rotulo="Desses, por QR Code" texto="Números ligados pelo nosso servidor Evolution, que é custo nosso. Não pode passar do total de números." />;
    case 'teste_mensagens_dia':
      return <DicaDoCampo rotulo="Mensagens enviadas por dia" texto="Mensagens que saíram hoje, no horário de Brasília, somando a Conta e as Lojas. As que chegam nunca contam nem são barradas." />;
    case 'teste_contatos_campanha':
      return <DicaDoCampo rotulo="Contatos por disparo de campanha" texto="Disparo maior que isso é recusado na hora de disparar, e a pessoa lê o limite e como dividir o público." />;
    case 'cadastro_por_hora':
      return <DicaDoCampo rotulo="Cadastros por hora" texto="Soma de todos os cadastros do site, de qualquer pessoa. Passou, o visitante lê que muitos cadastros estão chegando e tenta depois." />;
    case 'cadastro_por_dia':
      return <DicaDoCampo rotulo="Cadastros por dia" texto="Soma das últimas 24 horas. Precisa ser igual ou maior que o limite por hora." />;
  }
}

export function LimitesDoTesteCard() {
  const qc = useQueryClient();
  const { data: limites, isLoading, isError } = useLimitesDaPlataforma();
  const [valores, setValores] = useState<Partial<Record<CampoDoLimite, string>>>({});

  useEffect(() => {
    if (!limites) return;
    const inicial: Partial<Record<CampoDoLimite, string>> = {};
    for (const c of CAMPOS_DOS_LIMITES) inicial[c] = String(limites[c]);
    setValores(inicial);
  }, [limites]);

  const mudou = limites ? CAMPOS_DOS_LIMITES.filter((c) => valores[c] !== String(limites[c])) : [];

  const salvar = useMutation({
    mutationFn: async () => {
      const patch: Record<string, number> = {};
      for (const c of mudou) {
        const n = Number(valores[c]);
        if (!Number.isInteger(n) || n < 0) throw new Error(`Use um número inteiro em "${ROTULOS[c]}".`);
        patch[c] = n;
      }
      const { error } = await supabase.rpc('definir_limites_da_plataforma' as never, { p_limites: patch } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Limites salvos. Valem a partir de agora.');
      qc.invalidateQueries({ queryKey: [QUERY_KEYS.SETTINGS, 'limites-da-plataforma'] });
    },
    onError: (e: unknown) =>
      toast.error('Não foi possível salvar', {
        description: e instanceof Error && e.message.startsWith('Use um número') ? e.message : motivoDoErro(e),
      }),
  });

  const campo = (c: CampoDoLimite) => (
    <div key={c} className="space-y-1">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={`limite-${c}`}>{ROTULOS[c]}</Label>
        <Dica campo={c} />
      </div>
      <Input
        id={`limite-${c}`}
        type="number"
        inputMode="numeric"
        min={c === 'teste_numeros_qr' ? 0 : 1}
        value={valores[c] ?? ''}
        onChange={(e) => setValores((v) => ({ ...v, [c]: e.target.value }))}
      />
    </div>
  );

  return (
    <Card data-testid="limites-do-teste-card">
      <CardHeader>
        <CardTitle className="text-base">Teste grátis e cadastro pelo site</CardTitle>
        <CardDescription>
          Estes valem de verdade: o servidor confere cada um. Os do teste valem só para a Conta em teste grátis e
          acabam no primeiro pagamento. A liberação manual nunca é limitada.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-md" />
            ))}
          </div>
        ) : isError || !limites ? (
          <p className="text-sm text-muted-foreground">Não foi possível carregar os limites. Recarregue a página.</p>
        ) : (
          <>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Durante o teste grátis</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {(['teste_lojas', 'teste_numeros', 'teste_numeros_qr', 'teste_mensagens_dia', 'teste_contatos_campanha'] as const).map(campo)}
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Cadastro pelo site (o sistema inteiro)</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                {(['cadastro_por_hora', 'cadastro_por_dia'] as const).map(campo)}
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                {limites.atualizado_em
                  ? `Última mudança: ${new Date(limites.atualizado_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
                  : null}
              </p>
              <Button onClick={() => salvar.mutate()} disabled={mudou.length === 0 || salvar.isPending}>
                {salvar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Salvar limites
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
