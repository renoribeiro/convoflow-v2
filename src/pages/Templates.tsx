/**
 * Templates (/dashboard/templates) — consulta, somente leitura.
 *
 * Mostra os templates que já existem na conta do WhatsApp Business, para o
 * atendente saber o que pode disparar sem sair do ConvoFlow e sem depender de
 * alguém abrir o Gerenciador da Meta para conferir.
 *
 * Criar e submeter template para aprovação NÃO acontece aqui — é no WhatsApp
 * Manager da Meta. Esta tela lê e só.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, FileText, RefreshCw, Search, Smartphone } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Skeleton } from '@/components/shared/Skeleton';
import { TemplateStatusBadge } from '@/components/shared/TemplateStatusBadge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

import { useMetaTemplates, useMetaWabaGroups } from '@/hooks/useMetaTemplates';
import {
  buttonTypeLabel,
  filterTemplateGroups,
  groupTemplatesByName,
  headerFormatLabel,
  languageLabel,
  splitTemplateText,
  templateCategoryLabel,
  type TemplateNameGroup,
} from '@/lib/templates/metaTemplates';
import type { WhatsAppTemplate } from '@/services/whatsapp';

/** Texto do template com os {{n}} destacados. */
const TemplateText = ({ text }: { text?: string }) => {
  const segments = splitTemplateText(text);
  if (segments.length === 0) return null;

  return (
    <p className="text-sm whitespace-pre-wrap break-words">
      {segments.map((segment, index) =>
        segment.type === 'param' ? (
          <code
            key={index}
            className="rounded bg-primary/10 px-1 py-0.5 font-mono text-xs text-primary"
          >
            {segment.value}
          </code>
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </p>
  );
};

/** Um idioma de um template: cabeçalho, corpo, rodapé e botões. */
const TemplateLanguage = ({ template }: { template: WhatsAppTemplate }) => {
  const header = template.header;
  const buttons = template.buttons ?? [];

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{languageLabel(template.language)}</span>
        <TemplateStatusBadge status={template.status} />
        {typeof template.paramCount === 'number' && template.paramCount > 0 && (
          <span className="text-xs text-muted-foreground">
            {template.paramCount === 1 ? '1 variável' : `${template.paramCount} variáveis`}
          </span>
        )}
      </div>

      {header && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Cabeçalho · {headerFormatLabel(header.format)}
          </p>
          {header.text ? (
            <TemplateText text={header.text} />
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Mídia enviada no momento do disparo.
            </p>
          )}
        </div>
      )}

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase text-muted-foreground">Corpo</p>
        {template.bodyText ? (
          <TemplateText text={template.bodyText} />
        ) : (
          <p className="text-sm text-muted-foreground italic">Sem corpo de texto.</p>
        )}
      </div>

      {template.footer?.text && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">Rodapé</p>
          <p className="text-sm text-muted-foreground">{template.footer.text}</p>
        </div>
      )}

      {buttons.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase text-muted-foreground">Botões</p>
          <div className="flex flex-wrap gap-2">
            {buttons.map((button, index) => (
              <Badge key={index} variant="outline" className="font-normal">
                {button.text || buttonTypeLabel(button.type)}
                <span className="ml-1.5 text-muted-foreground">
                  · {buttonTypeLabel(button.type)}
                </span>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/** Um template: o nome uma vez só, com os idiomas dentro. */
const TemplateCard = ({ group }: { group: TemplateNameGroup }) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <h3 className="font-mono text-sm font-semibold break-all">{group.name}</h3>
          {group.category && (
            <Badge variant="secondary">{templateCategoryLabel(group.category)}</Badge>
          )}
        </div>
        <span className="text-xs text-muted-foreground">
          {group.languages.length === 1 ? '1 idioma' : `${group.languages.length} idiomas`}
        </span>
      </div>
    </CardHeader>
    <CardContent className="space-y-3">
      {group.languages.map((template) => (
        <TemplateLanguage key={`${template.name}::${template.language}`} template={template} />
      ))}
    </CardContent>
  </Card>
);

const ListSkeleton = () => (
  <div className="space-y-4">
    {Array.from({ length: 3 }).map((_, index) => (
      <Card key={index}>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </CardContent>
      </Card>
    ))}
  </div>
);

export default function Templates() {
  const {
    groups,
    officialCount,
    isLoading: carregandoContas,
    error: erroContas,
  } = useMetaWabaGroups();

  const [wabaSelecionado, setWabaSelecionado] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  // Sem seleção explícita, o primeiro grupo. Com uma Loja de um WABA só — o
  // caso comum — isso significa que a tela nunca pede escolha nenhuma.
  const grupoAtivo = useMemo(
    () => groups.find((g) => g.wabaId === wabaSelecionado) ?? groups[0] ?? null,
    [groups, wabaSelecionado],
  );

  const templatesQuery = useMetaTemplates(grupoAtivo?.instanceId ?? null);

  const gruposPorNome = useMemo(
    () => groupTemplatesByName(templatesQuery.data ?? []),
    [templatesQuery.data],
  );
  const visiveis = useMemo(
    () => filterTemplateGroups(gruposPorNome, busca),
    [gruposPorNome, busca],
  );

  const atualizando = templatesQuery.isFetching;

  const renderConteudo = () => {
    if (carregandoContas) return <ListSkeleton />;

    if (erroContas) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar seus números</AlertTitle>
          <AlertDescription>{erroContas.message}</AlertDescription>
        </Alert>
      );
    }

    // Estado padrão da maioria das Lojas hoje: nenhum número na API Oficial.
    // Precisa ler como informação, não como tela quebrada.
    if (officialCount === 0) {
      return (
        <EmptyState
          icon={<Smartphone className="h-12 w-12" />}
          title="Nenhum número na API Oficial da Meta"
          description={
            'Templates existem só na API Oficial (Meta Cloud API). Números conectados por ' +
            'QR Code não têm templates: neles você envia texto livre dentro da janela de 24h. ' +
            'Para usar templates, conecte um número oficial em Instâncias e APIs.'
          }
        />
      );
    }

    // Tem número oficial, mas nenhum com WABA ID — problema diferente do de
    // cima, e com solução diferente: falta terminar a configuração da conexão.
    if (groups.length === 0) {
      return (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Falta o WABA ID na conexão</AlertTitle>
          <AlertDescription>
            {officialCount === 1
              ? 'Seu número na API Oficial está sem o WABA ID (o identificador da conta do '
              : 'Seus números na API Oficial estão sem o WABA ID (o identificador da conta do '}
            WhatsApp Business). Sem ele não dá para consultar os templates. Preencha em{' '}
            <Link to="/dashboard/whatsapp-numbers" className="underline font-medium">
              Instâncias e APIs
            </Link>
            .
          </AlertDescription>
        </Alert>
      );
    }

    if (templatesQuery.isLoading) return <ListSkeleton />;

    // A falha aparece com o texto que a Meta ou a edge function escreveu. Nada
    // de mensagem genérica e nada de degradar em silêncio: numa tela de
    // consulta, esconder o erro é mostrar uma lista mentirosa.
    if (templatesQuery.isError) {
      return (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Não foi possível carregar os templates</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>{(templatesQuery.error as Error)?.message}</p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => templatesQuery.refetch()}
              disabled={atualizando}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${atualizando ? 'animate-spin' : ''}`} />
              Tentar de novo
            </Button>
          </AlertDescription>
        </Alert>
      );
    }

    if (gruposPorNome.length === 0) {
      return (
        <EmptyState
          icon={<FileText className="h-12 w-12" />}
          title="Nenhum template nesta conta"
          description={
            'Esta conta do WhatsApp Business ainda não tem template criado. A criação e o ' +
            'envio para aprovação acontecem no WhatsApp Manager da Meta; assim que a Meta ' +
            'aprovar, ele aparece aqui.'
          }
        />
      );
    }

    if (visiveis.length === 0) {
      return (
        <EmptyState
          icon={<Search className="h-12 w-12" />}
          title="Nenhum template encontrado"
          description={`Nada casa com "${busca}". Tente outro termo ou limpe a busca.`}
        />
      );
    }

    return (
      <div className="space-y-4">
        {visiveis.map((group) => (
          <TemplateCard key={group.name} group={group} />
        ))}
      </div>
    );
  };

  const mostrarControles = !carregandoContas && !erroContas && groups.length > 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        helpKey="page:templates"
        description="Consulte os templates da sua conta do WhatsApp Business. Criar e enviar para aprovação é no WhatsApp Manager da Meta."
        breadcrumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Templates' }]}
        actions={
          mostrarControles ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => templatesQuery.refetch()}
              disabled={atualizando}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${atualizando ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          ) : undefined
        }
      />

      {mostrarControles && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          {/* O seletor só existe quando há mais de um WABA. Com um só, oferecer
              escolha de uma opção é ruído — e um seletor de INSTÂNCIA mostraria
              a mesma lista duas vezes quando dois números dividem o WABA. */}
          {groups.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="waba-selector">Conta do WhatsApp Business</Label>
              <Select
                value={grupoAtivo?.wabaId ?? ''}
                onValueChange={(value) => setWabaSelecionado(value)}
              >
                <SelectTrigger id="waba-selector" className="w-full sm:w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.wabaId} value={group.wabaId}>
                      {group.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-1.5 flex-1">
            <Label htmlFor="template-search">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="template-search"
                value={busca}
                onChange={(event) => setBusca(event.target.value)}
                placeholder="Buscar por nome ou texto do template"
                className="pl-9"
              />
            </div>
          </div>
        </div>
      )}

      {renderConteudo()}
    </div>
  );
}
