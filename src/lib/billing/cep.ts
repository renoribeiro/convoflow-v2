// =============================================================================
// billing/cep — o CEP preenche o endereço (dados para a nota fiscal)
// =============================================================================
// Busca no navegador, sem passar pelo nosso servidor:
//   1. ViaCEP           — devolve rua, bairro, cidade, UF E o código IBGE.
//   2. BrasilAPI (v1)   — reserva, quando o ViaCEP não responde. Não traz o
//                         código IBGE: ele vem do passo 3.
//   3. IBGE (servicodados.ibge.gov.br) — a lista oficial de municípios da UF,
//      para achar o código pela cidade. Também é o que roda quando a pessoa
//      digita o endereço à mão.
// Tudo com tempo limite curto: se nada responde, a tela deixa preencher à mão.
// Só o CEP (ou a UF) sai do navegador — nunca o CPF/CNPJ.
//
// O PWA não guarda essas respostas em cache (regra NetworkOnly em
// vite.config.ts).
// =============================================================================

import { codigoIbgeCombina, somenteDigitos, UF_IBGE } from '@/lib/billing/dadosFiscais';

export interface EnderecoDoCep {
  street: string;
  district: string;
  city: string;
  state: string;
  city_ibge_code: string | null;
}

export type ResultadoCep =
  | { ok: true; endereco: EnderecoDoCep; fonte: 'viacep' | 'brasilapi' }
  | { ok: false; motivo: 'cep_invalido' | 'nao_encontrado' | 'indisponivel' };

type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export const TEMPO_LIMITE_MS = 6_000;

async function pegarJson(fetchImpl: Fetch, url: string, limiteMs: number): Promise<{ status: number; body: unknown } | null> {
  const controle = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const relogio = controle ? setTimeout(() => controle.abort(), limiteMs) : null;
  try {
    const r = await fetchImpl(url, controle ? { signal: controle.signal } : undefined);
    const body = r.ok ? await r.json() : null;
    return { status: r.status, body };
  } catch {
    return null;
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

/** Sem acento e sem maiúscula, para comparar nomes de cidade. */
export function chaveDeCidade(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * O código IBGE da cidade, pela lista oficial de municípios da UF. Null se a
 * UF não existe, se o IBGE não responde ou se nenhum município tem esse nome.
 */
export async function buscarCodigoIbge(
  cidade: string,
  uf: string,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  limiteMs = TEMPO_LIMITE_MS,
): Promise<string | null> {
  const sigla = (uf ?? '').trim().toUpperCase();
  const alvo = chaveDeCidade(cidade ?? '');
  if (!UF_IBGE[sigla] || !alvo) return null;
  const r = await pegarJson(
    fetchImpl,
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${sigla}/municipios`,
    limiteMs,
  );
  if (!r || !Array.isArray(r.body)) return null;
  for (const m of r.body as Array<{ id?: unknown; nome?: unknown }>) {
    if (chaveDeCidade(texto(m?.nome)) !== alvo) continue;
    const codigo = String(m?.id ?? '');
    return codigoIbgeCombina(codigo, sigla) ? codigo : null;
  }
  return null;
}

/** Endereço pelo CEP: ViaCEP, depois BrasilAPI (+ IBGE para o código). */
export async function buscarCep(
  cep: string,
  fetchImpl: Fetch = fetch as unknown as Fetch,
  limiteMs = TEMPO_LIMITE_MS,
): Promise<ResultadoCep> {
  const d = somenteDigitos(cep);
  if (d.length !== 8) return { ok: false, motivo: 'cep_invalido' };

  let naoExiste = false;

  const via = await pegarJson(fetchImpl, `https://viacep.com.br/ws/${d}/json/`, limiteMs);
  if (via && via.body && typeof via.body === 'object') {
    const b = via.body as Record<string, unknown>;
    if (b.erro === true || b.erro === 'true') {
      naoExiste = true;
    } else if (texto(b.localidade) && UF_IBGE[texto(b.uf).toUpperCase()]) {
      const uf = texto(b.uf).toUpperCase();
      const ibge = texto(b.ibge);
      return {
        ok: true,
        fonte: 'viacep',
        endereco: {
          street: texto(b.logradouro),
          district: texto(b.bairro),
          city: texto(b.localidade),
          state: uf,
          city_ibge_code: codigoIbgeCombina(ibge, uf) ? ibge : null,
        },
      };
    }
  } else if (via && via.status === 400) {
    return { ok: false, motivo: 'cep_invalido' };
  }

  const br = await pegarJson(fetchImpl, `https://brasilapi.com.br/api/cep/v1/${d}`, limiteMs);
  if (br && br.body && typeof br.body === 'object') {
    const b = br.body as Record<string, unknown>;
    const uf = texto(b.state).toUpperCase();
    if (texto(b.city) && UF_IBGE[uf]) {
      return {
        ok: true,
        fonte: 'brasilapi',
        endereco: {
          street: texto(b.street),
          district: texto(b.neighborhood),
          city: texto(b.city),
          state: uf,
          city_ibge_code: await buscarCodigoIbge(texto(b.city), uf, fetchImpl, limiteMs),
        },
      };
    }
  } else if (br && br.status === 404) {
    naoExiste = true;
  }

  return { ok: false, motivo: naoExiste ? 'nao_encontrado' : 'indisponivel' };
}

/** A frase da tela para cada falha. */
export function mensagemDoCep(motivo: 'cep_invalido' | 'nao_encontrado' | 'indisponivel'): string {
  switch (motivo) {
    case 'cep_invalido':
      return 'O CEP tem 8 números.';
    case 'nao_encontrado':
      return 'Não achamos esse CEP. Confira os números ou preencha o endereço à mão.';
    default:
      return 'A busca do CEP não respondeu agora. Preencha o endereço à mão: a gente confere a cidade pelo IBGE.';
  }
}
