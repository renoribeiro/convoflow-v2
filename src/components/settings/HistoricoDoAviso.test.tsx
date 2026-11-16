import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';

const reenviar = vi.fn();
const toast = vi.fn();
let entregas: unknown[] = [];

vi.mock('@/hooks/useAvisos', () => ({
  useEntregasDoAviso: () => ({ data: entregas, isLoading: false, isError: false }),
  useMexerNosAvisos: () => ({ reenviar: { mutateAsync: reenviar, isPending: false } }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import { HistoricoDoAviso } from './HistoricoDoAviso';

const base = { event_type: 'lead.novo', max_attempts: 5, created_at: '2026-11-16T22:00:00Z' };

beforeEach(() => {
  reenviar.mockReset();
  toast.mockReset();
  entregas = [
    { ...base, id: 'falhou', status: 'failed', attempts: 5, response_status: 404, error_message: 'HTTP 404', teste: false },
    { ...base, id: 'teste', status: 'failed', attempts: 1, response_status: 404, error_message: 'HTTP 404', teste: true },
    { ...base, id: 'ok', status: 'delivered', attempts: 1, response_status: 200, error_message: null, teste: false },
  ];
});

describe('Últimos envios: Reenviar', () => {
  it('só o envio que falhou (e não o teste) tem Reenviar', () => {
    render(<HistoricoDoAviso avisoId="aviso-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Últimos envios' }));
    const [falhou, teste, aceito] = screen.getAllByTestId("envio-do-aviso") as [HTMLElement, HTMLElement, HTMLElement];
    expect(within(falhou).getByRole('button', { name: 'Reenviar' })).toBeInTheDocument();
    expect(within(teste).queryByRole('button', { name: 'Reenviar' })).not.toBeInTheDocument();
    expect(within(aceito).queryByRole('button', { name: 'Reenviar' })).not.toBeInTheDocument();
    expect(falhou).toHaveTextContent('o endereço não existe no outro sistema (código 404)');
  });

  it('pede confirmação e reenvia', async () => {
    reenviar.mockResolvedValue({ ok: true });
    render(<HistoricoDoAviso avisoId="aviso-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Últimos envios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    const janela = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    expect(janela).toHaveTextContent('Reenviar este envio?');
    expect(janela).toHaveTextContent('com até 5 tentativas');
    expect(reenviar).not.toHaveBeenCalled();
    fireEvent.click(within(janela).getByRole('button', { name: 'Reenviar' }));
    await waitFor(() => expect(reenviar).toHaveBeenCalledWith({ entregaId: 'falhou', avisoId: 'aviso-1' }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Envio de volta na fila' })));
  });

  it('a recusa do banco aparece com a frase dele', async () => {
    reenviar.mockResolvedValue({ ok: false, mensagem: 'O aviso está desligado. Ligue o aviso e reenvie.' });
    render(<HistoricoDoAviso avisoId="aviso-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Últimos envios' }));
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar' }));
    const janela = await screen.findByRole('alertdialog').catch(() => screen.getByRole('dialog'));
    fireEvent.click(within(janela).getByRole('button', { name: 'Reenviar' }));
    await waitFor(() =>
      expect(toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Não foi possível reenviar',
        description: 'O aviso está desligado. Ligue o aviso e reenvie.',
      })),
    );
  });
});
