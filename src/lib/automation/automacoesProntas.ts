/**
 * Automações prontas da aba Automação (2026-11-23): "Salvar o nome do lead" e
 * "Aviso quando ninguém responde". Um cartão de cada, por Loja, gravado em
 * `tenants.settings` pela RPC `set_tenant_settings` (o mesmo caminho da
 * "Transferência por tempo sem resposta"). Gerente e Gestor ajustam; o
 * Atendente só vê. O banco recusa o resto: a RPC barra o Atendente e quem é de
 * fora da Loja, e o CHECK `tenants_automacoes_prontas_check` (migração
 * 20261123000002) barra valor fora da forma.
 *
 * Quem faz valer:
 *   - nome: o motor do chatbot (supabase/functions/_shared/chatbot-engine.ts,
 *     `salvarNomeDoLead`) com as regras de _shared/nome-do-lead.ts;
 *   - aviso: public.aviso_de_espera_pendentes() decide, a edge function
 *     aviso-de-espera envia com o texto da Loja.
 *
 * Os padrões abaixo repetem os do servidor; `automacoesProntas.test.ts`
 * confere que são iguais.
 */

/** O texto que o aviso sempre mandou (_shared/aviso-de-espera.ts). */
export const TEXTO_PADRAO_DO_AVISO =
  'Recebemos sua mensagem! Estamos com uma demanda alta agora e, como aqui o atendimento é feito por pessoas, com toda a atenção que você merece, pode levar só alguns minutinhos. Já já falo com você!';
export const LIMITE_DO_TEXTO_DO_AVISO = 1000;
export const MINUTOS_DO_AVISO = { min: 1, max: 240, padrao: 5 } as const;
/** Nome de variável do chatbot (o CHECK do banco aceita só isto). */
export const VARIAVEL_VALIDA = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;
export const VARIAVEL_SUGERIDA = 'nome';

export interface CartaoDoNome {
  ligado: boolean;
  variavel: string;
}

export interface CartaoDoAviso {
  ligado: boolean;
  minutos: number;
  texto: string;
  respeitarHorario: boolean;
}

export interface AutomacoesProntas {
  nome: CartaoDoNome;
  aviso: CartaoDoAviso;
  /** A Loja tem horário de funcionamento salvo (aba Horário). */
  horarioSalvo: boolean;
}

const objeto = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** O que está salvo na Loja, com os padrões de quando nada foi salvo. */
export function lerAutomacoesProntas(settings: unknown): AutomacoesProntas {
  const s = objeto(settings);
  const minutos = s.waiting_notice_minutes;
  const texto = typeof s.waiting_notice_text === 'string' ? s.waiting_notice_text.trim() : '';
  return {
    nome: {
      ligado: s.lead_name_enabled === true,
      variavel: typeof s.lead_name_variable === 'string' ? s.lead_name_variable : '',
    },
    aviso: {
      ligado: s.waiting_notice_enabled === true,
      minutos:
        typeof minutos === 'number' && Number.isFinite(minutos)
          ? Math.min(Math.max(Math.floor(minutos), MINUTOS_DO_AVISO.min), MINUTOS_DO_AVISO.max)
          : MINUTOS_DO_AVISO.padrao,
      texto: texto && texto.length <= LIMITE_DO_TEXTO_DO_AVISO ? texto : TEXTO_PADRAO_DO_AVISO,
      respeitarHorario: s.waiting_notice_respect_hours !== false,
    },
    // Igual ao banco (jsonb_typeof = 'object'): qualquer objeto salvo conta.
    horarioSalvo: !!s.business_hours && typeof s.business_hours === 'object' && !Array.isArray(s.business_hours),
  };
}

/** O que está errado no cartão do nome (null = pode salvar). */
export function erroDoNome(c: CartaoDoNome): string | null {
  const v = c.variavel.trim();
  if (!c.ligado && !v) return null;
  if (!v) return 'Escreva a variável em que a pergunta do nome guarda a resposta.';
  if (!VARIAVEL_VALIDA.test(v)) {
    return 'A variável começa com letra e tem só letras sem acento, números e _ (sem espaço e sem chaves).';
  }
  return null;
}

export interface ErrosDoAviso {
  minutos?: string;
  texto?: string;
}

/** O que está errado no cartão do aviso (objeto vazio = pode salvar). */
export function errosDoAviso(c: { minutos: number; texto: string }): ErrosDoAviso {
  const erros: ErrosDoAviso = {};
  if (!Number.isInteger(c.minutos) || c.minutos < MINUTOS_DO_AVISO.min || c.minutos > MINUTOS_DO_AVISO.max) {
    erros.minutos = `Use um número inteiro de ${MINUTOS_DO_AVISO.min} a ${MINUTOS_DO_AVISO.max}.`;
  }
  const texto = c.texto.trim();
  if (!texto) erros.texto = 'Escreva a mensagem do aviso.';
  else if (texto.length > LIMITE_DO_TEXTO_DO_AVISO) {
    erros.texto = `A mensagem tem ${texto.length} letras. O máximo é ${LIMITE_DO_TEXTO_DO_AVISO}.`;
  }
  return erros;
}

/** As chaves que o cartão do nome grava (merge raso em tenants.settings). */
export function chavesDoNome(c: CartaoDoNome): Record<string, unknown> {
  const v = c.variavel.trim();
  return { lead_name_enabled: c.ligado, lead_name_variable: v ? v : null };
}

/** As chaves que o cartão do aviso grava (nunca business_hours: a aba Horário cuida dele). */
export function chavesDoAviso(c: CartaoDoAviso): Record<string, unknown> {
  return {
    waiting_notice_enabled: c.ligado,
    waiting_notice_minutes: c.minutos,
    waiting_notice_text: c.texto.trim(),
    waiting_notice_respect_hours: c.respeitarHorario,
  };
}

/** A frase do horário que o cartão do aviso mostra. */
export function fraseDoHorario(c: { respeitarHorario: boolean }, horarioSalvo: boolean): string {
  if (!horarioSalvo) return 'Esta Loja não tem horário de funcionamento salvo: o aviso sai a qualquer hora.';
  if (!c.respeitarHorario) return 'O aviso sai a qualquer hora, mesmo com a Loja fechada.';
  return 'O aviso só sai com a Loja aberta, e só contam os minutos de Loja aberta.';
}

/**
 * As automações comuns ATIVAS da Loja que trocam o nome do contato (passo
 * "Atualizar Contato" com o campo Nome). Elas não conferem nada e trocam até
 * nome salvo pela equipe: o cartão do nome avisa.
 */
export function automacoesQueTrocamONome(fluxos: ReadonlyArray<unknown> | null | undefined): string[] {
  const nomes: string[] = [];
  for (const item of fluxos ?? []) {
    const f = objeto(item);
    if (f.active !== true) continue;
    let passos: unknown = f.steps;
    if (typeof passos === 'string') {
      try {
        passos = JSON.parse(passos);
      } catch {
        passos = [];
      }
    }
    if (!Array.isArray(passos)) continue;
    const trocaONome = passos.some((p) => {
      const passo = objeto(p);
      const config = objeto(passo.config);
      const tipo = config.type ?? passo.type;
      return tipo === 'update_contact' && config.field === 'name';
    });
    if (trocaONome) nomes.push((typeof f.name === 'string' && f.name.trim()) || 'Sem nome');
  }
  return nomes;
}

/** As variáveis em que as perguntas dos chatbots da Loja guardam a resposta (sugestões do campo). */
export function variaveisDasPerguntas(nos: Array<{ data?: unknown }> | null | undefined): string[] {
  const vistas = new Set<string>();
  for (const no of nos ?? []) {
    const v = objeto(no?.data).save_to_variable;
    if (typeof v === 'string' && VARIAVEL_VALIDA.test(v.trim())) vistas.add(v.trim());
  }
  return [...vistas].sort((a, b) => a.localeCompare(b));
}
