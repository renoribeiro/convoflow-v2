// =============================================================================
// billing/dadosFiscais — "Dados para a nota fiscal" da Conta (nota fiscal, parte 1)
// =============================================================================
// Quem paga precisa estar identificado na nota: CPF ou CNPJ, nome ou razão
// social, endereço completo (com o código IBGE da cidade) e um e-mail para
// receber a nota. Uma linha por Conta, em `public.tenant_billing_details`.
//
// TRÊS LUGARES CONFEREM, DE PROPÓSITO:
//   - esta tela (mensagem amigável antes de salvar);
//   - o gatilho `tenant_billing_details_guard` do banco (a verdade: normaliza
//     e recusa, com mensagem SEM o documento — migração 20261013000001);
//   - o `create-checkout-session`, que recusa o checkout sem a linha
//     (supabase/functions/_shared/billing-details.ts).
// `src/lib/billing/dadosFiscaisParity.test.ts` vigia esta cópia contra a do
// servidor.
//
// CNPJ ALFANUMÉRICO. Desde julho de 2026 a Receita emite CNPJ com letras nas
// 12 primeiras posições (IN RFB 2.229/2024). O cálculo do dígito é o mesmo,
// com o valor de cada caractere = código ASCII − 48. Por isso o documento é
// guardado "sem pontuação", não "só algarismos": letras de CNPJ ficam.
//
// PRIVACIDADE. CPF/CNPJ é dado pessoal. Nada aqui registra em log, console ou
// mensagem de erro o valor digitado — as mensagens dizem o que está errado,
// nunca repetem o número.
// =============================================================================

export type TipoPessoa = 'cpf' | 'cnpj';

/** Uma linha de `tenant_billing_details`, como o navegador lê e grava. */
export interface DadosFiscais {
  tenant_id: string;
  person_type: TipoPessoa;
  tax_id: string;
  legal_name: string;
  cep: string;
  street: string;
  number: string;
  complement: string | null;
  district: string;
  city: string;
  city_ibge_code: string | null;
  state: string;
  invoice_email: string;
  created_at?: string;
  updated_at?: string;
  updated_by?: string | null;
}

/** O formulário, antes de normalizar (tudo texto, como o usuário digitou). */
export interface FormularioDadosFiscais {
  person_type: TipoPessoa;
  tax_id: string;
  legal_name: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  city_ibge_code: string;
  state: string;
  invoice_email: string;
}

export type CampoDadosFiscais = keyof FormularioDadosFiscais;

export const FORMULARIO_VAZIO: FormularioDadosFiscais = {
  person_type: 'cnpj',
  tax_id: '',
  legal_name: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  district: '',
  city: '',
  city_ibge_code: '',
  state: '',
  invoice_email: '',
};

// --------------------------------------------------------------- Estados
/** As 27 UFs e o prefixo IBGE de cada uma (os 2 primeiros números do código da cidade). */
export const UF_IBGE: Readonly<Record<string, string>> = {
  AC: '12', AL: '27', AP: '16', AM: '13', BA: '29', CE: '23', DF: '53', ES: '32', GO: '52',
  MA: '21', MT: '51', MS: '50', MG: '31', PA: '15', PB: '25', PR: '41', PE: '26', PI: '22',
  RJ: '33', RN: '24', RS: '43', RO: '11', RR: '14', SC: '42', SP: '35', SE: '28', TO: '17',
};

export const UFS: readonly string[] = Object.keys(UF_IBGE).sort();

// --------------------------------------------------------------- Limites
// Os mesmos do gatilho do banco.
export const LIMITES = {
  legal_name: 150,
  street: 150,
  number: 20,
  complement: 80,
  district: 80,
  city: 80,
  invoice_email: 254,
} as const;

// --------------------------------------------------------------- Documento

/** Tira pontuação e espaço; letras viram maiúsculas (CNPJ alfanumérico). */
export function limparDocumento(valor: string): string {
  return (valor ?? '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
}

export function somenteDigitos(valor: string): string {
  return (valor ?? '').replace(/\D/g, '');
}

const todosIguais = (s: string) => s.length > 0 && s.split('').every((c) => c === s[0]);

/** CPF: 11 algarismos e os dois dígitos verificadores. Sequências repetidas não valem. */
export function cpfValido(valor: string): boolean {
  const d = limparDocumento(valor);
  if (!/^[0-9]{11}$/.test(d) || todosIguais(d)) return false;
  const n = d.split('').map(Number);
  const dv = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += (n[i] ?? 0) * (ate + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return dv(9) === n[9] && dv(10) === n[10];
}

/**
 * CNPJ: 12 caracteres (algarismos ou, desde 2026, letras) e 2 dígitos
 * verificadores. Valor de cada caractere = código ASCII − 48.
 */
export function cnpjValido(valor: string): boolean {
  const d = limparDocumento(valor);
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(d) || todosIguais(d)) return false;
  const v = d.split('').map((c) => c.charCodeAt(0) - 48);
  const dv = (pesos: number[]) => {
    const soma = pesos.reduce((s, p, i) => s + (v[i] ?? 0) * p, 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  return (
    dv([5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === v[12] &&
    dv([6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]) === v[13]
  );
}

export function documentoValido(tipo: TipoPessoa, valor: string): boolean {
  return tipo === 'cpf' ? cpfValido(valor) : cnpjValido(valor);
}

/** 000.000.000-00 / 00.000.000/0000-00, conforme o que já foi digitado. */
export function formatarDocumento(tipo: TipoPessoa, valor: string): string {
  const d = limparDocumento(valor).slice(0, tipo === 'cpf' ? 11 : 14);
  if (tipo === 'cpf') {
    return d
      .replace(/^(\d{3})(\d)/, '$1.$2')
      .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
      .replace(/\.(\d{3})(\d{1,2})$/, '.$1-$2');
  }
  return d
    .replace(/^(\w{2})(\w)/, '$1.$2')
    .replace(/^(\w{2})\.(\w{3})(\w)/, '$1.$2.$3')
    .replace(/^(\w{2})\.(\w{3})\.(\w{3})(\w)/, '$1.$2.$3/$4')
    .replace(/\/(\w{4})(\w{1,2})$/, '/$1-$2');
}

/**
 * O documento para mostrar na tela sem expor o número inteiro: só os 2 últimos
 * algarismos. É o que aparece no resumo e nas listas.
 */
export function documentoMascarado(tipo: TipoPessoa, valor: string): string {
  const d = limparDocumento(valor);
  if (!d) return '';
  const fim = d.slice(-2);
  return tipo === 'cpf' ? `CPF •••.•••.•••-${fim}` : `CNPJ ••.•••.•••/••••-${fim}`;
}

// --------------------------------------------------------------- CEP
export function formatarCep(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function cepValido(valor: string): boolean {
  return /^[0-9]{8}$/.test(somenteDigitos(valor));
}

/** O código IBGE bate com a UF (os 2 primeiros números são o estado). */
export function codigoIbgeCombina(codigo: string, uf: string): boolean {
  const c = somenteDigitos(codigo);
  return /^[0-9]{7}$/.test(c) && UF_IBGE[uf.toUpperCase()] === c.slice(0, 2);
}

// --------------------------------------------------------------- E-mail
export function emailValido(valor: string): boolean {
  const e = (valor ?? '').trim();
  return e.length <= LIMITES.invoice_email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);
}

// --------------------------------------------------------------- Formulário

const espacos = (s: string) => (s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Confere o formulário. Devolve um erro por campo, em pt-BR, sem repetir o que
 * foi digitado. Vazio = pode salvar.
 */
export function validarDadosFiscais(f: FormularioDadosFiscais): Partial<Record<CampoDadosFiscais, string>> {
  const erros: Partial<Record<CampoDadosFiscais, string>> = {};
  const doc = limparDocumento(f.tax_id);

  if (f.person_type !== 'cpf' && f.person_type !== 'cnpj') erros.person_type = 'Escolha CPF ou CNPJ.';
  else if (!doc) erros.tax_id = f.person_type === 'cpf' ? 'Informe o CPF.' : 'Informe o CNPJ.';
  else if (!documentoValido(f.person_type, doc)) {
    erros.tax_id = f.person_type === 'cpf'
      ? 'CPF inválido: confira os números.'
      : 'CNPJ inválido: confira os números (e as letras, se o seu CNPJ tiver).';
  }

  const nome = espacos(f.legal_name);
  if (nome.length < 2 || nome.length > LIMITES.legal_name) {
    erros.legal_name = f.person_type === 'cpf'
      ? 'Informe o nome completo.'
      : 'Informe a razão social.';
  }

  if (!cepValido(f.cep)) erros.cep = 'O CEP tem 8 números.';

  const obrigatorio = (campo: 'street' | 'number' | 'district' | 'city', mensagem: string) => {
    const v = espacos(f[campo]);
    if (!v) erros[campo] = mensagem;
    else if (v.length > LIMITES[campo]) erros[campo] = `Use até ${LIMITES[campo]} caracteres.`;
  };
  obrigatorio('street', 'Informe a rua, avenida ou logradouro.');
  obrigatorio('number', 'Informe o número (ou "S/N", se não tiver).');
  obrigatorio('district', 'Informe o bairro.');
  obrigatorio('city', 'Informe a cidade.');
  if (espacos(f.complement).length > LIMITES.complement) erros.complement = `Use até ${LIMITES.complement} caracteres.`;

  const uf = (f.state ?? '').trim().toUpperCase();
  if (!UF_IBGE[uf]) erros.state = 'Escolha o estado (UF).';
  else if (somenteDigitos(f.city_ibge_code) && !codigoIbgeCombina(f.city_ibge_code, uf)) {
    erros.city = 'A cidade não confere com o estado. Busque o CEP de novo ou confira a UF.';
  }

  if (!emailValido(f.invoice_email)) erros.invoice_email = 'Confira o email para receber a nota.';

  return erros;
}

/** O formulário pronto para gravar: sem pontuação, sem espaço sobrando, UF em maiúscula. */
export function normalizarDadosFiscais(
  tenantId: string,
  f: FormularioDadosFiscais,
): Omit<DadosFiscais, 'created_at' | 'updated_at' | 'updated_by'> {
  const complemento = espacos(f.complement);
  const ibge = somenteDigitos(f.city_ibge_code);
  return {
    tenant_id: tenantId,
    person_type: f.person_type,
    tax_id: limparDocumento(f.tax_id),
    legal_name: espacos(f.legal_name),
    cep: somenteDigitos(f.cep),
    street: espacos(f.street),
    number: espacos(f.number),
    complement: complemento || null,
    district: espacos(f.district),
    city: espacos(f.city),
    city_ibge_code: ibge || null,
    state: (f.state ?? '').trim().toUpperCase(),
    invoice_email: (f.invoice_email ?? '').trim().toLowerCase(),
  };
}

/** A linha gravada de volta para o formulário (para editar). */
export function formularioDaLinha(linha: DadosFiscais | null | undefined, emailPadrao = ''): FormularioDadosFiscais {
  if (!linha) return { ...FORMULARIO_VAZIO, invoice_email: emailPadrao };
  const tipo: TipoPessoa = linha.person_type === 'cpf' ? 'cpf' : 'cnpj';
  return {
    person_type: tipo,
    tax_id: formatarDocumento(tipo, linha.tax_id ?? ''),
    legal_name: linha.legal_name ?? '',
    cep: formatarCep(linha.cep ?? ''),
    street: linha.street ?? '',
    number: linha.number ?? '',
    complement: linha.complement ?? '',
    district: linha.district ?? '',
    city: linha.city ?? '',
    city_ibge_code: linha.city_ibge_code ?? '',
    state: linha.state ?? '',
    invoice_email: linha.invoice_email ?? emailPadrao,
  };
}

/**
 * A linha basta para assinar? Mesma regra do servidor
 * (`billingDetailsMissing` em supabase/functions/_shared/billing-details.ts):
 * documento válido, nome, endereço completo e e-mail. O código IBGE não é
 * exigido aqui — quando a busca do CEP falha e a cidade é digitada à mão, ele
 * pode ficar vazio, e a parte 2 (emissão) resolve pela cidade e UF.
 */
export function dadosFiscaisCompletos(linha: Partial<DadosFiscais> | null | undefined): boolean {
  if (!linha) return false;
  const f = formularioDaLinha(linha as DadosFiscais);
  return Object.keys(validarDadosFiscais(f)).length === 0;
}

/**
 * Traduz o erro do banco (gatilho ou RLS) para uma frase da tela. O gatilho já
 * escreve em pt-BR e nunca repete o documento; o RLS (42501) não diz nada útil.
 */
export function mensagemDoErroAoSalvar(erro: { code?: string; message?: string } | null | undefined): string {
  if (!erro) return 'Não foi possível salvar os dados. Tente de novo.';
  if (erro.code === '42501') return 'Só o Gerente da Conta pode salvar os dados para a nota fiscal.';
  if (erro.code === '22023' && erro.message) return erro.message;
  return 'Não foi possível salvar os dados. Tente de novo em alguns minutos.';
}

/** Uma linha de endereço curta para o resumo. */
export function enderecoResumido(d: Pick<DadosFiscais, 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'cep'>): string {
  const partes = [
    [d.street, d.number].filter(Boolean).join(', '),
    d.complement,
    d.district,
    [d.city, d.state].filter(Boolean).join('/'),
    formatarCep(d.cep ?? ''),
  ].filter((p) => p && String(p).trim());
  return partes.join(' · ');
}
