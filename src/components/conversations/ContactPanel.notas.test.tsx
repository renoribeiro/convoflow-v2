/**
 * Achado 48 (lote 6d): as notas do painel do contato gravam ao fechar e
 * mostram o estado de verdade ("Salvando...", "Salvo", "Não foi possível
 * salvar."). Antes, fechar antes de 1 segundo perdia o texto.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TooltipProvider } from '@/components/ui/tooltip';

const { banco } = vi.hoisted(() => ({
  banco: { updates: [] as Array<Record<string, unknown>>, falhar: false },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => {
      const c: Record<string, unknown> = {};
      c.update = (dados: Record<string, unknown>) => {
        banco.updates.push(dados);
        return c;
      };
      c.eq = () => c;
      c.select = () =>
        Promise.resolve(banco.falhar ? { data: [], error: null } : { data: [{ id: 'x' }], error: null });
      return c;
    },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/contexts/TenantContext', () => ({ useTenant: () => ({ tenant: { id: 'aaaaaaaa-0000-4000-8000-000000000001' } }) }));
vi.mock('@/hooks/useSupabaseQuery', () => ({ useSupabaseQuery: () => ({ data: [] }) }));
vi.mock('@/hooks/useSupabaseMutation', () => ({ useSupabaseMutation: () => ({ mutate: vi.fn() }) }));
vi.mock('@/hooks/useContactFollowups', () => ({ useContactFollowups: () => ({ data: [], isLoading: false }) }));
vi.mock('@/hooks/useContactLinks', () => ({ useContactLinkIndex: () => ({ byContact: new Map() }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsBelowXl: () => false }));
vi.mock('@/components/conversations/ContactLinkSection', () => ({ ContactLinkSection: () => null }));
vi.mock('@/components/etiquetas/LeadTagsDialog', () => ({ LeadTagsDialog: () => null }));
vi.mock('@/components/shared/FeatureHelp', () => ({ FeatureHelp: () => null }));

import { ContactPanel } from './ContactPanel';

const CONTATO = 'aaaaaaaa-0000-4000-8000-0000000000c1';
const contato = { id: CONTATO, name: 'Cliente Teste', phone: '5585999990201', notes: 'antiga', channel: 'whatsapp' };

function abrir() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TooltipProvider>
          <ContactPanel open onOpenChange={() => {}} contactId={CONTATO} contact={contato} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  banco.updates = [];
  banco.falhar = false;
});

describe('Notas do painel do contato', () => {
  it('fechar o painel antes de 1 segundo grava a nota', async () => {
    const { unmount } = abrir();
    fireEvent.change(screen.getByLabelText('Notas do contato'), { target: { value: 'quer ver o de 2 quartos' } });
    expect(screen.getByTestId('estado-da-nota').textContent).toMatch('Salvando...');
    unmount();
    await waitFor(() => expect(banco.updates).toEqual([{ notes: 'quer ver o de 2 quartos' }]));
  });

  it('sair do campo grava e mostra "Salvo"', async () => {
    abrir();
    const campo = screen.getByLabelText('Notas do contato');
    fireEvent.change(campo, { target: { value: 'visita sexta' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(screen.getByTestId('estado-da-nota').textContent).toMatch('Salvo'));
    expect(banco.updates).toEqual([{ notes: 'visita sexta' }]);
  });

  it('não gravou: diz que não foi possível e oferece tentar de novo', async () => {
    banco.falhar = true;
    abrir();
    const campo = screen.getByLabelText('Notas do contato');
    fireEvent.change(campo, { target: { value: 'x' } });
    fireEvent.blur(campo);
    await waitFor(() => expect(screen.getByTestId('estado-da-nota').textContent).toMatch('Não foi possível salvar.'));
    banco.falhar = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await waitFor(() => expect(screen.getByTestId('estado-da-nota').textContent).toMatch('Salvo'));
  });
});
