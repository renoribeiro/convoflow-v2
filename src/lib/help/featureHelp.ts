/**
 * Conteúdo de ajuda contextual ("o que faz / como configurar / exemplo") das
 * funções do produto. Consumido pelo componente <FeatureHelp />, que abre um
 * painel lateral explicando a função.
 *
 * Chaves:
 *  - Telas do dashboard: prefixadas com 'page:' + o segmento da rota
 *    (ex.: 'page:conversations'). Abas de Configurações usam
 *    'page:settings-<aba>'.
 *  - Nós do chatbot: o próprio node_type (ex.: 'ask_question').
 *  - Automações: prefixadas — 'trigger:*', 'action:*', 'condition:*'.
 *  - Conceitos: prefixadas com 'concept:*'.
 *
 * IMPORTANTE: nunca use o nome "pelado" de uma tela como chave (ex.: 'condition'
 * já é um nó do chatbot e 'update_contact' já é um nó e uma ação). O namespace é
 * plano; o prefixo é o que evita colisão.
 *
 * A `category` e a `area` de cada entrada existem para que a página de Ajuda
 * possa montar o índice sem interpretar prefixo de chave.
 */
import type { UserRole } from '@/types/userHierarchy';
import { PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/release';
import { COMO_CANCELAR_NO_TESTE, TRIAL_DAYS, TRIAL_OFFER_ENABLED } from '@/lib/billing/trialOffer';

/**
 * Ordem das seções na página de Ajuda. Categoria nova entra AQUI, na posição em
 * que deve aparecer — a página não tem ordem própria.
 *
 * 'tutorial' vem primeiro e é a única categoria sem entradas em FEATURE_HELP:
 * o conteúdo dela mora em src/lib/help/tutorials.ts, porque um tutorial tem
 * forma diferente (objetivo + passos) de uma entrada de referência.
 */
export const HELP_CATEGORIES = ['tutorial', 'tela', 'chatbot', 'automacao', 'conceito'] as const;
export type HelpCategory = (typeof HELP_CATEGORIES)[number];

/** Rótulo de exibição de cada categoria. */
export const HELP_CATEGORY_LABELS: Record<HelpCategory, string> = {
  tutorial: 'Tutoriais',
  tela: 'Telas',
  chatbot: 'Chatbot',
  automacao: 'Automações',
  conceito: 'Conceitos',
};

/** Áreas usadas pelas entradas de categoria 'tela' — espelham as seções do menu lateral. */
export const SCREEN_AREAS = ['Operação', 'Marketing', 'Configuração', 'Equipe', 'Admin'] as const;
export type ScreenArea = (typeof SCREEN_AREAS)[number];

export interface FeatureHelpEntry {
  /**
   * Módulo que a tela documentada exige — mesmo nome usado pelo `ModuleGuard`
   * em App.tsx e pelo menu lateral. Só faz sentido em `category: 'tela'`.
   * Ausente = tela sem módulo (abre para qualquer sessão).
   */
  moduleName?: string;
  /**
   * Cargo mínimo para alcançar a tela, na mesma escala do `RoleGuard`
   * (`atendente` < `gestor` < `gerente` < `superadmin`). Ausente = sem
   * restrição de cargo. Só faz sentido em `category: 'tela'`.
   *
   * Isto NÃO é uma fonte de permissão: quem barra o acesso continua sendo o
   * guard da rota. Aqui serve para a página de Ajuda não oferecer leitura sobre
   * tela que o cargo não alcança.
   */
  minRole?: UserRole;
  title: string;
  /** Frase curta: o que a função faz. */
  whatItDoes: string;
  /** Passo-a-passo de configuração. */
  howToConfigure: string[];
  /** Exemplo concreto de uso. */
  example?: string;
  /** Dicas extras (opcional). */
  tips?: string[];
  /** Grupo a que a entrada pertence. */
  category?: HelpCategory;
  /**
   * Sub-agrupamento dentro da categoria. Para 'tela' use uma ScreenArea (seção
   * do menu). Para 'chatbot' use a categoria da paleta de blocos
   * (Início/Mensagens/Interação/Ações/Finalizar). Para 'automacao' use
   * Gatilhos/Ações/Condições.
   */
  area?: string;
}

export const FEATURE_HELP: Record<string, FeatureHelpEntry> = {
  // ----------------------------------------------------------------- Conceito
  'concept:variables': {
    title: 'Variáveis',
    whatItDoes:
      'Variáveis guardam dados do contato durante a conversa (ex.: o nome que o lead digitou). Você as referencia escrevendo {nome} em qualquer texto.',
    howToConfigure: [
      'No chatbot, use o nó "Fazer Pergunta" e defina "Salvar resposta como variável" (ex.: nome).',
      'O valor digitado pelo lead é salvo na variável e também gravado no contato (campo personalizado), ficando disponível depois.',
      'Em mensagens, use {nome}, {first_name}, {phone}, {email} e suas variáveis personalizadas.',
      'Nas Automações, use o gatilho "Variável Capturada", a ação "Atualizar Contato" e a condição "Variável".',
    ],
    example:
      'O bot pergunta "Qual seu nome?" e salva em {nome}. Uma automação com gatilho "Variável Capturada = nome" atualiza o Nome do contato com {nome} automaticamente.',
    tips: [
      'Variáveis de sistema sempre existem: {name}, {first_name}, {phone}, {email}, {date}, {time}, {datetime}.',
      'Tokens desconhecidos ficam como estão: se escrever {xyz} sem essa variável, o texto sai literal.',
    ],
    category: 'conceito',
  },
  // Montado em Configurações › Escala/Transferência (src/pages/Settings.tsx),
  // acima dos três cartões — é onde o gestor decide cada etapa; na página de
  // Ajuda ("Conceitos") aparece para todo cargo.
  'concept:conversation-routing': {
    title: 'Como uma conversa chega ao atendente',
    whatItDoes:
      'É o caminho inteiro de uma mensagem nova até alguém responder: quem a vê, quem fica com ela e o que o sistema faz quando ninguém responde. Cada pedaço tem a própria tela; aqui está a ordem em que eles acontecem.',
    howToConfigure: [
      'A mensagem chega e a conversa aparece em Conversas, sem responsável. Se há um chatbot publicado para o número e o gatilho casa, o bot responde primeiro e a conversa ganha o selo "Bot em atendimento".',
      'Se a Loja ligou o rodízio (Configurações › Escala/Transferência, cartão 2), a conversa ganha responsável sozinha (na primeira mensagem ou só quando o bot terminar, conforme a escolha), na proporção definida e sem aviso no sino. Sem rodízio, ela fica na fila até alguém clicar em "Assumir".',
      'Um fluxo que termina em "Transferir para Atendente" nomeando alguém dá a conversa a essa pessoa, se ela ainda não tiver responsável, e avisa no sino. Em "Qualquer atendente", entrega ao rodízio.',
      'Quem vê a conversa depende do cartão 1: por padrão todo mundo da Loja; em "Sem responsável + as dele" ou "Só as dele", o atendente vê o que está com ele, o que ele já respondeu e o que passou adiante. Gestor e Gerente sempre veem tudo.',
      'Com a sinalização ligada (Configurações › Atendimento), a conversa vai ficando amarela, laranja e vermelha conforme as horas sem resposta. Cor não move nada.',
      'Com a transferência por tempo sem resposta ligada (cartão 3), a conversa que tem responsável e passou do limite em minutos de funcionamento muda para o próximo do rodízio, com aviso no sino de quem recebeu. Isso pode se repetir até o máximo definido.',
      'Chegando ao máximo, ou sem mais ninguém para receber, a conversa para de circular e o Gestor (e o Gerente da Conta) recebem "Conversa sem resposta precisa de você", uma vez só, até alguém responder.',
      'Qualquer resposta de pessoa encerra a espera: zera o relógio e o contador. Resposta do bot não conta para nada disso.',
    ],
    example:
      'Cliente escreve às 9h. O bot faz a triagem e termina às 9h05 em "Qualquer atendente"; o rodízio dá a conversa à Ana. Ana não responde; às 10h05, 60 minutos de funcionamento depois, a regra passa a conversa ao Bruno, que é avisado no sino. Bruno responde às 10h20: espera encerrada, relógio zerado.',
    tips: [
      'Ordem para configurar: rodízio primeiro (quem recebe), visibilidade depois (quem vê), regra de tempo por último (quando passa adiante). Os três vêm desligados.',
      'Uma conversa que já tem responsável nunca muda de mão sozinha pelo rodízio nem pelo chatbot. Só uma pessoa, ou a regra de tempo, transfere.',
      'Tudo isso vale por Loja: cada Loja tem o próprio rodízio, a própria regra, o próprio horário de funcionamento.',
    ],
    category: 'conceito',
  },

  // -------------------------------------------------------------- Nós chatbot
  start: {
    title: 'Início do Fluxo',
    whatItDoes: 'Ponto de partida do chatbot. Todo fluxo começa aqui (apenas 1 por chatbot).',
    howToConfigure: [
      'Conecte a saída do Início ao primeiro nó (geralmente "Enviar Texto").',
      'Não precisa de configuração própria.',
    ],
    example: 'Início → Enviar Texto ("Olá! Bem-vindo 👋").',
    category: 'chatbot',
    area: 'Início',
  },
  send_text: {
    title: 'Enviar Texto',
    whatItDoes: 'Envia uma mensagem de texto para o lead.',
    howToConfigure: [
      'Escreva a mensagem no campo de texto.',
      'Use {variavel} para personalizar (ex.: "Olá {first_name}!").',
      'Opcional: defina um atraso (em segundos) antes de enviar.',
    ],
    example: '"Oi {first_name}! Como posso te ajudar hoje?"',
    category: 'chatbot',
    area: 'Mensagens',
  },
  ask_question: {
    title: 'Fazer Pergunta',
    whatItDoes: 'Faz uma pergunta e aguarda a resposta do lead, salvando-a em uma variável.',
    howToConfigure: [
      'Escreva a pergunta.',
      'Defina "Salvar resposta como variável" (ex.: nome, email). Comece por letra, use só letras/números/_.',
      'Opcional: escolha uma validação (e-mail, telefone, número) para rejeitar respostas inválidas.',
    ],
    example: 'Pergunta "Qual seu e-mail?" com validação "e-mail" e salva em {email}.',
    tips: ['A resposta salva fica disponível em todos os nós seguintes e também é gravada no contato.'],
    category: 'chatbot',
    area: 'Mensagens',
  },
  show_options: {
    title: 'Menu de Opções',
    whatItDoes: 'Apresenta um menu numerado e ramifica o fluxo conforme a opção escolhida.',
    howToConfigure: [
      'Escreva a mensagem do menu.',
      'Adicione as opções (cada uma vira uma saída do nó).',
      'Conecte cada saída ao próximo nó correspondente.',
    ],
    example: '"1) Vendas  2) Suporte" → cada opção leva a um caminho diferente.',
    category: 'chatbot',
    area: 'Interação',
  },
  condition: {
    title: 'Condição (Se/Senão)',
    whatItDoes: 'Desvia o fluxo com base no valor de uma variável.',
    howToConfigure: [
      'Escolha a variável a avaliar.',
      'Escolha o operador (contém, é igual, está preenchida, está vazia).',
      'Conecte a saída "Verdadeiro" e a saída "Falso" aos próximos nós.',
    ],
    example: 'Se {interesse} contém "imóvel" → caminho A; senão → caminho B.',
    category: 'chatbot',
    area: 'Interação',
  },
  transfer_agent: {
    title: 'Transferir para Atendente',
    whatItDoes:
      'Encerra a automação do bot e entrega a conversa a uma pessoa: à que você nomear no bloco, ou ao rodízio da Loja. Em Conversas, o selo "Bot em atendimento" some dessa conversa.',
    howToConfigure: [
      'Opcional: escreva uma mensagem de transição ("Aguarde, vou te transferir...").',
      'Escolha "Qualquer atendente disponível" para a conversa seguir o rodízio da Loja (Configurações › Escala/Transferência). Com o rodízio desligado, ela fica sem responsável, na fila.',
      'Ou escolha "Atendente específico" e a pessoa: a conversa passa a ser dela e ela recebe um aviso no sino.',
    ],
    example: 'Lead pede falar com humano → Transferir para Atendente, nomeando a corretora de plantão.',
    tips: [
      'O bloco só dá a conversa a quem você nomeou se ela AINDA NÃO tiver responsável. Conversa que já tem responsável fica com quem está, e ninguém é avisado. É o caso quando o rodízio "Na primeira mensagem" já entregou antes de o bot rodar, ou quando é um cliente que voltou e já tinha quem o atendia.',
      'Se a pessoa nomeada não puder receber (suspensa, excluída, fora desta Loja), a conversa segue como em "Qualquer atendente": vai para o rodízio, ou fica na fila. O painel do bloco marca em vermelho quando isso acontece: reescolha a pessoa.',
      'Estar em 0 % no rodízio não impede: 0 % só tira a pessoa do sorteio de conversas novas. O fluxo pode nomeá-la mesmo assim.',
      'A lista mostra só quem está ativo nesta Loja: os atendentes e o Gestor.',
    ],
    category: 'chatbot',
    area: 'Ações',
  },
  set_variable: {
    title: 'Salvar Variável',
    whatItDoes: 'Cria ou atualiza uma variável com um valor fixo ou montado a partir de outras variáveis.',
    howToConfigure: [
      'Defina o nome da variável.',
      'Defina o valor (pode conter {variaveis}).',
    ],
    example: 'Salvar {saudacao} = "Olá {first_name}".',
    category: 'chatbot',
    area: 'Ações',
  },
  update_contact: {
    title: 'Atualizar Contato',
    whatItDoes: 'Grava um valor em um campo do contato (nome, e-mail, telefone ou tag).',
    howToConfigure: [
      'Escolha o campo do contato.',
      'Defina o valor (geralmente uma {variavel} coletada antes).',
    ],
    example: 'Campo "Nome" = {nome} → o contato passa a ter o nome informado.',
    category: 'chatbot',
    area: 'Ações',
  },
  move_funnel: {
    title: 'Mover no Funil',
    whatItDoes: 'Move o contato para uma etapa específica do funil de vendas.',
    howToConfigure: ['Escolha a etapa de destino do funil.'],
    example: 'Após qualificar o lead → mover para "Em negociação".',
    category: 'chatbot',
    area: 'Ações',
  },
  end_flow: {
    title: 'Encerrar Fluxo',
    whatItDoes: 'Finaliza o fluxo do chatbot e a sessão do lead.',
    howToConfigure: ['Opcional: mensagem de despedida.', 'Opcional: encerrar silenciosamente (sem mensagem).'],
    example: '"Obrigado pelo contato! Até logo 👋"',
    category: 'chatbot',
    area: 'Finalizar',
  },

  // ------------------------------------------------------ Automações: gatilhos
  'trigger:message_received': {
    title: 'Gatilho: Mensagem Recebida',
    whatItDoes: 'Inicia a automação quando o contato envia uma mensagem (opcionalmente filtrando por palavras-chave).',
    howToConfigure: [
      'Opcional: informe palavras-chave (separadas por vírgula).',
      'Opcional: marque "Correspondência exata" para casar a mensagem inteira.',
    ],
    example: 'Palavra-chave "preço" → dispara uma resposta automática com a tabela de preços.',
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:contact_created': {
    title: 'Gatilho: Novo Contato',
    whatItDoes: 'Inicia a automação quando um novo contato é criado.',
    howToConfigure: ['Opcional: filtre pela fonte do contato (whatsapp, site, manual).'],
    example: 'Novo contato do WhatsApp → enviar mensagem de boas-vindas.',
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:funnel_stage_changed': {
    title: 'Gatilho: Mudança de Estágio',
    whatItDoes: 'Inicia a automação quando o contato muda de etapa no funil.',
    howToConfigure: ['Opcional: filtre o estágio de origem e/ou de destino.'],
    example: 'Mudou para "Em negociação" → agendar follow-up em 24h.',
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:scheduled_time': {
    title: 'Gatilho: Horário Agendado',
    whatItDoes: 'Inicia a automação em horários definidos (diário, semanal, mensal).',
    howToConfigure: ['Escolha a periodicidade.', 'Defina o horário.'],
    example: 'Todo dia às 9h → enviar lembrete.',
    category: 'automacao',
    area: 'Gatilhos',
  },
  'trigger:variable_captured': {
    title: 'Gatilho: Variável Capturada',
    whatItDoes:
      'Inicia a automação em tempo real assim que o chatbot captura ou atualiza uma variável (ex.: o nome do lead). Esse é o gatilho para reagir ao que o bot coletou.',
    howToConfigure: [
      'Escolha a variável que dispara (ex.: nome).',
      'Opcional: adicione uma condição de valor (ex.: "é igual a" / "contém") para só disparar em certos casos.',
      'Monte as ações abaixo (ex.: "Atualizar Contato").',
    ],
    example:
      'Bot coleta {nome} → gatilho "Variável Capturada = nome" → ação "Atualizar Contato: Nome = {nome}". O contato é atualizado na hora.',
    tips: ['Deixe a condição em branco para disparar sempre que a variável for capturada/alterada.'],
    category: 'automacao',
    area: 'Gatilhos',
  },

  // -------------------------------------------------------- Automações: ações
  'action:send_message': {
    title: 'Ação: Enviar Mensagem',
    whatItDoes:
      'Envia uma mensagem de WhatsApp para o contato: ou uma resposta rápida da Loja, ou um texto escrito na própria etapa.',
    howToConfigure: [
      'Escolha uma resposta rápida da Loja. São as mesmas que o atendente usa no botão de raio da conversa.',
      'Ou deixe o campo em branco e escreva a mensagem personalizada logo abaixo.',
      'Use {variavel} para personalizar (ex.: "Olá {first_name}").',
    ],
    example: '"Recebemos seus dados, {first_name}! Em breve entramos em contato."',
    tips: [
      'Preencher os dois campos não soma: a resposta rápida vence e a mensagem personalizada é ignorada.',
      'Editar a resposta rápida em Configurações muda o que esta automação envia da próxima vez: a etapa guarda a referência, não uma cópia do texto.',
      'Isto NÃO é o template aprovado na Meta. Para falar com quem está fora da janela de 24 horas em número oficial, o caminho é o template aprovado, na tela Templates.',
    ],
    category: 'automacao',
    area: 'Ações',
  },
  'action:change_funnel_stage': {
    title: 'Ação: Alterar Estágio',
    whatItDoes: 'Move o contato para outra etapa do funil.',
    howToConfigure: ['Escolha o novo estágio.'],
    example: 'Após resposta positiva → mover para "Qualificado".',
    category: 'automacao',
    area: 'Ações',
  },
  'action:schedule_followup': {
    title: 'Ação: Agendar Follow-up',
    whatItDoes: 'Cria um follow-up automático (tarefa ou envio agendado) para o contato.',
    howToConfigure: [
      'Defina o atraso em horas.',
      'Escolha o tipo (whatsapp, ligação, e-mail).',
      'Opcional: escreva a mensagem (com {variaveis}).',
    ],
    example: 'Em 24h, enviar "Oi {first_name}, conseguiu ver nossa proposta?"',
    category: 'automacao',
    area: 'Ações',
  },
  'action:add_tag': {
    title: 'Ação: Adicionar Tag',
    whatItDoes: 'Aplica uma etiqueta (tag) ao contato. Útil para segmentar.',
    howToConfigure: ['Informe o nome da tag (pode conter {variaveis}).'],
    example: 'Adicionar tag "lead-quente".',
    category: 'automacao',
    area: 'Ações',
  },
  'action:update_contact': {
    title: 'Ação: Atualizar Contato',
    whatItDoes:
      'Grava o valor de uma variável em um campo do contato (nome, e-mail, telefone, tag ou um campo personalizado), em tempo real.',
    howToConfigure: [
      'Escolha o campo: Nome, E-mail, Telefone, Tag ou "Campo personalizado".',
      'Se escolher "Campo personalizado", informe o nome do campo.',
      'Defina o valor, normalmente uma {variavel} coletada pelo chatbot.',
    ],
    example:
      'Campo "Nome" = {nome}: quando o bot captura o nome do lead, esta ação atualiza o contato automaticamente.',
    tips: ['Combine com o gatilho "Variável Capturada" para atualizar o contato no instante em que o dado é coletado.'],
    category: 'automacao',
    area: 'Ações',
  },
  'action:delay': {
    title: 'Ação: Aguardar',
    whatItDoes: 'Adiciona uma pausa antes da próxima ação.',
    howToConfigure: ['Escolha a unidade (minutos, horas, dias) e o valor.'],
    example: 'Aguardar 2 horas antes de enviar a próxima mensagem.',
    category: 'automacao',
    area: 'Ações',
  },

  // ---------------------------------------------------- Automações: condições
  'condition:contact_has_tag': {
    title: 'Condição: Contato tem Tag',
    whatItDoes: 'Continua o fluxo apenas se o contato tiver a tag indicada.',
    howToConfigure: ['Informe o nome da tag.'],
    example: 'Só envia a oferta se o contato tiver a tag "cliente".',
    category: 'automacao',
    area: 'Condições',
  },
  'condition:contact_in_stage': {
    title: 'Condição: Contato no Estágio',
    whatItDoes: 'Continua o fluxo apenas se o contato estiver no estágio indicado do funil.',
    howToConfigure: ['Escolha o estágio.'],
    example: 'Só agenda follow-up se estiver em "Em negociação".',
    category: 'automacao',
    area: 'Condições',
  },
  'condition:message_contains': {
    title: 'Condição: Mensagem Contém',
    whatItDoes: 'Continua o fluxo apenas se a mensagem contiver as palavras indicadas.',
    howToConfigure: ['Informe as palavras-chave.', 'Opcional: marque "Sensível a maiúsculas".'],
    example: 'Só responde se a mensagem contiver "orçamento".',
    category: 'automacao',
    area: 'Condições',
  },
  'condition:variable_condition': {
    title: 'Condição: Variável',
    whatItDoes: 'Continua o fluxo apenas se a variável satisfizer a condição. Caso contrário, o fluxo para.',
    howToConfigure: [
      'Escolha a variável.',
      'Escolha o operador (é igual a, contém, está preenchida, está vazia).',
      'Se usar "é igual a" / "contém", informe o valor de comparação.',
    ],
    example: 'Só atualiza o contato se {email} estiver preenchida.',
    category: 'automacao',
    area: 'Condições',
  },

  // ===========================================================================
  // Telas do dashboard
  // A ordem de declaração define a ordem do índice da página de Ajuda: mantenha
  // as áreas na mesma sequência do menu lateral (Operação → Marketing →
  // Configuração → Equipe → Admin).
  // ===========================================================================

  // ------------------------------------------------------- Telas: Operação
  'page:dashboard': {
    title: 'Dashboard',
    whatItDoes:
      'É a primeira parada do dia: mostra se o atendimento está saudável e o que precisa de ação agora. Todos os números obedecem ao período escolhido no topo: trocar de 7 para 30 dias muda cartões e gráficos de uma vez.',
    howToConfigure: [
      'Escolha o período no topo (Hoje, 7 dias, 30 dias ou uma faixa personalizada). O resto da tela segue essa escolha.',
      'Comece pelo painel "Precisa de Atenção": é onde estão as conversas e os leads parados.',
      'Clique em um cartão de métrica para ir direto à tela correspondente (Conversas, Contatos, Funil).',
      'Na seção "Atendimento", leia os dois tempos de resposta como coisas diferentes: "1ª resposta do bot" é quanto o cliente espera pela primeira mensagem automática; "1ª resposta de uma pessoa" é quanto ele espera até alguém do time responder de verdade. Um não entra no outro. Os dois são medianas, isto é, na metade das conversas o tempo foi até aquele valor. A média foi trocada de propósito, porque meia dúzia de conversas esquecidas por dias puxavam o número para longe do que acontece de fato.',
      'Ainda em "Atendimento": "Esperando uma pessoa agora" conta as conversas em que o cliente falou por último e ninguém do time respondeu, com quantas delas não têm responsável; "Sem resposta de pessoa" conta as conversas do período em que só o bot falou (ou ninguém). Campanha, follow-up e chatbot não contam como resposta de pessoa.',
      'Como Gestor ou Gerente, você vê também a seção "Por atendente": quem está com cada conversa aberta agora, como ela chegou (assumiu, recebeu de colega ou automático), quantas esperam resposta e quantas vezes a regra de tempo tirou ou entregou conversa à pessoa. Isso é POSSE, não autoria: diz quem é o responsável, não quem escreveu. O aviso no topo da seção diz quantas conversas estão sem responsável e quantas delas esperam alguém. Leia esse número antes da tabela: conversa sem dono não aparece na linha de ninguém. Quem saiu do time mas ainda tem conversa aparece com o motivo ao lado do nome, e o Gerente da Conta aparece marcado como "da Conta".',
      'Abra "Análise detalhada" no fim da página para ver origem dos leads e desempenho das automações.',
    ],
    example:
      'Você abre o dia em "7 dias": o bot responde em 6 segundos, mas a 1ª resposta de uma pessoa está em 2 horas e há 90 conversas esperando alguém, quase todas sem responsável. Distribuir essas conversas passa a ser a primeira tarefa.',
    tips: [
      'Em imobiliária, a 1ª resposta de uma pessoa é a métrica que mais move venda: o lead de portal fala com três corretores e fecha com quem responde primeiro. O bot responder rápido não substitui isso.',
      'Os números de atendimento olham conversas iniciadas no período escolhido; só "Esperando uma pessoa agora" é retrato de hoje, seja qual for o período.',
      'A tela se atualiza sozinha a cada 30 segundos. Não precisa recarregar.',
      'Como Gerente ou Superadmin você troca a Conta em foco pelo seletor do topo. Como Gestor ou Atendente, você vê sempre a sua Loja.',
      'Gerente: ao escolher uma Loja no seletor, os dados dela aparecem: conversas, contatos, funil, campanhas. Você atende junto na caixa de entrada (responder, editar contato, marcar etiqueta); nas demais telas da Loja a visão é de acompanhamento, sem edição.',
      'Gerente: para sair da Loja e voltar à sua Conta, abra o seletor e clique em "Voltar para a Conta", o primeiro item da lista. Ele só aparece enquanto uma Loja está aberta; com a Conta em foco, o seletor mostra "Selecionar loja". A Conta tem dados próprios, como as conversas dela. O Instagram não é um deles: a conta do Instagram fica sempre numa Loja, como o WhatsApp de cada Loja.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:conversations': {
    moduleName: 'conversations',
    title: 'Conversas',
    whatItDoes:
      'É a caixa de entrada do time: onde você responde, assume e encerra atendimentos. A lista é ordenada pela última mensagem, então o que chegou por último sobe, e o que ninguém respondeu fica marcado.',
    howToConfigure: [
      'Escolha uma conversa na lista da esquerda para abrir o histórico à direita.',
      'Se a Loja tem conta do Instagram, o topo da lista ganha a chave "WhatsApp" / "Instagram". Cada lado é uma lista própria, com as suas pílulas e os seus números: clique no outro lado para trocar. Sem Instagram na Loja a chave não aparece e a tela é só WhatsApp.',
      'No lado da chave que não está aberto, o número ao lado do nome do canal conta as conversas que aguardam resposta lá, com a mesma regra da pílula "Aguardando". É o total exato, contado no servidor, não só o que já foi carregado. Ele cai assim que você lê a conversa.',
      'O seletor logo abaixo de "Conversas Ativas" mostra só as instâncias do lado aberto (no Instagram, as contas do Instagram). "Todas as instâncias" volta a mostrar a lista inteira daquele lado.',
      'Use a busca por nome ou número em vez de rolar a lista inteira. No lado do Instagram a busca olha o nome e o @ do cliente: digite com ou sem a arroba, as duas formas acham a mesma pessoa.',
      'Para reaproveitar um trecho pronto, clique no raio ao lado do campo de mensagem, ou digite "/" com o campo vazio, que abre a mesma lista.',
      'Para guardar um trecho que você acabou de escrever, passe o mouse sobre a mensagem enviada e clique no raio que aparece nela.',
      'Use as pílulas acima da lista ("Não lidas", "Aguardando"...) para trabalhar uma fila de cada vez; o número em cada uma diz o tamanho dela. Não cabem todas na coluna: a seta na ponta (ou arrastar de lado) mostra as demais.',
      'O botão "Filtros" abre os recortes que se somam às pílulas: só não lidas, só arquivadas (as ativas somem da lista), um período pela data da última mensagem (o dia "Até" entra inteiro) e as etiquetas do contato. Gestor e Gerente veem um recorte a mais, "Responsável pela conversa". Cada um vale na hora, assim que você marca; "Fechar" só fecha a janela e "Limpar" desliga todos.',
      'Para ver só as conversas de quem tem uma etiqueta, abra "Filtros" e marque a etiqueta em "Etiquetas do contato". Marque várias para ver quem tem qualquer uma delas. As marcadas aparecem acima das pílulas, cada uma com um "x" para tirar; a lista e o número da pílula passam a contar só essas conversas.',
      'Para ficar responsável por uma conversa, abra-a e clique em "Sem responsável", no cabeçalho, e depois em "Assumir". O seu nome passa a aparecer na conversa, para todo mundo da Loja.',
      'Para passar a conversa a um colega, clique no responsável no cabeçalho e em "Transferir…", escolha a pessoa na lista e pronto: ela recebe um aviso no sino. Dá para transferir para você mesmo uma conversa que está com outra pessoa.',
      'Use as pílulas "Minhas" e "Sem responsável" para ver só o que está com você ou o que ninguém pegou ainda. O número delas é o total da fila, como em "Todas": não depende de quanto você rolou.',
      'Como Gestor ou Gerente, para acompanhar o trabalho de uma pessoa, abra "Filtros" e marque o nome dela em "Responsável pela conversa": a lista e os números das pílulas passam a contar só as conversas que estão com ela. Marque várias pessoas para ver o que está com qualquer uma delas. Os nomes marcados aparecem acima das pílulas, cada um com um "x" para tirar. Quem saiu do time mas ainda tem conversa aparece na lista com o motivo ao lado do nome, por exemplo "Maria (suspenso)".',
      'O filtro por responsável e as pílulas "Minhas" / "Sem responsável" não se somam, porque olham a mesma coisa: marcar alguém em "Filtros" devolve a pílula a "Todas", e clicar em "Minhas" ou "Sem responsável" tira os nomes marcados. As outras pílulas ("Aguardando", "Não lidas", "Responsável indisponível"...) somam normalmente ao filtro por responsável.',
      'Como Gestor ou Gerente, use a pílula "Responsável indisponível" para achar conversas presas com alguém suspenso, excluído, fora da Loja ou em 0 % no rodízio, e transfira-as à mão pelo cabeçalho.',
      'Ative a sinalização de conversas não respondidas em Configurações › Atendimento para que os atrasos apareçam coloridos aqui e para a pílula "Não respondidas" existir; sem a sinalização ela não aparece.',
      'Quando um chatbot está conduzindo a conversa, aparece o selo "Bot em atendimento" na linha da lista e, com o nome do bot, no cabeçalho do chat. Antes de responder, abra o menu ⋮ e clique em "Encerrar sessão do bot": o bot para na hora e a partir daí é você quem atende. Sem esse passo, vocês dois falam com o cliente ao mesmo tempo.',
      'Sem selo, não há bot na conversa e "Encerrar sessão do bot" fica desabilitado. Não precisa clicar por garantia.',
      'Para responder um cliente do Instagram, abra a conversa dele e escreva no campo "Responder no Instagram...". Sai só texto: nessa conversa não aparecem anexo, áudio, template nem a citação de mensagem.',
    ],
    example:
      'Chega "ainda está disponível o apartamento do anúncio?". Você responde em minutos e o contato já entra na base com nome e telefone, pronto para acompanhar no Funil.',
    tips: [
      'A visão "Por pendência" (o botão ao lado de "Lista") é opcional e só classifica as conversas já carregadas na tela. Role a lista para incluir as mais antigas.',
      'No número da pílula, "12" é o total da fila e "12+" quer dizer "pelo menos 12": as pílulas "Todas", "Minhas", "Sem responsável", "Não lidas" e "Arquivadas" sabem o total; "Aguardando", "Não respondidas", "Em atendimento" e "Responsável indisponível" contam só o que já foi carregado, e o "+" some quando você rola até o fim.',
      'A lista se atualiza sozinha a cada poucos segundos, então numa fila filtrada entram conversas que estavam fora da tela conforme você trabalha. Acompanhe o número da pílula: é ele que mostra a fila diminuindo.',
      'Dá para silenciar o aviso de atraso de uma conversa específica quando a demora é justificada, sem tirá-la da lista.',
      'O selo "Bot em atendimento" some sozinho quando o fluxo termina (bloco "Encerrar Fluxo" ou "Transferir para Atendente") e na hora quando você encerra a sessão pelo menu. Ele é visto por todo mundo que abre a conversa, não só pelo responsável. Encerrar a sessão não muda o responsável nem entra no rodízio: é ação sua, não distribuição automática.',
      'O selo pode levar até meio minuto para aparecer depois que o bot começa. É o mesmo ritmo com que a lista se atualiza.',
      'Responsável não é cadeado por padrão: quem assume uma conversa fica marcado nela, e todo mundo da Loja continua vendo e podendo responder todas as conversas, a menos que a Loja tenha mudado isso em Configurações › Escala/Transferência. Gestor e Gerente sempre veem tudo.',
      'Se a Loja ligou o rodízio (Configurações › Escala/Transferência), a conversa nova já chega com responsável, na proporção que o Gestor definiu, e sem aviso no sino. O sino só toca quando alguém entrega a conversa de propósito: uma pessoa, a regra de tempo sem resposta ou o bloco "Transferir para Atendente" nomeando alguém. Uma conversa que já tem responsável nunca é trocada pelo rodízio nem pelo chatbot: o cliente que volta cai com quem já o atendia, mesmo que essa pessoa esteja suspensa ou em 0 %. O bloco "Transferir para Atendente" de um fluxo, mesmo nomeando outra pessoa, não muda isso.',
      'Se a sua Loja restringiu a visibilidade (você é atendente), a lista mostra só o que a regra permite: as conversas que estão com você, as em que você já respondeu, as que você mesmo passou adiante e, na opção intermediária, as que ninguém assumiu. Uma conversa que não aparece não está apagada: está com outra pessoa.',
      'Mesmo com a lista restrita, responder numa conversa que aparece para você nunca é bloqueado, e depois de responder ela continua na sua lista, mesmo se passar para outra pessoa. O mesmo vale para a conversa que você começa em "Nova conversa". Uma conversa que não aparece para você continua não aparecendo: mandar mensagem para esse contato não a abre. Os números do Dashboard continuam da Loja inteira e aparecem com a etiqueta "Toda a Loja".',
      'A Loja pode desligar a transferência para atendentes. Aí o botão "Transferir…" some para o atendente e o servidor recusa a tentativa; "Assumir" continua funcionando.',
      'Uma conversa sua pode mudar de responsável sozinha: se a Loja ligou a transferência por tempo sem resposta (Configurações › Escala/Transferência) e o cliente ficou esperando resposta de pessoa por mais minutos de funcionamento do que o limite, ela passa para o próximo do rodízio. Você percebe assim: ela sai de "Minhas" (e some da sua lista, se a Loja restringiu a visibilidade), e quem recebeu ganha o aviso "Conversa transferida para você" no sino. Não é erro nem punição: é a Loja garantindo que o cliente não fique sem resposta. Para segurar as suas, responda dentro do limite: resposta do bot não conta, só a sua. Se uma conversa chegar a você por esse caminho, o relógio recomeça do zero.',
      'Se duas pessoas clicarem em "Assumir" na mesma conversa quase ao mesmo tempo, só a primeira fica com ela. A segunda vê um aviso dizendo quem pegou, e a tela se atualiza.',
      'Desde 21/09/2026 o sistema guarda quem enviou cada mensagem escrita por uma pessoa (texto, mídia, template e a primeira mensagem de uma conversa nova). Isso é gravado pelo próprio sistema a partir de quem está logado e não pode ser alterado depois. Mensagem do bot, de campanha, de follow-up, digitada direto no celular ou importada do histórico fica sem autor. As mensagens anteriores a essa data também não têm autor e nunca terão: não há como saber quem escreveu. Toda mudança de responsável (assumir, transferir, devolver, rodízio, regra de tempo, bloco do chatbot) também passa a ficar registrada a partir dessa data, com quem, de quem e como.',
      'As etiquetas e as pessoas são de cada Loja. Se você é Gerente e troca de Loja no seletor do topo, os filtros de etiqueta e de responsável são limpos sozinhos: as etiquetas e o time da outra Loja são outros, mesmo que tenham o mesmo nome.',
      'Conversas é privada por Loja: o Superadmin não abre esta tela de nenhuma Conta, nem entrando nela pelo seletor do topo, que aqui mostra "Exclusivo para lojas". Quem lê as conversas é o Atendente, o Gestor e o Gerente da Conta.',
      'Gerente atende as Lojas da própria Conta escolhendo a Loja no seletor do topo: abre o histórico, responde e marca como lida, igual ao Gestor. O que o Gerente não faz é apagar conversa ou contato de uma Loja.',
      'A resposta rápida entra no campo com as variáveis já trocadas pelos dados de quem está na conversa, e só sai quando você clica em enviar. Dá para ajustar antes.',
      'No campo de mensagem, Enter envia e Shift+Enter quebra a linha. Depois de enviar o cursor continua no campo, então dá para emendar a próxima mensagem sem clicar na caixa de novo.',
      'O Instagram só deixa responder até 24 horas depois da última mensagem do cliente. Passado esse prazo o campo trava com o aviso, e não existe template nem outro jeito de reabrir: a conversa volta quando o cliente escrever de novo.',
      'No Instagram a mensagem enviada mostra um risco só ("Enviada") e fica assim. O Instagram não avisa quando entregou nem quando o cliente leu. Não é falha.',
      'Cada resposta no Instagram tem limite de 1.000 bytes. Acento e emoji ocupam mais de um, então o limite chega antes de 1.000 letras. O contador aparece perto do fim, e o botão Enviar desliga se passar.',
      'Conversa do Instagram responde só pelo Instagram. Se a conexão do Instagram não estiver disponível ou tiver expirado, o campo trava e diz o motivo: a mensagem nunca sai pelo WhatsApp da Loja. A conexão do Instagram se renova sozinha antes de vencer; se mesmo assim vencer, o Gerente e o Gestor recebem o aviso no sino e veem o que fazer no cartão do Instagram em Instâncias e APIs.',
      'Resposta dada pelo app do Instagram no celular também aparece aqui, sem autor, e conta como respondida: as não lidas zeram e a conversa sai de "Aguardando", como se você tivesse aberto e respondido por esta tela. A que você manda por aqui aparece uma vez só, com o seu nome.',
      'Se o cliente escreveu de novo depois da sua resposta pelo app, ou enquanto você respondia, a mensagem dele continua não lida e a conversa fica em "Aguardando". Resposta pelo app só com foto, áudio ou figurinha não aparece nesta tela e não zera nada; nesse caso, abra a conversa aqui.',
      'O nome e o @ do cliente do Instagram são buscados no próprio Instagram na primeira vez que a conversa aparece para alguém da Loja, e ficam guardados. Até lá, ou se o cliente bloqueou a conta da Loja, a conversa aparece como "Cliente do Instagram". Um nome que você digitou em "Editar Contato" nunca é trocado pelo do Instagram.',
      'No lado do Instagram não existem "Nova Conversa" nem o botão de sincronizar: o Instagram não deixa começar conversa nem puxar histórico. Quem escreve para a conta aparece sozinho na lista, e você responde por aqui.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  // Os três a seguir são superfícies DENTRO de Conversas (diálogo, diálogo,
  // painel). Ganharam entrada própria porque cada um tem regra que não cabe num
  // passo: a janela de 24 h, o atalho que muda conforme o tipo de número, e um painel
  // com seis seções. O modal "Filtros" ficou como dois passos em
  // page:conversations — quatro recortes que valem na hora, não há o que
  // explicar em separado.
  'page:conversations-template': {
    moduleName: 'conversations',
    title: 'Conversas › Enviar template',
    whatItDoes:
      'É o único jeito de voltar a falar com um cliente pela API Oficial da Meta depois de 24 horas sem mensagem dele. Passado esse prazo, o texto livre não é entregue: a Meta só aceita um modelo que ela já aprovou, e é ele que reabre a conversa.',
    howToConfigure: [
      'Abra a conversa. Se o cliente não escreve há mais de 24 horas, aparece um aviso acima do campo de mensagem com o botão "Enviar template"; ele também fica no menu ⋮ do cabeçalho, em qualquer momento.',
      'Escolha o modelo na lista "Template": só os marcados como aprovados são entregues. Se a lista não carregar, digite o nome exato em "Nome do template" e escolha o idioma.',
      'Preencha os "Parâmetros do corpo" na ordem: cada campo é um {{1}}, {{2}} do modelo. O que você digita vai substituir a marcação. Confira antes, porque o envio não tem prévia.',
      'Clique em "Enviar template". O modelo sai pela instância da conversa e fica gravado no histórico como uma mensagem sua; se o cliente responder, a janela de 24 horas reabre e o texto livre volta a funcionar.',
    ],
    example:
      'O cliente pediu orçamento na segunda e sumiu. Na quinta você abre a conversa, vê o aviso das 24 horas, escolhe o modelo "retorno_orcamento" com o nome dele no {{1}} e envia. Ele responde à tarde, e a partir daí você escreve normalmente.',
    tips: [
      'Isto só existe em número da API Oficial. Número conectado por QR Code (Evolution ou WAHA) não tem janela de 24 horas nem template: nele o texto livre sai sempre.',
      'Modelo com variável errada é recusado pela Meta na hora, com o motivo no aviso vermelho e o código da Meta no fim, por exemplo "(código 132001 da Meta)" para modelo que não existe ou não foi aprovado. O erro mais comum é deixar um parâmetro vazio.',
      'Para falar com um telefone que ainda não está na lista, use "Nova Conversa": num número da API Oficial ela também começa por um template aprovado.',
      'Os modelos são criados e aprovados no Gerenciador do WhatsApp Business, não aqui. Para ver a lista completa da sua conta com o selo de cada um, use a tela Templates.',
      'Use template para reabrir a conversa, não como mensagem do dia a dia: dentro da janela de 24 horas o texto livre é mais rápido, sem parâmetros e sem depender de aprovação.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:conversations-new': {
    moduleName: 'conversations',
    title: 'Conversas › Nova Conversa',
    whatItDoes:
      'Começa uma conversa com um telefone que ainda não está na sua lista: você escolhe o número da Loja, digita o telefone do cliente e a primeira mensagem, e o envio sai pelo mesmo caminho da tela da conversa. Em número conectado por QR Code, a primeira mensagem é texto livre. Em número da API Oficial, é um template aprovado, a não ser que o cliente tenha escrito para esse número nas últimas 24 horas.',
    howToConfigure: [
      'Clique em "Nova Conversa", acima da lista.',
      'Escolha em "Instância do WhatsApp" o número da Loja que vai enviar. Ele precisa estar conectado; se a Loja tem um número só, ele já vem escolhido.',
      'Digite o "Número do WhatsApp" com DDD.',
      'Número conectado por QR Code: escreva a "Mensagem inicial" (até 1000 caracteres).',
      'Número da API Oficial: escolha o template na lista "Template" e preencha cada variável ({{1}}, {{2}}…). Só aparecem os aprovados. Se o cliente escreveu para esse número nas últimas 24 horas, o botão "Texto livre" fica liberado e você pode escrever em vez de usar template.',
      'Clique em "Iniciar Conversa". Se a Meta ou o WhatsApp recusar, o motivo aparece em vermelho na própria janela e nada é cadastrado. Se der certo, o contato é cadastrado (caso ainda não fosse) e a conversa abre na lista, já com a sua mensagem.',
    ],
    example:
      'O corretor recebeu um cartão na visita. Ele abre "Nova Conversa", escolhe o número do plantão, digita o telefone, escolhe o template "retorno_visita", põe o nome do cliente no {{1}} e envia. A conversa já nasce no ConvoFlow; quando o cliente responder, ele escreve normalmente.',
    tips: [
      'A lista "Template" vem da sua conta na Meta. Se ela diz "Nenhum template aprovado neste número", crie um no Gerenciador do WhatsApp Business e acompanhe a aprovação na tela Templates. Template com imagem, vídeo, documento ou variável no cabeçalho ou no botão não aparece aqui; para esses, use "Enviar template" dentro da conversa.',
      'O motivo da recusa vem com o código da Meta no fim, por exemplo "(código 131047 da Meta)". Mande esse código ao suporte se precisar de ajuda.',
      'Se o telefone já era contato da Loja, nada é duplicado: a conversa dele é reaproveitada e a mensagem entra no histórico que já existia. Vale também para celular gravado sem o 9 depois do DDD, que é como o WhatsApp manda muitos números brasileiros.',
      'Para o atendente, o "Texto livre" só libera quando ele enxerga a conversa desse cliente. Se a conversa está com outra pessoa, use o template ou peça para quem a atende.',
      'A conversa nova nasce sem responsável. Se a Loja ligou o rodízio, o próximo cliente que responder faz ela ganhar dono; até lá, quem quiser cuidar clica em "Assumir".',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:conversations-contact': {
    moduleName: 'conversations',
    title: 'Conversas › Painel do contato',
    whatItDoes:
      'É a ficha do cliente ao lado do chat, para você mexer no cadastro sem sair da conversa: etapa do funil, etiquetas, anotações, follow-ups pendentes e a origem do lead. O que você muda aqui vale em Contatos e no Funil na mesma hora.',
    howToConfigure: [
      'Abra o painel pelo ícone no canto direito do cabeçalho da conversa ("Abrir painel do contato"); o mesmo ícone fecha. Em tela larga (1280px ou mais) a escolha fica salva: nas próximas conversas ele volta como você deixou. Em janela mais estreita (tablet, celular ou navegador reduzido), ele abre por cima do chat, como uma gaveta, e fecha ao tocar fora; e nasce fechado, mesmo que esteja aberto na tela larga.',
      'Em "Funil", troque a etapa em "Mover para etapa...": é o mesmo que arrastar o card no Funil de Vendas, e dispara as mesmas automações.',
      'Em "Etiquetas", o botão de mais abre o mesmo diálogo de etiquetar do menu ⋮; a etiqueta vale para campanhas segmentadas.',
      'Em "Notas", escreva o que o resto do time precisa saber antes de responder. Não há botão de salvar: o texto grava sozinho, e "Salvo automaticamente" confirma.',
      'Em "Follow-ups pendentes", veja o que já está marcado para este cliente antes de marcar outro. Para editar o cadastro inteiro (nome, e-mail, telefone), use o link para Contatos no topo do painel.',
    ],
    example:
      'Cliente confirma a visita pelo chat. Sem sair da conversa você move para "Visita agendada", anota "quer ver o de 2 quartos também" e confere que o follow-up de amanhã já existe.',
    tips: [
      'As seções "Fonte do lead", "Campos personalizados" e "Informações" vêm recolhidas: origem do anúncio, o que o chatbot coletou nas variáveis e os dados de cadastro. Clique no título para abrir.',
      'A nota é do contato, não da conversa: quem abrir esse cliente em qualquer instância vê a mesma anotação.',
      'Mover de etapa aqui pode disparar automação (gatilho "Mudança de Estágio") e follow-up, igual ao Funil.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:contacts': {
    moduleName: 'contacts',
    title: 'Contatos',
    whatItDoes:
      'É o cadastro por trás de toda conversa. Quem o chatbot capturou, quem veio de campanha e quem você cadastrou à mão ficam todos aqui, e é desta base que campanhas e automações escolhem para quem falar.',
    howToConfigure: [
      'Não precisa cadastrar nada para começar: o contato é criado sozinho na primeira mensagem recebida.',
      'Complete nome e e-mail e aplique tags. Tag é o que você vai usar depois para segmentar campanha.',
      'Não existe importação de planilha: base antiga entra sozinha, à medida que essas pessoas escrevem, ou à mão em "Novo Contato". Cadastre antes só quem precisa estar numa campanha segmentada, e já aplique a tag no cadastro.',
      'Em "Novo Contato", digite o telefone com DDI e DDD, como 55 11 99999-9999. Pode colar com espaço, parêntese ou traço: fica gravado só com os dígitos.',
      'Na Loja com Instagram, use o filtro "Todos / WhatsApp / Instagram" acima da lista. Cada contato traz o logo do canal ao lado do nome, e a busca também acha pelo @, com ou sem o "@".',
    ],
    example:
      'Você marca com a tag "interesse-cobertura" quem pediu alto padrão. Quando entra um lançamento nesse perfil, a campanha vai só para essa tag em vez de ir para a base toda.',
    tips: [
      'Campos personalizados são preenchidos automaticamente pelo chatbot quando você usa "Salvar resposta como variável". Não precisa criar o campo antes.',
      'Padronize a tag em minúscula e sem acento ("lead-quente"): fica muito mais fácil de acertar na hora de segmentar.',
      'Contato sem tag nenhuma é contato que nunca vai entrar numa campanha segmentada.',
      'Contato do Instagram não tem telefone. No lugar do número aparece o @ (ou "Instagram", enquanto o @ não chegou), e em "Editar" o @ fica só para leitura. Nome, e-mail, observações e etiquetas você edita igual.',
      'A mesma pessoa no WhatsApp e no Instagram são dois contatos. O sistema não junta os dois, nem quando o nome é igual.',
      '"Novo Contato" cria contato de WhatsApp. Contato do Instagram só aparece quando a pessoa manda mensagem no direct.',
      'Na exportação, as colunas "Canal" e "Usuário do Instagram" dizem de onde cada contato veio. O filtro de canal e o de conexão também valem para o arquivo.',
    ],
    category: 'tela',
    area: 'Operação',
  },
  'page:funnel': {
    moduleName: 'funnel',
    title: 'Funil de Vendas',
    whatItDoes:
      'É onde a venda tem etapa e responsável. Cada card é um lead numa etapa, e mover o card é o que registra que a negociação andou. O chatbot e as automações também movem cards sozinhos.',
    howToConfigure: [
      'Ajuste as etapas para o seu processo real antes de usar. Etapa genérica não informa nada; "Visita agendada" informa.',
      'Arraste o card do lead para a etapa nova conforme a negociação evolui.',
      'Para automatizar, use a ação "Alterar Estágio" nas Automações ou o nó "Mover no Funil" no chatbot.',
    ],
    example:
      'Etapas "Novo lead → Contato feito → Visita agendada → Proposta → Fechado". O chatbot qualifica e já joga o lead em "Contato feito"; o corretor move para "Visita agendada" quando marca a visita.',
    tips: [
      'Menos etapas funciona melhor: etapa que nunca recebe card só atrapalha a leitura.',
      'Mudar de etapa pode disparar automação: use o gatilho "Mudança de Estágio" para agendar o follow-up no instante em que o lead avança.',
      'Se a cobrança da Conta falhar, o sistema continua aberto enquanto o Stripe tenta cobrar de novo. Se todas as tentativas falharem, não é só o Funil que fecha: o sistema inteiro dá lugar à tela "Acesso bloqueado", para todo o time. O que resolve é o pagamento da Conta, em Configurações › Assinatura.',
    ],
    category: 'tela',
    area: 'Operação',
  },

  // ------------------------------------------------------- Telas: Marketing
  'page:tracking': {
    moduleName: 'tracking',
    title: 'Rastreamento de Leads',
    whatItDoes:
      'Responde de onde o lead veio. Quem clica em "Enviar mensagem" num anúncio do Facebook ou do Instagram chega já identificado: a tela mostra qual anúncio trouxe cada pessoa, sem link encurtado e sem você configurar nada.',
    howToConfigure: [
      'Não há o que configurar para anúncios: a origem chega junto com a primeira mensagem e o anúncio vira uma fonte sozinho.',
      'Abra a aba Dashboard e escolha o período. Os números são só dos leads que chegaram nesse intervalo.',
      'Use a aba Fontes para ver quantos leads cada anúncio trouxe, e para cadastrar à mão uma origem que você controla por fora (link na bio, portal, indicação).',
      'A aba Análises abre os mesmos leads por dia, por fonte e por etapa do funil.',
    ],
    example:
      'Dois criativos do mesmo consultório rodando juntos. Em dois meses um trouxe 21 leads e o outro 3, e o orçamento vai para o primeiro sem ninguém precisar contar conversa a conversa.',
    tips: [
      'A identificação automática vale para a conexão oficial da Meta. Número conectado por QR Code não recebe o dado do anúncio, e os leads dele ficam sem origem.',
      'Vale a primeira origem: se a pessoa voltar meses depois por outro anúncio, a fonte continua sendo a do primeiro contato. Origem escolhida à mão por você nunca é sobrescrita.',
      'A Meta reaproveita o mesmo código em criativos diferentes, então o nome da fonte termina com os últimos dígitos do anúncio. É o que separa dois criativos de mesmo título.',
      'A tela não sabe quanto você gastou: o valor investido não vem da Meta para cá. Ela responde "quantos leads cada anúncio trouxe", não "quanto custou cada lead".',
      'Os números são atualizados a cada 15 minutos. Um lead que acabou de chegar pode levar esse tempo para aparecer nos gráficos, mas já aparece na conversa.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:reports': {
    moduleName: 'reports',
    title: 'Relatórios',
    whatItDoes:
      'Serve para prestar contas a quem não abre o sistema: o dono da imobiliária, o diretor, o cliente da agência. Você monta o recorte uma vez em vez de remontar planilha todo mês.',
    howToConfigure: [
      'Escolha o período: o relatório sai da Loja aberta no seletor, no período escolhido. O tipo (Campanhas, Conversas, Funil, Geral) muda só o título do e-mail; o conteúdo é sempre o mesmo.',
      'Na segunda etapa você vê a lista do que vai no relatório. É a lista completa: contatos, conversas, mensagens, leads por estágio do funil e três números de atendimento da Loja inteira: a 1ª resposta de uma pessoa (mediana, isto é, na metade das conversas iniciadas no período alguém do time respondeu em até aquele tempo; não conta bot nem campanha), quantas conversas esperam uma pessoa agora (e quantas delas sem responsável) e quantas conversas do período ficaram sem resposta de pessoa. Não há nada para marcar ou desmarcar.',
      'Gere uma vez e confira os números na tela.',
      'Para repassar sozinho toda semana, abra a aba Agendamentos e crie um agendamento: nome, frequência, horário e os e-mails que recebem.',
      'Acompanhe a aba Entregas depois do primeiro disparo. É lá que aparece se o envio saiu ou falhou.',
    ],
    example:
      'Relatório de segunda-feira com leads novos, conversas novas, quanto tempo o cliente esperou por uma pessoa e quantas conversas ainda esperam alguém, para o dono acompanhar a semana sem pedir print para ninguém.',
    tips: [
      'O envio agendado é por e-mail. Não há envio recorrente por WhatsApp: no agendamento você informa endereços de e-mail, não telefones.',
      'O horário é o de Brasília e o disparo acontece na janela dos 5 minutos seguintes: marcar 09:00 significa receber entre 09:00 e 09:05.',
      'O período segue a frequência: agendamento diário fala do último dia, semanal dos últimos 7 dias, mensal dos últimos 30.',
      'Antes de confiar em qualquer envio recorrente, faça um envio de teste para você mesmo.',
      'Relatório com número errado é pior que relatório nenhum: confira o recorte antes de programar o envio.',
      'Como Gerente, gere um relatório por Loja trocando a Conta em foco antes de gerar. O agendamento também é por Conta: cada Loja tem os seus.',
      'O relatório não traz números por atendente, de propósito: ele vai para qualquer endereço de e-mail, e um atendente poderia receber os números dos colegas. Esses números ficam na seção "Por atendente" do Dashboard, só para Gestor e Gerente.',
      'Mensagens enviadas incluem bot, campanha e follow-up. Os três números de atendimento, não: neles só conta resposta escrita por uma pessoa.',
      'O envio pela tela tem limite: até 10 e-mails e 10 números de WhatsApp por envio, até 20 envios por pessoa por hora e nome do relatório com até 120 caracteres. Passou disso, o envio é recusado com o motivo na tela. Para mais gente, crie um agendamento ou envie em partes.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:chatbots': {
    moduleName: 'chatbots',
    title: 'Chatbots',
    whatItDoes:
      'Aqui você administra os bots: quais existem, qual está no ar e em qual número. O desenho do fluxo é feito no construtor; esta lista é quem coloca o bot em produção.',
    howToConfigure: [
      'Crie o chatbot e escolha a instância de WhatsApp em que ele vai responder.',
      'Defina o gatilho, que é o que faz o bot entrar na conversa: "Primeiro contato" (a primeira mensagem de quem nunca falou com você), "Palavra-chave" (uma das palavras que você cadastrar), "Fora do horário" (qualquer mensagem fora do horário de funcionamento da Loja) ou "Etapa do funil" (contato que está numa etapa escolhida).',
      'Abra o construtor, monte o fluxo e publique. Bot salvo não é bot publicado.',
      'Se houver mais de um bot no mesmo número, ajuste a prioridade para decidir quem responde primeiro.',
    ],
    example:
      '"Triagem de plantão" atende toda primeira mensagem, pergunta o bairro de interesse e transfere para o corretor de plantão. Fica publicado no número da imobiliária, com prioridade 1.',
    tips: [
      'Publicar valida o fluxo: se faltar ligação entre blocos ou campo obrigatório, o sistema recusa e mostra o que corrigir.',
      'Para parar de atender por um período, desative o bot em vez de apagar. Apagar leva o fluxo junto.',
      'Bot sem instância vinculada não responde ninguém, mesmo publicado.',
      'O bot pertence à Loja que está no seletor do topo, porque o número de WhatsApp é da Loja. Se você é gerente e cuida de mais de uma, confira a Loja selecionada antes de criar ou editar: o bot montado numa não responde na outra.',
      'O gatilho "Fora do horário" usa o horário de funcionamento da Loja, que não fica nesta tela: edita-se em Configurações › Escala/Transferência, dentro do cartão "Transferência por tempo sem resposta". O horário só aparece com a chave do cartão ligada. Ligue-a só para ele aparecer, ajuste fuso, dias e horas, desligue a chave de volta e salve: o horário fica gravado e a transferência automática continua desligada. Sem nada gravado, vale segunda a sexta, 9h às 18h, horário de Brasília.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:chatbot-builder': {
    // Rota /dashboard/chatbots/:id/builder — mesmo ModuleGuard dos Chatbots.
    moduleName: 'chatbots',
    title: 'Construtor de Fluxo',
    whatItDoes:
      'É a tela onde o fluxo é desenhado. Você arrasta blocos da esquerda e liga a saída de um na entrada do outro: o caminho que as setas formam é exatamente o que o cliente vai viver na conversa. No tablet e no celular a lista de blocos fica no botão "Blocos" da barra do topo, e tocar num bloco o coloca no meio da tela.',
    howToConfigure: [
      'Arraste "Início do Fluxo" primeiro. Só pode existir um por chatbot.',
      'Arraste os blocos seguintes e ligue as bolinhas, saída de um na entrada do próximo. Bloco solto não executa.',
      'Clique num bloco para configurar o conteúdo dele no painel da direita (no tablet e no celular o painel abre por cima do desenho e fecha ao tocar fora).',
      'Salvar guarda o rascunho; Publicar valida o fluxo inteiro e coloca no ar.',
    ],
    example:
      'Início → Enviar Texto ("Olá! Sou o assistente da imobiliária") → Fazer Pergunta ("Qual bairro você procura?", salvando em {bairro}) → Transferir para Atendente.',
    tips: [
      'Cada bloco tem o próprio botão de ajuda no painel da direita, com o passo-a-passo daquele bloco.',
      'Ctrl+Z desfaz e Ctrl+Y refaz. Delete apaga o bloco selecionado.',
      'Para remover uma ligação, use o × sobre a seta ou arraste a ponta dela para um espaço vazio.',
      'Se Publicar recusar por falta de ligação, o aviso lista os blocos com saída solta, um por um, e o "Ver no fluxo" de cada linha leva o desenho até ele. No desenho esses blocos ficam com borda vermelha. Menu de Opções precisa de uma ligação por opção, e Condição precisa das duas saídas, Verdadeiro e Falso.',
      'Teste o fluxo pelo seu próprio WhatsApp antes de deixar publicado: erro de texto só aparece na conversa real.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:campaigns': {
    moduleName: 'campaigns',
    title: 'Campanhas de Disparo',
    whatItDoes:
      'É o envio ativo: você fala com muita gente de uma vez, sem esperar o cliente escrever. É também a função com mais risco de bloqueio do número, então cuidar da lista e do texto faz parte do trabalho.',
    howToConfigure: [
      'Monte primeiro a segmentação: escolha por tag ou etapa do funil em vez de mandar para a base toda.',
      'Escreva a mensagem usando {first_name} para personalizar.',
      'Faça um teste com poucos contatos antes de liberar a lista inteira.',
      'Depois do disparo, acompanhe a entrega e as respostas na própria campanha.',
    ],
    example:
      'Lançamento na zona sul: campanha só para a tag "interesse-zona-sul", com "Oi {first_name}, saiu a planta do lançamento que você me pediu".',
    tips: [
      'Mensagem idêntica para milhares de números é o caminho mais rápido para o WhatsApp bloquear a linha. Personalize e envie em lotes.',
      'Quem nunca falou com você tende a denunciar como spam. Priorize contatos que já conversaram.',
      'Número da API Oficial recém-conectado tem um teto diário de envio na primeira semana. É proteção contra bloqueio pela Meta, não limite do plano: 50 mensagens por dia nos dois primeiros dias, 250 até o quarto, 1.000 até o sétimo; do oitavo dia em diante o teto some. Conta tudo o que sai pelo número no dia, inclusive respostas do time. Quem ficar fora do teto naquele dia aparece nos Detalhes da campanha como "skipped" e não é reenviado sozinho. Monte outra campanha para esses contatos no dia seguinte, ou planeje a primeira semana em lotes.',
      'Como Atendente você acompanha as campanhas e as respostas que elas geram, mas não cria nem dispara: o botão "Nova Campanha" aparece, mas o servidor recusa na hora de salvar. Quem dispara é o Gestor ou o Gerente; os passos acima são deles.',
      'Campanha é só WhatsApp. Contato do Instagram não aparece na lista de "Contatos" do passo Público e não conta no total das Tags, mesmo com a etiqueta escolhida. Para falar com ele, responda pelo direct em Conversas.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:campaigns-details': {
    moduleName: 'campaigns',
    title: 'Campanhas › Detalhes da Campanha',
    whatItDoes:
      'É o raio-X de uma campanha depois do disparo: o que foi configurado, a mensagem como saiu, os números de entrega e, pessoa por pessoa, se a mensagem foi enviada, entregue, lida, respondida, ou se falhou e por quê.',
    howToConfigure: [
      'Na lista de Campanhas, abra o menu ⋮ da campanha e clique em "Ver detalhes".',
      'Leia primeiro os contadores: Total, Enviadas, Entregues, Lidas, Respondidas, Falhas e a "Taxa de entrega". Entregue e não lida é normal nas primeiras horas; enviada e não entregue por muito tempo é número inválido ou bloqueado.',
      'Se houve falhas, o bloco vermelho lista os erros mais comuns com a quantidade de cada um. É ele que diz se o problema foi número inválido, template recusado ou limite da Meta.',
      'Em "Destinatários", ache a pessoa pelo nome e veja o status dela com data de envio, entrega e leitura. Para responder a quem respondeu, vá em Conversas: a resposta chegou lá.',
      'Em "Configuração" e "Prévia da mensagem", confira o que realmente saiu: instância, público, horário comercial, limite diário e o texto com as variáveis trocadas.',
    ],
    example:
      '500 disparos, 60 falhas. O bloco de erros mostra 58 vezes "número inválido": a lista importada tinha DDD faltando. Você corrige os contatos e duplica a campanha só para eles.',
    tips: [
      'Uma campanha em andamento pode ser pausada e retomada pelo mesmo menu ("Pausar", "Retomar"); "Duplicar" cria uma cópia em rascunho para ajustar e disparar de novo.',
      'Para comparar várias campanhas de uma vez (funil de conversão e desempenho por campanha num período), use o botão "Relatórios" no topo da tela, que abre "Relatórios de Campanhas". Esta janela é de UMA campanha; aquela é do conjunto.',
      'Os status de entrega e leitura vêm do WhatsApp. Cliente com confirmação de leitura desligada aparece como entregue, nunca como lida. Não é falha sua.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  // Sem moduleName e sem minRole de propósito: a rota /dashboard/templates não
  // tem ModuleGuard nem RoleGuard. Quem tem sessão alcança a tela, então a
  // página de Ajuda também tem de oferecer a leitura para todo cargo.
  'page:templates': {
    title: 'Templates',
    whatItDoes:
      'Mostra os modelos de mensagem que a Meta já aprovou para a sua conta. É a lista do que você pode disparar para quem está fora da janela de 24 horas, sem precisar abrir o Gerenciador da Meta para conferir.',
    howToConfigure: [
      'Confira o selo de cada modelo: só o que está "Aprovado" pode ser enviado. Pendente, Rejeitado, Pausado e Desativado aparecem para você saber por que aquele nome não funciona.',
      'Leia o corpo da mensagem. Os trechos destacados como {{1}} e {{2}} são as variáveis: você preenche cada uma na hora do envio, na ordem em que aparecem.',
      'Se a sua Loja tiver mais de uma conta do WhatsApp Business, escolha a conta no seletor do topo. Os modelos são de cada conta, não de cada número.',
      'Use "Atualizar" depois de aprovar um modelo na Meta. A lista é buscada na hora, mas fica alguns minutos em memória.',
    ],
    example:
      'O cliente sumiu há três dias. Você abre esta tela, vê que "retorno_orcamento" está Aprovado com duas variáveis, e usa esse modelo na conversa para reabrir o atendimento.',
    tips: [
      'Modelos são criados e enviados para aprovação no WhatsApp Manager da Meta, não aqui. Esta tela é consulta: ela não cria, não edita e não exclui.',
      'Passadas 24 horas desde a última mensagem do cliente, o WhatsApp bloqueia texto livre. Só um modelo aprovado reabre a conversa. É para isso que eles existem.',
      'O mesmo nome aparece uma vez por idioma. Aqui eles vêm agrupados: o nome aparece uma vez só, com os idiomas dentro.',
      'Modelos existem apenas na API Oficial (Meta). Número conectado por QR Code não tem modelo: nele vale texto livre dentro da janela de 24 horas.',
      'Aprovação na Meta não é definitiva: ela pode pausar ou desativar um modelo depois, por qualidade. Por isso esta tela consulta a Meta na hora, em vez de guardar uma cópia que envelhece.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:followups': {
    moduleName: 'followups',
    title: 'Follow-ups',
    whatItDoes:
      'É o que impede o lead de esfriar por esquecimento. A maioria das vendas perdidas não foi para o concorrente: simplesmente ninguém voltou a falar com o cliente.',
    howToConfigure: [
      'Comece pelo que está atrasado; depois veja os pendentes.',
      'Crie uma sequência (cadência) para não depender da memória do time: contato imediato, 1 dia, 3 dias, 7 dias.',
      'Deixe as automações agendarem por você: a ação "Agendar Follow-up" cria a tarefa no momento em que o lead avança.',
    ],
    example:
      'Lead visitou o imóvel e sumiu: follow-up em 1 dia ("o que você achou?"), em 3 dias (condições de pagamento) e em 7 dias (um imóvel parecido).',
    tips: [
      'Quando o cliente responde, o sistema já para a sequência e cancela as mensagens agendadas dele. Você não precisa limpar a lista na mão. O que ele cancela é ajustável em Configurações › Follow-ups.',
      'Tarefa manual é a exceção: por padrão ela sobrevive à resposta, porque foi você quem planejou aquele passo.',
      'Follow-up sem mensagem definida é só um lembrete para o corretor; com mensagem, vira envio.',
      'Contato do Instagram só aparece no modo "Manual" do "Novo Follow-up". Em "Agendado" e "Sequência" ele sai da lista, porque esses modos mandam WhatsApp sozinhos e ele não tem telefone. Se você escolher um contato do Instagram no Manual e trocar para um desses modos, a escolha é desfeita e você escolhe de novo.',
      'Cadência curta demais irrita e cadência longa demais perde a venda. Uma semana é o intervalo em que a maioria dos leads ainda lembra de você.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:followups-sequences': {
    moduleName: 'followups',
    title: 'Follow-ups › Sequências',
    whatItDoes:
      'Aqui você monta a cadência uma vez (mensagem em 1 dia, tarefa em 3, mensagem em 7) e depois inscreve os leads nela. Cada inscrição segue os passos sozinha, e para de seguir quando o cliente responde, se a sequência for feita para isso.',
    howToConfigure: [
      'Clique em "Nova sequência" e dê um nome que diga o objetivo ("Reativação de leads frios", por exemplo).',
      'Decida "Parar ao receber resposta": ligado, a primeira mensagem do cliente encerra a cadência dele, e os passos que faltavam não saem. Desligado, a sequência vai até o fim mesmo com o cliente respondendo.',
      'Monte os passos com "Adicionar passo". Cada passo é uma mensagem de WhatsApp (com variáveis como {{primeiro_nome}}) ou uma tarefa para o operador, com prioridade. O tempo de cada um conta "Após a inscrição" ou "Após o passo anterior", em minutos, horas ou dias.',
      'Deixe "Ativa" ligada e salve. Sequência inativa continua rodando para quem já está nela, mas não aceita inscrição nova.',
      'Para inscrever um lead, vá em "Novo Follow-up", escolha o modo "Sequência" e a sequência. É por lá que a cadência começa; a aba só desenha. Contato do Instagram não aparece nesse modo: sequência manda WhatsApp, e ele não tem telefone.',
    ],
    example:
      'Sequência "Pós-visita": mensagem em 1 dia ("o que você achou?"), tarefa "Ligar para o cliente" em 3 dias, mensagem em 7 dias com um imóvel parecido. O lead que responde no segundo dia sai da cadência; o que não responde recebe as três etapas.',
    tips: [
      'Não dá para editar uma sequência depois de criada. Para mudar um passo, crie outra, inscreva os próximos leads nela e desative a antiga. Quem já estava inscrito termina a versão antiga.',
      '"Excluir" apaga a sequência, os passos e TODAS as inscrições em andamento de uma vez, sem desfazer. As tarefas e mensagens que já tinham sido criadas ficam na lista de Follow-ups, mas soltas, sem a cadência a que pertenciam. Prefira desativar.',
      'A opção "Parar ao receber resposta" é da sequência, não da Loja: a aba Configurações › Follow-ups decide o que a resposta cancela nos follow-ups avulsos, e não manda nesta trava.',
      'As mensagens saem pelo número da Loja em que o lead foi inscrito, nos horários dos passos, também de madrugada, se a conta cair de madrugada. Pense nos intervalos em dias inteiros.',
    ],
    category: 'tela',
    area: 'Marketing',
  },
  'page:automation': {
    moduleName: 'automation',
    title: 'Automação',
    whatItDoes:
      'Automação reage a eventos; chatbot conduz conversa. Aqui você diz "quando isso acontecer, faça aquilo", sem diálogo e sem esperar o cliente escolher opção. É o que trabalha nos bastidores.',
    howToConfigure: [
      'Escolha o gatilho: o evento que inicia tudo (mensagem recebida, novo contato, mudança de etapa, variável capturada, horário).',
      'Adicione as ações na ordem em que devem acontecer.',
      'Use condições para o fluxo parar quando não fizer sentido continuar.',
      'Ative o fluxo. Fluxo criado e desativado não roda.',
    ],
    example:
      'Gatilho "Mudança de Estágio" para "Visita agendada" → ação "Agendar Follow-up" em 24h com "Confirmando sua visita amanhã, {first_name}?" → ação "Adicionar Tag" com "visita-marcada".',
    tips: [
      'Condição que não passa PARA o fluxo: ela não desvia para um caminho alternativo. Para ter dois caminhos, use o chatbot.',
      'Cada etapa tem o próprio botão de ajuda no painel de configuração.',
      'Comece com um fluxo curto e confira as execuções antes de montar algo longo: fluxo grande errado erra em silêncio.',
    ],
    category: 'tela',
    area: 'Marketing',
  },

  // ---------------------------------------------------- Telas: Configuração
  'page:whatsapp-numbers': {
    moduleName: 'whatsapp-numbers',
    title: 'Instâncias e APIs',
    whatItDoes:
      'É a base de tudo: sem um número conectado aqui, não existe conversa, campanha nem chatbot. Cada instância é uma linha de WhatsApp ligada ao sistema.',
    howToConfigure: [
      'Crie a instância e escolha o provedor: "API Oficial do WhatsApp" (Meta, o caminho de produção e o único que dispara campanha dentro das regras), "Evolution API" (número comum, por QR Code, no servidor da plataforma) ou "WAHA API" (número comum, por QR Code, num servidor auto-hospedado).',
      'Na API Oficial, clique em "Conectar com a Meta": abre uma janela da própria Meta, em que você entra com o login do Facebook da empresa, escolhe (ou cria) a conta do WhatsApp Business, informa o número e confirma o código. Você não copia código nem chave. Os campos Phone Number ID, WhatsApp Business Account ID e Access Token são só para quem já tem app próprio na Meta. O que ter em mãos antes está no tutorial "Antes de conectar seu WhatsApp"; o passo-a-passo da conexão, em "Conectar seu WhatsApp".',
      'Na Evolution você informa só o nome e a chave da instância: o servidor de WhatsApp é o da plataforma e já vem configurado.',
      'Na WAHA você informa o nome, a URL base do servidor WAHA, a API Key se o servidor exigir e o nome da sessão. Aqui o servidor é seu (ou de quem o hospeda para você): endereço e chave são pedidos porque a plataforma não o conhece.',
      'Conecte lendo o QR Code no celular que tem o número, ou use o código de pareamento se preferir não escanear.',
      'Confirme que o status ficou "Conectado" antes de configurar chatbot ou campanha.',
      'Confira o webhook, que é o que faz as mensagens chegarem em tempo real. Na API Oficial ele é configurado uma única vez para a instalação inteira, não a cada número.',
      'Errou o nome? Use o lápis ao lado da instância para renomear. Muda só o rótulo que aparece nas telas; a conexão, as conversas e o número continuam os mesmos. Gerente e Gestor renomeiam; Atendente não vê o botão.',
      'A lixeira exclui a instância, e só funciona em instância VAZIA. Ao abrir, a janela confere e mostra quantas conversas, mensagens, contatos, chatbots, sessões de chatbot, campanhas e follow-ups dependem dela. Se qualquer número for maior que zero, a exclusão é recusada e não há como forçar: apagar a instância apagaria tudo isso, sem volta. Gerente e Gestor veem a lixeira; Atendente não. O Gerente também exclui nas Lojas da Conta dele.',
      'Quer usar o número de novo ou refazer a conexão? Isso é reconectar, não excluir. Na API Oficial, reconectar é o mesmo botão da primeira vez: "Nova Instância" › "API Oficial do WhatsApp" › "Conectar com a Meta", escolhendo o mesmo número na janela da Meta. O ConvoFlow reconhece o número, atualiza a instância no lugar (mesmo id, mesmas conversas, mensagens, contatos, chatbot e sessões) e avisa "Número reconectado". O nome só muda se você digitar um novo; o registro do número não é refeito, então o aquecimento da primeira semana não recomeça. Excluir e criar de novo é exatamente o caminho que perde o histórico.',
      'Reconectar exige o mesmo alcance que conectar: Gestor na própria Loja, Gerente na Conta dele ou numa Loja dela. Se o número já está conectado em outra Conta ou Loja que você não administra, a Meta nem é chamada: aparece "Este número já está conectado em outra Conta ou Loja que você não administra" e nada muda. Se o número é seu, escreva para contato@convoflow.com.br. Na primeira conexão, a instância nasce na Conta ou Loja que está escolhida no seletor do topo, não na Conta do seu perfil: o Gerente confere o seletor antes de clicar.',
      'A conexão do Instagram tem validade, e o cartão dela mostra até quando vale: "Válida até", com dia e hora de Brasília. Você não precisa fazer nada para mantê-la: todo dia o ConvoFlow confere e, quando faltam 30 dias ou menos, renova sozinho. Depois de cada renovação a data avança.',
      'Se o cartão do Instagram mudar, ele diz o que houve. "Vence em", seguido de quantos dias faltam: a renovação automática não conseguiu renovar e tenta de novo no dia seguinte. "Reconectar": o Instagram não aceita mais renovar aquele acesso, por exemplo porque a senha da conta mudou ou a permissão do ConvoFlow foi retirada no Instagram. "Vencida": passou da data, e as respostas pelo Instagram param. Nos dois últimos casos só reconectar a conta resolve: clique em "Reconectar" no cartão e entre no Instagram com a MESMA conta. Na Loja em que o botão ainda não aparece, a reconexão é feita pela equipe do ConvoFlow: escreva para contato@convoflow.com.br.',
      'Na Loja com Instagram, a tela tem duas seções: "Instâncias WhatsApp" e "Contas do Instagram". O cartão de cada conta mostra o @, até quando a conexão vale e o estado dela. Os contadores do topo somam as duas seções: o primeiro vira "Total de conexões" e diz quantas são de cada canal, e uma conta do Instagram vencida, por reconectar ou desligada conta como desconectada.',
      'Para conectar o Instagram, abra a Loja no seletor do topo (o Instagram fica sempre numa Loja, nunca na Conta) e clique em "Conectar Instagram", na seção "Contas do Instagram". O ConvoFlow leva você ao Instagram: entre com usuário e senha da conta PROFISSIONAL da Loja (Empresa ou Criador de conteúdo), autorize e você volta para esta tela com "Instagram conectado" e a data até quando a conexão vale. O passo-a-passo completo está no tutorial "Conectar seu Instagram".',
      'O botão "Conectar Instagram" só aparece nas Lojas em que a equipe do ConvoFlow liberou a conexão. Sem ele, escreva para contato@convoflow.com.br. Gerente e Gestor veem o botão; o Gerente também nas Lojas da Conta dele; o Atendente não vê.',
      '"Reconectar", no cartão, troca o acesso da MESMA conta sem perder nada: é o mesmo cartão, com as mesmas conversas, mensagens e contatos. A validade que aparece depois é a que o Instagram informar: se o acesso anterior ainda valia, ela pode continuar sendo a mesma data que já estava no cartão, e isso não é erro. Um prazo novo, de cerca de 60 dias, só vem quando o acesso anterior já não valia. Se no Instagram você entrar com outra conta, o ConvoFlow recusa e não muda nada: saia do Instagram no navegador e entre com a conta do cartão. Uma conta que já está conectada em outra Conta ou Loja também é recusada, sem dizer de quem é; se ela é sua, escreva para contato@convoflow.com.br.',
      '"Desligar", no cartão, para de receber as mensagens daquela conta sem apagar nada: conversas, mensagens e contatos ficam. Mensagens que chegarem pelo Instagram enquanto ela estiver desligada NÃO entram no ConvoFlow e não voltam depois; também não dá para responder por aqui, e a renovação automática para. "Religar" volta a receber a partir daquele momento. A janela de confirmação diz isso antes de você confirmar.',
      'No cartão da conta você também usa o lápis para renomear e a lixeira para excluir. Gerente e Gestor veem os botões do cartão; Atendente, nenhum.',
    ],
    example:
      'A imobiliária liga o número do plantão como uma instância e o do comercial como outra. O chatbot de triagem fica publicado só no número do plantão.',
    tips: [
      'Instâncias pertencem à Conta e quem as conecta é o Gerente ou o Gestor. Como Superadmin você não abre esta tela de nenhuma Conta: ela mostra "Exclusivo para lojas" mesmo com a Conta escolhida no seletor. Para apoiar um cliente que não consegue conectar: confira na Administração se a Conta tem acesso e se a pessoa tem o cargo certo, e passe a ela os tutoriais "Antes de conectar seu WhatsApp" e "Conectar seu WhatsApp" da Ajuda. O que trava costuma ser um pré-requisito (login da Meta, número ainda no aplicativo, PIN), não a tela.',
      'Linha desconectada é atendimento parado: mensagem que chega com a instância fora pode não entrar no sistema. Reconecte assim que ver "Desconectado".',
      'Número conectado por QR Code (Evolution ou WAHA): usar o mesmo número no WhatsApp do celular e aqui ao mesmo tempo pode derrubar a sessão.',
      'Número na API Oficial: ele deixa de funcionar no aplicativo do WhatsApp do celular. Não é instabilidade, é a regra da Meta: o número passa a atender só pela API, e o ConvoFlow não liga o modo em que os dois convivem. Avise o time antes de conectar.',
      'Na API Oficial, quem cobra as conversas é a Meta, e ela cobra você, não o ConvoFlow. O cartão fica no seu portfólio empresarial da Meta, o mesmo em que a conta do WhatsApp Business foi criada. Sem forma de pagamento válida lá, as mensagens param de sair mesmo com o número "Conectado" aqui. Os valores atuais estão na página da Meta: developers.facebook.com/docs/whatsapp/pricing.',
      'Na API Oficial, o Verify Token que a Meta valida não é pedido no formulário: é um token único da instalação, guardado como secret no Supabase e configurado uma vez por quem opera a plataforma. Pelos campos manuais, você só informa Phone Number ID, WABA ID e Access Token; pelo botão "Conectar com a Meta", nem isso.',
      'Você nunca precisa de endereço de servidor nem de chave de API para ligar um número pela Evolution. Se alguma tela pedir isso na Evolution, é engano: fale com quem opera a plataforma. Na WAHA é o contrário: o servidor é seu, então URL e chave são pedidos mesmo.',
      'O que excluir uma instância vazia faz em cada provedor: na Evolution, a sessão é encerrada e a instância some do servidor da plataforma; na WAHA, a sessão é apagada no seu servidor; na API Oficial, nada muda na Meta (o número continua registrado lá e o app continua inscrito na conta do WhatsApp Business), o que some é o vínculo aqui e o token guardado no cofre. Em todos, os registros de webhook da instância vão junto.',
      'Excluir uma conta do Instagram segue a mesma regra: só conta vazia. Com qualquer conversa, mensagem ou contato, a exclusão é recusada, e o caminho é reconectar. Numa conta vazia, no Instagram nada muda (a conta continua sua); some o vínculo aqui e o acesso guardado no cofre, e as mensagens novas do direct dessa conta deixam de entrar no ConvoFlow.',
      'O Gerente e o Gestor recebem aviso no sino sobre a conexão do Instagram em três momentos, uma vez cada: 7 dias antes de vencer, no dia em que vence e quando o Instagram recusa renovar. Se a renovação der certo, nenhum aviso sai. Quando o Instagram é de uma Loja, o Gerente da Conta também recebe. O Atendente não recebe.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings': {
    title: 'Configurações',
    whatItDoes:
      'Reúne o que vale só para você e o que vale para a Loja inteira. A diferença importa: Perfil, Notificações e Segurança são seus; Atendimento, Escala/Transferência, Respostas rápidas, Follow-ups e Integrações mudam o comportamento para todo o time; Assinatura é da Conta e só o Gerente a vê.',
    howToConfigure: [
      'Escolha a aba. Cada aba tem o próprio botão de ajuda com o passo-a-passo dela.',
      'Antes de salvar algo em Atendimento, Escala/Transferência, Respostas rápidas, Follow-ups ou Integrações, lembre que a mudança atinge o time todo.',
      'Depois de salvar, confira na tela afetada: preferência de atendimento aparece nas Conversas, webhook aparece no sistema de destino.',
    ],
    example:
      'Você ativa a sinalização de conversas não respondidas em Atendimento e, a partir daí, todo o time passa a ver o aviso de atraso na tela de Conversas.',
    tips: [
      'A aba escolhida fica na URL, então você pode salvar o link direto (ex.: /dashboard/settings?tab=integrations).',
      'Trocar senha é em Segurança. Dar ou tirar acesso de outra pessoa é em Equipe, não aqui.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-profile': {
    title: 'Configurações › Perfil',
    whatItDoes:
      'São seus dados como usuário: é o nome que o resto do time vê quando uma conversa é transferida e o que aparece nos relatórios por pessoa. Não é o nome da Loja.',
    howToConfigure: [
      'Preencha nome e sobrenome: é assim que você aparece para o time.',
      'Confira o telefone, usado para te identificar e para avisos.',
      'Salve para aplicar.',
    ],
    example:
      'A corretora preenche "Ana Ribeiro" e a foto. Nas conversas transferidas o time passa a ver quem está atendendo, em vez de um e-mail solto.',
    tips: [
      'Perfil em branco atrapalha relatório por pessoa: fica impossível saber quem atendeu o quê.',
      'Trocar senha é na aba Segurança, não aqui.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-attendance': {
    title: 'Configurações › Atendimento',
    whatItDoes:
      'Define a partir de quantas HORAS sem resposta uma conversa passa a aparecer marcada na lista de Conversas, em três níveis: Atenção (amarelo), Atrasada (laranja) e Crítica (vermelho). É a régua de atendimento da Loja: ela só colore a lista, não move conversa nenhuma.',
    howToConfigure: [
      'Ative a sinalização. Ela vem desligada de propósito.',
      'Preencha as três faixas em horas inteiras e crescentes: Atenção, Atrasada e Crítica. O padrão é 1, 4 e 20 horas. A Crítica vem em 20 porque, passadas 24 horas da última mensagem do cliente, o WhatsApp só deixa reabrir a conversa com template. O vermelho é o aviso de que ainda dá tempo.',
      'Salve e abra as Conversas: cada conversa em que o cliente espera resposta ganha a cor da faixa em que está, e a pílula "Não respondidas" passa a existir para filtrar só elas.',
    ],
    example:
      'Faixas 1, 4 e 20 horas. O lead de portal que escreveu às 9h e ninguém respondeu fica amarelo a partir das 10h, laranja às 13h e vermelho às 5h da manhã seguinte, quatro horas antes de a janela de 24 horas fechar.',
    tips: [
      'A configuração vale para a Loja inteira, não só para você.',
      'Vem desligada por escolha: ligue quando o time já souber que o aviso vai aparecer, para não parecer cobrança de surpresa.',
      'Não dá para marcar em minutos: a menor faixa é 1 hora. Para reagir em minutos, o caminho é a regra de tempo sem resposta, abaixo.',
      'Dá para silenciar o aviso de uma conversa específica quando a demora é justificada; a cor também some quando alguém da equipe responde.',
      'Isto só marca a lista, não move a conversa. Conta horas corridas, também de madrugada e no fim de semana. Para transferir automaticamente quem não responde, use "Transferência por tempo sem resposta" em Escala/Transferência: lá a conta é em minutos DE FUNCIONAMENTO da Loja, desde o início da espera do cliente, e só resposta de pessoa zera o relógio. As duas convivem sem se atrapalhar.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-quick-replies': {
    title: 'Configurações › Respostas rápidas',
    whatItDoes:
      'Guarda os trechos que o time repete o dia inteiro (saudação, horário de funcionamento, dados para pagamento) para o atendente inserir com dois cliques em vez de redigitar. A biblioteca é da Loja: qualquer cargo cria, edita e apaga.',
    howToConfigure: [
      'Clique em "Nova resposta" e dê um nome curto. É por ele que você encontra o trecho na busca.',
      'Escreva a mensagem e troque o que muda de pessoa para pessoa por {first_name}, {name}, {phone} ou {date}.',
      'Abra uma conversa e teste: clique no raio ao lado do campo de mensagem, ou digite "/" com o campo vazio.',
      'Para transformar algo que você acabou de mandar em resposta rápida, passe o mouse sobre a mensagem enviada e clique no raio dela.',
    ],
    example:
      '"Horário" com o texto "Olá {first_name}! Atendemos de segunda a sexta, das 9h às 18h." Na conversa com a Helena, o campo já aparece escrito "Olá Helena!", e você ainda pode ajustar antes de enviar.',
    tips: [
      'A escrita de variável é a mesma do chatbot e das automações: chave simples, {first_name}. O que o sistema não reconhecer fica na mensagem do jeito que você escreveu.',
      'A lista mostra quem criou e quem editou por último. Como todo cargo pode mexer, é assim que o time sabe a quem perguntar antes de mudar um texto.',
      'Como Gerente, a resposta vai para a Loja que está aberta no seletor, não para a sua Conta. Escolha a Loja antes de criar: é a equipe dela que vai ver o trecho.',
      'Apagar pede confirmação e vale para a Loja inteira. Não dá para desfazer.',
      'Dois trechos não podem ter o mesmo nome na mesma Loja: numa lista onde se escolhe pelo nome, o repetido só atrapalha.',
      'As automações também usam esta lista: a ação "Enviar Mensagem" escolhe uma resposta rápida daqui.',
      'Não confunda com a tela Templates, que mostra os modelos aprovados na Meta. Aquilo é exigência da Meta para falar fora da janela de 24 horas; isto aqui é só atalho de digitação e vale para qualquer conversa aberta.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-visibility': {
    title: 'Configurações › Escala/Transferência',
    whatItDoes:
      'Quatro assuntos, três cartões, na ordem em que uma conversa passa por eles: o que cada atendente enxerga na caixa de entrada e se ele pode passar uma conversa para um colega (cartão 1), como as conversas NOVAS são divididas entre a equipe, o rodízio (cartão 2), e o que acontece quando o responsável não responde a tempo: a transferência automática por tempo sem resposta (cartão 3). As duas primeiras valem só para o cargo atendente; Gestor e Gerente sempre veem e transferem tudo. O rodízio e a transferência automática vêm desligados: sem mexer neles, nada muda. Só Gestor e Gerente alteram os três cartões; como Atendente você vê os valores da Loja em modo leitura, e os passos abaixo são deles.',
    howToConfigure: [
      'Escolha o que o atendente vê: "Todas as conversas da Loja" (como hoje), "Sem responsável + as dele" (vê a fila sem dono e o que está com ele, não vê o que está com um colega) ou "Só as dele" (só o que está com ele).',
      'Em qualquer opção, quem já respondeu numa conversa continua vendo-a depois de transferida, e quem passou uma conversa adiante continua vendo-a até outra pessoa reatribuí-la.',
      'Decida se o atendente pode transferir. Desligado, ele ainda assume conversas sem responsável; passar para outra pessoa fica só com Gestor e Gerente. O servidor recusa a tentativa; não é só o botão que some.',
      'Salve o primeiro cartão. A mudança vale na hora: a lista de Conversas do atendente se refaz no próximo carregamento.',
      'No cartão "Distribuição de conversas novas", ligue "Distribuir conversas novas automaticamente". Ele só aparece com pelo menos 2 atendentes ativos na Loja; com um só, a tela diz isso em uma linha em vez de esconder.',
      'Decida se o Gestor também recebe conversas e quando a conversa ganha responsável: "Na primeira mensagem" (na hora, mesmo com chatbot) ou "Quando o chatbot terminar" (só depois que a sessão do bot acaba; sem bot publicado para o número, é na hora; se o bot não engatar, o sistema atribui sozinho em até 2 minutos). Se algum fluxo termina em "Transferir para Atendente" nomeando uma pessoa, escolha "Quando o chatbot terminar" (veja a dica sobre isso abaixo).',
      'Ajuste a fatia de cada pessoa. A soma precisa dar exatamente 100: a tela diz quanto falta ou sobra e não corrige o que você digitou. Coloque 0 para tirar alguém do rodízio sem tirar da Loja; "Dividir igualmente" refaz as fatias por igual.',
      'Salve a distribuição. Se você mudou a chave do Gestor, salve antes de mexer nas fatias: quem participa muda, o sistema divide igual e aí você ajusta.',
      'No cartão "Transferência por tempo sem resposta", ligue a regra e defina o tempo em MINUTOS DE FUNCIONAMENTO (mínimo 5; o padrão é 60) e o máximo de transferências por espera (padrão 3). A tela mostra, com o histórico real da Loja, quantas esperas dos últimos 30 dias teriam passado do limite com o valor que você digitou. Use isso para calibrar antes de salvar.',
      'Confira o horário de funcionamento da Loja (fuso, dias e horas). Só os minutos dentro dele contam: cliente que escreve às 22:00 não gera transferência de madrugada; o relógio retoma quando a Loja abre. É o mesmo horário que o chatbot usa para "fora do horário": mudar aqui muda lá.',
      'Salve a regra. A partir daí, a cada 2 minutos o sistema confere as conversas com responsável em que o cliente espera resposta humana há mais tempo que o limite e passa cada uma para o próximo do rodízio, nunca para quem já a tinha. Quem recebe é avisado no sino.',
    ],
    example:
      'Loja com Ana e Bruno em 70/30: a cada 10 conversas novas, 7 chegam já com a Ana e 3 com o Bruno, sem ninguém precisar transferir e sem aviso no sino. Quando um cliente antigo volta a escrever, a conversa continua com quem já atendia: o rodízio nunca troca um responsável que já existe.',
    tips: [
      'Responder nunca é bloqueado: se um atendente restrito responde numa conversa que não via (por exemplo, começando uma conversa com um telefone que já tinha histórico), ela passa a aparecer para ele.',
      'A restrição vale só para a lista e o histórico. Contatos, funil, campanhas e os números do Dashboard continuam da Loja inteira.',
      'O que aconteceu antes desta configuração não conta como "já respondi": a participação começa a ser registrada a partir do dia em que a Loja passou a usar o recurso.',
      'Ative "Sem responsável + as dele" quando o time tira da fila por conta própria; "Só as dele" quando o gestor distribui, ou ligue o rodízio e deixe o sistema distribuir.',
      'Quando alguém entra ou sai da Loja (convite aceito, suspensão, exclusão), as fatias se refazem sozinhas em divisão igual, e quem estava em 0 continua em 0. Você ajusta depois, se quiser. Enquanto você digita, nada é corrigido automaticamente.',
      'Quem é suspenso ou vai para 0 % FICA com as conversas que já tem; só o Gestor move, à mão. Um aviso no topo do cartão conta quantas conversas estão assim e leva para a pílula "Responsável indisponível" em Conversas.',
      'A distribuição é proporcional, não alternada: em 100 conversas com 70/30 saem exatamente 70 e 30; em 7, saem 5 e 2, o mais perto possível. Duas mensagens chegando no mesmo instante nunca caem na mesma pessoa por acidente.',
      'Atribuição automática do rodízio não toca o sino: só transferência feita por uma pessoa, pela regra de tempo sem resposta ou pelo bloco "Transferir para Atendente" nomeando alguém avisa quem recebeu.',
      'Um fluxo de chatbot que termina em "Transferir para Atendente" nomeando uma pessoa só dá a conversa a ela se a conversa ainda não tiver responsável. Com o rodízio em "Na primeira mensagem", a conversa já chegou com responsável antes de o bot rodar: o bloco NÃO troca o dono, e a pessoa nomeada não recebe nada. Para o bloco valer, use "Quando o chatbot terminar", ou deixe o bloco em "Qualquer atendente" e confie no rodízio.',
      'A regra de tempo conta desde o INÍCIO da espera do cliente, não desde a última mensagem dele: o cliente mandar "oi?" três vezes não zera o relógio. Resposta do chatbot também não zera, só resposta de pessoa. Quem recebe a conversa por transferência ganha o prazo inteiro de novo.',
      'A regra nunca transfere uma conversa em que o chatbot está no meio de uma sessão, nem uma conversa sem responsável (essa é do rodízio). Chegando ao máximo de transferências, ou não havendo outro atendente disponível, a conversa para de circular e o Gestor (e o Gerente da Conta) recebem um aviso no sino, uma vez só, até alguém responder.',
      'Não confunda com a sinalização de SLA da aba Atendimento: aquela só colore a lista, em horas corridas desde a última mensagem do cliente, e não move nada. As duas podem ficar ligadas.',
      'Para desligar a transferência automática de emergência, basta desligar a chave do cartão 3 e salvar: nada mais precisa mudar.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-followups': {
    title: 'Configurações › Follow-ups',
    whatItDoes:
      'Decide o que o sistema desmarca sozinho quando o cliente responde. Sem isso, quem já respondeu continua recebendo a cobrança automática marcada dias antes, e percebe que estava falando com uma agenda, não com você.',
    howToConfigure: [
      'Deixe "Cancelar mensagens agendadas" ligado: é o que evita o envio automático depois da resposta.',
      'Decida sobre "Cancelar tarefas manuais". Ligado, a resposta apaga os lembretes que o time criou; desligado, quem criou decide o que fazer.',
      'Salve e teste com um contato real: responda de outro celular e confira se o follow-up agendado saiu da lista.',
    ],
    example:
      'A corretora agenda "posso mandar as condições?" para sexta. O cliente responde na quarta. Com a opção ligada, o envio de sexta é cancelado e a conversa segue no tom que o cliente começou.',
    tips: [
      'As duas opções valem para a Loja inteira, não só para você.',
      'Tarefa manual é trabalho que uma pessoa planejou; por isso o padrão é NÃO apagar. Ligue só se o seu time preferir a lista sempre limpa.',
      'Sequências não obedecem a esta tela: cada sequência tem a própria trava, em Follow-ups › Sequências.',
      'Uma tarefa que fazia parte de uma sequência interrompida é encerrada junto, independente das opções aqui: ela ficou sem cadência a que servir.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-subscription': {
    // Quem responde pela cobranca e a CONTA, e a Conta e do Gerente. A aba
    // exige a capacidade billing.view, verdadeira so para gerente/superadmin
    // (ver src/pages/Settings.tsx). Gestor e Atendente nao a enxergam.
    minRole: 'gerente',
    title: 'Configurações › Assinatura',
    whatItDoes:
      'É onde você vê e resolve o pagamento da Conta. Quem assina é a Conta, nunca a Loja: um único plano paga a Conta inteira, e todas as Lojas dela funcionam por causa dele. É a explicação mais comum para "o sistema não abre".',
    howToConfigure: [
      'Confira a situação no selo do topo: "ATIVO" (pagando em dia), "EM TESTE" (no teste grátis, com a data em que ele termina) ou "PAGAMENTO PENDENTE" (a última cobrança não passou no cartão).',
      'Para assinar, siga para o checkout. O cartão é cadastrado lá mesmo.',
      'Depois de pagar, você volta para cá. Se a Conta estava bloqueada, a tela "Confirmando seu pagamento" abre o sistema sozinha em alguns segundos, sem recarregar.',
      'Para trocar o cartão, clique em "Atualizar cartão". Abre uma página do Stripe só para cadastrar o cartão novo; ao terminar, você volta para cá e as próximas cobranças usam o cartão novo.',
      'Para cancelar, clique em "Cancelar assinatura" e leia o aviso até o fim: ele diz até que dia o sistema continua liberado. No teste grátis, nada é cobrado. Depois da primeira cobrança, você usa até o fim do período já pago, sem nova cobrança e sem reembolso dos dias que faltam.',
      'Mudou de ideia? Enquanto a data não chega, "Desfazer cancelamento" deixa a assinatura como estava.',
    ],
    example:
      'O cartão da Conta é recusado na renovação. A aba mostra "PAGAMENTO PENDENTE" e o sistema continua aberto enquanto o Stripe tenta cobrar de novo. Você atualiza o cartão pelo link do e-mail do Stripe e a próxima tentativa passa. Se todas as tentativas falhassem, todo mundo, você inclusive, passaria a ver a tela "Acesso bloqueado"; regularizado o pagamento, todas as Lojas voltam juntas.',
    tips: [
      ...(TRIAL_OFFER_ENABLED
        ? [
            `A primeira assinatura da Conta começa com ${TRIAL_DAYS} dias de teste grátis. O cartão é cadastrado no checkout e só é cobrado no fim do teste; a data aparece aqui. Uma Conta que já assinou antes não ganha outro teste. As regras estão na cláusula 4.3 dos Termos de Uso.`,
            'Se a assinatura for cancelada durante o teste, o sistema segue aberto até o fim do teste e nada é cobrado. A aba mostra "Cancelamento agendado" com a data.',
          ]
        : ['A cobrança começa no dia em que o cartão é cadastrado no checkout e se repete todo mês na mesma data.']),
      'Com pagamento pendente, o aviso vermelho desta aba manda clicar em "Atualizar cartão". Nessa situação não há botão de cancelar: atualize o cartão, ou fale com o suporte se não quiser continuar. Enquanto isso não dá para contratar Lojas adicionais.',
      'Só o Gerente vê "Cancelar assinatura", "Desfazer cancelamento" e "Atualizar cartão". O servidor confere o cargo de novo a cada clique: nenhum outro cargo cancela, nem chamando a função direto.',
      'O botão cancela sem devolver o que já foi pago. Ele não é o direito de arrependimento dos Termos de Uso (cláusula 4.4): para desistir da contratação dentro do prazo dele, escreva para contato@convoflow.com.br, e o valor pago é devolvido inteiro. O cancelamento também pode ser pedido por esse e-mail, a partir do e-mail cadastrado na Conta.',
      'Cancelou durante o teste grátis? O cartão fica guardado, mas deixa de ser usado para cobrar, e "Atualizar cartão" some até você desfazer o cancelamento. É isso que garante que nada seja cobrado no fim do teste. Desfazendo, o cartão volta a valer.',
      'Nos últimos minutos antes da data do cancelamento não dá mais para desfazer por aqui. Nesse caso, fale com o suporte.',
      'A aba mostra sempre a assinatura da sua Conta, mesmo quando você está numa Loja pelo seletor do topo.',
      TRIAL_OFFER_ENABLED
        ? 'Você também é bloqueado quando a Conta não está paga. Mas a tela de bloqueio resolve sozinha: numa Conta que nunca assinou ela oferece o teste grátis ("Começar teste grátis"); numa que já assinou, o preço e "Assinar agora". Não é preciso chegar até esta aba nem depender de ninguém.'
        : 'Você também é bloqueado quando a Conta não está paga. Mas a tela de bloqueio traz o preço e o botão de assinar. Dá para resolver de lá, sem precisar chegar até esta aba e sem depender de ninguém.',
      'Na tela de bloqueio há um "Já paguei, reconferir acesso": use depois de pagar em outra aba ou quando o suporte liberar seu acesso na mão, em vez de sair e entrar de novo.',
      'A Loja não tem assinatura própria: ela herda o acesso da Conta. Se uma Loja está bloqueada, o que resolve é o pagamento da Conta.',
      'Liberação manual concedida pelo Superadmin também abre o sistema, sem assinatura ativa, e vale para a Conta inteira.',
      'Esta aba é só do Gerente: quem assina é a Conta, e Gestor e Atendente pertencem a uma Loja, que não contrata nada. Bloqueados, eles veem a tela sem preço e sem botão, com o recado de falar com você. Não adianta pedir que "assinem por lá".',
      'Lojas adicionais são contratadas aqui, e o jeito muda conforme o momento: antes de assinar elas entram junto no checkout; depois de assinar, elas são somadas à assinatura que já existe e a diferença cai na próxima fatura, proporcional ao que falta do mês.',
      'Não dá para reduzir as Lojas abaixo do que você já usa. Exclua a Loja primeiro, depois reduza a vaga.',
      'Se o sistema não abre para todo o time ao mesmo tempo, o problema é aqui, não é permissão de usuário.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  // A tela de bloqueio (PaywallScreen). Não é rota: aparece no lugar do sistema
  // inteiro. Montada na própria tela, sem o link para a Ajuda (o bloqueio cobre
  // /dashboard/help). Vale para todo cargo; o texto diz o que muda por cargo.
  'page:paywall': {
    title: 'Tela de bloqueio e teste grátis',
    whatItDoes:
      'É a tela que aparece no lugar do sistema quando a Conta não tem acesso liberado. O que ela mostra muda com o seu cargo e com a história da Conta.',
    howToConfigure: [
      ...(TRIAL_OFFER_ENABLED
        ? [
            `Gerente de uma Conta que nunca assinou: a tela oferece o teste grátis de ${TRIAL_DAYS} dias. Leia o quadro antes de clicar: hoje você não paga nada; ali estão a data e o valor da primeira cobrança e como cancelar antes. Clique em "Começar teste grátis" e cadastre o cartão no Stripe.`,
            'Gerente de uma Conta que já assinou e voltou a travar: a tela mostra o plano, o preço e "Assinar agora". Não há teste de novo: ele vale uma vez por Conta.',
          ]
        : [
            'Gerente: a tela mostra o plano, o preço e "Assinar agora". O cartão é cadastrado no Stripe, e a cobrança começa no mesmo dia.',
          ]),
      'De volta do Stripe, a tela mostra "Confirmando seu pagamento" e abre o sistema sozinha assim que o pagamento é confirmado, normalmente em segundos. Não assine de novo enquanto isso: seria uma segunda assinatura.',
      'Gestor e Atendente: a tela não tem preço nem botão. Quem assina é a Conta, e a Conta é do Gerente; fale com ele.',
      'Pagou em outra aba ou o suporte liberou seu acesso? Use o botão de reconferir acesso, em vez de sair e entrar de novo.',
    ],
    example: TRIAL_OFFER_ENABLED
      ? `Você criou a Conta ontem pelo site e hoje abre o sistema: aparece "Comece seu teste grátis de ${TRIAL_DAYS} dias", com a data da primeira cobrança. Você cadastra o cartão, volta do Stripe, vê "Confirmando seu pagamento" por alguns segundos e o sistema abre.`
      : 'O cartão da Conta foi recusado em todas as tentativas e a assinatura foi encerrada. Você abre o sistema, vê "Acesso bloqueado", clica em "Assinar agora", paga no Stripe e, de volta, vê "Confirmando seu pagamento" até o sistema abrir.',
    tips: [
      ...(TRIAL_OFFER_ENABLED
        ? [`Para cancelar durante o teste e não ser cobrado, ${COMO_CANCELAR_NO_TESTE}.`]
        : []),
      'Se "Confirmando seu pagamento" passar de dois minutos, a própria tela avisa. Nada se perdeu: reconfira em alguns minutos ou fale com o suporte.',
      'Voltou do Stripe sem terminar? A tela avisa que nada foi cobrado, e o botão continua lá.',
      'A Loja não assina nada: ela herda o acesso da Conta. Por isso o preço e a oferta aparecem só para o Gerente.',
      'O Superadmin nunca vê esta tela.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-notifications': {
    title: 'Configurações › Notificações',
    whatItDoes:
      'Escolhe sobre o que o sistema te avisa. É preferência sua, por usuário: desligar aqui não desliga para o resto do time.',
    howToConfigure: [
      'Ligue ou desligue por tipo: novas mensagens, follow-ups, campanhas.',
      'Salve.',
      'Os avisos passam a aparecer no sino do topo e na tela de Notificações.',
    ],
    example:
      'O corretor desliga aviso de campanha e mantém novas mensagens: assim só é interrompido quando um cliente realmente escreve.',
    tips: [
      'É por usuário: cada pessoa do time configura o seu.',
      'Desligar tudo é tentador e custa venda. Mantenha ao menos o aviso de novas mensagens.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-security': {
    title: 'Configurações › Segurança',
    whatItDoes:
      'Troca a senha da sua conta de acesso. Só isso: quem vê o quê é definido pelo cargo, em Equipe.',
    howToConfigure: [
      'Informe a senha atual.',
      'Escreva a nova senha duas vezes.',
      'Salve para aplicar.',
    ],
    example:
      'Você compartilhou a senha para alguém resolver algo no sistema. Troque logo depois, em vez de deixar o acesso circulando.',
    tips: [
      'Senha longa protege mais que senha complicada.',
      'Para remover o acesso de quem saiu do time, vá em Equipe. Trocar a sua senha não afeta o login das outras pessoas.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:settings-integrations': {
    title: 'Configurações › Integrações',
    whatItDoes:
      'Manda os eventos do ConvoFlow para fora: seu ERP, uma planilha, o n8n. Em vez de alguém copiar lead na mão, o sistema avisa o outro sistema no instante em que o evento acontece.',
    howToConfigure: [
      'Cadastre o webhook com um nome e a URL que vai receber as chamadas.',
      'Escolha só os eventos que interessam. Marcar todos gera ruído no destino.',
      'Defina um secret. É ele que permite ao outro lado confirmar que a chamada veio mesmo daqui.',
      'Ative e provoque o evento uma vez para conferir que chegou.',
    ],
    example:
      'O evento de novo contato vai para o n8n, que cadastra o lead no sistema da construtora e avisa o corretor de plantão por e-mail.',
    tips: [
      'Sem secret, qualquer um que descobrir a URL pode se passar pelo ConvoFlow. Use secret sempre que o destino aceitar.',
      'URL que responde erro é tentada de novo por um tempo; URL errada só acumula tentativa.',
      'Isto é saída de dados. Receber mensagem do WhatsApp é a outra ponta, em Instâncias e APIs.',
      'Só o Gestor e o Gerente cadastram, alteram e veem os webhooks e as entregas. Para o Atendente a lista aparece vazia e salvar não funciona: um webhook recebe as mensagens da Loja inteira, inclusive as que o atendente não enxerga.',
    ],
    category: 'tela',
    area: 'Configuração',
  },
  'page:notifications': {
    title: 'Notificações',
    whatItDoes:
      'É a lista completa dos avisos, não só os últimos que aparecem no sino. Serve para recuperar o que passou enquanto você estava em outra coisa.',
    howToConfigure: [
      'Clique no aviso para ir direto ao que o originou.',
      'Use "Marcar todas como lidas" quando a lista virar ruído.',
      'Para receber menos, ajuste os tipos em Configurações › Notificações.',
    ],
    example:
      'Você volta do almoço com 12 avisos, marca todos como lidos e vai direto às Conversas, que é onde o cliente está esperando.',
    tips: [
      'Os avisos são seus: marcar como lido não muda nada para o resto do time.',
      'Aviso lido não resolve o atendimento: a conversa sem resposta continua na tela de Conversas.',
      '"Conversa transferida para você" com a frase "não respondeu em X min de funcionamento" é a regra de tempo sem resposta da Loja agindo: o cliente já está esperando. "Conversa sem resposta precisa de você" chega só ao Gestor e ao Gerente, quando a regra bateu no máximo de transferências ou não tem mais para quem transferir, uma vez só, até alguém responder.',
    ],
    category: 'tela',
    area: 'Configuração',
  },

  // ---------------------------------------------------------- Telas: Equipe
  'page:team': {
    // 'gestor', nao 'gerente': desde 2026-08-18 a rota /dashboard/team tambem
    // abre para o Gestor, que administra a equipe da propria Loja.
    minRole: 'gestor',
    title: 'Equipe',
    whatItDoes:
      'É onde a Conta ganha Lojas e as Lojas ganham gente. Como Gerente, você cria a Loja aqui e convida quem vai trabalhar nela; como Gestor, você convida os Atendentes da sua Loja. ' +
      (PUBLIC_SIGNUP_ENABLED
        ? 'Convidar por aqui é o jeito de alguém entrar na SUA Conta: o cadastro pelo site sempre cria uma Conta nova, separada da sua.'
        : 'Convidar por aqui é o único jeito de alguém entrar no ConvoFlow: não existe cadastro público.'),
    howToConfigure: [
      'Como Gerente, crie a Loja em "Nova Loja" antes de convidar: Gestor e Atendente sempre pertencem a uma.',
      'Confira o contador ao lado do botão (por exemplo, 2 de 5 lojas): é quanto do seu plano já foi usado.',
      'Use "Abrir" na lista de Lojas para colocar uma delas em foco e trabalhar dentro dela.',
      'Convide a pessoa pelo e-mail dela.',
      'Escolha o cargo: ele define o que a pessoa vê e o que pode fazer.',
      'Quem sai do time deve ter o acesso removido no mesmo dia.',
    ],
    example:
      'Você abre a segunda unidade: cria a Loja "Filial Norte", convida um Gestor para ela e depois os corretores como Atendentes, cada um com o login próprio, em vez de todos usarem o mesmo acesso.',
    tips: [
      'Os cargos vão de Atendente (atende) a Gestor (administra a Loja) e Gerente (administra várias Lojas).',
      'Loja nova já nasce com acesso: ela herda o da sua Conta. Quem você convidar entra direto, sem precisar de liberação separada para cada Loja.',
      'A coluna "Loja" diz onde cada pessoa trabalha, e "Ver detalhes" no menu de Ações abre o resto: telefone, último acesso e o que o cargo dela alcança.',
      'O link do convite vale por um acesso só. Quem perdeu o prazo, ou esqueceu a senha, resolve sozinho pelo "Esqueci minha senha" da tela de login. Você também pode disparar pelo "Redefinir senha" no menu de Ações.',
      'O plano Gerente inclui 5 Lojas. Quando elas acabam, "Nova Loja" fica cinza e o motivo aparece ao passar o mouse. Lojas adicionais são contratadas em Configurações › Assinatura.',
      'Cada Loja aceita no máximo 1 Gestor e até 5 Atendentes.',
      'Com o rodízio de conversas ligado (Configurações › Escala/Transferência), quem entra na Loja recebe a própria fatia sozinho e quem sai é removido dela: as fatias se refazem em divisão igual, preservando quem estava em 0 %. Quem sai FICA com as conversas que já tinha; use a pílula "Responsável indisponível" em Conversas para movê-las.',
      'Como Gerente esta tela mostra as Lojas da sua Conta e as pessoas delas; como Gestor, mostra as pessoas da sua Loja e o convite já entra nela. Você não escolhe Loja, porque só tem a sua.',
      'Login compartilhado quebra relatório por pessoa e apaga o histórico de quem atendeu o quê.',
      'Suspender corta o acesso na hora: a pessoa não consegue mais entrar (na tela de login ela vê "Acesso suspenso", com o pedido de falar com quem administra a equipe), e uma tela que ela deixou aberta para de mostrar conversas e de enviar mensagens. Quem está abaixo dela (os Atendentes de um Gestor suspenso) é suspenso junto. "Reativar" devolve tudo como era, mas só para a pessoa escolhida: quem foi suspenso junto precisa ser reativado um por um.',
    ],
    category: 'tela',
    area: 'Equipe',
  },
  'page:store-comparison': {
    minRole: 'gerente',
    title: 'Comparar Lojas',
    whatItDoes:
      'Coloca as Lojas da sua Conta na mesma tabela para você achar a que está fora da curva. É a tela de quem responde por mais de uma operação e precisa decidir onde entrar primeiro.',
    howToConfigure: [
      'Leia a coluna que importa no seu momento: contatos (entrada), conversas (atendimento) ou mensagens (volume).',
      'Procure a loja com muitos contatos e poucas conversas: é onde tem lead entrando e ninguém atendendo.',
      'Entre nessa loja pelo seletor de Conta do topo para investigar o caso.',
    ],
    example:
      'Duas lojas com 300 contatos no mês: a primeira teve 280 conversas e a segunda 90. O problema da segunda é atendimento, não geração de lead.',
    tips: [
      'Muitas mensagens com poucas conversas costuma ser campanha disparando sem ninguém responder as respostas.',
      'A tela é do Gerente. Gestor e Atendente enxergam apenas a própria Loja.',
    ],
    category: 'tela',
    area: 'Equipe',
  },

  // ----------------------------------------------------------- Telas: Admin
  'page:admin': {
    minRole: 'superadmin',
    title: 'Administração',
    whatItDoes:
      'É a visão global do ConvoFlow: todas as Contas, quem está pagando e quem está liberado na mão. É o único lugar onde se abre acesso sem passar pelo pagamento.',
    howToConfigure: [
      'Ache a Conta pela busca.',
      'Confira a situação de acesso antes de mexer: assinatura paga e liberação manual são coisas diferentes.',
      'Para liberar sem pagamento, use a liberação manual. Ela fica registrada com data e autor.',
    ],
    example:
      'O cliente fecha contrato na sexta e o pagamento só cai na terça. Você libera manualmente para ele começar a usar e revoga se o pagamento não vier.',
    tips: [
      'Liberação manual é auditada: fica gravado quem liberou e quando.',
      'Superadmin não abre Conversas, Contatos, Funil, Chatbots, Campanhas, Follow-ups, Automação nem Instâncias de NENHUMA Conta, nem escolhendo a Conta no seletor do topo: essas telas mostram "Exclusivo para lojas". É privacidade do dado do cliente, de propósito.',
      'Quando um cliente pedir ajuda numa dessas telas, você apoia por três lugares: a Ajuda (você lê toda a documentação, inclusive das telas que não abre), o Dashboard da Conta escolhida no seletor (só números, sem conversa) e a Administração (acesso liberado, cargo certo, usuário ativo). O que é dado operacional, só quem é da Loja vê; peça a ela um print.',
      'Revogar acesso fecha o sistema na hora para todo o time daquela Conta, o Gerente incluído. Ele não fica de fora do bloqueio: vê a tela de "Acesso bloqueado" com o botão de assinar, e resolve sozinho pelo cartão se quiser.',
      'O bloqueio não alcança o superadmin. Você continua entrando em qualquer Conta, inclusive nas que acabou de revogar.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-users': {
    minRole: 'superadmin',
    title: 'Gestão de Usuários',
    whatItDoes:
      'É a lista de todo mundo no sistema, de todas as Contas, não só do seu time. Serve para achar um usuário quando você só tem o e-mail e não sabe de qual Loja ele é.',
    howToConfigure: [
      'Busque pelo e-mail ou pelo nome.',
      'Confira o cargo e a Conta a que a pessoa pertence antes de mudar qualquer coisa.',
      'Para convidar alguém, use o convite indicando o cargo e a Conta.',
    ],
    example:
      'Chega um "não consigo entrar". Você busca o e-mail e vê que a Conta da pessoa está com acesso vencido: o problema é cobrança, não senha.',
    tips: [
      'Cargo errado é a causa mais comum de "essa tela não abre para mim". Confira aqui antes de investigar permissão.',
      PUBLIC_SIGNUP_ENABLED
        ? 'Há duas portas de entrada: o convite, feito aqui, e o cadastro pelo site, que cria uma Conta nova com um Gerente. Quem entra pelo site aparece também em Administração › Cadastros.'
        : 'Hoje o convite é a única porta de entrada. O cadastro pelo site está pronto, mas desligado: a aba Administração › Cadastros mostra a chave.',
      'Mudar o cargo de alguém muda o que ela vê na hora. Avise a pessoa antes.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-maintenance': {
    minRole: 'superadmin',
    title: 'Modo de manutenção',
    whatItDoes:
      'Fecha o ConvoFlow inteiro de uma vez (todas as Contas, todas as Lojas, todos os cargos) e mostra a eles uma tela com o motivo que você escreveu e a hora em que o sistema volta. Superadmins continuam entrando normalmente: é assim que você confere o conserto antes de destrancar a porta para os outros.',
    howToConfigure: [
      'Escreva o motivo pensando em quem vai ler: é o cliente que lê esse texto, na tela de bloqueio e também na tela de login.',
      'Preencha a "Previsão de retorno". Esse horário não é enfeite: é a hora em que o sistema abre sozinho.',
      'Para parar tudo agora, deixe o "Início" vazio e clique em "Ligar agora". Para marcar de madrugada, preencha o "Início" e clique em "Agendar".',
      'Confirme lendo o aviso até o fim: ao ligar agora, todo mundo cai na tela de manutenção em até um minuto.',
      'Enquanto estiver ligada, uma faixa âmbar fica no topo de todas as suas telas. É por ela que você desliga, com um clique em "Desligar".',
    ],
    example:
      'Você vai trocar uma tabela grande às 3h. Marca início 03:00 e previsão de retorno 04:00. Ninguém é bloqueado até as 3h; às 4h o sistema abre sozinho, mesmo que você tenha dormido.',
    tips: [
      'Sem previsão de retorno, a manutenção fica ligada até alguém desligar na mão. É a única forma de esquecer clientes trancados durante a noite. Preencha o horário.',
      'Se a manutenção passar do horário marcado, os clientes voltam no meio dela. Estique a janela ANTES de o horário chegar: a faixa no topo mostra quanto falta justamente para isso.',
      'Agendar não bloqueia ninguém na hora. Até a janela abrir, todo mundo trabalha normalmente.',
      'O bloqueio é do sistema inteiro. Não existe manutenção de uma Conta só; para isso, use a revogação de acesso em Administração.',
      'O motivo aparece para quem ainda nem entrou, na tela de login. Não escreva nada ali que você não publicaria.',
      'A trava falha ABERTA de propósito: se o banco não responder, o sistema abre em vez de trancar. Uma soluçada nunca deixa a base de clientes do lado de fora.',
      'Se a tela quebrar com a manutenção ligada, dá para desligar por SQL. O comando está em docs/RUNBOOK_modo_manutencao.md.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-usage-limits': {
    minRole: 'superadmin',
    title: 'Limites de uso por nível',
    whatItDoes:
      'Define o teto de uso de cada nível da hierarquia: quantas instâncias, contatos ou disparos cada cargo pode ter. É prevenção: evita que uma Conta consuma a estrutura das outras.',
    howToConfigure: [
      'Escolha o nível da hierarquia que quer limitar.',
      'Preencha o limite. Campo vazio significa sem limite, não zero.',
      'Salve e confira com uma Conta real antes de considerar a regra aplicada.',
    ],
    example:
      'Gestor limitado a 2 instâncias de WhatsApp e Gerente a 10: a loja não liga números novos sem falar com você, e a agência ainda consegue atender o grupo dela.',
    tips: [
      'Vazio é ilimitado: apagar o campo libera em vez de bloquear. É o erro mais comum nesta tela.',
      'Para o usuário, limite atingido aparece como erro na hora de criar. Avise o time antes de reduzir um limite.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  // As quatro abas de /dashboard/admin. 'page:admin-users' já é a rota
  // /dashboard/admin/users (Gestão de Usuários), por isso a aba Usuários leva
  // o sufixo -tab; as outras seguem 'page:admin-<aba>'.
  'page:admin-users-tab': {
    minRole: 'superadmin',
    title: 'Administração › Usuários',
    whatItDoes:
      'É a lista plana de todas as pessoas com login no ConvoFlow, uma por linha, com cargo, Conta e o selo de acesso da Conta dela: "Pago", "Em teste até" a data, "Pagamento pendente", "Manual (Liberado)" ou "Bloqueado". É onde você libera ou revoga acesso na mão, cria um usuário sem passar por convite e exclui quem não deve mais entrar.',
    howToConfigure: [
      'Busque pelo nome ou e-mail; a lista filtra enquanto você digita.',
      'Leia a coluna Plano / Acesso antes de qualquer ação. "Pago" é assinatura ativa; "Em teste até" é o teste grátis de 7 dias, já com cartão cadastrado; "Pagamento pendente" é o cartão recusado com o Stripe ainda tentando (o sistema segue aberto); os três liberam a Conta. Um "cancela em" embaixo do selo é cancelamento agendado. "Manual (Liberado)" é liberação sua, com a data ao passar o mouse; "Bloqueado" é sem acesso. Numa Loja o selo é o da Conta acima, e a lista diz de onde ele vem. A Loja não decide nada sozinha.',
      'Para abrir o sistema sem pagamento, clique em "Liberar Manualmente" na linha da pessoa: a Conta inteira abre, para todo o time, e fica registrado quem liberou e quando. "Revogar Acesso" fecha na hora para todos, inclusive o Gerente.',
      'Para criar alguém, use "Novo Usuário": nome, e-mail, cargo e a Loja (Gestor e Atendente) ou o nome da Conta nova (Gerente: a Conta nasce junto). A pessoa recebe o convite por e-mail e define a própria senha.',
      'Na coluna Ações, o olho abre "Detalhes do Usuário", o lápis abre "Editar Usuário" (nome, telefone, cargo) e a lixeira abre "Excluir Usuário". Excluir tira o login e some com a pessoa das listas; o histórico de atendimento dela fica. Se ela tentar entrar, vê "Acesso suspenso", o mesmo aviso de quem foi suspenso. Não existe botão para desfazer.',
    ],
    example:
      'Chega um "não consigo entrar". Você busca o e-mail e vê "Bloqueado" na Conta: é cobrança, não senha. O contrato já foi assinado, então "Liberar Manualmente" abre na hora, e você revoga se o pagamento não vier.',
    tips: [
      'Esta aba e a tela "Gestão de Usuários" (Admin › Usuários no menu lateral) mostram as mesmas pessoas de dois jeitos: aqui, a lista plana com o selo de acesso e os botões de liberar, editar e excluir; lá, a hierarquia Superadmin → Conta → Loja, com "Convidar usuário". Para saber de quem é uma Loja, vá lá; para liberar ou excluir, é aqui.',
      'Excluir é o último recurso. Quem só saiu do time deve ser suspenso pelo Gestor ou Gerente em Equipe. Assim o rodízio se refaz e as conversas dela aparecem na pílula "Responsável indisponível".',
      'Cargo Superadmin vê tudo, inclusive esta aba. Dê a alguém só quando essa pessoa opera a plataforma.',
      'Na sua própria linha, o lápis salva nome e telefone, mas não troca o seu cargo, o seu status nem a sua Loja: o sistema recusa, para ninguém mudar o próprio acesso. Se precisar mudar o seu, peça a outro Superadmin.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-billing': {
    minRole: 'superadmin',
    title: 'Administração › Faturamento',
    whatItDoes:
      'É o dinheiro da plataforma, de duas fontes. As Contas dizem quem paga, quem está no teste grátis e até quando, quem está com pagamento pendente e quem agendou o cancelamento — é o mesmo dado que libera ou tranca o sistema. O Stripe, consultado na hora, diz quanto entra por mês (com lojas extras e cupons), as próximas cobranças, quanto foi recebido em cada mês e quais pagamentos falharam. É também onde os cupons de desconto são criados.',
    howToConfigure: [
      'Leia a primeira fileira, "Pelas Contas": Contas pagantes, Em teste (com a data em que o próximo teste termina), Pagamento pendente e Cancelamento agendado. Na aba "Contas", cada cartão vira uma lista com o nome da Conta e a data que importa.',
      'Leia a segunda fileira, "No Stripe, ao vivo": Receita mensal recorrente (já com lojas extras e o desconto dos cupons em vigor), Próximas cobranças, Recebido no mês e Pagamentos que falharam nos últimos 90 dias. Clique em "Atualizar" para consultar o Stripe de novo; a aba "Stripe" mostra as listas completas.',
      'Se aparecer o bloco "Fora da conta atual do Stripe", aquelas Contas assinaram na conta antiga do Stripe. Nada do que acontece lá chega ao ConvoFlow, então elas ficam fora de todos os números e de todas as listas até migrarem para a conta nova.',
      'Em "Cupons", clique em "Novo Cupom": código (é o que o cliente digita no checkout), tipo (percentual ou valor fixo), duração (uma vez, alguns meses ou para sempre), limite de usos e validade. O cupom nasce no Stripe e já vale no Checkout na hora.',
      'Para tirar um cupom de circulação, use o ícone de arquivar na linha dele e confirme. Arquivar NÃO pode ser desfeito: o código deixa de ser aceito no mesmo instante e não volta a existir; quem já assinou com ele continua com o desconto. Se ainda tem dúvida, deixe o cupom expirar pela data em vez de arquivar.',
      'Em "Conexão", confira se o Stripe está conectado, se os dois preços do checkout (Plano da Conta e Loja extra) existem na conta conectada e se o webhook aponta para o endereço mostrado, com os 6 eventos marcados. "Testar Conexão" só consulta de novo; não grava nada.',
    ],
    example:
      'Segunda de manhã você abre a aba: 12 Contas pagantes, 3 em teste (a primeira termina na quarta), 1 com pagamento pendente. Em "Stripe", a Conta pendente aparece em "Pagamentos que falharam" com "Cartão recusado" e "Não recuperado". Você avisa o Gerente dela antes que o Stripe desista de cobrar.',
    tips: [
      'A chave do Stripe não fica nesta tela: é a secret STRIPE_SECRET_KEY do Supabase, a mesma do checkout, do webhook e dos cupons. Trocar de conta do Stripe é trocar as secrets (a chave, o segredo do webhook e os dois preços) de uma vez.',
      '"Em teste" conta só quem está de fato no teste do Stripe. Uma Conta com data de teste antiga e sem assinatura não entra.',
      'A receita mensal conta as assinaturas ativas e as com pagamento pendente; o teste grátis fica de fora até a primeira cobrança. "Recebido no mês" soma as faturas pagas; reembolso não é descontado.',
      'Cupom errado não se corrige: não há edição. Arquive e crie outro com o código certo, e lembre que quem já usou o errado fica com o desconto errado até o fim da duração.',
      'Assinatura é da Conta, nunca da Loja. As Lojas herdam o acesso da Conta e não aparecem aqui.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-reports': {
    minRole: 'superadmin',
    title: 'Administração › Relatórios',
    whatItDoes:
      'É o tamanho da plataforma em números: quantas pessoas têm login, quantas estão ativas, quantos Superadmins, Contas e Lojas existem. Serve para saber quanto o ConvoFlow cresceu, não para acompanhar um cliente.',
    howToConfigure: [
      'Leia os dois cartões do topo: Total de Usuários (todo mundo cadastrado) e Usuários Ativos (quem pode entrar hoje).',
      'Na tabela "Resumo do Sistema", cada linha é uma contagem com a explicação ao lado: Usuários Cadastrados, Superadmins, Contas (Gerentes) e Lojas (Gestores).',
      'Para investigar uma Conta específica, saia daqui: a aba Usuários mostra a pessoa e o acesso; o seletor de Conta no topo mostra o Dashboard dela.',
    ],
    example:
      'Fim do mês: 14 Contas, 31 Lojas, 118 usuários, 97 ativos. A diferença entre cadastrados e ativos é o que ainda não aceitou convite ou foi suspenso. Vale uma olhada na aba Usuários.',
    tips: [
      'Não há exportação nem período: são contagens do momento. Para série histórica, anote mês a mês.',
      'Usuários Ativos conta quem está com a caixa "Usuário ativo" ligada; convite ainda não aceito e pessoa suspensa ficam fora. A diferença para o total é onde procurar quem travou no caminho.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  'page:admin-settings': {
    minRole: 'superadmin',
    title: 'Administração › Configurações',
    whatItDoes:
      'Quatro ajustes que valem para a plataforma inteira, um cartão cada: o modo de manutenção (que tem a própria ajuda no cartão), quem recebe por e-mail os relatos do botão "Reportar bug", qual número de WhatsApp o sistema usa para enviar relatórios e em quais Lojas o botão "Conectar Instagram" aparece.',
    howToConfigure: [
      'Manutenção vem primeiro de propósito: é a única coisa aqui que fecha o sistema para todos os clientes. O botão de ajuda dele está no próprio cartão.',
      'Em Destinatários de bug: escreva em "E-mails (um por linha)" quem deve receber os relatos que qualquer usuário manda pelo botão "Reportar bug", e clique em "Salvar". O relato chega com print, tela e Conta de quem mandou.',
      'Em "Número de envio dos relatórios", escolha a instância de WhatsApp que envia relatório quando alguém pede entrega por WhatsApp em Relatórios. Sem escolher, a entrega por WhatsApp falha e só o e-mail sai. Só aparecem instâncias de WhatsApp: a conta do Instagram não envia relatório.',
      'Em "Conectar Instagram por Loja", ligue a chave da Loja para o Gerente e o Gestor dela verem o botão "Conectar Instagram" em Instâncias e APIs. Só Lojas aparecem na lista: o Instagram nunca fica na Conta. Use a busca para achar a Loja pelo nome dela ou da Conta.',
    ],
    example:
      'Você põe suporte@ e dev@ como destinatários. Um Gestor relata "o funil não abre" pelo botão: os dois recebem o e-mail com o print e a Conta dele, sem ninguém precisar pedir detalhes.',
    tips: [
      'Sem nenhum e-mail salvo, os relatos de bug ficam gravados no banco mas ninguém é avisado. Preencha ao menos um.',
      'O número de envio é da plataforma, não do cliente: o relatório de qualquer Conta sai por ele. Use um número que não seja de atendimento.',
      'Tudo nesta aba é lido por funções de servidor no momento do uso. Salvar vale na hora, sem reiniciar nada.',
      'Enquanto o app do Instagram não tiver o acesso avançado da Meta, só contas do Instagram com papel no app conseguem entrar. Ligue a chave só em Loja de teste: um cliente de verdade veria um erro do Instagram. Desligar a chave esconde o botão e impede conexões novas, mas não mexe nas contas já conectadas.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  // A aba Administração › Cadastros (src/components/admin/SignupLeadsTab.tsx).
  'page:admin-signups': {
    minRole: 'superadmin',
    title: 'Administração › Cadastros',
    whatItDoes:
      'É a lista de quem se cadastrou pelo site, com o contato e o que aconteceu com cada cadastro. É daqui que vendas liga para quem não conseguiu terminar.',
    howToConfigure: [
      'Leia a chave no topo. "Desligado" quer dizer que os botões da página de vendas ainda levam ao login e ninguém se cadastra sozinho.',
      'Comece pelo cartão "Para vendas ligar": são os cadastros em que o convite não saiu ou o processamento parou. A pessoa não recebeu nada; ligue ou escreva para ela.',
      'Na coluna Situação, "Convite enviado" é quem recebeu o e-mail e ainda não criou a senha; "Em teste grátis" e "Assinante" já estão usando. Embaixo de "Convite não saiu" aparece o motivo.',
      'O cartão "E-mails de login barrados" conta os e-mails de login que não saíram nos últimos 7 dias (convites, redefinição de senha e cadastros), por limite por hora ou por endereço recusado. Quando esse número passa de zero com frequência, é hora de trocar o envio de e-mail: o passo-a-passo está em docs/RUNBOOK_trocar_envio_email.md.',
      'Clique no e-mail ou no telefone para abrir o contato direto.',
    ],
    example:
      'Numa manhã de campanha, seis pessoas se cadastram em meia hora e o limite de e-mails por hora estoura. Duas aparecem como "Convite não saiu", com o motivo "o envio de e-mail atingiu o limite por hora". Você liga para elas e, à tarde, cria o acesso em Usuários › "Novo Usuário", como Gerente de uma Conta nova.',
    tips: [
      'A limpeza é automática, de hora em hora: convite não aceito em 48 horas e Conta que confirmou mas não assinou em 30 dias são removidos. A ficha continua aqui, com a situação "Removido".',
      'A limpeza nunca remove Conta que já teve assinatura, cliente no Stripe ou liberação manual. Para segurar uma Conta de cadastro que ainda não pagou, libere-a manualmente na aba Usuários.',
      'Depois do envio, o formulário diz sempre a mesma coisa, até para e-mail que já tem conta. É de propósito: ele não pode revelar quem é cliente. O que aconteceu de fato com cada cadastro só aparece aqui.',
      'O aceite dos Termos de Uso e da Política de Privacidade fica gravado com a versão e a hora. A coluna só aparece em telas largas.',
    ],
    category: 'tela',
    area: 'Admin',
  },
  // O formulário público /cadastro (src/pages/Cadastro.tsx). Quem lê o painel é
  // o visitante; na página de Ajuda, só o superadmin (é documentação da porta).
  'page:cadastro': {
    minRole: 'superadmin',
    title: 'Cadastro pelo site',
    whatItDoes: `É onde uma empresa cria a própria Conta no ConvoFlow, sem convite, e começa o teste grátis de ${TRIAL_DAYS} dias. Você preenche seus dados aqui; a senha e o cartão vêm depois, em telas próprias.`,
    howToConfigure: [
      'Preencha nome, sobrenome, e-mail, o nome da empresa e um telefone com DDD. O nome da empresa vira o nome da sua Conta.',
      'Marque a caixa dos Termos de Uso e da Política de Privacidade. Os links abrem numa aba nova; guardamos a data do seu aceite e a versão que você leu.',
      'Espere a verificação "não sou um robô" terminar e clique em "Criar minha conta".',
      'Abra o e-mail do ConvoFlow e clique no link para criar sua senha. Você entra no sistema como Gerente da sua Conta.',
      'Na tela seguinte, clique em "Começar teste grátis" e cadastre o cartão no Stripe. Nada é cobrado hoje: a cobrança só acontece no fim do teste.',
    ],
    example: `A Ana, dona de uma imobiliária, se cadastra às 10h com o e-mail da empresa. Às 10h02 cria a senha pelo link, cadastra o cartão e entra. A primeira cobrança só acontece ${TRIAL_DAYS} dias depois, se ela não cancelar.`,
    tips: [
      'O e-mail não chegou em alguns minutos? Confira o spam e a aba Promoções.',
      'Já tem conta? Não se cadastre de novo: entre pelo login ou use "Esqueci minha senha".',
      'O link do e-mail vale por um acesso. Se ele não abrir, peça outro na própria tela de criar senha.',
      'Cada cadastro cria uma Conta nova, e o teste grátis é da Conta: vale na primeira assinatura dela.',
      'As regras do teste estão na cláusula 4.3 dos Termos de Uso: o cartão é cadastrado ao começar, nada é cobrado se você cancelar antes do fim, a mensalidade é cobrada no dia em que o teste termina, e é um teste por Conta.',
      ...(PUBLIC_SIGNUP_ENABLED
        ? []
        : [
            'Hoje esta tela ainda não está no ar: os botões da página de vendas levam ao login e /cadastro redireciona para ele. A chave está descrita em docs/RUNBOOK_cadastro_publico.md.',
          ]),
    ],
    category: 'tela',
    area: 'Admin',
  },
};

/** Retorna o conteúdo de ajuda de uma chave, ou null se não houver. */
export function getFeatureHelp(key: string | null | undefined): FeatureHelpEntry | null {
  if (!key) return null;
  return FEATURE_HELP[key] ?? null;
}

/**
 * Achata o texto para busca: sem acento, sem caixa, sem espaço nas pontas.
 * O conteúdo é todo em pt-BR, então quem digita "automacao" tem de achar
 * "Automação".
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Motor de busca da ajuda: os pedaços de texto casam com a consulta?
 *
 * Ignora acento e caixa, e exige TODOS os termos (busca por "campanha tag" acha
 * quem fala das duas coisas). Busca vazia casa com tudo. Valores vazios ou
 * ausentes são descartados.
 *
 * É o único lugar que implementa a busca — as entradas de ajuda e os tutoriais
 * (src/lib/help/tutorials.ts) passam por aqui, cada um informando os próprios
 * campos pesquisáveis.
 */
export function matchesSearchTerms(
  parts: Array<string | null | undefined>,
  query: string,
): boolean {
  const terms = normalizeForSearch(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = normalizeForSearch(parts.filter(Boolean).join(' '));
  return terms.every((term) => haystack.includes(term));
}

/** A entrada de ajuda casa com a busca? */
export function helpEntryMatches(entry: FeatureHelpEntry, query: string): boolean {
  return matchesSearchTerms(
    [
      entry.title,
      entry.whatItDoes,
      ...entry.howToConfigure,
      entry.example,
      ...(entry.tips ?? []),
    ],
    query,
  );
}

/** Uma entrada acompanhada da própria chave. */
export interface FeatureHelpItem extends FeatureHelpEntry {
  key: string;
}

/** Entradas de uma categoria agrupadas por `area`. */
export interface FeatureHelpGroup {
  /** `area` das entradas, ou null quando elas não têm área definida. */
  area: string | null;
  entries: FeatureHelpItem[];
}

/** Todas as entradas, na ordem de declaração, já com a chave embutida. */
export function getHelpEntries(): FeatureHelpItem[] {
  return Object.entries(FEATURE_HELP).map(([key, entry]) => ({ key, ...entry }));
}

/** Todas as chaves existentes. */
export function getAllHelpKeys(): string[] {
  return Object.keys(FEATURE_HELP);
}

/**
 * Entradas de uma categoria, agrupadas por `area` e prontas para renderizar.
 *
 * A ordem dos grupos e das entradas dentro de cada grupo segue a ordem de
 * declaração em FEATURE_HELP — para as telas isso significa a ordem do menu
 * lateral. Quem consome não precisa interpretar prefixo de chave.
 */
export function getHelpByCategory(category: HelpCategory): FeatureHelpGroup[] {
  const groups: FeatureHelpGroup[] = [];
  const byArea = new Map<string | null, FeatureHelpGroup>();

  for (const item of getHelpEntries()) {
    if (item.category !== category) continue;
    const area = item.area ?? null;
    let group = byArea.get(area);
    if (!group) {
      group = { area, entries: [] };
      byArea.set(area, group);
      groups.push(group);
    }
    group.entries.push(item);
  }

  return groups;
}
