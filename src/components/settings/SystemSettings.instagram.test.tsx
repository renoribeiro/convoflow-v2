import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Fatia 4b: a conta do Instagram mora na mesma tabela das instâncias, mas não
 * envia relatório. Antes, ela aparecia no seletor do "Número de envio dos
 * relatórios" com o rótulo "Evolution" (o providerLabel cai nele para
 * qualquer provedor desconhecido).
 */

const rows = [
  { id: 'wa-1', name: 'Plantão', phone_number: '+55 53 9000-0001', provider: 'official', status: 'open' },
  { id: 'ig-1', name: 'Instagram Teste', phone_number: null, provider: 'instagram', status: 'connected' },
  { id: 'wa-2', name: 'Legado', phone_number: null, provider: null, status: 'open' },
];

vi.mock('@/integrations/supabase/client', () => {
  const chain = (result: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq']) c[m] = () => c;
    c.maybeSingle = async () => ({ data: null, error: null });
    c.then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    return c;
  };
  return {
    supabase: {
      from: (t: string) => (t === 'whatsapp_instances' ? chain({ data: rows, error: null }) : chain({ data: null, error: null })),
    },
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { SystemSettings } from './SystemSettings';

describe('Número de envio dos relatórios — só WhatsApp', () => {
  it('a conta do Instagram não é oferecida', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <SystemSettings />
      </QueryClientProvider>,
    );
    const trigger = await screen.findByRole('combobox');
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(0));
    const options = screen.getAllByRole('option').map((o) => o.textContent ?? '');
    expect(options.some((t) => t.includes('Plantão'))).toBe(true);
    expect(options.some((t) => t.includes('Legado'))).toBe(true);
    expect(options.some((t) => t.includes('Instagram'))).toBe(false);
  });
});
