/**
 * Janela "Enviar localização" (lote 6f, B5, decisão D4): os dois jeitos de
 * montar o ponto e a confirmação com o que vai sair. Nada sai sem a
 * confirmação.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SendLocationDialog } from './SendLocationDialog';
import { TEXTOS_DA_LOCALIZACAO } from '@/lib/conversations/localizacao';

const onSend = vi.fn(async (..._a: unknown[]) => true);
const onOpenChange = vi.fn();
const geo = { getCurrentPosition: vi.fn() };

function montar() {
  return render(
    <SendLocationDialog open onOpenChange={onOpenChange} contactName="Helena Duarte" onSend={onSend} />,
  );
}

beforeEach(() => {
  const proto = window.HTMLElement.prototype as unknown as Record<string, unknown>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  onSend.mockClear();
  onOpenChange.mockClear();
  geo.getCurrentPosition.mockReset();
  Object.defineProperty(navigator, 'geolocation', { value: geo, configurable: true });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('minha localização', () => {
  it('com a permissão: mostra o ponto, e a confirmação diz o que vai sair e para quem', async () => {
    geo.getCurrentPosition.mockImplementation((ok: (p: unknown) => void) =>
      ok({ coords: { latitude: -3.731862, longitude: -38.526669 } }),
    );
    const user = userEvent.setup();
    montar();

    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Usar minha localização atual' }));

    const escolhida = await screen.findByTestId('localizacao-escolhida');
    expect(escolhida).toHaveTextContent('-3.73186, -38.52667');
    expect(screen.getByRole('link', { name: /Ver no mapa/ })).toHaveAttribute(
      'href',
      'https://www.google.com/maps/search/?api=1&query=-3.731862,-38.526669',
    );

    await user.clear(screen.getByLabelText('Nome do lugar (opcional)'));
    await user.type(screen.getByLabelText('Nome do lugar (opcional)'), 'Loja Centro');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));

    const confirmacao = await screen.findByTestId('confirmacao');
    expect(confirmacao).toHaveTextContent('Enviar esta localização?');
    expect(confirmacao).toHaveTextContent('Vai para Helena Duarte pelo WhatsApp');
    expect(screen.getByTestId('confirmacao-localizacao')).toHaveTextContent('Loja Centro');
    expect(onSend).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Enviar localização' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({ latitude: -3.731862, longitude: -38.526669, nome: 'Loja Centro' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('permissão negada: diz como liberar ou digitar o endereço, e não deixa continuar', async () => {
    geo.getCurrentPosition.mockImplementation((_ok: unknown, erro: (e: unknown) => void) => erro({ code: 1 }));
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Usar minha localização atual' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTOS_DA_LOCALIZACAO.negada);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
});

describe('digitar endereço', () => {
  it('busca, escolhe entre os lugares e confirma', async () => {
    const fetchFalso = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        { lat: '-23.5505', lon: '-46.6333', display_name: 'Praça da Sé, São Paulo, SP, Brasil', name: 'Praça da Sé' },
        { lat: '-22.9068', lon: '-43.1729', display_name: 'Praça da Sé, Rio de Janeiro, RJ, Brasil', name: 'Praça da Sé' },
      ],
    }));
    vi.stubGlobal('fetch', fetchFalso);
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole('tab', { name: 'Digitar endereço' }));
    await user.type(screen.getByLabelText('Endereço'), 'Praça da Sé');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    const opcoes = await screen.findByRole('group', { name: 'Escolha o lugar' });
    expect(opcoes).toHaveTextContent('São Paulo');
    await user.click(screen.getByRole('button', { name: /Rio de Janeiro/ }));
    expect(screen.getByLabelText('Nome do lugar (opcional)')).toHaveValue('Praça da Sé');

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Enviar localização' }));
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith({
        latitude: -22.9068,
        longitude: -43.1729,
        nome: 'Praça da Sé',
        endereco: 'Praça da Sé, Rio de Janeiro, RJ, Brasil',
      }),
    );
  });

  it('nada encontrado: avisa e não deixa continuar', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })));
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('tab', { name: 'Digitar endereço' }));
    await user.type(screen.getByLabelText('Endereço'), 'Rua que não existe, 999');
    await user.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(TEXTOS_DA_LOCALIZACAO.nao_encontrado);
    expect(screen.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  });
});

describe('guarda do envio', () => {
  it('barrado antes de sair (onSend false): a confirmação fica aberta e a janela não fecha', async () => {
    onSend.mockResolvedValueOnce(false);
    geo.getCurrentPosition.mockImplementation((ok: (p: unknown) => void) => ok({ coords: { latitude: 1, longitude: 2 } }));
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole('button', { name: 'Usar minha localização atual' }));
    await user.click(await screen.findByRole('button', { name: 'Continuar' }));
    await user.click(await screen.findByRole('button', { name: 'Enviar localização' }));
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('confirmacao')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
