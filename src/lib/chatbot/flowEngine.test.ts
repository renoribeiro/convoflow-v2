/**
 * Unit tests for the pure chatbot flow-execution helpers.
 * These semantics are mirrored by the Edge Function engine, so this suite
 * also guards the production engine's behaviour.
 */
import { describe, it, expect } from 'vitest';
import {
  substituteVariables,
  firstName,
  evaluateCondition,
  validateAnswer,
  matchKeyword,
  matchOption,
  resolveNextNodeId,
  isInputNode,
  isTerminalNode,
  validateFlowForPublish,
} from '@/lib/chatbot/flowEngine';
import type { ShowOptionsOption } from '@/types/chatbot-flow.types';

describe('substituteVariables', () => {
  const ctx = { name: 'Maria Silva', first_name: 'Maria', phone: '5511999', email: null };

  it('replaces known tokens', () => {
    expect(substituteVariables('Olá {name}!', ctx)).toBe('Olá Maria Silva!');
  });
  it('tolerates whitespace inside braces', () => {
    expect(substituteVariables('Oi { first_name }', ctx)).toBe('Oi Maria');
  });
  it('leaves unknown tokens untouched', () => {
    expect(substituteVariables('{unknown} fim', ctx)).toBe('{unknown} fim');
  });
  it('leaves null-valued tokens as the original token', () => {
    expect(substituteVariables('e-mail: {email}', ctx)).toBe('e-mail: {email}');
  });
  it('returns empty string for empty template', () => {
    expect(substituteVariables('', ctx)).toBe('');
    expect(substituteVariables(undefined, ctx)).toBe('');
  });
  it('substitutes multiple occurrences', () => {
    expect(substituteVariables('{name} {name}', ctx)).toBe('Maria Silva Maria Silva');
  });
});

describe('firstName', () => {
  it('takes the first token', () => {
    expect(firstName('João Pedro Souza')).toBe('João');
  });
  it('handles empty/null', () => {
    expect(firstName('')).toBe('');
    expect(firstName(null)).toBe('');
  });
});

describe('evaluateCondition', () => {
  it('empty / not_empty', () => {
    expect(evaluateCondition('empty', '')).toBe(true);
    expect(evaluateCondition('empty', '  ')).toBe(true);
    expect(evaluateCondition('empty', 'x')).toBe(false);
    expect(evaluateCondition('not_empty', 'x')).toBe(true);
    expect(evaluateCondition('not_empty', '')).toBe(false);
  });
  it('equals is case-insensitive and trims', () => {
    expect(evaluateCondition('equals', ' Sim ', 'sim')).toBe(true);
    expect(evaluateCondition('equals', 'nao', 'sim')).toBe(false);
  });
  it('contains is case-insensitive', () => {
    expect(evaluateCondition('contains', 'meu email@example.com', 'example.com')).toBe(true);
    expect(evaluateCondition('contains', 'hotmail', 'gmail')).toBe(false);
  });
  it('handles null variable value', () => {
    expect(evaluateCondition('empty', null)).toBe(true);
    expect(evaluateCondition('contains', null, 'x')).toBe(false);
  });
});

describe('validateAnswer', () => {
  it('none requires non-empty', () => {
    expect(validateAnswer('none', 'qualquer')).toBe(true);
    expect(validateAnswer('none', '   ')).toBe(false);
  });
  it('email', () => {
    expect(validateAnswer('email', 'a@b.example')).toBe(true);
    expect(validateAnswer('email', 'invalido')).toBe(false);
  });
  it('phone', () => {
    expect(validateAnswer('phone', '+55 11 99999-9999')).toBe(true);
    expect(validateAnswer('phone', '123')).toBe(false);
  });
  it('number accepts comma decimals', () => {
    expect(validateAnswer('number', '42')).toBe(true);
    expect(validateAnswer('number', '3,14')).toBe(true);
    expect(validateAnswer('number', 'abc')).toBe(false);
  });
});

describe('matchKeyword', () => {
  it('matches substring case-insensitively', () => {
    expect(matchKeyword('Olá, quero suporte', ['suporte', 'ajuda'])).toBe(true);
    expect(matchKeyword('bom dia', ['suporte'])).toBe(false);
  });
  it('handles empty inputs', () => {
    expect(matchKeyword('', ['x'])).toBe(false);
    expect(matchKeyword('x', [])).toBe(false);
  });
});

describe('matchOption', () => {
  const options: ShowOptionsOption[] = [
    { id: 'a', label: 'Suporte', value: 'suporte' },
    { id: 'b', label: 'Vendas', value: 'vendas' },
  ];
  it('matches by 1-based index', () => {
    expect(matchOption('1', options)?.id).toBe('a');
    expect(matchOption('2', options)?.id).toBe('b');
    expect(matchOption('3', options)).toBeNull();
  });
  it('matches by label or value', () => {
    expect(matchOption('suporte', options)?.id).toBe('a');
    expect(matchOption('VENDAS', options)?.id).toBe('b');
  });
  it('returns null for no match', () => {
    expect(matchOption('xyz', options)).toBeNull();
  });
});

describe('resolveNextNodeId', () => {
  const edges = [
    { source_node_id: 'n1', target_node_id: 'n2', source_handle: 'default' },
    { source_node_id: 'c1', target_node_id: 'tt', source_handle: 'true' },
    { source_node_id: 'c1', target_node_id: 'ff', source_handle: 'false' },
    { source_node_id: 'single', target_node_id: 'x', source_handle: null },
  ];
  it('follows the default handle', () => {
    expect(resolveNextNodeId(edges, 'n1')).toBe('n2');
  });
  it('follows true/false handles', () => {
    expect(resolveNextNodeId(edges, 'c1', 'true')).toBe('tt');
    expect(resolveNextNodeId(edges, 'c1', 'false')).toBe('ff');
  });
  it('falls back to the single outgoing edge', () => {
    expect(resolveNextNodeId(edges, 'single', 'whatever')).toBe('x');
  });
  it('returns null when no outgoing edge', () => {
    expect(resolveNextNodeId(edges, 'nope')).toBeNull();
  });
});

describe('isInputNode / isTerminalNode', () => {
  it('classifies input nodes', () => {
    expect(isInputNode('ask_question')).toBe(true);
    expect(isInputNode('show_options')).toBe(true);
    expect(isInputNode('send_text')).toBe(false);
  });
  it('classifies terminal nodes', () => {
    expect(isTerminalNode('end_flow')).toBe(true);
    expect(isTerminalNode('transfer_agent')).toBe(true);
    expect(isTerminalNode('send_text')).toBe(false);
  });
});

describe('validateFlowForPublish', () => {
  it('fails without a start node', () => {
    const res = validateFlowForPublish(
      [{ id: 's', node_type: 'send_text', data: {} }],
      []
    );
    expect(res.valid).toBe(false);
    expect(res.errors.join(' ')).toContain('Início');
  });

  it('fails with more than one start node', () => {
    const res = validateFlowForPublish(
      [
        { id: 's1', node_type: 'start', data: {} },
        { id: 's2', node_type: 'start', data: {} },
      ],
      [{ source_node_id: 's1', source_handle: 'default' }]
    );
    expect(res.valid).toBe(false);
  });

  it('flags a non-terminal node with no outgoing edge', () => {
    const res = validateFlowForPublish(
      [
        { id: 'start', node_type: 'start', data: {} },
        { id: 'msg', node_type: 'send_text', data: {} },
      ],
      [{ source_node_id: 'start', source_handle: 'default' }]
    );
    expect(res.valid).toBe(false);
    expect(res.nodeErrors['msg']).toBeTruthy();
  });

  it('requires both condition handles', () => {
    const res = validateFlowForPublish(
      [
        { id: 'start', node_type: 'start', data: {} },
        { id: 'c', node_type: 'condition', data: {} },
        { id: 'e', node_type: 'end_flow', data: {} },
      ],
      [
        { source_node_id: 'start', source_handle: 'default' },
        { source_node_id: 'c', source_handle: 'true' },
      ]
    );
    expect(res.nodeErrors['c']).toContain('Falso');
  });

  it('requires an edge per show_options option', () => {
    const res = validateFlowForPublish(
      [
        { id: 'start', node_type: 'start', data: {} },
        {
          id: 'opt',
          node_type: 'show_options',
          data: { options: [{ id: 'o1', label: 'A', value: 'a' }, { id: 'o2', label: 'B', value: 'b' }] },
        },
        { id: 'e', node_type: 'end_flow', data: {} },
      ],
      [
        { source_node_id: 'start', source_handle: 'default' },
        { source_node_id: 'opt', source_handle: 'o1' },
      ]
    );
    expect(res.nodeErrors['opt']).toBeTruthy();
  });

  it('passes a well-formed minimal flow', () => {
    const res = validateFlowForPublish(
      [
        { id: 'start', node_type: 'start', data: {} },
        { id: 'msg', node_type: 'send_text', data: { message: 'oi' } },
        { id: 'end', node_type: 'end_flow', data: {} },
      ],
      [
        { source_node_id: 'start', source_handle: 'default' },
        { source_node_id: 'msg', source_handle: 'default' },
      ]
    );
    expect(res.valid).toBe(true);
    expect(Object.keys(res.nodeErrors)).toHaveLength(0);
  });
});
