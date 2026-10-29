import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Loader2, RefreshCw, X } from 'lucide-react';
import { useMetaTemplates, useMetaWabaGroups } from '@/hooks/useMetaTemplates';
import {
  chaveDoTemplate,
  parametrosParaTemplate,
  templatesAprovados,
  type TemplateEscolhido,
} from '@/lib/templates/escolherTemplate';

const NOME_DO_IDIOMA: Record<string, string> = {
  pt_BR: 'Português (Brasil)',
  en_US: 'English (US)',
  es: 'Español',
};

interface EscolherTemplateProps {
  /** Número da API Oficial que envia: a lista é a da conta Meta dele. */
  instanceId: string | null;
  valor: TemplateEscolhido;
  aoMudar: (valor: TemplateEscolhido) => void;
  /** Frase sobre as variáveis que o envio troca ("{name}", "{{primeiro_nome}}"...). */
  dicaDasVariaveis: string;
  /** Prefixo dos ids dos campos (mais de um seletor na mesma tela). */
  idBase?: string;
}

/**
 * Escolha do template aprovado (achado 93, decisão D12). O template sai da
 * lista dos APROVADOS da conta Meta do número, e a lista monta os campos das
 * variáveis do corpo. Digitar o nome à mão fica escondido em "Digitar o nome à
 * mão", para quando a lista não carrega.
 *
 * Usado na Nova campanha, no Follow up agendado e nos passos de WhatsApp das
 * sequências. A conversa tem a própria janela (SendTemplateDialog), que já
 * seguia esta regra.
 */
export function EscolherTemplate({ instanceId, valor, aoMudar, dicaDasVariaveis, idBase = 'tpl' }: EscolherTemplateProps) {
  const { data, isLoading, isFetching, error, refetch } = useMetaTemplates(instanceId);
  const aprovados = useMemo(() => templatesAprovados(data ?? []), [data]);
  const escolhido = aprovados.find((t) => chaveDoTemplate(t) === chaveDoTemplate(valor)) ?? null;

  // À mão: quando a pessoa pede, quando a lista falha ou quando o que estava
  // gravado não está (mais) entre os aprovados.
  const [aMao, setAMao] = useState(false);
  const foraDaLista = !isLoading && !error && !!valor.nome.trim() && !escolhido;
  useEffect(() => {
    if (error || foraDaLista) setAMao(true);
  }, [error, foraDaLista]);

  const escolher = (chave: string) => {
    const t = aprovados.find((x) => chaveDoTemplate(x) === chave);
    if (!t) return;
    aoMudar({ nome: t.name, idioma: t.language, parametros: parametrosParaTemplate(t, valor.parametros) });
  };

  const mudarParametro = (i: number, texto: string) => {
    const novos = [...valor.parametros];
    novos[i] = texto;
    aoMudar({ ...valor, parametros: novos });
  };

  const campos = valor.parametros.map((p, i) => (
    <div key={i} className="flex items-center gap-2">
      <Label htmlFor={`${idBase}-var-${i}`} className="w-24 shrink-0 text-xs text-muted-foreground">
        Variável {i + 1}
      </Label>
      <Input
        id={`${idBase}-var-${i}`}
        value={p}
        placeholder={`O que entra no lugar de {{${i + 1}}}`}
        onChange={(e) => mudarParametro(i, e.target.value)}
      />
      {aMao && (
        <button
          type="button"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Tirar a variável ${i + 1}`}
          data-alvo-expandido
          onClick={() => aoMudar({ ...valor, parametros: valor.parametros.filter((_, j) => j !== i) })}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  ));

  return (
    <div className="space-y-3">
      {!aMao ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`${idBase}-lista`}>Template aprovado *</Label>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary disabled:opacity-50"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
          {isLoading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando os templates aprovados...
            </p>
          ) : aprovados.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-sm">
                Esta conta ainda não tem template aprovado. A aprovação é feita no Gerenciador do WhatsApp
                Business da Meta; depois, clique em Atualizar. Veja a situação de cada um em{' '}
                <Link to="/dashboard/templates" className="underline">Templates</Link>.
              </AlertDescription>
            </Alert>
          ) : (
            <Select value={escolhido ? chaveDoTemplate(escolhido) : ''} onValueChange={escolher}>
              <SelectTrigger id={`${idBase}-lista`}>
                <SelectValue placeholder="Escolha o template" />
              </SelectTrigger>
              <SelectContent>
                {aprovados.map((t) => (
                  <SelectItem key={chaveDoTemplate(t)} value={chaveDoTemplate(t)}>
                    {t.name} · {NOME_DO_IDIOMA[t.language] ?? t.language}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {escolhido?.bodyText && (
            <p className="whitespace-pre-wrap rounded border bg-muted/30 p-2 text-xs text-muted-foreground">
              {escolhido.bodyText}
            </p>
          )}
          {escolhido && valor.parametros.length === 0 && (
            <p className="text-xs text-muted-foreground">Este template não tem variáveis: ele sai como está.</p>
          )}
          {escolhido && valor.parametros.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Preencha cada variável do texto acima, na ordem. {dicaDasVariaveis}
              </p>
              {campos}
            </div>
          )}
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-primary"
            onClick={() => setAMao(true)}
          >
            Digitar o nome à mão
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {error && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Não deu para carregar a lista de templates ({(error as Error).message}). Digite o nome à mão.
              </AlertDescription>
            </Alert>
          )}
          {foraDaLista && !error && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                O template "{valor.nome}" não está entre os aprovados desta conta. Confira o nome ou escolha outro da lista.
              </AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor={`${idBase}-nome`}>Nome do template *</Label>
              {!error && aprovados.length > 0 && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-primary"
                  onClick={() => setAMao(false)}
                >
                  Escolher da lista
                </button>
              )}
            </div>
            <Input
              id={`${idBase}-nome`}
              placeholder="Ex: pedido_confirmado"
              value={valor.nome}
              onChange={(e) => aoMudar({ ...valor, nome: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              O nome exato do template aprovado, como está no Gerenciador do WhatsApp Business.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${idBase}-idioma`}>Idioma do template</Label>
            <Select value={valor.idioma} onValueChange={(v) => aoMudar({ ...valor, idioma: v })}>
              <SelectTrigger id={`${idBase}-idioma`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(NOME_DO_IDIOMA).map(([codigo, nome]) => (
                  <SelectItem key={codigo} value={codigo}>{nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Variáveis</span>
              <button
                type="button"
                className="text-xs text-primary hover:underline"
                onClick={() => aoMudar({ ...valor, parametros: [...valor.parametros, ''] })}
              >
                + Adicionar variável
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              Uma por variável do template, na ordem em que aparecem no texto. {dicaDasVariaveis}
            </p>
            {campos}
          </div>
        </div>
      )}
    </div>
  );
}

interface EscolherTemplateDaLojaProps extends Omit<EscolherTemplateProps, 'instanceId'> {
  /** Conta Meta escolhida (instância alça do grupo); null usa a primeira. */
  instanceIdDaConta: string | null;
  aoMudarConta: (instanceId: string) => void;
}

/**
 * Para quem não sabe ainda por qual número vai sair (passo de sequência): a
 * lista é a da conta Meta da Loja. Com mais de uma conta, a pessoa escolhe qual.
 */
export function EscolherTemplateDaLoja({ instanceIdDaConta, aoMudarConta, ...resto }: EscolherTemplateDaLojaProps) {
  const { groups, isLoading } = useMetaWabaGroups();
  const conta = groups.find((g) => g.instanceId === instanceIdDaConta) ?? groups[0] ?? null;

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a conta do WhatsApp Business...
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {groups.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor={`${resto.idBase ?? 'tpl'}-conta`}>Conta do WhatsApp Business</Label>
          <Select value={conta?.instanceId ?? ''} onValueChange={aoMudarConta}>
            <SelectTrigger id={`${resto.idBase ?? 'tpl'}-conta`}>
              <SelectValue placeholder="Escolha a conta" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((g) => (
                <SelectItem key={g.instanceId} value={g.instanceId}>{g.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <EscolherTemplate instanceId={conta?.instanceId ?? null} {...resto} />
    </div>
  );
}
