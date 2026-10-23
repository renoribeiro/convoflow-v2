import { z } from 'zod';

// =============================================================================
// Chaves de API: constantes, rótulos e regras puras (sem React)
// =============================================================================

/**
 * Texto da caixa de confirmação do diálogo "Nova chave".
 *
 * ACEITE_VERSAO guarda QUAL texto a pessoa aceitou (vai para o servidor em
 * `p_aceite_versao`). Mudou uma palavra de ACEITE_TEXTO? Suba a data de
 * ACEITE_VERSAO no mesmo commit: a versão é a prova de o que foi aceito.
 */
export const ACEITE_TEXTO =
  'Entendo que os dados escolhidos sairão do ConvoFlow para o serviço onde eu usar esta chave, e que sou responsável pelo uso dela.';
export const ACEITE_VERSAO = 'api-chave-2026-10-24';

export const MAX_CHAVES_ATIVAS = 10;
export const NOME_MAX = 60;

export const ESCOPOS = ['contatos', 'conversas', 'mensagens', 'funil', 'equipe', 'metricas', 'midia'] as const;
export type Escopo = (typeof ESCOPOS)[number];

export const ESCOPO_INFO: Record<Escopo, { rotulo: string; descricao: string }> = {
  contatos: { rotulo: 'Contatos', descricao: 'Nomes, telefones e etiquetas dos contatos.' },
  conversas: { rotulo: 'Conversas', descricao: 'A lista das conversas e de quem está com cada uma.' },
  mensagens: { rotulo: 'Histórico das conversas', descricao: 'O texto das mensagens trocadas com os clientes.' },
  funil: { rotulo: 'Funil', descricao: 'Etapas do funil e em que etapa cada contato está.' },
  equipe: { rotulo: 'Equipe', descricao: 'Quem faz parte da equipe e em qual Loja.' },
  metricas: { rotulo: 'Métricas', descricao: 'Números de atendimento e de vendas.' },
  midia: {
    rotulo: 'Fotos, áudios e documentos',
    descricao: 'Arquivos enviados nas conversas, por links que valem 15 minutos. Exige o histórico das conversas.',
  },
};

/** Marcados ao abrir o diálogo. "mensagens" e "midia" começam desligados de propósito. */
export const ESCOPOS_PADRAO: readonly Escopo[] = ['contatos', 'conversas', 'funil', 'equipe', 'metricas'];

export const VALIDADES = [30, 90, 365] as const;
export type Validade = (typeof VALIDADES)[number];
export const VALIDADE_PADRAO: Validade = 90;
export const VALIDADE_ROTULO: Record<Validade, string> = {
  30: '30 dias',
  90: '90 dias',
  365: '1 ano',
};

export type EstadoChave = 'ativa' | 'revogada' | 'expirada' | 'suspensa' | 'dono_inativo';

export const ESTADO_CHAVE_INFO: Record<EstadoChave, { rotulo: string; tom: 'ok' | 'aviso' | 'ruim' | 'neutro' }> = {
  ativa: { rotulo: 'Ativa', tom: 'ok' },
  suspensa: { rotulo: 'Suspensa (API desligada)', tom: 'aviso' },
  dono_inativo: { rotulo: 'Dono inativo', tom: 'aviso' },
  expirada: { rotulo: 'Expirada', tom: 'neutro' },
  revogada: { rotulo: 'Revogada', tom: 'ruim' },
};

/** Linha de `api_chaves_listar`. */
export interface ApiChave {
  id: string;
  nome: string;
  prefixo: string;
  escopos: string[];
  lojas: string[] | null;
  expira_em: string;
  criada_em: string;
  revogada_em: string | null;
  ultimo_uso_em: string | null;
  ultimo_uso_ip: string | null;
  dono_nome: string | null;
  estado: EstadoChave;
}

/** Linha de `api_chave_criar`. `chave` é o segredo inteiro e só existe aqui. */
export interface ApiChaveCriada {
  id: string;
  chave: string;
  prefixo: string;
  expira_em: string;
}

export const ACEITE_VERSAO_REGEX = /^api-chave-\d{4}-\d{2}-\d{2}$/;

/**
 * Liga ou desliga um escopo respeitando a regra da mídia: ela só vale junto com
 * o histórico, então ligar "midia" sem "mensagens" não faz nada e desligar
 * "mensagens" leva a mídia junto.
 */
export function alternarEscopo(atuais: readonly Escopo[], escopo: Escopo, ligar: boolean): Escopo[] {
  const conjunto = new Set(atuais);
  if (ligar) {
    if (escopo === 'midia' && !conjunto.has('mensagens')) return ESCOPOS.filter((e) => conjunto.has(e));
    conjunto.add(escopo);
  } else {
    conjunto.delete(escopo);
    if (escopo === 'mensagens') conjunto.delete('midia');
  }
  return ESCOPOS.filter((e) => conjunto.has(e));
}

export const novaChaveSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(1, 'Dê um nome à chave.')
    .max(NOME_MAX, `O nome pode ter até ${NOME_MAX} letras.`),
  escopos: z.array(z.enum(ESCOPOS)).min(1, 'Marque ao menos uma permissão.'),
  lojas: z.array(z.string().min(1)).min(1, 'Escolha ao menos uma Loja.').nullable(),
  validade: z.union([z.literal(30), z.literal(90), z.literal(365)]),
  aceite: z.literal(true, { errorMap: () => ({ message: 'Marque a confirmação para criar a chave.' }) }),
});

export type NovaChaveForm = z.input<typeof novaChaveSchema>;

/** Primeira mensagem de erro do formulário, ou null se está tudo certo. */
export function erroDoFormulario(form: {
  nome: string;
  escopos: readonly string[];
  lojas: readonly string[] | null;
  validade: number;
  aceite: boolean;
}): string | null {
  const r = novaChaveSchema.safeParse({ ...form, escopos: [...form.escopos], lojas: form.lojas ? [...form.lojas] : null });
  if (r.success) {
    if (r.data.escopos.includes('midia') && !r.data.escopos.includes('mensagens')) {
      return 'Fotos, áudios e documentos só funcionam junto com o histórico das conversas.';
    }
    return null;
  }
  return r.error.issues[0]?.message ?? 'Confira os campos.';
}

/** Argumentos exatos de `api_chave_criar`. */
export function argsDeCriarChave(form: {
  nome: string;
  escopos: readonly Escopo[];
  lojas: readonly string[] | null;
  validade: Validade;
}) {
  return {
    p_nome: form.nome.trim(),
    p_escopos: [...form.escopos],
    p_lojas: form.lojas ? [...form.lojas] : null,
    p_validade_dias: form.validade,
    p_aceite_versao: ACEITE_VERSAO,
  };
}

export function contarAtivas(chaves: readonly Pick<ApiChave, 'estado'>[]): number {
  return chaves.filter((c) => c.estado === 'ativa' || c.estado === 'suspensa' || c.estado === 'dono_inativo').length;
}

/** "Todas" ou os nomes das Lojas (cai no id curto se a Loja não é mais conhecida). */
export function rotuloDasLojas(lojas: readonly string[] | null, nomes: Record<string, string>): string {
  if (!lojas) return 'Todas';
  if (lojas.length === 0) return 'Nenhuma';
  return lojas.map((id) => nomes[id] ?? 'Loja removida').join(', ');
}

export function rotuloDoEscopo(escopo: string): string {
  return ESCOPO_INFO[escopo as Escopo]?.rotulo ?? escopo;
}
