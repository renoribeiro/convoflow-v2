import { useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { buscarCep, mensagemDoCep } from '@/lib/billing/cep';
import {
  formatarCep,
  formatarDocumento,
  LIMITES,
  somenteDigitos,
  UFS,
  validarDadosFiscais,
  type CampoDadosFiscais,
  type FormularioDadosFiscais,
  type TipoPessoa,
} from '@/lib/billing/dadosFiscais';

/**
 * O formulário "Dados para a nota fiscal". Usado na aba Assinatura e na tela
 * de bloqueio (quem volta a assinar assina de lá).
 *
 * O CEP preenche rua, bairro, cidade, UF e o código IBGE (ViaCEP, BrasilAPI de
 * reserva). Se a busca falhar, tudo continua editável à mão.
 *
 * PRIVACIDADE: nada aqui vai para console ou log. As mensagens de erro dizem o
 * que conferir, nunca repetem o número digitado.
 */
interface Props {
  inicial: FormularioDadosFiscais;
  salvando: boolean;
  /** Erro do servidor ao salvar (já em pt-BR, sem o documento). */
  erroDoServidor?: string | null;
  onSalvar: (form: FormularioDadosFiscais) => void;
  onCancelar?: () => void;
  rotuloSalvar?: string;
}

export function DadosFiscaisForm({ inicial, salvando, erroDoServidor, onSalvar, onCancelar, rotuloSalvar }: Props) {
  const [form, setForm] = useState<FormularioDadosFiscais>(inicial);
  const [erros, setErros] = useState<Partial<Record<CampoDadosFiscais, string>>>({});
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [avisoCep, setAvisoCep] = useState<string | null>(null);
  const ultimoCep = useRef(somenteDigitos(inicial.cep));

  const muda = (campo: CampoDadosFiscais, valor: string) => {
    setForm((f) => ({
      ...f,
      [campo]: valor,
      // Cidade ou UF digitadas à mão: o código IBGE do CEP antigo não vale mais.
      ...(campo === 'city' || campo === 'state' ? { city_ibge_code: '' } : {}),
    }));
  };

  // Depois da primeira tentativa de salvar, os erros acompanham o que é digitado.
  useEffect(() => {
    if (tentouSalvar) setErros(validarDadosFiscais(form));
  }, [form, tentouSalvar]);

  const trocaTipo = (tipo: TipoPessoa) => {
    setForm((f) => ({ ...f, person_type: tipo, tax_id: formatarDocumento(tipo, f.tax_id) }));
    setErros((e) => ({ ...e, tax_id: undefined }));
  };

  // O CEP completo dispara a busca (uma vez por CEP).
  useEffect(() => {
    const d = somenteDigitos(form.cep);
    if (d.length !== 8 || d === ultimoCep.current) return;
    ultimoCep.current = d;
    let vivo = true;
    setBuscandoCep(true);
    setAvisoCep(null);
    buscarCep(d)
      .then((r) => {
        if (!vivo) return;
        if (r.ok) {
          setForm((f) => ({
            ...f,
            street: r.endereco.street || f.street,
            district: r.endereco.district || f.district,
            city: r.endereco.city,
            state: r.endereco.state,
            city_ibge_code: r.endereco.city_ibge_code ?? '',
          }));
          setAvisoCep(
            r.endereco.street ? null : 'Este CEP é da cidade inteira: preencha a rua e o bairro.',
          );
        } else {
          setAvisoCep(mensagemDoCep(r.motivo));
        }
      })
      .finally(() => {
        if (vivo) setBuscandoCep(false);
      });
    return () => {
      vivo = false;
    };
  }, [form.cep]);

  const enviar = (e: React.FormEvent) => {
    e.preventDefault();
    setTentouSalvar(true);
    const encontrados = validarDadosFiscais(form);
    setErros(encontrados);
    if (Object.keys(encontrados).length) return;
    onSalvar(form);
  };

  const cpf = form.person_type === 'cpf';

  return (
    <form onSubmit={enviar} noValidate className="space-y-4" aria-label="Dados para a nota fiscal">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">A nota sai em nome de</legend>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Tipo de pessoa">
          {(['cnpj', 'cpf'] as const).map((tipo) => (
            <Button
              key={tipo}
              type="button"
              role="radio"
              aria-checked={form.person_type === tipo}
              variant={form.person_type === tipo ? 'default' : 'outline'}
              size="sm"
              onClick={() => trocaTipo(tipo)}
            >
              {tipo === 'cnpj' ? 'Empresa (CNPJ)' : 'Pessoa física (CPF)'}
            </Button>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nf-documento" rotulo={cpf ? 'CPF' : 'CNPJ'} erro={erros.tax_id}>
          <Input
            id="nf-documento"
            inputMode={cpf ? 'numeric' : 'text'}
            autoComplete="off"
            placeholder={cpf ? '000.000.000-00' : '00.000.000/0000-00'}
            value={form.tax_id}
            onChange={(e) => muda('tax_id', formatarDocumento(form.person_type, e.target.value))}
            aria-invalid={!!erros.tax_id}
          />
        </Campo>
        <Campo id="nf-nome" rotulo={cpf ? 'Nome completo' : 'Razão social'} erro={erros.legal_name}>
          <Input
            id="nf-nome"
            autoComplete={cpf ? 'name' : 'organization'}
            maxLength={LIMITES.legal_name}
            value={form.legal_name}
            onChange={(e) => muda('legal_name', e.target.value)}
            aria-invalid={!!erros.legal_name}
          />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,10rem)_1fr]">
        <Campo id="nf-cep" rotulo="CEP" erro={erros.cep}>
          <div className="relative">
            <Input
              id="nf-cep"
              inputMode="numeric"
              autoComplete="postal-code"
              placeholder="00000-000"
              value={form.cep}
              onChange={(e) => muda('cep', formatarCep(e.target.value))}
              aria-invalid={!!erros.cep}
            />
            {buscandoCep ? (
              <Loader2 className="absolute right-2 top-2.5 h-4 w-4 animate-spin text-muted-foreground" aria-label="Buscando o CEP" />
            ) : null}
          </div>
        </Campo>
        <div className="flex items-end">
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground" role="status">
            <MapPin className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            {avisoCep ?? 'Digite o CEP: o endereço se preenche sozinho. Dá para corrigir à mão.'}
          </p>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,8rem)]">
        <Campo id="nf-rua" rotulo="Rua, avenida ou logradouro" erro={erros.street}>
          <Input id="nf-rua" autoComplete="address-line1" maxLength={LIMITES.street} value={form.street} onChange={(e) => muda('street', e.target.value)} aria-invalid={!!erros.street} />
        </Campo>
        <Campo id="nf-numero" rotulo="Número" erro={erros.number}>
          <Input id="nf-numero" maxLength={LIMITES.number} placeholder="S/N" value={form.number} onChange={(e) => muda('number', e.target.value)} aria-invalid={!!erros.number} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo id="nf-complemento" rotulo="Complemento (opcional)" erro={erros.complement}>
          <Input id="nf-complemento" autoComplete="address-line2" maxLength={LIMITES.complement} value={form.complement} onChange={(e) => muda('complement', e.target.value)} />
        </Campo>
        <Campo id="nf-bairro" rotulo="Bairro" erro={erros.district}>
          <Input id="nf-bairro" maxLength={LIMITES.district} value={form.district} onChange={(e) => muda('district', e.target.value)} aria-invalid={!!erros.district} />
        </Campo>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_minmax(0,7rem)]">
        <Campo id="nf-cidade" rotulo="Cidade" erro={erros.city}>
          <Input id="nf-cidade" autoComplete="address-level2" maxLength={LIMITES.city} value={form.city} onChange={(e) => muda('city', e.target.value)} aria-invalid={!!erros.city} />
        </Campo>
        <Campo id="nf-uf" rotulo="UF" erro={erros.state}>
          <select
            id="nf-uf"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            value={form.state}
            onChange={(e) => muda('state', e.target.value)}
            aria-invalid={!!erros.state}
          >
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <Campo id="nf-email" rotulo="E-mail para receber a nota" erro={erros.invoice_email}>
        <Input id="nf-email" type="email" autoComplete="email" maxLength={LIMITES.invoice_email} value={form.invoice_email} onChange={(e) => muda('invoice_email', e.target.value)} aria-invalid={!!erros.invoice_email} />
      </Campo>

      {erroDoServidor ? (
        <p className="text-sm text-destructive" role="alert">
          {erroDoServidor}
        </p>
      ) : null}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancelar ? (
          <Button type="button" variant="ghost" onClick={onCancelar} disabled={salvando}>
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" disabled={salvando || buscandoCep} className="gap-2">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {rotuloSalvar ?? 'Salvar dados'}
        </Button>
      </div>
    </form>
  );
}

function Campo({ id, rotulo, erro, children }: { id: string; rotulo: string; erro?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {erro ? (
        <p id={`${id}-erro`} className={cn('text-xs text-destructive')}>
          {erro}
        </p>
      ) : null}
    </div>
  );
}
