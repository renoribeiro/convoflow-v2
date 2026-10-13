/**
 * "Dados para a nota fiscal" (nota fiscal, parte 1): a validação do navegador.
 *
 * Documentos INVENTADOS: os dígitos verificadores foram calculados, e o CNPJ
 * alfanumérico é o exemplo publicado pela Receita. Nenhum é de alguém.
 */
import { describe, expect, it } from 'vitest';
import {
  cepValido,
  cnpjValido,
  codigoIbgeCombina,
  cpfValido,
  dadosFiscaisCompletos,
  documentoMascarado,
  documentoValido,
  emailValido,
  formatarCep,
  formatarDocumento,
  formularioDaLinha,
  FORMULARIO_VAZIO,
  limparDocumento,
  mensagemDoErroAoSalvar,
  normalizarDadosFiscais,
  UF_IBGE,
  UFS,
  validarDadosFiscais,
  type DadosFiscais,
  type FormularioDadosFiscais,
} from './dadosFiscais';

const CPF = '11144477735';
const CPF_2 = '12345678909';
const CNPJ = '11222333000181';
const CNPJ_2 = '11444777000161';
const CNPJ_ALFA = '12ABC34501DE35';

const formOk = (extra: Partial<FormularioDadosFiscais> = {}): FormularioDadosFiscais => ({
  ...FORMULARIO_VAZIO,
  person_type: 'cpf',
  tax_id: '111.444.777-35',
  legal_name: 'Fulano de Teste',
  cep: '60000-000',
  street: 'Rua Exemplo',
  number: '100',
  complement: '',
  district: 'Centro',
  city: 'Fortaleza',
  city_ibge_code: '2304400',
  state: 'CE',
  invoice_email: 'nota@exemplo.com.br',
  ...extra,
});

describe('CPF', () => {
  it('válido: só algarismos e formatado', () => {
    expect(cpfValido(CPF)).toBe(true);
    expect(cpfValido(CPF_2)).toBe(true);
    expect(cpfValido('111.444.777-35')).toBe(true);
    expect(cpfValido(' 111 444 777 35 ')).toBe(true);
  });

  it('inválido: dígito errado, sequência repetida, tamanho, letra', () => {
    expect(cpfValido('11144477736')).toBe(false);
    expect(cpfValido('11144477725')).toBe(false);
    for (const d of '0123456789') expect(cpfValido(d.repeat(11))).toBe(false);
    expect(cpfValido('1114447773')).toBe(false);
    expect(cpfValido('111444777355')).toBe(false);
    expect(cpfValido('1114447773A')).toBe(false);
    expect(cpfValido('')).toBe(false);
  });
});

describe('CNPJ', () => {
  it('válido: numérico, formatado e alfanumérico (2026)', () => {
    expect(cnpjValido(CNPJ)).toBe(true);
    expect(cnpjValido(CNPJ_2)).toBe(true);
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido(CNPJ_ALFA)).toBe(true);
    expect(cnpjValido('12.ABC.345/01DE-35')).toBe(true);
    // minúscula vira maiúscula antes de conferir
    expect(cnpjValido('12.abc.345/01de-35')).toBe(true);
  });

  it('inválido: dígito errado, zerado, letra no dígito verificador, tamanho', () => {
    expect(cnpjValido('11222333000182')).toBe(false);
    expect(cnpjValido('12ABC34501DE36')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
    expect(cnpjValido('12ABC34501DE3A')).toBe(false);
    expect(cnpjValido('1122233300018')).toBe(false);
    expect(cnpjValido(CPF)).toBe(false);
  });

  it('documentoValido confere pelo tipo escolhido', () => {
    expect(documentoValido('cpf', CPF)).toBe(true);
    expect(documentoValido('cnpj', CPF)).toBe(false);
    expect(documentoValido('cnpj', CNPJ)).toBe(true);
    expect(documentoValido('cpf', CNPJ)).toBe(false);
  });
});

describe('formatação', () => {
  it('documento: máscara conforme o que já foi digitado', () => {
    expect(formatarDocumento('cpf', CPF)).toBe('111.444.777-35');
    expect(formatarDocumento('cpf', '1114')).toBe('111.4');
    expect(formatarDocumento('cpf', '111444777351234')).toBe('111.444.777-35');
    expect(formatarDocumento('cnpj', CNPJ)).toBe('11.222.333/0001-81');
    expect(formatarDocumento('cnpj', '12abc34501de35')).toBe('12.ABC.345/01DE-35');
    expect(formatarDocumento('cnpj', '112')).toBe('11.2');
  });

  it('limparDocumento tira pontuação e deixa letra maiúscula', () => {
    expect(limparDocumento('12.abc.345/01de-35')).toBe(CNPJ_ALFA);
    expect(limparDocumento('111.444.777-35')).toBe(CPF);
  });

  it('o resumo mostra só os 2 últimos algarismos', () => {
    expect(documentoMascarado('cpf', CPF)).toBe('CPF •••.•••.•••-35');
    expect(documentoMascarado('cnpj', CNPJ)).toBe('CNPJ ••.•••.•••/••••-81');
    expect(documentoMascarado('cpf', CPF)).not.toContain('444');
  });

  it('CEP', () => {
    expect(formatarCep('60000000')).toBe('60000-000');
    expect(formatarCep('600')).toBe('600');
    expect(cepValido('60000-000')).toBe(true);
    expect(cepValido('6000-000')).toBe(false);
  });
});

describe('UF e código IBGE', () => {
  it('as 27 UFs, cada uma com o prefixo IBGE', () => {
    expect(UFS).toHaveLength(27);
    expect(new Set(Object.values(UF_IBGE)).size).toBe(27);
    expect(UF_IBGE.CE).toBe('23');
    expect(UF_IBGE.SP).toBe('35');
  });

  it('o código da cidade começa pelo código do estado', () => {
    expect(codigoIbgeCombina('2304400', 'CE')).toBe(true);
    expect(codigoIbgeCombina('2304400', 'ce')).toBe(true);
    expect(codigoIbgeCombina('3550308', 'CE')).toBe(false);
    expect(codigoIbgeCombina('230440', 'CE')).toBe(false);
  });
});

describe('validarDadosFiscais', () => {
  it('formulário completo: sem erro', () => {
    expect(validarDadosFiscais(formOk())).toEqual({});
    expect(validarDadosFiscais(formOk({ person_type: 'cnpj', tax_id: '12.ABC.345/01DE-35', legal_name: 'Fulano Ltda' }))).toEqual({});
    // sem código IBGE vale (endereço à mão)
    expect(validarDadosFiscais(formOk({ city_ibge_code: '' }))).toEqual({});
  });

  it('cada campo obrigatório tem a sua frase', () => {
    const erros = validarDadosFiscais({ ...FORMULARIO_VAZIO, person_type: 'cpf' });
    expect(erros.tax_id).toBe('Informe o CPF.');
    expect(erros.legal_name).toBe('Informe o nome completo.');
    expect(erros.cep).toBe('O CEP tem 8 números.');
    expect(erros.street).toMatch(/rua/);
    expect(erros.number).toMatch(/S\/N/);
    expect(erros.district).toMatch(/bairro/);
    expect(erros.city).toMatch(/cidade/);
    expect(erros.state).toMatch(/UF/);
    expect(erros.invoice_email).toMatch(/e-mail/);
    expect(validarDadosFiscais({ ...FORMULARIO_VAZIO, person_type: 'cnpj' }).legal_name).toBe('Informe a razão social.');
  });

  it('documento errado: a frase não repete o número', () => {
    const e = validarDadosFiscais(formOk({ tax_id: '111.444.777-36' }));
    expect(e.tax_id).toBe('CPF inválido: confira os números.');
    expect(e.tax_id).not.toMatch(/\d/);
    const c = validarDadosFiscais(formOk({ person_type: 'cnpj', tax_id: '11.222.333/0001-82' }));
    expect(c.tax_id).toMatch(/^CNPJ inválido/);
    expect(c.tax_id).not.toMatch(/\d/);
  });

  it('cidade que não confere com a UF', () => {
    expect(validarDadosFiscais(formOk({ city_ibge_code: '3550308' })).city).toMatch(/não confere com o estado/);
  });

  it('limites de tamanho', () => {
    expect(validarDadosFiscais(formOk({ number: '1'.repeat(21) })).number).toBe('Use até 20 caracteres.');
    expect(validarDadosFiscais(formOk({ legal_name: 'x'.repeat(151) })).legal_name).toBeDefined();
    expect(validarDadosFiscais(formOk({ complement: 'x'.repeat(81) })).complement).toBe('Use até 80 caracteres.');
  });

  it('e-mail', () => {
    expect(emailValido('nota@exemplo.com.br')).toBe(true);
    expect(emailValido('nota@exemplo')).toBe(false);
    expect(emailValido('nota exemplo@exemplo.com')).toBe(false);
  });
});

describe('normalizar, ler de volta e "completos"', () => {
  it('normaliza como o gatilho do banco', () => {
    const linha = normalizarDadosFiscais('aaaaaaaa-0000-4000-8000-000000000001', formOk({
      tax_id: ' 111.444.777-35 ',
      legal_name: '  Fulano   de  Teste ',
      cep: '60000-000',
      complement: '  ',
      state: 'ce',
      invoice_email: ' Nota@Exemplo.com.br ',
    }));
    expect(linha).toMatchObject({
      tenant_id: 'aaaaaaaa-0000-4000-8000-000000000001',
      person_type: 'cpf',
      tax_id: CPF,
      legal_name: 'Fulano de Teste',
      cep: '60000000',
      complement: null,
      city_ibge_code: '2304400',
      state: 'CE',
      invoice_email: 'nota@exemplo.com.br',
    });
  });

  it('a linha volta para o formulário formatada', () => {
    const linha = normalizarDadosFiscais('t', formOk()) as DadosFiscais;
    const f = formularioDaLinha(linha);
    expect(f.tax_id).toBe('111.444.777-35');
    expect(f.cep).toBe('60000-000');
    expect(formularioDaLinha(null, 'eu@exemplo.com.br').invoice_email).toBe('eu@exemplo.com.br');
  });

  it('completos: só com a linha inteira e válida', () => {
    expect(dadosFiscaisCompletos(null)).toBe(false);
    const linha = normalizarDadosFiscais('t', formOk()) as DadosFiscais;
    expect(dadosFiscaisCompletos(linha)).toBe(true);
    expect(dadosFiscaisCompletos({ ...linha, city_ibge_code: null })).toBe(true);
    expect(dadosFiscaisCompletos({ ...linha, street: '' })).toBe(false);
    expect(dadosFiscaisCompletos({ ...linha, tax_id: '11144477736' })).toBe(false);
    // o que o backend falso do e2e devolve não passa por "completo"
    expect(dadosFiscaisCompletos({ ...linha, tax_id: 'Valor 0', cep: 'Valor 1' })).toBe(false);
  });
});

describe('mensagemDoErroAoSalvar', () => {
  it('RLS vira "só o Gerente"; o gatilho passa a frase dele; o resto é genérico', () => {
    expect(mensagemDoErroAoSalvar({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/Gerente/);
    expect(mensagemDoErroAoSalvar({ code: '22023', message: 'CPF inválido: confira os números.' })).toBe('CPF inválido: confira os números.');
    // um erro desconhecido nunca é repassado (poderia trazer a linha)
    const generica = mensagemDoErroAoSalvar({ code: '23502', message: 'null value ... Failing row contains (111.444.777-35)' });
    expect(generica).not.toMatch(/Failing|\d{3}/);
    expect(mensagemDoErroAoSalvar(null)).toMatch(/Tente de novo/);
  });
});
