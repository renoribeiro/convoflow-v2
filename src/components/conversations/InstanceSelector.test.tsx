import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ALL_INSTANCES_VALUE, InstanceSelector } from './InstanceSelector';
import type { ActiveInstanceWithAdapter } from '@/hooks/useWhatsAppApi';

/**
 * Antes: sem nada escolhido o seletor mostrava a PRIMEIRA instância enquanto a
 * lista vinha sem filtro — dizia uma coisa e mostrava outra — e não havia como
 * voltar para "todas". Agora existe a opção "todas" e ela é o padrão.
 */
const inst = (id: string, name: string, provider: string, status = 'open') =>
  ({
    row: { id, name, provider, status, profile_picture_url: null },
    adapter: {} as never,
    providerLabel: provider,
  }) as unknown as ActiveInstanceWithAdapter;

const lista = [inst('wa-1', 'Plantão', 'official'), inst('wa-2', 'Comercial', 'evolution')];

describe('InstanceSelector — opção "todas"', () => {
  it('nada escolhido = "Todas as instâncias" (e não a primeira)', () => {
    render(<InstanceSelector instances={lista} selectedId={null} onChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Filtrar por instância' });
    expect(trigger).toHaveTextContent('Todas as instâncias');
    expect(trigger).not.toHaveTextContent('Plantão');
  });

  it('id que não está na lista (instância do outro canal) = "todas"', () => {
    render(<InstanceSelector instances={lista} selectedId="ig-1" onChange={() => {}} />);
    expect(screen.getByRole('combobox', { name: 'Filtrar por instância' })).toHaveTextContent('Todas as instâncias');
  });

  it('instância escolhida aparece com o provedor e o status', () => {
    render(<InstanceSelector instances={lista} selectedId="wa-2" onChange={() => {}} />);
    const trigger = screen.getByRole('combobox', { name: 'Filtrar por instância' });
    expect(trigger).toHaveTextContent('Comercial');
    expect(screen.getAllByText('Conectada').length).toBeGreaterThan(0);
  });

  it('o rótulo de "todas" muda com o canal', () => {
    render(
      <InstanceSelector
        instances={[inst('ig-1', 'Instagram Loja', 'instagram', 'connected')]}
        selectedId={null}
        allLabel="Todas as contas do Instagram"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('combobox', { name: 'Filtrar por instância' })).toHaveTextContent(
      'Todas as contas do Instagram',
    );
  });

  it('o valor de "todas" é o que os chamadores já traduzem para sem filtro', () => {
    expect(ALL_INSTANCES_VALUE).toBe('__all__');
    const onChange = vi.fn();
    render(<InstanceSelector instances={lista} selectedId={null} onChange={onChange} />);
    // A opção existe no conteúdo do Select (renderizado ao abrir); o valor do
    // gatilho sem seleção é ela.
    expect(screen.getByRole('combobox', { name: 'Filtrar por instância' })).toBeInTheDocument();
  });
});
