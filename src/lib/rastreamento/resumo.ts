/**
 * Aba Resumo do Rastreamento (2026-11-12).
 *
 * Os números vêm prontos da função `rastreamento_resumo` (migração
 * 20261112000001): o banco decide quem vê qual Loja (a mesma regra das
 * policies do lote 6d) e agrupa por DIA DE BRASÍLIA. Aqui ficam só o período
 * escolhido na tela e as contas de apresentação, sem fuso nenhum: o período é
 * de dias civis ("AAAA-MM-DD"), nunca de instantes.
 */
import {
  DiaCivil,
  diaEmBrasilia,
  diaIso,
  somarDias,
  compararDias,
} from '@/lib/datas/brasilia';

export type PeriodoRapido = 'today' | '7d' | '30d' | '90d' | 'custom';

export interface PeriodoRastreamento {
  rapido: PeriodoRapido;
  de: DiaCivil;
  ate: DiaCivil;
}

export const OPCOES_DE_PERIODO: Array<{ value: PeriodoRapido; label: string }> = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'custom', label: 'Período personalizado' },
];

const DIAS_DO_RAPIDO: Record<Exclude<PeriodoRapido, 'custom'>, number> = {
  today: 1,
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

/** O período de um atalho, terminando HOJE em Brasília (hoje conta). */
export function periodoRapido(rapido: Exclude<PeriodoRapido, 'custom'>, agora: Date = new Date()): PeriodoRastreamento {
  const hoje = diaEmBrasilia(agora);
  return { rapido, de: somarDias(hoje, -(DIAS_DO_RAPIDO[rapido] - 1)), ate: hoje };
}

/** Período personalizado; põe em ordem se a pessoa escolheu de trás para frente. */
export function periodoPersonalizado(a: DiaCivil, b: DiaCivil): PeriodoRastreamento {
  return compararDias(a, b) <= 0
    ? { rapido: 'custom', de: a, ate: b }
    : { rapido: 'custom', de: b, ate: a };
}

export const PERIODO_PADRAO: Exclude<PeriodoRapido, 'custom'> = '30d';

// ---------------------------------------------------------------------------
// O que a função devolve
// ---------------------------------------------------------------------------

export interface Totais {
  contatos: number;
  conversoes: number;
  receita: number;
  conversas_anuncio: number;
  novos: number;
  voltaram: number;
}

export interface LojaDoResumo {
  id: string;
  nome: string;
  tipo: 'account' | 'store' | string;
}

export interface DiaDoResumo {
  dia: string;
  contatos: number;
  conversoes: number;
  conversas_anuncio: number;
  novos: number;
  voltaram: number;
}

export interface LojaComTotais extends Totais {
  tenant_id: string;
}

export interface FonteDoResumo {
  tenant_id: string;
  fonte_id: string | null;
  fonte: string;
  tipo: string | null;
  contatos: number;
  conversoes: number;
  receita: number;
}

export interface AnuncioDoResumo {
  tenant_id: string;
  anuncio_id: string;
  titulo: string | null;
  conversas: number;
  novos: number;
  voltaram: number;
}

export interface AnuncioPorDia {
  tenant_id: string;
  dia: string;
  anuncio_id: string;
  conversas: number;
  novos: number;
  voltaram: number;
}

export interface ResumoRastreamento {
  periodo: { de: string; ate: string; dias: number; fuso: string };
  todas_lojas: boolean;
  lojas: LojaDoResumo[];
  totais: Totais;
  anterior: Totais;
  por_dia: DiaDoResumo[];
  por_loja: LojaComTotais[];
  por_fonte: FonteDoResumo[];
  anuncios: AnuncioDoResumo[];
  anuncios_por_dia: AnuncioPorDia[];
}

const TOTAIS_VAZIOS: Totais = { contatos: 0, conversoes: 0, receita: 0, conversas_anuncio: 0, novos: 0, voltaram: 0 };

const n = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

function totais(v: any): Totais {
  if (!v || typeof v !== 'object') return { ...TOTAIS_VAZIOS };
  return {
    contatos: n(v.contatos),
    conversoes: n(v.conversoes),
    receita: n(v.receita),
    conversas_anuncio: n(v.conversas_anuncio),
    novos: n(v.novos),
    voltaram: n(v.voltaram),
  };
}

const lista = (v: unknown): any[] => (Array.isArray(v) ? v : []);

/** Lê o jsonb da função sem confiar em nenhum campo: o que faltar vira zero ou lista vazia. */
export function lerResumo(bruto: unknown): ResumoRastreamento {
  const r: any = bruto && typeof bruto === 'object' ? bruto : {};
  return {
    periodo: {
      de: String(r.periodo?.de ?? ''),
      ate: String(r.periodo?.ate ?? ''),
      dias: n(r.periodo?.dias),
      fuso: String(r.periodo?.fuso ?? 'America/Sao_Paulo'),
    },
    todas_lojas: !!r.todas_lojas,
    lojas: lista(r.lojas).map((l) => ({ id: String(l.id), nome: String(l.nome ?? ''), tipo: String(l.tipo ?? '') })),
    totais: totais(r.totais),
    anterior: totais(r.anterior),
    por_dia: lista(r.por_dia).map((d) => ({
      dia: String(d.dia),
      contatos: n(d.contatos),
      conversoes: n(d.conversoes),
      conversas_anuncio: n(d.conversas_anuncio),
      novos: n(d.novos),
      voltaram: n(d.voltaram),
    })),
    por_loja: lista(r.por_loja).map((l) => ({ tenant_id: String(l.tenant_id), ...totais(l) })),
    por_fonte: lista(r.por_fonte).map((f) => ({
      tenant_id: String(f.tenant_id),
      fonte_id: f.fonte_id ? String(f.fonte_id) : null,
      fonte: String(f.fonte ?? 'Sem fonte'),
      tipo: f.tipo ? String(f.tipo) : null,
      contatos: n(f.contatos),
      conversoes: n(f.conversoes),
      receita: n(f.receita),
    })),
    anuncios: lista(r.anuncios).map((a) => ({
      tenant_id: String(a.tenant_id),
      anuncio_id: String(a.anuncio_id),
      titulo: a.titulo ? String(a.titulo) : null,
      conversas: n(a.conversas),
      novos: n(a.novos),
      voltaram: n(a.voltaram),
    })),
    anuncios_por_dia: lista(r.anuncios_por_dia).map((a) => ({
      tenant_id: String(a.tenant_id),
      dia: String(a.dia),
      anuncio_id: String(a.anuncio_id),
      conversas: n(a.conversas),
      novos: n(a.novos),
      voltaram: n(a.voltaram),
    })),
  };
}

/** Variação em % sobre o período anterior; null quando não há base (anterior zero). */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}

export function taxaDeConversao(t: Pick<Totais, 'contatos' | 'conversoes'>): number {
  return t.contatos > 0 ? (t.conversoes / t.contatos) * 100 : 0;
}

/** Nome da Loja para a linha da tabela (em "Todas as Lojas"). A Conta aparece como tal. */
export function nomeDaLoja(lojas: LojaDoResumo[], tenantId: string): string {
  const l = lojas.find((x) => x.id === tenantId);
  if (!l) return 'Loja';
  return l.tipo === 'account' ? `${l.nome} (Conta)` : l.nome;
}

/** Título do anúncio para a linha (o da Meta; sem título, o id). */
export function tituloDoAnuncio(a: { anuncio_id: string; titulo?: string | null }): string {
  if (a.titulo) return a.titulo;
  return a.anuncio_id === 'sem_id' ? 'Anúncio sem identificação' : `Anúncio ${a.anuncio_id}`;
}

/** Os títulos por anúncio (para a tabela por dia, que não repete o título). */
export function titulosPorAnuncio(anuncios: AnuncioDoResumo[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of anuncios) m.set(`${a.tenant_id}|${a.anuncio_id}`, tituloDoAnuncio(a));
  return m;
}

/**
 * Fontes somadas pelo nome para o gráfico de pizza (em "Todas as Lojas" a
 * mesma fonte pode existir em duas Lojas). A tabela continua por Loja.
 */
export function fontesSomadas(fontes: FonteDoResumo[]): Array<{ name: string; value: number }> {
  const m = new Map<string, number>();
  for (const f of fontes) m.set(f.fonte, (m.get(f.fonte) ?? 0) + f.contatos);
  return [...m.entries()]
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

export { diaIso };
