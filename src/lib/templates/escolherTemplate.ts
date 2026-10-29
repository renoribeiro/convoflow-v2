/**
 * Regras puras da escolha de template aprovado (achado 93, decisão D12).
 * Quem usa: src/components/templates/EscolherTemplate.tsx.
 */
import type { WhatsAppTemplate } from '@/services/whatsapp';

/** O que a tela guarda: nome, idioma e o valor de cada variável, na ordem. */
export interface TemplateEscolhido {
  nome: string;
  idioma: string;
  parametros: string[];
}

export const TEMPLATE_VAZIO: TemplateEscolhido = { nome: '', idioma: 'pt_BR', parametros: [] };

/** O mesmo nome existe em vários idiomas: a chave junta os dois. */
export function chaveDoTemplate(t: { name?: string; nome?: string; language?: string; idioma?: string }): string {
  return `${t.name ?? t.nome ?? ''}::${t.language ?? t.idioma ?? ''}`;
}

/** Só os APROVADOS, em ordem alfabética: o resto não é entregue. */
export function templatesAprovados(lista: WhatsAppTemplate[]): WhatsAppTemplate[] {
  return lista
    .filter((t) => String(t.status ?? '').toUpperCase() === 'APPROVED')
    .sort((a, b) => a.name.localeCompare(b.name) || a.language.localeCompare(b.language));
}

/**
 * Um campo por variável do corpo ({{1}}, {{2}}...). O que já estava escrito
 * fica no lugar quando a pessoa troca de template.
 */
export function parametrosParaTemplate(t: WhatsAppTemplate, anteriores: string[] = []): string[] {
  const total = Math.max(0, t.paramCount ?? 0);
  return Array.from({ length: total }, (_, i) => anteriores[i] ?? '');
}

/** Template pronto para gravar: tem nome e nenhuma variável em branco. */
export function templateCompleto(v: TemplateEscolhido): boolean {
  return !!v.nome.trim() && v.parametros.every((p) => p.trim().length > 0);
}

/** Lê o que veio do banco (template_params é jsonb). */
export function templateDoBanco(row: {
  template_name?: string | null;
  template_language?: string | null;
  template_params?: unknown;
}): TemplateEscolhido {
  return {
    nome: row.template_name ?? '',
    idioma: row.template_language || 'pt_BR',
    parametros: Array.isArray(row.template_params) ? row.template_params.map((p) => String(p ?? '')) : [],
  };
}

/**
 * O motivo da lista não carregar, em português. A Meta devolve JSON em inglês
 * ("Error validating access token: Session has expired..."), que não diz à
 * pessoa o que fazer.
 */
export function motivoDaListaDeTemplates(mensagem: string): string {
  if (/access token|OAuthException|session has expired|"code":\s*190/i.test(mensagem)) {
    return 'o acesso deste número à Meta venceu. Reconecte o número em Números de WhatsApp';
  }
  if (/wabaId/i.test(mensagem)) {
    return 'este número não tem a identificação da conta do WhatsApp Business';
  }
  return 'a Meta não respondeu agora. Tente Atualizar daqui a pouco';
}
