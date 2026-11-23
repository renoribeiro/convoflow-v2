/**
 * Automações prontas da aba Automação (2026-11-23): leitura do que a Loja
 * salvou, conferência dos campos, as chaves gravadas, a frase do horário, o
 * aviso de automação comum que também troca o nome e a paridade com o
 * servidor (texto padrão, limites, variável). O banco tem a própria rede:
 * docs/teste_automacoes_prontas.sql.
 */
import { describe, expect, it } from 'vitest';
import {
  LIMITE_DO_TEXTO_DO_AVISO,
  MINUTOS_DO_AVISO,
  TEXTO_PADRAO_DO_AVISO,
  VARIAVEL_VALIDA,
  automacoesQueTrocamONome,
  chavesDoAviso,
  chavesDoNome,
  erroDoNome,
  errosDoAviso,
  fraseDoHorario,
  lerAutomacoesProntas,
  variaveisDasPerguntas,
} from './automacoesProntas';
import * as servidorAviso from '../../../supabase/functions/_shared/aviso-de-espera';
import * as servidorNome from '../../../supabase/functions/_shared/nome-do-lead';

describe('o que está salvo na Loja', () => {
  it('nada salvo: tudo desligado, 5 minutos, texto padrão, respeita o horário', () => {
    expect(lerAutomacoesProntas({})).toEqual({
      nome: { ligado: false, variavel: '' },
      aviso: { ligado: false, minutos: 5, texto: TEXTO_PADRAO_DO_AVISO, respeitarHorario: true },
      horarioSalvo: false,
    });
    expect(lerAutomacoesProntas(null).aviso.minutos).toBe(5);
  });

  it('a Loja de hoje (aviso ligado com 5 minutos, sem texto salvo) aparece como está', () => {
    const lido = lerAutomacoesProntas({ waiting_notice_enabled: true, waiting_notice_minutes: 5 });
    expect(lido.aviso).toEqual({ ligado: true, minutos: 5, texto: TEXTO_PADRAO_DO_AVISO, respeitarHorario: true });
  });

  it('lê o que o cartão gravou', () => {
    const lido = lerAutomacoesProntas({
      lead_name_enabled: true,
      lead_name_variable: 'nome',
      waiting_notice_enabled: true,
      waiting_notice_minutes: 15,
      waiting_notice_text: '  Já respondemos!  ',
      waiting_notice_respect_hours: false,
      business_hours: { timezone: 'America/Sao_Paulo', schedule: {} },
    });
    expect(lido.nome).toEqual({ ligado: true, variavel: 'nome' });
    expect(lido.aviso).toEqual({ ligado: true, minutos: 15, texto: 'Já respondemos!', respeitarHorario: false });
    expect(lido.horarioSalvo).toBe(true);
  });
});

describe('conferência dos campos', () => {
  it('nome: variável obrigatória com o cartão ligado, e no formato do banco', () => {
    expect(erroDoNome({ ligado: true, variavel: 'nome' })).toBeNull();
    expect(erroDoNome({ ligado: false, variavel: '' })).toBeNull();
    expect(erroDoNome({ ligado: true, variavel: '  ' })).toMatch(/Escreva a variável/);
    for (const ruim of ['{nome}', 'nome do', '1nome', 'nóme']) {
      expect(erroDoNome({ ligado: true, variavel: ruim }), ruim).toMatch(/começa com letra/);
    }
  });

  it('aviso: minutos inteiros de 1 a 240', () => {
    for (const ok of [1, 5, 240]) expect(errosDoAviso({ minutos: ok, texto: 'x' }).minutos, String(ok)).toBeUndefined();
    for (const ruim of [0, 241, 2.5, Number.NaN]) {
      expect(errosDoAviso({ minutos: ruim, texto: 'x' }).minutos, String(ruim)).toMatch(/de 1 a 240/);
    }
  });

  it('aviso: mensagem de 1 a 1000 letras', () => {
    expect(errosDoAviso({ minutos: 5, texto: '   ' }).texto).toMatch(/Escreva a mensagem/);
    expect(errosDoAviso({ minutos: 5, texto: 'a'.repeat(1001) }).texto).toMatch(/máximo é 1000/);
    expect(errosDoAviso({ minutos: 5, texto: 'a'.repeat(1000) }).texto).toBeUndefined();
  });
});

describe('as chaves que cada cartão grava', () => {
  it('nome: só as duas chaves dele', () => {
    expect(chavesDoNome({ ligado: true, variavel: ' nome ' })).toEqual({ lead_name_enabled: true, lead_name_variable: 'nome' });
    expect(chavesDoNome({ ligado: false, variavel: '' })).toEqual({ lead_name_enabled: false, lead_name_variable: null });
  });

  it('aviso: minutos e texto do cartão, nunca o horário', () => {
    const chaves = chavesDoAviso({ ligado: true, minutos: 12, texto: ' Oi! ', respeitarHorario: false });
    expect(chaves).toEqual({
      waiting_notice_enabled: true,
      waiting_notice_minutes: 12,
      waiting_notice_text: 'Oi!',
      waiting_notice_respect_hours: false,
    });
    expect(chaves).not.toHaveProperty('business_hours');
  });

  it('o texto gravado pelo cartão é o que o servidor manda', () => {
    const settings = chavesDoAviso({ ligado: true, minutos: 5, texto: 'Já já falamos com você.', respeitarHorario: true });
    expect(servidorAviso.textoDoAviso(settings)).toBe('Já já falamos com você.');
    expect(servidorAviso.textoDoAviso({})).toBe(TEXTO_PADRAO_DO_AVISO);
    expect(servidorAviso.textoDoAviso({ waiting_notice_text: '   ' })).toBe(TEXTO_PADRAO_DO_AVISO);
  });

  it('a variável gravada pelo cartão é a que o chatbot confere', () => {
    expect(servidorNome.variavelDoNomeDoLead(chavesDoNome({ ligado: true, variavel: 'nome' }))).toBe('nome');
    expect(servidorNome.variavelDoNomeDoLead(chavesDoNome({ ligado: false, variavel: 'nome' }))).toBeNull();
  });
});

describe('a frase do horário', () => {
  it('sem horário salvo: a qualquer hora', () => {
    expect(fraseDoHorario({ respeitarHorario: true }, false)).toMatch(/não tem horário de funcionamento salvo: o aviso sai a qualquer hora/);
  });
  it('com horário salvo: respeita ou não, conforme a chave', () => {
    expect(fraseDoHorario({ respeitarHorario: true }, true)).toMatch(/só sai com a Loja aberta/);
    expect(fraseDoHorario({ respeitarHorario: false }, true)).toMatch(/mesmo com a Loja fechada/);
  });
});

describe('automação comum que também troca o nome', () => {
  const passoNome = { id: 's1', type: 'action', config: { type: 'update_contact', field: 'name', value: '{nome_cliente}' } };
  const passoEmail = { id: 's2', type: 'action', config: { type: 'update_contact', field: 'email', value: '{email}' } };
  const passoTag = { id: 's3', type: 'action', config: { type: 'add_tag', tag_name: 'x' } };

  it('acha a automação ativa com "Atualizar Contato" no campo Nome', () => {
    expect(
      automacoesQueTrocamONome([
        { name: 'Salva nome', active: true, steps: [passoTag, passoNome] },
        { name: 'Só email', active: true, steps: [passoEmail] },
        { name: 'Pausada', active: false, steps: [passoNome] },
      ]),
    ).toEqual(['Salva nome']);
  });

  it('lê passos gravados como texto e ignora o que não é lista', () => {
    expect(automacoesQueTrocamONome([{ name: 'Texto', active: true, steps: JSON.stringify([passoNome]) }])).toEqual(['Texto']);
    expect(automacoesQueTrocamONome([{ name: 'Quebrado', active: true, steps: '{' }])).toEqual([]);
    expect(automacoesQueTrocamONome(undefined)).toEqual([]);
  });
});

describe('sugestões de variável', () => {
  it('as variáveis das perguntas dos chatbots, sem repetir', () => {
    expect(
      variaveisDasPerguntas([
        { data: { save_to_variable: 'nome' } },
        { data: { save_to_variable: 'procedimento' } },
        { data: { save_to_variable: 'nome' } },
        { data: { save_to_variable: '' } },
        { data: {} },
      ]),
    ).toEqual(['nome', 'procedimento']);
  });
});

describe('paridade com o servidor', () => {
  it('texto padrão, limites e formato da variável são os mesmos', () => {
    expect(TEXTO_PADRAO_DO_AVISO).toBe(servidorAviso.TEXTO_DO_AVISO_DE_ESPERA);
    expect(LIMITE_DO_TEXTO_DO_AVISO).toBe(servidorAviso.LIMITE_DO_TEXTO_DO_AVISO);
    expect(MINUTOS_DO_AVISO).toEqual(servidorAviso.MINUTOS_DO_AVISO);
    expect(VARIAVEL_VALIDA.source).toBe(servidorNome.VARIAVEL_VALIDA.source);
  });
});
