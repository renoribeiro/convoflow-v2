/**
 * Número da API Oficial que já funcionava em outra empresa (modelo novo de
 * contas da Meta): supabase/functions/_shared/meta-numero-existente.ts.
 *
 * Dois caminhos, os dois cobertos aqui:
 *   número novo: o de sempre (PIN sorteado é guardado, aquecimento começa hoje);
 *   número que veio pronto: PIN sorteado NÃO é guardado, sem aquecimento,
 *     marcado como de outra empresa, e o registro manual pede o PIN na tela.
 */
import { describe, expect, it } from 'vitest';
import {
  CAMPOS_BASICOS_DO_NUMERO_NA_META,
  CAMPOS_DO_NUMERO_NA_META,
  desfechoDoRegistro,
  escolherPinDoRegistro,
  estadoDoNumeroNaMeta,
  limiteInformadoPelaMeta,
  MENSAGEM_PIN_DESCONHECIDO,
  META_ERRO_JA_REGISTRADO,
  META_ERRO_PIN_JA_DEFINIDO,
  notaInformadaPelaMeta,
} from '../../../supabase/functions/_shared/meta-numero-existente.ts';

describe('o número já estava em uso na Meta?', () => {
  it.each(['CONNECTED', 'FLAGGED', 'RESTRICTED', 'RATE_LIMITED', 'connected'])('status %s: já em uso', (status) => {
    expect(estadoDoNumeroNaMeta({ status })).toBe('ja_em_uso');
  });

  it.each(['PENDING', 'DISCONNECTED'])('status %s: número novo', (status) => {
    expect(estadoDoNumeroNaMeta({ status, quality_rating: 'GREEN' })).toBe('novo');
  });

  it('sem status, nota de quem já enviou decide', () => {
    expect(estadoDoNumeroNaMeta({ quality_rating: 'YELLOW' })).toBe('ja_em_uso');
    expect(estadoDoNumeroNaMeta({ quality_rating: 'NA' })).toBe('desconhecido');
  });

  it('sem resposta da Meta: desconhecido (vale o comportamento de sempre)', () => {
    expect(estadoDoNumeroNaMeta(null)).toBe('desconhecido');
    expect(estadoDoNumeroNaMeta({})).toBe('desconhecido');
  });

  it('lê o limite e a nota que a Meta informa, e ignora lixo', () => {
    expect(limiteInformadoPelaMeta({ whatsapp_business_manager_messaging_limit: 'TIER_2K' })).toBe('TIER_2K');
    expect(limiteInformadoPelaMeta({ whatsapp_business_manager_messaging_limit: 'tier_unlimited' })).toBe('TIER_UNLIMITED');
    expect(limiteInformadoPelaMeta({ whatsapp_business_manager_messaging_limit: 'muito' })).toBeNull();
    expect(notaInformadaPelaMeta({ quality_rating: 'GREEN' })).toBe('GREEN');
    expect(notaInformadaPelaMeta({ quality_rating: 'roxo' })).toBeNull();
  });

  it('pede à Meta os campos documentados (status, nota e limite da v24 em diante)', () => {
    expect(CAMPOS_DO_NUMERO_NA_META.split(',')).toEqual([
      'display_phone_number',
      'verified_name',
      'status',
      'quality_rating',
      'whatsapp_business_manager_messaging_limit',
    ]);
    expect(CAMPOS_BASICOS_DO_NUMERO_NA_META).toBe('display_phone_number,verified_name,status');
  });
});

describe('qual PIN mandar', () => {
  it('o digitado vale primeiro, depois o guardado', () => {
    expect(escolherPinDoRegistro({ pinDigitado: '123456', pinGuardado: '654321', deOutraEmpresa: true })).toEqual({ origem: 'digitado' });
    expect(escolherPinDoRegistro({ pinGuardado: '654321', deOutraEmpresa: true })).toEqual({ origem: 'guardado' });
  });

  it('número novo sem PIN: sorteia, como sempre', () => {
    expect(escolherPinDoRegistro({ deOutraEmpresa: false })).toEqual({ origem: 'sorteado' });
  });

  it('número de outra empresa sem PIN conhecido: não inventa, pede na tela', () => {
    expect(escolherPinDoRegistro({ pinGuardado: null, deOutraEmpresa: true })).toEqual({ pedirPin: true });
    expect(escolherPinDoRegistro({ pinDigitado: '12', deOutraEmpresa: true })).toEqual({ pedirPin: true });
  });

  it('a frase do PIN desconhecido diz onde achar e não tem hífen nem travessão', () => {
    expect(MENSAGEM_PIN_DESCONHECIDO).toMatch(/outra empresa/);
    expect(MENSAGEM_PIN_DESCONHECIDO).toMatch(/WhatsApp Manager/);
    expect(MENSAGEM_PIN_DESCONHECIDO).not.toMatch(/[-‐‑‒–—―−]/);
  });
});

describe('o que gravar depois do registro', () => {
  it('número novo aceito: guarda o PIN e o aquecimento começa hoje (o de sempre)', () => {
    expect(desfechoDoRegistro({ origem: 'sorteado', numeroJaEmUso: false }, { ok: true })).toEqual({
      registrado: true,
      guardarPin: true,
      carimbarRegistradoEm: true,
      marcarDeOutraEmpresa: false,
    });
  });

  it('número novo com PIN que não confere (136024): o de sempre, nada gravado, a tela pede o PIN', () => {
    expect(
      desfechoDoRegistro({ origem: 'sorteado', numeroJaEmUso: false }, { ok: false, codigoDeErro: META_ERRO_PIN_JA_DEFINIDO }),
    ).toEqual({ registrado: false, guardarPin: false, carimbarRegistradoEm: false, marcarDeOutraEmpresa: false });
  });

  it('número que já estava em uso: sorteado não é guardado, sem aquecimento, marcado', () => {
    for (const r of [{ ok: true }, { ok: false, codigoDeErro: META_ERRO_JA_REGISTRADO }, { ok: false, codigoDeErro: META_ERRO_PIN_JA_DEFINIDO }]) {
      expect(desfechoDoRegistro({ origem: 'sorteado', numeroJaEmUso: true }, r)).toEqual({
        registrado: true,
        guardarPin: false,
        carimbarRegistradoEm: false,
        marcarDeOutraEmpresa: true,
      });
    }
  });

  it('"já registrado" (133015) com PIN sorteado também é número que veio pronto', () => {
    expect(
      desfechoDoRegistro({ origem: 'sorteado', numeroJaEmUso: false }, { ok: false, codigoDeErro: META_ERRO_JA_REGISTRADO }),
    ).toEqual({ registrado: true, guardarPin: false, carimbarRegistradoEm: false, marcarDeOutraEmpresa: true });
  });

  it('PIN digitado pela pessoa num número de outra empresa e aceito: passa a ser o PIN conhecido', () => {
    expect(desfechoDoRegistro({ origem: 'digitado', numeroJaEmUso: true }, { ok: true })).toEqual({
      registrado: true,
      guardarPin: true,
      carimbarRegistradoEm: false,
      marcarDeOutraEmpresa: true,
    });
  });

  it('PIN guardado e 133015 num número nosso: o de sempre', () => {
    expect(
      desfechoDoRegistro({ origem: 'guardado', numeroJaEmUso: false }, { ok: false, codigoDeErro: META_ERRO_JA_REGISTRADO }),
    ).toEqual({ registrado: true, guardarPin: true, carimbarRegistradoEm: true, marcarDeOutraEmpresa: false });
  });
});
