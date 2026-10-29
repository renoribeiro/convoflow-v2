/**
 * Achado 44 (lote 6d): template pela conversa. Todo parâmetro é obrigatório
 * (nada de descartar o vazio e mudar os seguintes de lugar) e a conversa grava
 * o texto que o cliente leu, com o id do envio.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/components/shared/FeatureHelp', () => ({ FeatureHelp: () => null }));

import { SendTemplateDialog } from './SendTemplateDialog';
import type { IWhatsAppProvider } from '@/services/whatsapp';

const sendTemplate = vi.fn();
const adapter = {
  type: 'official',
  listTemplates: vi.fn(async () => [
    {
      name: 'retorno_visita',
      language: 'pt_BR',
      status: 'APPROVED',
      bodyText: 'Olá {{1}}, sua visita ficou para {{2}}.',
      paramCount: 2,
    },
  ]),
  sendTemplate,
} as unknown as IWhatsAppProvider;

async function abrirEEscolher(onSent = vi.fn()) {
  render(<SendTemplateDialog open onOpenChange={() => {}} adapter={adapter} toPhone="5585999990201" onSent={onSent} />);
  await waitFor(() => expect(adapter.listTemplates).toHaveBeenCalled());
  // O Select do Radix não abre no jsdom: escolhe pelo teclado no gatilho.
  const gatilho = await screen.findByRole('combobox');
  fireEvent.keyDown(gatilho, { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name: /retorno_visita/ }));
  return onSent;
}

beforeEach(() => {
  sendTemplate.mockReset();
  sendTemplate.mockResolvedValue({ status: 'sent', providerMessageId: 'wamid.FAKE9' });
});

describe('SendTemplateDialog', () => {
  it('com um parâmetro em branco, não envia e diz qual falta', async () => {
    await abrirEEscolher();
    fireEvent.change(screen.getByLabelText('Parâmetro {{1}}'), { target: { value: 'Ana' } });
    expect(screen.getByRole('button', { name: 'Enviar template' })).toBeDisabled();
    expect(screen.getByTestId('aviso-parametros').textContent).toMatch(/Preencha \{\{2\}\}/);
    expect(sendTemplate).not.toHaveBeenCalled();
  });

  it('envia os parâmetros na posição certa e grava o texto final com o id do envio', async () => {
    const onSent = await abrirEEscolher();
    fireEvent.change(screen.getByLabelText('Parâmetro {{1}}'), { target: { value: ' Ana ' } });
    fireEvent.change(screen.getByLabelText('Parâmetro {{2}}'), { target: { value: 'sexta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar template' }));
    await waitFor(() => expect(onSent).toHaveBeenCalled());
    expect(sendTemplate).toHaveBeenCalledWith('5585999990201', {
      templateName: 'retorno_visita',
      language: 'pt_BR',
      bodyParams: ['Ana', 'sexta'],
    });
    expect(onSent).toHaveBeenCalledWith('Olá Ana, sua visita ficou para sexta.', 'wamid.FAKE9');
  });
});
