import { describe, it, expect } from 'vitest';
import {
  diaIso,
  diasNoIntervalo,
  fimDoDiaEmBrasilia,
  inicioDoDiaEmBrasilia,
  rotuloDiaCurto,
  rotuloDiaLongo,
  somarDias,
} from '@/lib/datas/brasilia';
import {
  fontesSomadas,
  lerResumo,
  nomeDaLoja,
  periodoPersonalizado,
  periodoRapido,
  taxaDeConversao,
  tituloDoAnuncio,
  variacao,
} from './resumo';

// 12/11/2026 às 23:30 em Brasília = 13/11 às 02:30 UTC. O UTC já virou o dia.
const NOITE_DE_12 = new Date('2026-11-13T02:30:00Z');
// 12/11 às 21:00 em Brasília: a hora em que o dia virava antes da correção.
const AS_21H_DE_12 = new Date('2026-11-13T00:00:00Z');

describe('dias de Brasília para relatórios', () => {
  it('a meia noite de Brasília é 03:00 UTC', () => {
    expect(inicioDoDiaEmBrasilia({ ano: 2026, mes: 11, dia: 12 }).toISOString()).toBe('2026-11-12T03:00:00.000Z');
    expect(fimDoDiaEmBrasilia({ ano: 2026, mes: 11, dia: 12 }).toISOString()).toBe('2026-11-13T02:59:59.999Z');
  });

  it('soma dias atravessando mês e ano', () => {
    expect(somarDias({ ano: 2026, mes: 11, dia: 1 }, -1)).toEqual({ ano: 2026, mes: 10, dia: 31 });
    expect(somarDias({ ano: 2026, mes: 12, dia: 31 }, 1)).toEqual({ ano: 2027, mes: 1, dia: 1 });
  });

  it('conta os dias do intervalo incluindo as duas pontas', () => {
    expect(diasNoIntervalo({ ano: 2026, mes: 11, dia: 1 }, { ano: 2026, mes: 11, dia: 12 })).toBe(12);
  });

  it('o rótulo sai do texto, sem cair no dia anterior', () => {
    // new Date('2026-11-12') em Brasília seria 11/11 às 21h.
    expect(rotuloDiaCurto('2026-11-12')).toBe('12/11');
    expect(rotuloDiaLongo('2026-11-01')).toBe('01/11/2026');
    expect(diaIso({ ano: 2026, mes: 1, dia: 5 })).toBe('2026-01-05');
  });
});

describe('período do Rastreamento', () => {
  it('"Hoje" às 23h30 ainda é o dia 12 (antes, às 21h já era 13)', () => {
    const p = periodoRapido('today', NOITE_DE_12);
    expect(diaIso(p.de)).toBe('2026-11-12');
    expect(diaIso(p.ate)).toBe('2026-11-12');
    expect(diaIso(periodoRapido('today', AS_21H_DE_12).ate)).toBe('2026-11-12');
  });

  it('"Últimos 7 dias" são hoje e os 6 anteriores', () => {
    const p = periodoRapido('7d', NOITE_DE_12);
    expect(diaIso(p.de)).toBe('2026-11-06');
    expect(diaIso(p.ate)).toBe('2026-11-12');
  });

  it('período personalizado fica em ordem', () => {
    const p = periodoPersonalizado({ ano: 2026, mes: 11, dia: 12 }, { ano: 2026, mes: 11, dia: 1 });
    expect(diaIso(p.de)).toBe('2026-11-01');
    expect(diaIso(p.ate)).toBe('2026-11-12');
    expect(p.rapido).toBe('custom');
  });
});

describe('leitura do resumo', () => {
  const bruto = {
    periodo: { de: '2026-11-01', ate: '2026-11-12', dias: 12, fuso: 'America/Sao_Paulo' },
    todas_lojas: true,
    lojas: [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', nome: 'Conta Exemplo', tipo: 'account' },
      { id: 'aaaaaaaa-0000-4000-8000-000000000002', nome: 'Loja Centro', tipo: 'store' },
    ],
    totais: { contatos: 36, conversoes: 0, receita: 0, conversas_anuncio: 39, novos: 35, voltaram: 4 },
    anterior: { contatos: 0 },
    por_dia: [{ dia: '2026-11-01', contatos: 3, conversas_anuncio: 4, novos: 3, voltaram: 1 }],
    por_fonte: [
      { tenant_id: 'aaaaaaaa-0000-4000-8000-000000000002', fonte: 'Anúncio A', contatos: 5 },
      { tenant_id: 'aaaaaaaa-0000-4000-8000-000000000001', fonte: 'Anúncio A', contatos: 2 },
      { tenant_id: 'aaaaaaaa-0000-4000-8000-000000000002', fonte: 'Sem fonte', contatos: 0 },
    ],
    anuncios: [{ tenant_id: 'aaaaaaaa-0000-4000-8000-000000000002', anuncio_id: '120000000000000001', titulo: null, conversas: 16, novos: 13, voltaram: 3 }],
  };

  it('lê o que veio e põe zero no que faltou', () => {
    const r = lerResumo(bruto);
    expect(r.totais.conversas_anuncio).toBe(39);
    expect(r.totais.novos + r.totais.voltaram).toBe(39);
    expect(r.anterior).toEqual({ contatos: 0, conversoes: 0, receita: 0, conversas_anuncio: 0, novos: 0, voltaram: 0 });
    expect(r.por_dia[0]!.conversoes).toBe(0);
    expect(r.anuncios_por_dia).toEqual([]);
    expect(lerResumo(null).totais.contatos).toBe(0);
  });

  it('a Conta aparece como Conta e o anúncio sem título mostra o ID', () => {
    const r = lerResumo(bruto);
    expect(nomeDaLoja(r.lojas, 'aaaaaaaa-0000-4000-8000-000000000001')).toBe('Conta Exemplo (Conta)');
    expect(nomeDaLoja(r.lojas, 'aaaaaaaa-0000-4000-8000-000000000002')).toBe('Loja Centro');
    expect(tituloDoAnuncio(r.anuncios[0]!)).toBe('Anúncio 120000000000000001');
    expect(tituloDoAnuncio({ anuncio_id: 'sem_id', titulo: null })).toBe('Anúncio sem identificação');
  });

  it('a pizza soma a mesma fonte de Lojas diferentes e tira as vazias', () => {
    expect(fontesSomadas(lerResumo(bruto).por_fonte)).toEqual([{ name: 'Anúncio A', value: 7 }]);
  });

  it('variação sem base não inventa número', () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(15, 10)).toBe(50);
    expect(taxaDeConversao({ contatos: 0, conversoes: 0 })).toBe(0);
    expect(taxaDeConversao({ contatos: 4, conversoes: 1 })).toBe(25);
  });
});
