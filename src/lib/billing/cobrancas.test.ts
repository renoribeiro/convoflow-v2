import { describe, expect, it } from 'vitest';
import {
  escolherNota,
  NOTA_STATUS_LABEL,
  notaFiscalVisivel,
  rotuloDaNota,
  STATUS_REEMITIVEIS,
  type NotaDaCobranca,
} from '@/lib/billing/cobrancas';

const STATUS = [
  'aguardando_emissao', 'emitindo', 'emitida', 'erro', 'cancelada', 'cancelar_manual',
  'aguardando_prefeitura', 'certificado_vencido', 'sem_nota',
];

const nota = (ambiente: 'restrita' | 'producao'): NotaDaCobranca => ({
  id: `aaaaaaaa-0000-4000-8000-00000000000${ambiente === 'producao' ? 1 : 2}`,
  ambiente, status: 'emitida', numero_nfse: '1', chave_acesso: null, emitida_em: null, cancelada_em: null,
  ultimo_erro_codigo: null, ultimo_erro_mensagem: null, tentativas: 1, pdf_path: null, xml_path: null,
});

describe('notaFiscalVisivel', () => {
  it('superadmin vê sempre', () => {
    expect(notaFiscalVisivel({ ehSuperadmin: true, ambienteAtivo: 'restrita' })).toBe(true);
    expect(notaFiscalVisivel({ ehSuperadmin: true, ambienteAtivo: undefined })).toBe(true);
  });
  it('os demais só com a produção ativa', () => {
    expect(notaFiscalVisivel({ ehSuperadmin: false, ambienteAtivo: 'producao' })).toBe(true);
    expect(notaFiscalVisivel({ ehSuperadmin: false, ambienteAtivo: 'restrita' })).toBe(false);
    expect(notaFiscalVisivel({ ehSuperadmin: false, ambienteAtivo: null })).toBe(false);
    expect(notaFiscalVisivel({ ehSuperadmin: false, ambienteAtivo: undefined })).toBe(false);
  });
});

describe('rótulos', () => {
  it('cobrem todos os estados', () => {
    expect(Object.keys(NOTA_STATUS_LABEL).sort()).toEqual([...STATUS].sort());
    for (const s of STATUS) expect(rotuloDaNota(s)).not.toBe('—');
    expect(rotuloDaNota('qualquer')).toBe('—');
    expect(rotuloDaNota('cancelar_manual')).toBe('Cancelar à mão');
  });
  it('reemitir vale só para os estados parados', () => {
    expect([...STATUS_REEMITIVEIS].sort()).toEqual(['aguardando_emissao', 'aguardando_prefeitura', 'certificado_vencido', 'erro']);
  });
});

describe('escolherNota', () => {
  it('superadmin prefere produção e cai na de teste', () => {
    expect(escolherNota([nota('restrita'), nota('producao')], true)?.ambiente).toBe('producao');
    expect(escolherNota([nota('restrita')], true)?.ambiente).toBe('restrita');
  });
  it('os demais só enxergam produção', () => {
    expect(escolherNota([nota('restrita')], false)).toBeNull();
    expect(escolherNota([nota('restrita'), nota('producao')], false)?.ambiente).toBe('producao');
    expect(escolherNota(null, false)).toBeNull();
  });
});
