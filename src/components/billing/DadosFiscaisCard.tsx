import { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useDadosFiscais, useSalvarDadosFiscais } from '@/hooks/useDadosFiscais';
import { documentoMascarado, enderecoResumido, formularioDaLinha } from '@/lib/billing/dadosFiscais';
import { DadosFiscaisForm } from '@/components/billing/DadosFiscaisForm';

/**
 * "Dados para a nota fiscal" da Conta: resumo (com o documento mascarado) e
 * "Alterar", ou o formulário quando ainda não há dados.
 *
 *   podeEditar   só o Gerente da Conta grava (o RLS confere de novo). O
 *                superadmin vê o resumo, sem botão.
 *   obrigatorio  mostra o selo "Obrigatório para assinar". Conta com acesso
 *                manual não paga, então não precisa (o selo some), mas o
 *                checkout continua exigindo os dados se ela decidir assinar.
 *   semCartao    o conteúdo sem a moldura do Card (na tela de bloqueio, que já
 *                é um cartão).
 */
interface Props {
  contaId: string | null;
  podeEditar: boolean;
  obrigatorio?: boolean;
  emailPadrao?: string;
  semCartao?: boolean;
}

export function DadosFiscaisCard({ contaId, podeEditar, obrigatorio = false, emailPadrao = '', semCartao = false }: Props) {
  const { dados, completos, carregando, erro } = useDadosFiscais(contaId);
  const salvar = useSalvarDadosFiscais(contaId);
  const { toast } = useToast();
  const [editando, setEditando] = useState(false);
  const [erroAoSalvar, setErroAoSalvar] = useState<string | null>(null);

  const mostrarFormulario = podeEditar && (editando || !completos);

  const titulo = (
    <span className="flex flex-wrap items-center gap-2">
      <FileText className="h-5 w-5" /> Dados para a nota fiscal
      {completos ? (
        <Badge className="bg-success/10 text-success hover:bg-success/10">
          <CheckCircle2 className="mr-1 h-3 w-3" /> Preenchidos
        </Badge>
      ) : obrigatorio ? (
        <Badge className="bg-warning/10 text-warning hover:bg-warning/10">Obrigatório para assinar</Badge>
      ) : null}
    </span>
  );
  const descricao = podeEditar
    ? 'A nota fiscal de cada cobrança sai com estes dados e chega neste email. Só o Gerente da Conta vê e altera.'
    : 'Os dados que a Conta informou para a nota fiscal. Só o Gerente da Conta altera.';

  const corpo = carregando ? (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
    </p>
  ) : erro ? (
    <p className="flex items-center gap-2 text-sm text-destructive">
      <AlertTriangle className="h-4 w-4" /> {erro.message}
    </p>
  ) : mostrarFormulario ? (
    <DadosFiscaisForm
      inicial={formularioDaLinha(dados, emailPadrao)}
      salvando={salvar.isPending}
      erroDoServidor={erroAoSalvar}
      rotuloSalvar={dados ? 'Salvar alterações' : 'Salvar dados'}
      onCancelar={dados && completos ? () => { setEditando(false); setErroAoSalvar(null); } : undefined}
      onSalvar={(form) => {
        setErroAoSalvar(null);
        salvar.mutate(form, {
          onSuccess: () => {
            setEditando(false);
            toast({ title: 'Dados salvos', description: 'A nota fiscal das próximas cobranças sai com estes dados.' });
          },
          onError: (e) => setErroAoSalvar(e instanceof Error ? e.message : 'Não foi possível salvar os dados.'),
        });
      }}
    />
  ) : dados ? (
    <div className="space-y-3 text-sm" data-testid="dados-fiscais-resumo">
      <dl className="grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{dados.person_type === 'cpf' ? 'Nome' : 'Razão social'}</dt>
          <dd className="font-medium break-words">{dados.legal_name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Documento</dt>
          <dd className="font-mono text-xs">{documentoMascarado(dados.person_type, dados.tax_id)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Endereço</dt>
          <dd className="break-words">{enderecoResumido(dados)}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-muted-foreground">Email da nota</dt>
          <dd className="break-all">{dados.invoice_email}</dd>
        </div>
      </dl>
      {podeEditar ? (
        <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditando(true)}>
          <Pencil className="h-4 w-4" /> Alterar
        </Button>
      ) : null}
    </div>
  ) : (
    <p className="text-sm text-muted-foreground">A Conta ainda não informou os dados para a nota fiscal.</p>
  );

  if (semCartao) {
    return (
      <section className="space-y-3 rounded-md border p-4 text-left" aria-label="Dados para a nota fiscal">
        <div className="space-y-1">
          <h3 className="text-base font-semibold">{titulo}</h3>
          <p className="text-xs text-muted-foreground">{descricao}</p>
        </div>
        {corpo}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>{corpo}</CardContent>
    </Card>
  );
}
