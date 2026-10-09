import { describe, it, expect } from 'vitest';
import {
  dentroDaJanela,
  normalizarTelefoneDigitado,
  podeTextoLivre,
  telefoneDoContatoNovo,
  telefoneValido,
  templatesParaIniciar,
  variantesDoTelefone,
} from './startConversation';
import type { WhatsAppTemplate } from '@/services/whatsapp';

const AGORA = new Date('2026-10-08T12:00:00Z');
const horasAtras = (h: number) => new Date(AGORA.getTime() - h * 3600 * 1000).toISOString();

describe('telefone digitado', () => {
  it('põe o 55 quando vem só com DDD e valida o tamanho', () => {
    expect(normalizarTelefoneDigitado('(11) 99999-0000')).toBe('5511999990000');
    expect(normalizarTelefoneDigitado('5511999990000')).toBe('5511999990000');
    expect(telefoneValido('5511999990000')).toBe(true);
    expect(telefoneValido('551199')).toBe(false);
  });

  it('celular brasileiro é procurado com e sem o 9 (o WhatsApp manda muitos sem)', () => {
    expect(variantesDoTelefone('5511999990000')).toEqual(['5511999990000', '551199990000']);
    expect(variantesDoTelefone('551199990000')).toEqual(['551199990000', '5511999990000']);
  });

  it('fixo brasileiro e número de fora do Brasil ficam como estão', () => {
    expect(variantesDoTelefone('551133330000')).toEqual(['551133330000']);
    expect(variantesDoTelefone('14155550000')).toEqual(['14155550000']);
  });

  it('contato novo nasce com o telefone que a Meta confirmou, senão com o digitado', () => {
    expect(
      telefoneDoContatoNovo({ digitado: '5511999990000', confirmadoPeloProvider: '551199990000' }),
    ).toBe('551199990000');
    expect(telefoneDoContatoNovo({ digitado: '5511999990000' })).toBe('5511999990000');
  });
});

describe('janela de 24 horas', () => {
  it('conta a partir da última mensagem que o telefone mandou', () => {
    expect(dentroDaJanela(horasAtras(1), AGORA)).toBe(true);
    expect(dentroDaJanela(horasAtras(23.9), AGORA)).toBe(true);
    expect(dentroDaJanela(horasAtras(24), AGORA)).toBe(false);
    expect(dentroDaJanela(horasAtras(30), AGORA)).toBe(false);
  });

  it('quem nunca escreveu está fora da janela', () => {
    expect(dentroDaJanela(null, AGORA)).toBe(false);
    expect(dentroDaJanela('não é data', AGORA)).toBe(false);
  });

  it('número oficial: texto livre só dentro da janela', () => {
    const oficial = { exigeTemplateForaDaJanela: true, agora: AGORA };
    expect(podeTextoLivre({ ...oficial, ultimaEntradaEm: horasAtras(2) })).toBe(true);
    expect(podeTextoLivre({ ...oficial, ultimaEntradaEm: horasAtras(25) })).toBe(false);
    expect(podeTextoLivre({ ...oficial, ultimaEntradaEm: null })).toBe(false);
  });

  it('número de QR Code: texto livre sempre', () => {
    expect(
      podeTextoLivre({ exigeTemplateForaDaJanela: false, ultimaEntradaEm: null, agora: AGORA }),
    ).toBe(true);
  });
});

describe('templates oferecidos', () => {
  const t = (over: Partial<WhatsAppTemplate>): WhatsAppTemplate => ({
    name: 'boas_vindas',
    language: 'pt_BR',
    status: 'APPROVED',
    paramCount: 1,
    ...over,
  });

  it('só aprovados, em ordem alfabética', () => {
    const { usaveis, foraDoAlcance } = templatesParaIniciar([
      t({ name: 'retorno' }),
      t({ name: 'pendente', status: 'PENDING' }),
      t({ name: 'rejeitado', status: 'REJECTED' }),
      t({ name: 'agenda' }),
    ]);
    expect(usaveis.map((x) => x.name)).toEqual(['agenda', 'retorno']);
    expect(foraDoAlcance).toBe(0);
  });

  it('aprovado que pede mídia ou variável fora do corpo fica de fora e é contado', () => {
    const { usaveis, foraDoAlcance } = templatesParaIniciar([
      t({ name: 'com_imagem', header: { format: 'IMAGE', text: '' } }),
      t({ name: 'cabecalho_variavel', header: { format: 'TEXT', text: 'Olá {{1}}' } }),
      t({ name: 'botao_link', buttons: [{ type: 'URL', text: 'Ver', url: 'https://exemplo.com.br/{{1}}' }] }),
      t({ name: 'cabecalho_fixo', header: { format: 'TEXT', text: 'Clínica' } }),
    ]);
    expect(usaveis.map((x) => x.name)).toEqual(['cabecalho_fixo']);
    expect(foraDoAlcance).toBe(3);
  });

  it('nenhum aprovado: lista vazia', () => {
    expect(templatesParaIniciar([t({ status: 'PENDING' })]).usaveis).toEqual([]);
    expect(templatesParaIniciar([]).usaveis).toEqual([]);
  });
});
