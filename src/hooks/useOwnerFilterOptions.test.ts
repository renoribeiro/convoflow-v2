/**
 * Opções do filtro "Responsável" do modal "Filtros".
 *
 * O que precisa continuar verdadeiro:
 *  - o `id` de cada opção é o profiles.id do diretório — o mesmo valor de
 *    conversations.assigned_profile_id, sem tradução;
 *  - quem saiu do time mas ainda tem conversa (RPC loja_ineligible_owners)
 *    entra DEPOIS do diretório, com o motivo no nome, e nunca duplicado;
 *  - quem está em 0 % no rodízio continua ativo: já veio do diretório, não é
 *    repetido nem marcado.
 */
import { describe, it, expect } from 'vitest';
import { buildOwnerFilterOptions, ownerFilterLabel } from './useOwnerFilterOptions';

const maria = { id: 'p-maria', first_name: 'Maria', last_name: 'Souza', avatar_url: null };
const joao = { id: 'p-joao', first_name: 'João', last_name: null, avatar_url: 'https://x/j.png' };

describe('buildOwnerFilterOptions', () => {
  it('diretório primeiro, com o id do perfil e o nome completo', () => {
    const options = buildOwnerFilterOptions([maria, joao], []);
    expect(options.map((o) => [o.id, o.label])).toEqual([
      ['p-maria', 'Maria Souza'],
      ['p-joao', 'João'],
    ]);
    expect(options[0].reason).toBeUndefined();
    expect(options[1].avatar_url).toBe('https://x/j.png');
  });

  it('quem saiu do time entra no fim, com o motivo: "Carla Reis (suspenso)"', () => {
    const options = buildOwnerFilterOptions(
      [maria],
      [
        { profile_id: 'p-carla', first_name: 'Carla', last_name: 'Reis', reason: 'suspended', n_conversations: 3 },
        { profile_id: 'p-davi', first_name: 'Davi', last_name: null, reason: 'moved', n_conversations: 1 },
        { profile_id: 'p-x', first_name: null, last_name: null, reason: 'deleted', n_conversations: 1 },
      ],
    );
    expect(options.map((o) => o.label)).toEqual([
      'Maria Souza',
      'Carla Reis (suspenso)',
      'Davi (fora da Loja)',
      'Sem nome (excluído)',
    ]);
    expect(options[1].reason).toBe('suspended');
  });

  it('quem está em 0 % já veio do diretório: não repete nem marca', () => {
    const options = buildOwnerFilterOptions(
      [maria],
      [{ profile_id: 'p-maria', first_name: 'Maria', last_name: 'Souza', reason: 'zero_percent', n_conversations: 2 }],
    );
    expect(options).toHaveLength(1);
    expect(options[0].label).toBe('Maria Souza');
    expect(options[0].reason).toBeUndefined();
  });

  it('lista vazia dos dois lados = nenhuma opção', () => {
    expect(buildOwnerFilterOptions([], [])).toEqual([]);
  });
});

describe('ownerFilterLabel', () => {
  it('sem motivo é só o nome; com motivo, o motivo entre parênteses em minúsculas', () => {
    expect(ownerFilterLabel(maria)).toBe('Maria Souza');
    expect(ownerFilterLabel(maria, 'pending')).toBe('Maria Souza (convite pendente)');
  });
});
