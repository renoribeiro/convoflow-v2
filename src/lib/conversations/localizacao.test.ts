import { describe, expect, it, vi } from 'vitest';
import {
  buscarEndereco,
  coordenadasEmTexto,
  lerPosicaoAtual,
  linkDoMapa,
  motivoDaBusca,
  motivoDaPosicao,
  pontoValido,
  TEXTOS_DA_LOCALIZACAO,
  textoDaLocalizacao,
} from './localizacao';

const resposta = (corpo: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({ ok, status, json: async () => corpo }));

describe('pontoValido (a mesma regra do servidor)', () => {
  it('aceita um ponto do mapa', () => {
    expect(pontoValido(-23.55052, -46.633308)).toBe(true);
    expect(pontoValido(90, 180)).toBe(true);
  });
  it('recusa fora do mapa, texto ou NaN', () => {
    expect(pontoValido(91, 0)).toBe(false);
    expect(pontoValido(0, -181)).toBe(false);
    expect(pontoValido('1', 2)).toBe(false);
    expect(pontoValido(Number.NaN, 2)).toBe(false);
  });
});

describe('buscarEndereco (OpenStreetMap)', () => {
  it('pergunta só no Brasil, em português, até 5 lugares, e devolve os pontos', async () => {
    const f = resposta([
      { lat: '-23.5505', lon: '-46.6333', display_name: 'Praça da Sé, São Paulo, SP, Brasil', name: 'Praça da Sé' },
      { lat: '-22.9068', lon: '-43.1729', display_name: 'Rio de Janeiro, RJ, Brasil', name: '' },
    ]);
    const r = await buscarEndereco('Praça da Sé, São Paulo', f);
    const url = new URL((f.mock.calls[0] as unknown as [string])[0]);
    expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
    expect(url.searchParams.get('countrycodes')).toBe('br');
    expect(url.searchParams.get('limit')).toBe('5');
    expect(url.searchParams.get('accept-language')).toBe('pt-BR');
    expect(url.searchParams.get('q')).toBe('Praça da Sé, São Paulo');
    expect(r).toEqual({
      ok: true,
      pontos: [
        { latitude: -23.5505, longitude: -46.6333, endereco: 'Praça da Sé, São Paulo, SP, Brasil', nome: 'Praça da Sé' },
        { latitude: -22.9068, longitude: -43.1729, endereco: 'Rio de Janeiro, RJ, Brasil', nome: undefined },
      ],
    });
  });

  it('texto curto demais não sai do navegador', async () => {
    const f = resposta([]);
    expect(await buscarEndereco('  Rua ', f)).toEqual({ ok: false, motivo: 'curto' });
    expect(f).not.toHaveBeenCalled();
  });

  it('nenhum lugar: nao_encontrado', async () => {
    expect(await buscarEndereco('Rua que não existe 999', resposta([]))).toEqual({ ok: false, motivo: 'nao_encontrado' });
  });

  it('ponto sem coordenada válida é ignorado', async () => {
    expect(await buscarEndereco('Rua Um, 10', resposta([{ lat: 'x', lon: '2' }]))).toEqual({
      ok: false,
      motivo: 'nao_encontrado',
    });
  });

  it('serviço fora, resposta estranha ou rede caída: indisponivel', async () => {
    expect(await buscarEndereco('Rua Um, 10', resposta(null, false, 503))).toEqual({ ok: false, motivo: 'indisponivel' });
    expect(await buscarEndereco('Rua Um, 10', resposta({ erro: 1 }))).toEqual({ ok: false, motivo: 'indisponivel' });
    const caiu = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await buscarEndereco('Rua Um, 10', caiu)).toEqual({ ok: false, motivo: 'indisponivel' });
  });
});

describe('lerPosicaoAtual (permissão do navegador)', () => {
  type Ok = (p: { coords: { latitude: number; longitude: number } }) => void;
  type Erro = (e: { code: number }) => void;
  const geo = (fn: (ok: Ok, erro: Erro, opcoes?: Record<string, unknown>) => void) => ({
    getCurrentPosition: vi.fn(fn),
  });

  it('com a permissão: o ponto do aparelho', async () => {
    const g = geo((ok) => ok({ coords: { latitude: -3.7319, longitude: -38.5267 } }));
    expect(await lerPosicaoAtual(g)).toEqual({ ok: true, ponto: { latitude: -3.7319, longitude: -38.5267 } });
    expect(g.getCurrentPosition.mock.calls[0]![2]).toMatchObject({ enableHighAccuracy: true });
  });

  it('permissão negada, posição indisponível e tempo esgotado', async () => {
    expect(await lerPosicaoAtual(geo((_, erro) => erro({ code: 1 })))).toEqual({ ok: false, motivo: 'negada' });
    expect(await lerPosicaoAtual(geo((_, erro) => erro({ code: 2 })))).toEqual({ ok: false, motivo: 'indisponivel' });
    expect(await lerPosicaoAtual(geo((_, erro) => erro({ code: 3 })))).toEqual({ ok: false, motivo: 'demorou' });
  });

  it('navegador sem localização: sem_suporte', async () => {
    expect(await lerPosicaoAtual(undefined)).toEqual({ ok: false, motivo: 'sem_suporte' });
  });
});

describe('textos', () => {
  it('cada motivo tem a sua frase, com o próximo passo', () => {
    expect(motivoDaPosicao('negada')).toBe(TEXTOS_DA_LOCALIZACAO.negada);
    expect(motivoDaPosicao('negada')).toMatch(/digite o endereço/);
    expect(motivoDaPosicao('indisponivel')).toBe(TEXTOS_DA_LOCALIZACAO.indisponivel_posicao);
    expect(motivoDaBusca('indisponivel')).toBe(TEXTOS_DA_LOCALIZACAO.indisponivel_busca);
    expect(motivoDaBusca('curto')).toBe(TEXTOS_DA_LOCALIZACAO.curto);
  });

  it('nenhum texto da tela tem hífen ou travessão', () => {
    for (const t of Object.values(TEXTOS_DA_LOCALIZACAO)) expect(t).not.toMatch(/[-–—]/);
  });

  it('o texto gravado, o link e as coordenadas', () => {
    expect(textoDaLocalizacao({ latitude: 1, longitude: 2, nome: 'Loja Centro', endereco: 'Rua Um' })).toBe('Loja Centro');
    expect(textoDaLocalizacao({ latitude: 1, longitude: 2, endereco: 'Rua Um' })).toBe('Rua Um');
    expect(textoDaLocalizacao({ latitude: 1, longitude: 2 })).toBe('Localização');
    expect(linkDoMapa(-23.5, -46.6)).toBe('https://www.google.com/maps/search/?api=1&query=-23.5,-46.6');
    expect(coordenadasEmTexto(-23.550521, -46.6333089)).toBe('-23.55052, -46.63331');
  });
});
