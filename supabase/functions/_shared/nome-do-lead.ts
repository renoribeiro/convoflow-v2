// =============================================================================
// nome-do-lead.ts — o nome que a pessoa digita no chatbot, limpo, e quando ele
// pode virar o nome do contato (2026-11-18)
// =============================================================================
// Usado pelo bloco "Atualizar contato" com o campo "Nome do lead" (lead_name):
//   - tira "meu nome é", "me chamo", "sou o/a", "aqui é" e saudações do começo;
//   - para na primeira pontuação ("Ana, quero botox" vira "Ana");
//   - fica com no máximo 3 palavras, cada uma com a primeira letra maiúscula;
//   - só troca o nome do contato quando ele está vazio, é só o telefone ou é o
//     nome do perfil do WhatsApp. Nome salvo à mão por alguém nunca é trocado.
// E a condição "Primeiro contato" (primeiro_contato = sim/nao).
// Sem I/O: o Vitest testa sem Deno.
// =============================================================================

export const CAMPO_NOME_DO_LEAD = 'lead_name';
export const VARIAVEL_PRIMEIRO_CONTATO = 'primeiro_contato';
/** Onde a resposta calculada fica guardada na sessão (prefixo reservado: não vai para o contato). */
export const CACHE_PRIMEIRO_CONTATO = '__primeiro_contato';
/** Mensagens mais novas que isso são a própria rajada que abriu o bot, não contato anterior. */
export const JANELA_DA_MENSAGEM_ATUAL_MS = 2 * 60 * 1000;

const MAX_PALAVRAS = 3;

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

// Comparadas sem acento e em minúsculas, no começo da resposta.
const SAUDACOES = ['bom dia', 'boa tarde', 'boa noite', 'ola', 'oie', 'oi'];
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

/** O nome limpo (até 3 palavras) e o primeiro nome; null quando não sobra nome. */
export function limparNomeDoLead(resposta: unknown): { completo: string; primeiro: string } | null {
  if (typeof resposta !== 'string') return null;
  let t = resposta.normalize('NFC').replace(/\s+/g, ' ').trim();
  // Áudio, imagem, figurinha... chegam como "[Áudio]": não é nome.
  if (/^\[[^\]]*\]$/.test(t)) return null;
  for (let i = 0; i < 4; i++) {
    const antes = t;
    t = tirarDoComeco(t, SAUDACOES);
    t = tirarDoComeco(t, APRESENTACOES);
    if (t === antes) break;
  }
  t = t.split(/[,;.!?:\n()]/)[0] ?? '';
  const palavras = t
    .split(' ')
    .map((p) => p.replace(/[^\p{L}'-]/gu, '').replace(/^['-]+|['-]+$/g, ''))
    .filter((p) => p.length > 0)
    .slice(0, MAX_PALAVRAS)
    .map(maiuscula);
  if (palavras.length === 0) return null;
  return { completo: palavras.join(' '), primeiro: palavras[0] ?? '' };
}

const comparavel = (s: string) => semAcento(s).toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * O nome atual do contato pode ser trocado pelo nome do lead? Só quando está
 * vazio, é só o telefone, ou é o nome do perfil do WhatsApp.
 */
export function podeTrocarNomeDoContato(p: {
  atual: string | null | undefined;
  telefone: string | null | undefined;
  nomeDoPerfil?: string | null;
}): boolean {
  const atual = (p.atual ?? '').trim();
  if (!atual) return true;
  const digitos = atual.replace(/\D/g, '');
  const fone = String(p.telefone ?? '').replace(/\D/g, '');
  if (!/\p{L}/u.test(atual) && (digitos.length >= 8 || digitos === fone)) return true;
  if (p.nomeDoPerfil && comparavel(p.nomeDoPerfil) === comparavel(atual)) return true;
  return false;
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
