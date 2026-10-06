/**
 * Regras puras da tela de Templates da Meta (/dashboard/templates).
 *
 * Tudo aqui é função pura sobre dados já buscados — nada de rede, nada de
 * React. É onde moram as duas decisões que a tela precisa acertar:
 *
 *  1. QUAL WABA consultar. Template pertence a uma WhatsApp Business Account,
 *     não a um número. Duas linhas de `whatsapp_instances` sob o mesmo WABA
 *     devolvem a MESMA lista — por isso deduplicamos por `wabaId` em vez de
 *     oferecer um seletor de instância, que mostraria a lista repetida.
 *  2. COMO agrupar. O nome do template não é único: existe uma entrada por
 *     idioma. Renderizar a lista crua mostra o mesmo nome várias vezes.
 */
import { matchesSearchTerms } from '@/lib/help/featureHelp';
import type { WhatsAppTemplate } from '@/services/whatsapp';

// ---------------------------------------------------------------------------
// WABA
// ---------------------------------------------------------------------------

/** As colunas de `whatsapp_instances` que interessam para resolver o WABA. */
export interface OfficialInstanceRow {
  id: string;
  name?: string | null;
  phone_number?: string | null;
  connection_config?: unknown;
}

export interface WabaGroup {
  wabaId: string;
  /**
   * Instância usada como alça para chamar a edge function — ela recebe
   * `instance_id`, não `waba_id`, e esse contrato não muda por causa da tela.
   * Qualquer instância do grupo serve: todas apontam para o mesmo WABA.
   */
  instanceId: string;
  /** Rótulo legível para o seletor. Nunca o WABA ID cru. */
  label: string;
  /** Nomes de todos os números sob este WABA, na ordem em que apareceram. */
  instanceNames: string[];
}

/**
 * Lê o WABA ID de uma instância.
 *
 * Aceita SOMENTE a chave `wabaId` do `connection_config`, que é exatamente o
 * que a edge function lê antes de decidir entre listar e devolver 400. Ser mais
 * tolerante aqui (aceitar `waba_id`, por exemplo) faria a tela oferecer um
 * grupo que a função recusaria — erro pior que a ausência.
 */
export function wabaIdOf(row: OfficialInstanceRow): string | null {
  const cfg = row?.connection_config;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) return null;
  const raw = (cfg as Record<string, unknown>).wabaId;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  return trimmed ? trimmed : null;
}

/** Nome de exibição de um número, com folga para linha sem nome. */
function instanceLabelOf(row: OfficialInstanceRow): string {
  const name = (row.name ?? '').trim();
  if (name) return name;
  const phone = (row.phone_number ?? '').trim();
  if (phone) return phone;
  return 'Número sem nome';
}

/**
 * Agrupa as instâncias oficiais por WABA, preservando a ordem de entrada.
 *
 * Instância sem `wabaId` fica de fora: ela não consegue listar template nenhum.
 * A tela usa a diferença entre "nenhuma instância oficial" e "instância oficial
 * sem WABA" para escolher a mensagem certa, então quem chama deve olhar o
 * tamanho da entrada, não só o do retorno.
 */
export function dedupeWabaGroups(rows: OfficialInstanceRow[]): WabaGroup[] {
  const byWaba = new Map<string, WabaGroup>();

  for (const row of rows ?? []) {
    const wabaId = wabaIdOf(row);
    if (!wabaId || !row?.id) continue;

    const existing = byWaba.get(wabaId);
    if (existing) {
      existing.instanceNames.push(instanceLabelOf(row));
      existing.label = existing.instanceNames.join(', ');
      continue;
    }

    const nome = instanceLabelOf(row);
    byWaba.set(wabaId, {
      wabaId,
      instanceId: row.id,
      label: nome,
      instanceNames: [nome],
    });
  }

  return [...byWaba.values()];
}

// ---------------------------------------------------------------------------
// Agrupamento por nome
// ---------------------------------------------------------------------------

export interface TemplateNameGroup {
  name: string;
  /** Categoria Meta (MARKETING/UTILITY/AUTHENTICATION) do primeiro idioma. */
  category?: string;
  /** Um item por idioma, APROVADO primeiro. */
  languages: WhatsAppTemplate[];
}

/** APROVADO na frente; o resto depois. Mesma regra do SendTemplateDialog. */
function approvedFirst(status?: string): number {
  return String(status ?? '').toUpperCase() === 'APPROVED' ? 0 : 1;
}

/**
 * Colapsa a lista crua em um grupo por nome, com os idiomas como filhos.
 *
 * Ordem: grupo que tem pelo menos um idioma aprovado vem primeiro; empate
 * resolve por nome. Dentro do grupo, mesma regra por idioma.
 */
export function groupTemplatesByName(list: WhatsAppTemplate[]): TemplateNameGroup[] {
  const byName = new Map<string, TemplateNameGroup>();

  for (const t of list ?? []) {
    if (!t?.name) continue;
    const group = byName.get(t.name);
    if (group) {
      group.languages.push(t);
      if (!group.category && t.category) group.category = t.category;
    } else {
      byName.set(t.name, { name: t.name, category: t.category, languages: [t] });
    }
  }

  const groups = [...byName.values()];

  for (const group of groups) {
    group.languages.sort(
      (a, b) =>
        approvedFirst(a.status) - approvedFirst(b.status) ||
        a.language.localeCompare(b.language),
    );
  }

  const groupRank = (g: TemplateNameGroup) =>
    g.languages.some((t) => approvedFirst(t.status) === 0) ? 0 : 1;

  return groups.sort(
    (a, b) => groupRank(a) - groupRank(b) || a.name.localeCompare(b.name, 'pt-BR'),
  );
}

/**
 * Filtra por nome e corpo, ignorando acento e caixa.
 *
 * Reaproveita o motor de busca da ajuda de propósito: ele já é o único lugar do
 * front que implementa "sem acento, todos os termos", e conteúdo em pt-BR sem
 * isso obriga o usuário a acertar o acento para achar "Confirmação".
 */
export function filterTemplateGroups(
  groups: TemplateNameGroup[],
  query: string,
): TemplateNameGroup[] {
  if (!query.trim()) return groups;
  return groups.filter((g) =>
    matchesSearchTerms([g.name, ...g.languages.map((t) => t.bodyText)], query),
  );
}

// ---------------------------------------------------------------------------
// Rótulos em pt-BR
// ---------------------------------------------------------------------------

/**
 * Status da Meta em português.
 *
 * Os três primeiros já eram traduzidos pelo SendTemplateDialog; PAUSED e
 * DISABLED chegavam crus em inglês na tela. Status desconhecido volta como
 * veio — inventar tradução para valor novo da Meta esconde a novidade.
 */
export function templateStatusLabel(status?: string): string {
  const s = String(status ?? '').toUpperCase();
  const labels: Record<string, string> = {
    APPROVED: 'Aprovado',
    PENDING: 'Pendente',
    REJECTED: 'Rejeitado',
    PAUSED: 'Pausado',
    DISABLED: 'Desativado',
    IN_APPEAL: 'Em recurso',
    PENDING_DELETION: 'Exclusão pendente',
  };
  return labels[s] ?? s;
}

export function templateCategoryLabel(category?: string): string {
  const c = String(category ?? '').toUpperCase();
  const labels: Record<string, string> = {
    MARKETING: 'Marketing',
    UTILITY: 'Utilidade',
    AUTHENTICATION: 'Autenticação',
  };
  return labels[c] ?? c;
}

export function headerFormatLabel(format?: string): string {
  const f = String(format ?? '').toUpperCase();
  const labels: Record<string, string> = {
    TEXT: 'Texto',
    IMAGE: 'Imagem',
    VIDEO: 'Vídeo',
    DOCUMENT: 'Documento',
    LOCATION: 'Localização',
  };
  return labels[f] ?? f;
}

export function buttonTypeLabel(type?: string): string {
  const t = String(type ?? '').toUpperCase();
  const labels: Record<string, string> = {
    QUICK_REPLY: 'Resposta rápida',
    URL: 'Link',
    PHONE_NUMBER: 'Telefone',
    COPY_CODE: 'Copiar código',
  };
  return labels[t] ?? t;
}

/** Mesmo mapa de idiomas do SendTemplateDialog, para as telas não divergirem. */
export function languageLabel(code?: string): string {
  const labels: Record<string, string> = {
    pt_BR: 'Português (Brasil)',
    en_US: 'English (US)',
    es: 'Español',
  };
  return labels[String(code ?? '')] ?? String(code ?? '');
}

// ---------------------------------------------------------------------------
// Marcação dos {{n}}
// ---------------------------------------------------------------------------

export interface TemplateTextSegment {
  type: 'text' | 'param';
  value: string;
}

/**
 * Quebra o texto do template em pedaços, separando os marcadores {{n}} do
 * texto comum, para a tela poder destacá-los.
 *
 * Normaliza `{{ 1 }}` para `{{1}}`: a Meta aceita espaço dentro das chaves e
 * dois templates iguais ficariam com destaque diferente.
 */
export function splitTemplateText(text?: string): TemplateTextSegment[] {
  const source = text ?? '';
  if (!source) return [];

  const segments: TemplateTextSegment[] = [];
  const pattern = /\{\{\s*(\d+)\s*\}\}/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(source)) !== null) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: source.slice(cursor, match.index) });
    }
    segments.push({ type: 'param', value: `{{${match[1]}}}` });
    cursor = match.index + match[0].length;
  }

  if (cursor < source.length) {
    segments.push({ type: 'text', value: source.slice(cursor) });
  }

  return segments;
}
