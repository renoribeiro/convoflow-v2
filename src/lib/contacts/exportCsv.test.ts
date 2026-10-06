import { describe, it, expect } from 'vitest';
import { buildContactsCsv, CONTACTS_CSV_HEADER } from './exportCsv';

describe('exportação de Contatos', () => {
  it('ganha as colunas Canal e Usuário do Instagram, logo depois de Telefone', () => {
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
    expect(csv.split('\n')[1]).toBe('Ana Beatriz Nogueira,ana@exemplo.com,5585999990201,WhatsApp,,,Anúncio,,2026-08-08T23:52:28Z');
  });

  it('Instagram: telefone vazio, canal Instagram, @ na coluna própria', () => {
    const csv = buildContactsCsv([
      {
        name: 'Paulo Andrade | Tráfego Pago',
        email: null,
        phone: null,
        channel: 'instagram',
        username: 'opauloandrade',
        notes: 'veio, pelo direct',
        created_at: '2026-09-24T10:00:00Z',
      },
    ]);
    expect(csv.split('\n')[1]).toBe('Paulo Andrade | Tráfego Pago,,,Instagram,@opauloandrade,,,"veio, pelo direct",2026-09-24T10:00:00Z');
  });

  it('contato antigo sem canal gravado sai como WhatsApp', () => {
    const csv = buildContactsCsv([
      { name: 'X', email: null, phone: '5511', notes: null, created_at: null },
    ]);
    expect(csv.split('\n')[1]).toBe('X,,5511,WhatsApp,,,,,');
  });
});
