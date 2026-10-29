import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { criarSalvadorDeNotas, type EstadoDaNota } from './salvadorDeNotas';

function montar(salvar = vi.fn(async (_t: string) => {})) {
  const estados: EstadoDaNota[] = [];
  const s = criarSalvadorDeNotas({ salvoInicial: 'antiga', salvar, aoMudarEstado: (e) => estados.push(e) });
  return { s, salvar, estados };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('salvador das notas', () => {
  it('grava uma vez, 1 segundo depois da última tecla, e diz Salvando e Salvo', async () => {
    const { s, salvar, estados } = montar();
    s.mudou('a');
    s.mudou('ab');
    await vi.advanceTimersByTimeAsync(999);
    expect(salvar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(salvar).toHaveBeenCalledWith('ab');
    expect(estados).toEqual(['salvando', 'salvo']);
  });

  it('fechar antes de 1 segundo grava na hora: nada se perde', async () => {
    const { s, salvar } = montar();
    s.mudou('ligar amanhã cedo');
    expect(await s.descarregar()).toBe(true);
    expect(salvar).toHaveBeenCalledWith('ligar amanhã cedo');
    await vi.advanceTimersByTimeAsync(2000);
    expect(salvar).toHaveBeenCalledTimes(1);
  });

  it('erro aparece como erro, e tentar de novo grava', async () => {
    const salvar = vi.fn(async (_t: string) => {}).mockRejectedValueOnce(new Error('rede'));
    const { s, estados } = montar(salvar);
    s.mudou('x');
    expect(await s.descarregar()).toBe(false);
    expect(estados.at(-1)).toBe('erro');
    expect(s.temPendente()).toBe(true);
    expect(await s.descarregar()).toBe(true);
    expect(estados.at(-1)).toBe('salvo');
    expect(s.temPendente()).toBe(false);
  });

  it('digitou durante a gravação: a última versão é a que fica', async () => {
    let soltar: () => void = () => {};
    const salvar = vi.fn((_t: string) => new Promise<void>((r) => (soltar = r)));
    const { s, estados } = montar(salvar);
    s.mudou('um');
    const primeira = s.descarregar();
    await vi.waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
    s.mudou('um dois');
    const segunda = s.descarregar();
    soltar();
    await primeira;
    expect(estados.at(-1)).toBe('salvando');
    await vi.waitFor(() => expect(salvar).toHaveBeenCalledTimes(2));
    soltar();
    await segunda;
    expect(salvar.mock.calls.map((c) => c[0])).toEqual(['um', 'um dois']);
    expect(estados.at(-1)).toBe('salvo');
  });

  it('nada mudou: não grava', async () => {
    const { s, salvar, estados } = montar();
    s.mudou('antiga');
    expect(await s.descarregar()).toBe(true);
    expect(salvar).not.toHaveBeenCalled();
    expect(estados).toEqual([]);
  });

  it('o texto do servidor só entra quando não há nada por gravar', async () => {
    const { s, salvar } = montar();
    s.sincronizar('do servidor');
    expect(s.temPendente()).toBe(false);
    s.mudou('minha');
    s.sincronizar('outra do servidor');
    expect(s.temPendente()).toBe(true);
    await s.descarregar();
    expect(salvar).toHaveBeenCalledWith('minha');
  });
});
