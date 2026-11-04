/**
 * O nome do número no servidor Evolution (`instance_key` / `instanceName`).
 *
 * É o nome do painel da Evolution e das automações de fora, e a tela o mostra
 * desde 2026-11-04 (src/lib/whatsapp/nomeNoServidor.ts, que tem a mesma regra
 * de formato; o teste src/lib/whatsapp/nomeNoServidor.test.ts confere).
 *
 * O servidor Evolution da plataforma é um só para todos os clientes, e nele
 * pode haver número que o ConvoFlow não conhece (criado no painel, ou de outro
 * ambiente). Por isso, além do banco, `evolution-provision` pergunta ao próprio
 * servidor se o nome está livre ANTES de criar. Referência:
 * .agent/skills/evolution-v2/SKILL.md §2.1 (fetchInstances com instanceName
 * filtra pelo nome exato; 404 = o nome não existe) e §2.5.
 */

/** Minúsculas, algarismos, _ e -, de 3 a 100. */
export const EVOLUTION_INSTANCE_NAME_PATTERN = /^[a-z0-9_-]{3,100}$/;

export const MENSAGEM_NOME_INVALIDO =
  'Nome no servidor de conexão inválido. Use de 3 a 100 caracteres: letras minúsculas sem acento, números, _ e -.';

export const MENSAGEM_NOME_EM_USO_NO_CONVOFLOW =
  'Já existe um número com esse nome no servidor de conexão. Clique em Gerar de novo, em Avançado, ou escolha outro nome.';

export const MENSAGEM_NOME_EM_USO_NO_SERVIDOR =
  'Esse nome já está em uso no servidor de conexão. Clique em Gerar de novo, em Avançado, ou escolha outro nome.';

export type SituacaoDoNome = 'livre' | 'em_uso' | 'desconhecido';

type EvolutionRequest = (path: string, init?: RequestInit) => Promise<Response>;

const nomeDaLinha = (row: unknown): string | null => {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const instancia = r.instance && typeof r.instance === 'object' ? (r.instance as Record<string, unknown>) : null;
  const nome = r.name ?? r.instanceName ?? instancia?.instanceName;
  return typeof nome === 'string' ? nome : null;
};

/**
 * Pergunta ao servidor Evolution se já existe instância com esse nome.
 * `desconhecido` (rede, 401, 5xx) não bloqueia: a criação ainda recusa nome
 * repetido, e `nomeEmUsoNaCriacao` traduz essa recusa.
 */
export async function situacaoDoNomeNaEvolution(request: EvolutionRequest, nome: string): Promise<SituacaoDoNome> {
  try {
    const res = await request(`/instance/fetchInstances?instanceName=${encodeURIComponent(nome)}`);
    if (res.status === 404) return 'livre';
    if (!res.ok) return 'desconhecido';
    const lista = await res.json().catch(() => null);
    if (!Array.isArray(lista)) return 'desconhecido';
    return lista.some((row) => nomeDaLinha(row) === nome) ? 'em_uso' : 'livre';
  } catch {
    return 'desconhecido';
  }
}

/**
 * A Evolution v2 recusa nome repetido no /instance/create com 403 e o texto
 * `This name "x" is already in use.`. Sem esta leitura, a tela dizia
 * "recusou o acesso (403)", que parece problema de senha.
 */
export function nomeEmUsoNaCriacao(status: number, corpo: string): boolean {
  if (status !== 403 && status !== 409) return false;
  return /already in use|em uso/i.test(corpo);
}
