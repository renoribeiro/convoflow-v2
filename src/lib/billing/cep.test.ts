/**
 * Busca de CEP (dados para a nota fiscal). Sem rede: um fetch falso responde
 * como o ViaCEP, a BrasilAPI e o IBGE responderiam. Endereços inventados.
 */
import { describe, expect, it, vi } from 'vitest';
import { buscarCep, buscarCodigoIbge, chaveDeCidade, mensagemDoCep } from './cep';

type Resposta = { status: number; body?: unknown } | 'falha';

function fetchFalso(rotas: Record<string, Resposta>) {
  const chamadas: string[] = [];
  const f = vi.fn(async (url: string) => {
    chamadas.push(url);
    const host = Object.keys(rotas).find((h) => url.includes(h));
    const r = (host ? rotas[host] : undefined) ?? 'falha';
    if (r === 'falha') throw new TypeError('Failed to fetch');
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body };
  });
  return { f, chamadas };
}

const VIACEP_OK = {
  cep: '60000-000',
  logradouro: 'Rua Exemplo',
  bairro: 'Centro',
  localidade: 'Fortaleza',
  uf: 'CE',
  ibge: '2304400',
};

describe('buscarCep', () => {
  it('ViaCEP responde: endereço e código IBGE, sem chamar mais ninguém', async () => {
    const { f, chamadas } = fetchFalso({ 'viacep.com.br': { status: 200, body: VIACEP_OK } });
    const r = await buscarCep('60000-000', f);
    expect(r).toEqual({
      ok: true,
      fonte: 'viacep',
      endereco: { street: 'Rua Exemplo', district: 'Centro', city: 'Fortaleza', state: 'CE', city_ibge_code: '2304400' },
    });
    expect(chamadas).toEqual(['https://viacep.com.br/ws/60000000/json/']);
  });

  it('código IBGE que não bate com a UF é descartado', async () => {
    const { f } = fetchFalso({ 'viacep.com.br': { status: 200, body: { ...VIACEP_OK, ibge: '3550308' } } });
    const r = await buscarCep('60000000', f);
    expect(r.ok && r.endereco.city_ibge_code).toBeNull();
  });

  it('CEP que não existe (ViaCEP erro:true, BrasilAPI 404): nao_encontrado', async () => {
    const { f } = fetchFalso({
      'viacep.com.br': { status: 200, body: { erro: 'true' } },
      'brasilapi.com.br': { status: 404 },
    });
    expect(await buscarCep('99999999', f)).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });

  it('ViaCEP fora do ar: BrasilAPI + IBGE pelo nome da cidade', async () => {
    const { f, chamadas } = fetchFalso({
      'viacep.com.br': 'falha',
      'brasilapi.com.br': { status: 200, body: { cep: '60000000', state: 'CE', city: 'Fortaleza', neighborhood: 'Centro', street: 'Rua Exemplo' } },
      'servicodados.ibge.gov.br': { status: 200, body: [{ id: 2303709, nome: 'Caucaia' }, { id: 2304400, nome: 'Fortaleza' }] },
    });
    const r = await buscarCep('60000000', f);
    expect(r).toEqual({
      ok: true,
      fonte: 'brasilapi',
      endereco: { street: 'Rua Exemplo', district: 'Centro', city: 'Fortaleza', state: 'CE', city_ibge_code: '2304400' },
    });
    expect(chamadas[2]).toBe('https://servicodados.ibge.gov.br/api/v1/localidades/estados/CE/municipios');
  });

  it('tudo fora do ar: indisponivel (a tela deixa preencher à mão)', async () => {
    const { f } = fetchFalso({});
    expect(await buscarCep('60000000', f)).toEqual({ ok: false, motivo: 'indisponivel' });
    expect(mensagemDoCep('indisponivel')).toMatch(/à mão/);
  });

  it('CEP incompleto nem sai do navegador', async () => {
    const { f } = fetchFalso({});
    expect(await buscarCep('6000', f)).toEqual({ ok: false, motivo: 'cep_invalido' });
    expect(f).not.toHaveBeenCalled();
  });

  it('demorou demais: desiste no tempo limite', async () => {
    const f = vi.fn(
      (_url: string, init?: { signal?: AbortSignal }) =>
        new Promise<never>((_ok, falha) => init?.signal?.addEventListener('abort', () => falha(new Error('abortado')))),
    );
    expect(await buscarCep('60000000', f as never, 5)).toEqual({ ok: false, motivo: 'indisponivel' });
  });
});

describe('buscarCodigoIbge', () => {
  it('acha a cidade sem acento e sem maiúscula', async () => {
    const { f } = fetchFalso({
      'servicodados.ibge.gov.br': { status: 200, body: [{ id: 3550308, nome: 'São Paulo' }, { id: 3509502, nome: 'Campinas' }] },
    });
    expect(await buscarCodigoIbge('sao paulo', 'sp', f)).toBe('3550308');
    expect(chaveDeCidade("Santa Bárbara d'Oeste")).toBe('santa barbara d oeste');
  });

  it('UF que não existe, cidade vazia ou não encontrada: null', async () => {
    const { f } = fetchFalso({ 'servicodados.ibge.gov.br': { status: 200, body: [{ id: 2304400, nome: 'Fortaleza' }] } });
    expect(await buscarCodigoIbge('Fortaleza', 'XX', f)).toBeNull();
    expect(await buscarCodigoIbge('', 'CE', f)).toBeNull();
    expect(await buscarCodigoIbge('Cidade Inventada', 'CE', f)).toBeNull();
  });
});
