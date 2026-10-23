import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ApiDocs from '@/pages/ApiDocs';
import { OPENAPI_PATHS } from '@/lib/api/openapi';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const abrir = () =>
  render(
    <MemoryRouter>
      <ApiDocs />
    </MemoryRouter>,
  );

describe('ApiDocs', () => {
  it('mostra as seções principais', () => {
    abrir();
    for (const titulo of [
      'O que é',
      'Primeiro pedido',
      'Autenticação e segurança',
      'Limites',
      'Paginação',
      'Endpoints',
      'Erros',
      'Como conectar o n8n',
      'Como conectar o Make',
      'Agentes de IA (MCP)',
      'Baixar a especificação',
    ]) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
    }
  });

  it('mostra um bloco para cada endpoint', () => {
    abrir();
    for (const caminho of OPENAPI_PATHS) {
      expect(screen.getByTestId(`endpoint-${caminho}`)).toBeInTheDocument();
    }
  });

  it('avisa que a API não responde a navegadores e lista os códigos de erro', () => {
    abrir();
    expect(screen.getAllByText(/não responde a navegadores/).length).toBeGreaterThan(0);
    expect(screen.getByText('limite_dia')).toBeInTheDocument();
    expect(screen.getByText('loja_fora_da_chave')).toBeInTheDocument();
  });

  it('não promete conectar ChatGPT nem o Claude no navegador', () => {
    const { container } = abrir();
    expect(container.textContent).not.toMatch(/ChatGPT|claude\.ai/i);
  });

  it('o botão de baixar cria um Blob com a especificação', () => {
    const criar = vi.fn(() => 'blob:fake');
    const revogar = vi.fn();
    Object.assign(URL, { createObjectURL: criar, revokeObjectURL: revogar });
    const clique = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    abrir();
    fireEvent.click(screen.getByRole('button', { name: /Baixar a especificação/ }));
    expect(criar).toHaveBeenCalledTimes(1);
    expect((criar.mock.calls[0] as unknown[])[0]).toBeInstanceOf(Blob);
    expect(clique).toHaveBeenCalled();
    expect(revogar).toHaveBeenCalledWith('blob:fake');
  });
});
