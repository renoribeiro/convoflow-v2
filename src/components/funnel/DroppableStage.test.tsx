/**
 * Menu da coluna do funil: cada item só aparece se o quadro passou a ação.
 * Para o atendente o FunnelBoard só passa "Adicionar Lead" (20261021000003).
 */
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DndContext } from '@dnd-kit/core';
import { DroppableStage } from './DroppableStage';

const ETAPA = { id: 'aaaaaaaa-0000-4000-8000-0000000000e1', name: 'Novo lead', color: 'bg-blue-100', leads: [] };

async function abrirMenu(props: Partial<Parameters<typeof DroppableStage>[0]>) {
  render(
    <DndContext>
      <DroppableStage stage={ETAPA} isDragActive={false} isOver={false} {...props} />
    </DndContext>,
  );
  await userEvent.click(screen.getByRole('button'));
}

describe('menu da coluna', () => {
  it('Gestor e Gerente: os quatro itens', async () => {
    await abrirMenu({ onAddLead: vi.fn(), onEditStage: vi.fn(), onConfigureStage: vi.fn(), onDeleteStage: vi.fn() });
    for (const item of ['Adicionar lead', 'Editar etapa', 'Configurar etapa', 'Apagar etapa']) {
      expect(screen.getByRole('menuitem', { name: item })).toBeInTheDocument();
    }
  });

  it('Atendente: só "Adicionar Lead"', async () => {
    const onAddLead = vi.fn();
    await abrirMenu({ onAddLead });
    expect(screen.getAllByRole('menuitem')).toHaveLength(1);
    await userEvent.click(screen.getByRole('menuitem', { name: 'Adicionar lead' }));
    expect(onAddLead).toHaveBeenCalledWith(ETAPA.id);
  });
});
