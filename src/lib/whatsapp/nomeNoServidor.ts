/**
 * O nome do número no servidor de conexão (coluna `instance_key`).
 *
 * É o nome que a agência vê no painel da Evolution e usa nas automações de
 * fora (no WAHA, o nome da sessão). Não é segredo: sozinho não abre nada, e
 * todo membro da Loja já recebe esse valor (SAFE_INSTANCE_SELECT). Ele sumiu
 * do cartão no lote 3 e virou código automático escondido no lote 6e; desde
 * 2026-11-04 volta à vista e nasce do nome digitado (decisão do dono).
 *
 * A regra de formato do Evolution mora também no servidor
 * (supabase/functions/_shared/evolution-instance-name.ts); o teste
 * nomeNoServidor.test.ts confere que as duas são a mesma.
 */

/** Minúsculas, algarismos, _ e -, de 3 a 100. Vale para o número novo do Evolution. */
export const NOME_NO_SERVIDOR_EVOLUTION = /^[a-z0-9_-]{3,100}$/;

/** Até onde vai a parte que vem do nome digitado (o resto é `_` e o sufixo). */
const MAX_BASE = 40;
const ALFABETO = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SEM_NOME = 'numero';

/** Tira acento e tudo que o servidor não aceita; espaço e pontuação viram `_`. */
export function normalizarNomeNoServidor(digitado: string): string {
  return digitado
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .slice(0, 100);
}

/** A parte do nome digitado: "WhatsApp Vendas" vira "whatsapp_vendas". */
export function baseDoNomeNoServidor(nomeDoNumero: string): string {
  const base = normalizarNomeNoServidor(nomeDoNumero)
    .replace(/_+/g, '_')
    .replace(/^[_-]+/, '')
    .slice(0, MAX_BASE)
    .replace(/[_-]+$/, '');
  return base || SEM_NOME;
}

/** Quatro letras ou algarismos sorteados, para dois números não terem o mesmo nome. */
export function sufixoAleatorio(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('');
}

/** "WhatsApp Vendas" + "k3f9" vira "whatsapp_vendas_k3f9". */
export function gerarNomeNoServidor(nomeDoNumero: string, sufixo: string = sufixoAleatorio()): string {
  return `${baseDoNomeNoServidor(nomeDoNumero)}_${sufixo}`;
}

/** O que dizer quando o nome digitado em "Avançado" não serve. `null` = serve. */
export function problemaNoNomeNoServidor(nome: string): string | null {
  if (nome.length < 3) return 'O nome no servidor de conexão precisa de pelo menos 3 caracteres.';
  if (nome.length > 100) return 'O nome no servidor de conexão pode ter no máximo 100 caracteres.';
  if (!NOME_NO_SERVIDOR_EVOLUTION.test(nome)) {
    return 'No nome no servidor de conexão use só letras minúsculas sem acento, números, _ e -.';
  }
  return null;
}

/** Evolution e WAHA têm nome no servidor; a API oficial e o Instagram, não. */
export const temNomeNoServidor = (provider?: string | null): boolean =>
  !provider || provider === 'evolution' || provider === 'waha';
