// =============================================================================
// nome-do-lead.ts — o nome que a pessoa digita no chatbot, conferido, e quando
// ele pode virar o nome do contato (2026-11-18; regra estrita desde 2026-11-23)
// =============================================================================
// Usado pela automação pronta "Salvar o nome do lead" (aba Automação, chaves
// lead_name_enabled e lead_name_variable em tenants.settings, desde
// 2026-11-23) e pelo bloco "Atualizar contato" com o campo "Nome do lead"
// (lead_name), que continua valendo para os chatbots que ainda o têm:
//   - tira "meu nome é", "me chamo", "sou o/a", "aqui é" do começo;
//   - só aceita de 1 a 4 palavras, só letras (acento e apóstrofo valem), sem
//     "?", sem número, e a primeira palavra não pode ser palavra comum que não
//     é nome ("qual", "bom", "oi", "preço"...). Correção de 2026-11-23: a
//     resposta "Qual preço da limpeza de pele?" virava o nome "Qual";
//   - cada palavra sai com a primeira letra maiúscula;
//   - só troca o nome do contato quando ele está vazio, é só o telefone ou veio
//     do perfil do WhatsApp (contacts.name_source, migração 20261123000002).
//     Nome salvo à mão por alguém, ou já salvo pelo chatbot, nunca é trocado.
// E a condição "Primeiro contato" (primeiro_contato = sim/nao).
// Sem I/O: o Vitest testa sem Deno.
// =============================================================================

export const CAMPO_NOME_DO_LEAD = 'lead_name';

/** De onde veio o nome do contato (contacts.name_source). */
export const ORIGENS_DO_NOME = ['whatsapp', 'telefone', 'equipe', 'lead'] as const;
export type OrigemDoNome = (typeof ORIGENS_DO_NOME)[number];
/** A origem que o chatbot grava quando salva o nome que a pessoa digitou. */
export const ORIGEM_DO_NOME_DO_LEAD: OrigemDoNome = 'lead';

/** Variável do chatbot que guarda a resposta, como o banco aceita (CHECK da migração 20261123000002). */
export const VARIAVEL_VALIDA = /^[A-Za-z][A-Za-z0-9_]{0,49}$/;

/**
 * A variável que a automação pronta "Salvar o nome do lead" confere, ou null
 * quando o cartão está desligado (ou mal preenchido) na Loja.
 */
export function variavelDoNomeDoLead(settings: unknown): string | null {
  if (!settings || typeof settings !== 'object') return null;
  const s = settings as Record<string, unknown>;
  if (s.lead_name_enabled !== true) return null;
  const v = typeof s.lead_name_variable === 'string' ? s.lead_name_variable.trim() : '';
  return VARIAVEL_VALIDA.test(v) ? v : null;
}
export const VARIAVEL_PRIMEIRO_CONTATO = 'primeiro_contato';
/** Onde a resposta calculada fica guardada na sessão (prefixo reservado: não vai para o contato). */
export const CACHE_PRIMEIRO_CONTATO = '__primeiro_contato';
/** Mensagens mais novas que isso são a própria rajada que abriu o bot, não contato anterior. */
export const JANELA_DA_MENSAGEM_ATUAL_MS = 2 * 60 * 1000;

const MAX_PALAVRAS = 4;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Primeira palavra que nunca é nome (comparada sem acento e em minúsculas). */
export const PALAVRAS_QUE_NAO_SAO_NOME: ReadonlySet<string> = new Set([
  'qual', 'quanto', 'quanta', 'quais', 'como', 'onde', 'quando', 'quero', 'gostaria', 'queria',
  'preco', 'valor', 'oi', 'ola', 'bom', 'boa', 'dia', 'tarde', 'noite', 'sim', 'nao', 'ok',
  'obrigado', 'obrigada', 'tudo', 'limpeza', 'botox', 'informacao',
]);

// Uma palavra de nome: só letras, com apóstrofo no meio (D'Ávila).
const PALAVRA_DE_NOME = /^\p{L}+(?:['’]\p{L}+)*$/u;

// Comparadas sem acento e em minúsculas, no começo da resposta (a mais longa primeiro).
const APRESENTACOES = [
  'o meu nome e', 'meu nome e', 'meu nome', 'eu me chamo', 'me chamo', 'chamo me',
  'eu sou o', 'eu sou a', 'eu sou', 'sou o', 'sou a', 'sou',
  'aqui quem fala e', 'aqui e o', 'aqui e a', 'aqui e', 'quem fala e',
];

function tirarDoComeco(texto: string, frases: string[]): string {
  const base = semAcento(texto).toLowerCase();
  for (const f of frases) {
    if (base === f) return '';
    if (base.startsWith(f) && /[\s,.!:;-]/.test(base.charAt(f.length))) {
      return texto.slice(f.length).replace(/^[\s,.!:;-]+/, '');
    }
  }
  return texto;
}

function maiuscula(palavra: string): string {
  const p = palavra.toLocaleLowerCase('pt-BR');
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1);
}

/**
 * O nome (até 4 palavras, primeira letra maiúscula) e o primeiro nome; null
 * quando a resposta não é um nome. Na dúvida, null: sem nome o bot segue sem
 * trocar o contato e sem chamar a pessoa pelo nome.
 */
export function limparNomeDoLead(resposta: unknown): { completo: string; primeiro: string } | null {
  if (typeof resposta !== 'string') return null;
  let t = resposta.normalize('NFC').replace(/\s+/g, ' ').trim();
  // Ponto ou exclamação no fim ("Ana.") não tiram o nome.
  t = t.replace(/[.!]+$/, '').trim();
  t = tirarDoComeco(t, APRESENTACOES).trim();
  // Áudio, figurinha ("[Áudio]"), pergunta, número, emoji: não é nome.
  if (!t || t.includes('?') || /\d/.test(t)) return null;
  const palavras = t.split(' ');
  if (palavras.length > MAX_PALAVRAS) return null;
  if (!palavras.every((p) => PALAVRA_DE_NOME.test(p))) return null;
  if (PALAVRAS_QUE_NAO_SAO_NOME.has(semAcento(palavras[0] ?? '').toLowerCase())) return null;
  const nomes = palavras.map(maiuscula);
  return { completo: nomes.join(' '), primeiro: nomes[0] ?? '' };
}

const comparavel = (s: string) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * O nome atual do contato pode ser trocado pelo nome do lead? Só quando está
 * vazio, é só o telefone, ou veio do perfil do WhatsApp. A origem gravada
 * (name_source) decide; vale igual no Evolution, na Meta e no WAHA. Contato
 * antigo, ainda sem origem: só quando o nome é igual ao do perfil que o
 * webhook mandou agora (o Evolution manda); sem isso, vale como equipe.
 */
export function podeTrocarNomeDoContato(p: {
  atual: string | null | undefined;
  telefone: string | null | undefined;
  origem?: string | null;
  nomeDoPerfil?: string | null;
}): boolean {
  const atual = (p.atual ?? '').trim();
  if (!atual) return true;
  const digitos = atual.replace(/\D/g, '');
  const fone = String(p.telefone ?? '').replace(/\D/g, '');
  if (!/\p{L}/u.test(atual) && (digitos.length >= 8 || digitos === fone)) return true;
  if (p.origem === 'whatsapp' || p.origem === 'telefone') return true;
  if (p.origem) return false;
  return !!p.nomeDoPerfil && comparavel(p.nomeDoPerfil) === comparavel(atual);
}

/**
 * Contato antigo (sem origem) quando chega o nome do perfil: igual ao nome
 * salvo é do WhatsApp; diferente, da equipe. Mesma regra de
 * receber_mensagem_whatsapp (Meta e WAHA), aqui para o Evolution.
 */
export function origemDoContatoAntigo(atual: string, nomeDoPerfil: string): OrigemDoNome {
  return comparavel(atual) === comparavel(nomeDoPerfil) ? 'whatsapp' : 'equipe';
}

/** O valor do bloco é uma variável só (ex.: "{nome}")? Devolve o nome dela. */
export function variavelUnica(valor: unknown): string | null {
  if (typeof valor !== 'string') return null;
  const m = valor.trim().match(/^\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}$/);
  return m ? (m[1] ?? null) : null;
}

/** "sim" quando não há mensagem anterior (fora a rajada atual) do contato na Loja. */
export function valorPrimeiroContato(mensagensAnteriores: number): 'sim' | 'nao' {
  return mensagensAnteriores > 0 ? 'nao' : 'sim';
}
