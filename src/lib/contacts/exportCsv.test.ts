import { describe, it, expect } from 'vitest';
import { buildContactsCsv, CONTACTS_CSV_HEADER, linkedContactLabel } from './exportCsv';

describe('exportação de Contatos', () => {
  it('ganha as colunas Canal e Usuário do Instagram, logo depois de Telefone, e "Vinculado a" no fim', () => {
    expect(CONTACTS_CSV_HEADER).toEqual([
      'Nome',
      'Email',
      'Telefone',
      'Canal',
      'Usuário do Instagram',
      'Estágio',
      'Origem',
      'Notas',
      'Criado em',
      'Vinculado a',
    ]);
  });

  it('WhatsApp: telefone preenchido, canal WhatsApp, @ vazio', () => {
    const csv = buildContactsCsv([
      {
        name: 'Ana Beatriz Nogueira',
        email: 'ana@exemplo.com',
        phone: '5585999990201',
        channel: 'whatsapp',
        username: null,
        notes: null,
        created_at: '2026-08-08T23:52:28Z',
        stage: null,
        lead_sources: { name: 'Anúncio' },
      },
    ]);
    expect(csv.split('\n')[1]).toBe('Ana Beatriz Nogueira,ana@exemplo.com,5585999990201,WhatsApp,,,Anúncio,,2026-08-08T23:52:28Z,');
  });

  it('Instagram: telefone vazio, canal Instagram, @ na coluna própria', () => {
    const csv = buildContactsCsv([
      {
        name: 'Pedro Exemplo | Tráfego Pago',
        email: null,
        phone: null,
        channel: 'instagram',
        username: 'pedro.exemplo',
        notes: 'veio, pelo direct',
        created_at: '2026-09-24T10:00:00Z',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('Pedro Exemplo | Tráfego Pago,,,Instagram,@pedro.exemplo,,,"veio, pelo direct",2026-09-24T10:00:00Z,');
  });

  it('contato antigo sem canal gravado sai como WhatsApp', () => {
    const csv = buildContactsCsv([
      { name: 'X', email: null, phone: '5511', notes: null, created_at: null },
    ]);
    expect(csv.split('\n')[1]).toBe('X,,5511,WhatsApp,,,,,,');
  });

  it('"Vinculado a" traz o outro contato da mesma pessoa; sem vínculo, vazio', () => {
    const linkedTo = new Map([
      ['aaaaaaaa-0000-4000-8000-000000000001', 'Instagram: Maria (@maria.exemplo)'],
      ['aaaaaaaa-0000-4000-8000-000000000002', 'WhatsApp: Maria (5511999990101)'],
    ]);
    const csv = buildContactsCsv(
      [
        { id: 'aaaaaaaa-0000-4000-8000-000000000001', name: 'Maria', email: null, phone: '5511999990101', channel: 'whatsapp', notes: null, created_at: null },
        { id: 'aaaaaaaa-0000-4000-8000-000000000002', name: 'Maria', email: null, phone: null, channel: 'instagram', username: 'maria.exemplo', notes: null, created_at: null },
        { id: 'aaaaaaaa-0000-4000-8000-000000000003', name: 'Sem vínculo', email: null, phone: '5511999990103', channel: 'whatsapp', notes: null, created_at: null },
      ],
      linkedTo,
    );
    const lines = csv.split('\n');
    expect(lines[1]!.endsWith(',Instagram: Maria (@maria.exemplo)')).toBe(true);
    expect(lines[2]!.endsWith(',WhatsApp: Maria (5511999990101)')).toBe(true);
    expect(lines[3]!.endsWith(',')).toBe(true);
  });

  it('rótulo do vinculado: canal, nome e identificador; sem nome, só o identificador', () => {
    expect(linkedContactLabel({ channel: 'instagram', name: 'Maria', username: 'maria.exemplo' })).toBe('Instagram: Maria (@maria.exemplo)');
    expect(linkedContactLabel({ channel: 'whatsapp', name: 'Maria', phone: '5511999990101' })).toBe('WhatsApp: Maria (5511999990101)');
    expect(linkedContactLabel({ channel: 'whatsapp', name: null, phone: '5511999990101' })).toBe('WhatsApp: 5511999990101');
    expect(linkedContactLabel({ channel: 'instagram', name: null, username: null })).toBe('Instagram (sem nome)');
  });
});
