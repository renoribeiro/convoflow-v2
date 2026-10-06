// =============================================================================
// roleDescriptions.ts — o que cada função pode e não pode fazer, em pt-BR
// =============================================================================
// Texto de INTERFACE, para explicar as funções a quem está criando ou editando
// um usuário. Não decide nada: não é checagem de permissão, não é guard, não
// entra em nenhum caminho de autorização. Quem nega é a matriz de capabilities.
//
// ATENÇÃO — ESTE ARQUIVO ESPELHA UMA FONTE DA VERDADE, NÃO É UMA:
//
//   src/types/userHierarchy.ts  → DEFAULT_CAPABILITIES (matriz por função)
//   supabase/functions/manage-user/index.ts:133-176
//                               → quem pode criar quem + limite por loja
//
// SE A MATRIZ MUDAR, MUDE AQUI TAMBÉM. Nenhum teste consegue conferir que uma
// frase em português descreve corretamente um booleano — o teste em
// `roleDescriptions.test.ts` só garante que toda função tem descrição, para que
// uma função nova não entre em produção sem explicação nenhuma. O conteúdo do
// texto é responsabilidade de quem mexe na matriz.
//
// Cada linha abaixo veio de:
//   'conversations.handle'  → atender conversas
//   'contacts.manage'       → gerenciar contatos
//   'automations.operate'   → operar automações
//   'campaigns.view_convos' → ver campanhas
//   'campaigns.dispatch'    → disparar campanhas
//   'campaigns.budget'      → orçamento das campanhas
//   'store.admin'           → criar/gerenciar usuários da loja
//   'whatsapp.configure'    → configurar o WhatsApp da loja
//   'billing.view'          → ver faturamento
//   'stores.switch'         → alternar entre lojas
//   'stores.compare'        → comparar lojas
//   'platform.ops'          → painel administrativo da plataforma
// =============================================================================

import type { UserRole } from '@/types/userHierarchy';

export interface RoleDescription {
  /** Nome da função como aparece na interface. Igual a ROLE_LABELS. */
  label: string;
  /** Uma frase dizendo, sem jargão, quem é essa pessoa. */
  summary: string;
  /** O que a função faz. Ordenado do mais importante para o menos. */
  can: string[];
  /** O que a função não faz. Ordenado do mais importante para o menos. */
  cannot: string[];
}

/**
 * Frase do gestor que repete o limite por loja já mostrado no formulário de
 * criação. Fica numa constante para `STORE_CAP_ITEMS` apontar exatamente para
 * ela — se o texto mudar num lugar, muda nos dois, e o filtro de duplicata não
 * para de funcionar em silêncio.
 */
const GESTOR_CRIA_ATENDENTES = 'Criar até 5 atendentes na loja';

export const ROLE_DESCRIPTIONS: Record<UserRole, RoleDescription> = {
  atendente: {
    label: 'Atendente',
    summary: 'Quem fala com o cliente no dia a dia.',
    can: [
      'Atender conversas',
      'Gerenciar contatos',
      'Operar automações',
      'Ver campanhas',
    ],
    cannot: [
      'Criar usuários',
      'Disparar campanhas',
      'Mexer no orçamento das campanhas',
      'Configurar o WhatsApp da loja',
      'Ver faturamento',
    ],
  },

  gestor: {
    label: 'Gestor',
    summary: 'Administra uma loja e a equipe de atendimento dela.',
    can: [
      'Tudo que o atendente faz',
      GESTOR_CRIA_ATENDENTES,
      'Disparar campanhas',
      'Definir o orçamento das campanhas',
      'Configurar o WhatsApp da loja',
    ],
    cannot: [
      'Ver faturamento',
      'Alternar entre lojas',
      'Comparar lojas',
      'Criar outros gestores',
    ],
  },

  gerente: {
    label: 'Gerente',
    summary: 'Responsável pela Conta e por todas as lojas dela.',
    can: [
      'Tudo que o gestor faz',
      'Criar gestores e atendentes',
      'Ver faturamento',
      'Alternar entre lojas',
      'Comparar o desempenho entre lojas',
    ],
    cannot: ['Acessar o painel administrativo da plataforma'],
  },

  superadmin: {
    label: 'Superadmin',
    summary:
      'Administrador da plataforma ConvoFlow. Não abre as telas de loja (Conversas, Campanhas, Contatos e afins): esse acesso é de quem trabalha na loja.',
    can: [
      'Acesso total à plataforma',
      'Painel administrativo',
      'Gerenciar todas as Contas',
      'Criar qualquer função',
    ],
    cannot: [],
  },
};

/**
 * Frases que repetem o limite de usuários por loja. O formulário de criação do
 * AdminDashboard já mostra esse limite embaixo do seletor de Loja
 * ("Cada loja tem no máximo 1 gestor." / "...5 atendentes."), então lá o cartão
 * omite estas linhas em vez de dizer a mesma coisa duas vezes.
 *
 * Só vale para o contexto que já mostra o aviso — no convite (InviteUserModal),
 * onde não existe esse texto, a linha aparece normalmente.
 */
export const STORE_CAP_ITEMS: Partial<Record<UserRole, readonly string[]>> = {
  gestor: [GESTOR_CRIA_ATENDENTES],
};

/**
 * Busca a descrição de uma função.
 *
 * DE PROPÓSITO não usa `normalizeRole()`: a busca é exata. O formulário do
 * AdminDashboard começa com `role: 'user'` (nome de cargo legado) e o modal de
 * edição carrega a role crua do banco, que também pode ser legada. Nesses casos
 * o `<Select>` não casa com nenhuma opção e mostra o placeholder — o cartão
 * precisa sumir junto, senão descreveria uma função que a tela não está
 * mostrando. Retorna null para qualquer valor fora das quatro funções atuais.
 */
export function getRoleDescription(
  role: string | null | undefined,
): RoleDescription | null {
  if (!role) return null;
  return ROLE_DESCRIPTIONS[role as UserRole] ?? null;
}
