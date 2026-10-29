/**
 * Tutoriais passo-a-passo — o caminho guiado do produto.
 *
 * A diferença em relação a src/lib/help/featureHelp.ts: a ajuda contextual
 * explica UMA tela; um tutorial cumpre um OBJETIVO, e objetivo atravessa várias
 * telas. Por isso cada passo pode apontar para a rota (`screen`) e para a
 * documentação daquele ponto (`helpKey`).
 *
 * Regra de conteúdo: todo passo é uma AÇÃO que a pessoa executa. Se um passo não
 * tem verbo, ele é documentação — o lugar dele é numa entrada do featureHelp.
 *
 * O conteúdo aqui foi conferido contra o código (labels de botão, campos de
 * formulário e ordem real do fluxo). Ao mexer em qualquer um desses fluxos,
 * atualize o tutorial correspondente — ver CLAUDE.md.
 *
 * Acesso: `moduleName` e `minRole` seguem exatamente o mesmo padrão declarado
 * nas entradas de tela do featureHelp.ts e são consumidos pelo MESMO
 * useHelpVisibility. Não existe segunda fonte de permissão.
 */
import type { Capability, UserRole } from '@/types/userHierarchy';
import { matchesSearchTerms } from './featureHelp';
import { PUBLIC_SIGNUP_ENABLED } from '@/lib/signup/release';
import { COMO_CANCELAR_NO_TESTE, TRIAL_DAYS } from '@/lib/billing/trialOffer';
import { API_ADDON_RELEASED } from '@/lib/api/release';

export interface TutorialStep {
  title: string;
  body: string;
  /** Rota do dashboard onde este passo acontece (renderizada como link). */
  screen?: string;
  /** Entrada de documentação relacionada, em FEATURE_HELP. */
  helpKey?: string;
  /** Ressalva ou pegadinha deste passo específico. */
  note?: string;
}

export interface Tutorial {
  id: string;
  title: string;
  /** Uma frase: o que estará pronto no fim. */
  goal: string;
  /** Para quem o tutorial foi escrito, em pt-BR simples. */
  forWhom: string;
  steps: TutorialStep[];
  /** Cargo mínimo, mesma escala do RoleGuard. */
  minRole?: UserRole;
  /** Módulo exigido, mesmo nome do ModuleGuard. */
  moduleName?: string;
  /** Capacidade exigida (matriz DEFAULT_CAPABILITIES). */
  capacidade?: Capability;
  /** Tutorial que vem depois deste (renderizado como link no fim dos passos). */
  nextTutorialId?: string;
}

/** Prefixo das chaves de deep link (/dashboard/help#tutorial:conectar-whatsapp). */
export const TUTORIAL_KEY_PREFIX = 'tutorial:';

/** Chave de deep link de um tutorial. */
export const tutorialKey = (id: string) => `${TUTORIAL_KEY_PREFIX}${id}`;

/** O tutorial do cadastro pelo site (só aparece com a chave ligada). */
export const TUTORIAL_TESTE_GRATIS_ID = 'teste-gratis';

/** O tutorial da chave da API (só aparece com a API liberada no site). */
export const TUTORIAL_CHAVE_API_ID = 'chave-api';

/**
 * Ordem = ordem recomendada de leitura, não alfabética. A preparação para a
 * API Oficial vem primeiro porque é decisão (qual número) antes de ser ação;
 * conectar vem em seguida porque nada funciona antes disso.
 */
export const ALL_TUTORIALS: Tutorial[] = [
  // ------------------------------------------------------------------ 1
  {
    id: 'antes-de-conectar',
    title: 'Antes de conectar seu WhatsApp',
    goal:
      'No fim, você terá escolhido o número certo e separado tudo o que a Meta pede, para a conexão não travar no meio.',
    forWhom:
      'Gerente ou Gestor, junto com quem decide pela empresa, porque o primeiro passo é uma decisão, não um clique. Atendente não conecta número.',
    moduleName: 'whatsapp-numbers',
    minRole: 'gestor',
    nextTutorialId: 'conectar-whatsapp',
    steps: [
      {
        title: 'Decida se este é mesmo o número certo',
        body:
          'Ao entrar na API Oficial, o número deixa de funcionar no aplicativo do WhatsApp do celular: ele passa a atender só pelo ConvoFlow. Por isso o número que a empresa inteira usa num celular costuma ser a escolha errada: quem usa o aplicativo perde o acesso no mesmo dia. O certo é um número comercial dedicado, que só vai atender por aqui. E as conversas antigas não vêm junto: o histórico do aplicativo fica no aplicativo.',
        note:
          'Número que já está em uso no WhatsApp do celular precisa ser removido do aplicativo antes: a Meta recusa número que ainda está registrado lá. Um chip novo, que nunca teve WhatsApp, é o caminho mais simples.',
      },
      {
        title: 'Combine quem vai estar presente na hora da conexão',
        body:
          'A janela da Meta pede duas coisas ao mesmo tempo. O login do Facebook de quem administra a empresa na Meta: é com ele que a Meta confirma quem está autorizando; se essa pessoa não é quem usa o ConvoFlow, ela precisa estar junto nesse momento, ou fazer a conexão ela mesma. E o celular com o chip do número, na mão de alguém: a Meta manda um código por SMS ou ligação para ele, e sem o código a conexão não termina.',
      },
      {
        title: 'Tenha, ou crie na hora, o portfólio empresarial da Meta',
        body:
          'Portfólio empresarial é o cadastro da sua empresa na Meta, o antigo Gerenciador de Negócios. É nele que ficam a conta do WhatsApp Business, o número e o cartão. Se a empresa já anuncia no Facebook ou no Instagram, provavelmente já tem um: use esse. Se não tem, dá para criar durante a própria conexão, com o login do passo anterior.',
      },
      {
        title: 'Separe os dados da empresa',
        body:
          'Nome da empresa como está no CNPJ, endereço, site (se houver) e um email de contato. Nem tudo é pedido na hora de conectar, mas é isso que a Meta pede quando quer confirmar que a empresa existe, e é mais rápido ter à mão do que procurar com a janela aberta.',
      },
      {
        title: 'Escolha o nome que os clientes vão ver',
        body:
          'É o nome que identifica sua empresa no WhatsApp. A Meta revisa esse nome, e ele precisa ser reconhecível como a empresa: nome de pessoa ou palavra genérica (vendas, atendimento, suporte) tende a ser recusado. Use o nome pelo qual seus clientes já conhecem o negócio, escrito como na sua marca.',
      },
      {
        title: 'Cadastre um cartão no portfólio empresarial da Meta',
        body:
          'Quem cobra as conversas é a Meta, e ela cobra você, não o ConvoFlow: o cartão fica no seu portfólio empresarial, não aqui. Sem forma de pagamento válida lá, as mensagens param de sair mesmo com o número "Conectado" no ConvoFlow. Se o portfólio já existe, cadastre o cartão agora; se vai criá-lo na conexão, cadastre logo depois, antes do primeiro disparo. Os valores atuais estão na página da Meta: developers.facebook.com/docs/whatsapp/pricing.',
      },
      {
        title: 'Planeje a primeira semana com o teto de aquecimento',
        body:
          'Número recém-conectado tem um teto diário de envio nos primeiros sete dias. É proteção contra bloqueio pela Meta, não limite do plano: 50 mensagens por dia nos dois primeiros dias, 250 até o quarto, 1.000 até o sétimo; do oitavo dia em diante o teto some. Conta tudo o que sai pelo número no dia, inclusive respostas do time, e o dia vira à meia noite de Brasília. Se a ideia é disparar campanha, não compre nem importe uma lista grande para a primeira semana: comece pelos contatos que já conhecem a empresa e cresça junto com o teto.',
      },
      {
        title: 'Confira a lista e vá para a conexão',
        body:
          'Número certo e fora do aplicativo; quem tem o login do Facebook e o celular, presentes; portfólio empresarial, ou a decisão de criar na hora; dados da empresa; nome escolhido; cartão cadastrado; primeira semana planejada. Com isso em mãos, a conexão é um clique em "Conectar com a Meta", em Números de WhatsApp. O passo-a-passo é o próximo tutorial, "Conectar número pela API Oficial".',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
    ],
  },

  // ------------------------------------------------------------------ 2
  {
    id: 'conectar-whatsapp',
    title: 'Conectar número pela API Oficial',
    goal:
      'No fim, seu número estará conectado pela API Oficial da Meta, recebendo e enviando mensagens dentro do ConvoFlow.',
    forWhom:
      'Gestor da Loja, que cuida da configuração dela (o Gerente faz o mesmo, numa Loja escolhida no topo). Atendente não conecta número. Quer conectar por QR Code? Veja "Conectar número pelo QR Code" ou "Conectar número no seu servidor (WAHA)".',
    moduleName: 'whatsapp-numbers',
    minRole: 'gestor',
    steps: [
      {
        title: 'Confira o que o tutorial anterior pediu',
        body:
          'Número certo, já fora do aplicativo do WhatsApp; o login do Facebook de quem administra a empresa na Meta; o celular com o chip, para receber o código; e um cartão no portfólio empresarial da Meta, porque é ela quem cobra as conversas. Sem forma de pagamento válida lá, as mensagens param de sair mesmo com o número "Conectado" aqui. Se algum item falta, volte a "Antes de conectar seu WhatsApp".',
      },
      {
        title: 'Abra Números de WhatsApp e clique em "Conectar número"',
        body:
          'Cada linha da lista é um número de WhatsApp ligado ao ConvoFlow. Sem nenhum conectado, não existe conversa, chatbot nem campanha. Na primeira vez, o botão se chama "Conectar o primeiro número". O número fica na Loja aberta no seletor do topo, e a janela diz qual. Gerente com a Conta aberta: a janela pede a Loja primeiro; escolha a Loja, ela abre e a janela volta sozinha.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
      {
        title: 'Escolha "API oficial da Meta" e clique em "Continuar"',
        body:
          'São duas opções. Escolha "API oficial da Meta": é a mais estável e a única que dispara campanha dentro das regras da Meta. "Conectar pelo QR Code" tem tutorial próprio.',
      },
      {
        title: 'Dê um nome ao número e clique em "Conectar com a Meta"',
        body:
          'O nome é só o rótulo que aparece nas telas (ex.: "WhatsApp Vendas"). Se deixar vazio, o ConvoFlow usa o nome verificado que a Meta devolver para o número. O botão abre uma janela da própria Meta: é ela que faz a conexão, e você não copia código nem chave nenhuma. O número nasce na Loja que a janela mostra no alto, logo abaixo do título.',
        note:
          'Se o botão não aparecer, a conexão automática com a Meta ainda não está ligada: o "Avançado" já vem aberto com os campos manuais, e o caminho é o do último passo. Para RECONECTAR um número que já está na lista (trocar o app da Meta, renovar a conexão), o caminho é este mesmo botão: escolha o mesmo número na janela da Meta e deixe o nome em branco. O ConvoFlow reconhece o número e atualiza no lugar, sem mexer no histórico.',
      },
      {
        title: 'Siga a janela da Meta até o fim',
        body:
          'Entre com o login do Facebook, escolha (ou crie) o portfólio empresarial e a conta do WhatsApp Business, digite o número, receba o código por SMS ou ligação e confirme. As telas são da Meta e mudam de tempos em tempos; o que não muda é a ordem: empresa, conta, número, código.',
        note:
          'Fechar a janela no meio cancela tudo: o ConvoFlow avisa "Cadastro cancelado" e nada é gravado. É só clicar de novo em "Conectar com a Meta".',
      },
      {
        title: 'Confira o que volta para o ConvoFlow',
        body:
          'Quando a Meta termina, aparece o aviso "Conta Meta conectada", a janela fecha e o número entra na lista com o selo "API Oficial" e o estado "Conectado". Nos bastidores o ConvoFlow já inscreveu o número na API e o registrou para envio. Numa reconexão o aviso é "Número reconectado": o número continua o mesmo na lista, com o histórico no lugar, e o registro do número não é refeito.',
        note:
          'Se aparecer "Este número já está conectado em outra Conta ou Loja que você não administra", nada foi alterado e a Meta nem chegou a ser chamada: o número existe no ConvoFlow em uma Conta ou Loja fora do seu alcance. Se ele é seu, escreva para contato@convoflow.com.br.',
      },
      {
        title: 'Se o número já tinha verificação em duas etapas, digite o PIN',
        body:
          'Nesse caso o registro automático não acontece: o número aparece "Conectado", mas não envia. Clique no ícone de chave "Registrar o número na API Oficial" na linha do número. Abre a caixa "Informe o PIN do número": digite o PIN de 6 dígitos que você já usava e clique em "Registrar número". O aviso "Número registrado" fecha o assunto. Se o registro criar um PIN novo, ele aparece numa janela "Guarde o PIN deste número", com botão de copiar: anote antes de clicar em "Já guardei o PIN", porque ele não aparece outra vez.',
      },
      {
        title: 'Faça um teste real',
        body:
          'Mande uma mensagem de outro celular para o número conectado e confirme que ela aparece em Conversas. Depois responda por ali e veja chegar. Enquanto isso não acontecer, a conexão não está completa. "Testar a conexão com a Meta", na linha do número, ajuda a achar onde parou.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
        note:
          'Se algo travou, não exclua o número para recomeçar: assim que a primeira conversa entra, a lixeira passa a recusar a exclusão, porque apagar o número apagaria o histórico. Escreva para contato@convoflow.com.br e descreva onde parou.',
      },
      {
        title: 'Só se você já tem app próprio na Meta: abra "Avançado" e preencha os campos',
        body:
          'É a exceção, para quem já mantém um app no Meta for Developers. Em vez de "Conectar com a Meta", abra "Avançado", embaixo do botão, e cole o "Código do número na Meta (Phone Number ID)", o "Código da conta do WhatsApp Business (WABA ID)" e a "Chave de acesso permanente (Access Token)" e clique em "Validar e conectar". O ConvoFlow confere os dados na Meta antes de gravar; se estiverem errados, nada é salvo e você corrige sem duplicar o número.',
        note:
          'Use a chave de um usuário do sistema da Meta (System User), de longa duração. A chave de um usuário comum vence em poucas horas e a conexão cai junto. O endereço de entrega da Meta é configurado uma vez para o ConvoFlow inteiro, por quem opera a plataforma. Não é passo seu.',
      },
    ],
  },

  // ------------------------------------------------------------------ 2a
  // QR Code pelo servidor do ConvoFlow. Conferido em 2026-10-29 contra
  // CreateInstanceModal, ProviderSelector, EvolutionApiForm, QRCodeModal e
  // evolution-provision (duas opções e "Avançado" desde o lote 6e).
  {
    id: 'conectar-evolution',
    title: 'Conectar número pelo QR Code',
    goal:
      'No fim, um número comum de WhatsApp estará conectado ao ConvoFlow lendo um QR Code, sem você configurar servidor nenhum.',
    forWhom:
      'Gestor da Loja, com o celular do número em mãos (o Gerente faz o mesmo, numa Loja escolhida no topo). Atendente não conecta número.',
    moduleName: 'whatsapp-numbers',
    minRole: 'gestor',
    steps: [
      {
        title: 'Confira se o QR Code é o caminho certo',
        body:
          'É uma conexão não oficial: o ConvoFlow entra no número como um aparelho conectado, igual ao WhatsApp Web. Não tem template nem janela de 24 horas, mas também não dispara campanha dentro das regras da Meta. Neste modo, ligações para o número são recusadas sozinhas e mensagens de grupos não entram no ConvoFlow. Para campanha, prefira a API Oficial.',
        note:
          'Usar o mesmo número no WhatsApp do celular e aqui ao mesmo tempo pode derrubar a sessão.',
      },
      {
        title: 'Abra Números de WhatsApp e clique em "Conectar número"',
        body:
          'Na primeira vez, o botão se chama "Conectar o primeiro número". O número fica na Loja aberta no seletor do topo, e a janela diz qual. Gerente com a Conta aberta: a janela pede a Loja primeiro; escolha a Loja, ela abre e a janela volta sozinha.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
      {
        title: 'Escolha "Conectar pelo QR Code" e clique em "Continuar"',
        body:
          'O servidor de WhatsApp é o do ConvoFlow e já vem configurado: você não informa endereço nem chave.',
      },
      {
        title: 'Preencha "Nome do número"',
        body:
          'O nome é o rótulo que aparece nas telas, de 3 a 50 letras (ex.: "WhatsApp Vendas"). O resto já vem pronto: o código interno do número e a entrega das mensagens ficam em "Avançado", e você não precisa abrir.',
      },
      {
        title: 'Clique em "Criar e abrir QR Code"',
        body:
          'Aparece "Número criado" e a janela do QR Code abre sozinha. As mensagens do número entram no ConvoFlow assim que ele conectar.',
        note:
          'Se aparecer que já existe um número com esse código interno, abra "Avançado" e clique em "Gerar". Se o aviso disser para falar com o suporte, o número foi criado mas o endereço de entrega não: escreva para contato@convoflow.com.br.',
      },
      {
        title: 'Leia o QR Code com o celular do número',
        body:
          'No celular, abra o WhatsApp e vá em Configurações › Aparelhos conectados › Conectar um aparelho. Aponte a câmera para o QR Code. Venceu antes de você ler? Clique em "Atualizar conexão". Quando conecta, aparece "Conectado com sucesso!" e a janela fecha sozinha.',
      },
      {
        title: 'Faça um teste real',
        body:
          'De outro celular, mande uma mensagem para o número e confira que ela aparece em Conversas. Responda por ali e veja chegar.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
      {
        title: 'Se o número cair, reconecte pelo QR Code',
        body:
          'Número desconectado mostra o ícone "Conectar pelo QR Code" na linha dele. Clique, leia o QR Code de novo com o mesmo celular e pronto: as conversas continuam no lugar. Não exclua o número para recomeçar.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
    ],
  },

  // ------------------------------------------------------------------ 2a'
  // QR Code num servidor WAHA do cliente. Conferido em 2026-10-27 contra
  // WahaApiForm, QRCodeModal e _shared/waha-provision.ts.
  {
    id: 'conectar-waha',
    title: 'Conectar número no seu servidor (WAHA)',
    goal:
      'No fim, um número comum de WhatsApp estará conectado ao ConvoFlow pelo seu próprio servidor WAHA, lendo um QR Code.',
    forWhom:
      'Gestor da Loja que já tem um servidor WAHA no ar (ou quem o hospeda para a empresa), com o celular do número em mãos (o Gerente faz o mesmo, numa Loja escolhida no topo). Atendente não conecta número.',
    moduleName: 'whatsapp-numbers',
    minRole: 'gestor',
    steps: [
      {
        title: 'Separe o endereço, a chave e um nome de sessão',
        body:
          'Você vai precisar do endereço público do servidor WAHA, de preferência com https, da chave dele (X-Api-Key), se ele pedir, e de um nome de sessão que só este número vai usar. Endereço de rede interna, como localhost, 10... ou 192.168..., é recusado.',
        note:
          'O nome da sessão não pode repetir em todo o ConvoFlow. Se o servidor também atende outro sistema (o n8n, por exemplo), não use "default".',
      },
      {
        title: 'Abra Números de WhatsApp e clique em "Conectar número"',
        body: 'Na primeira vez, o botão se chama "Conectar o primeiro número". O número fica na Loja aberta no seletor do topo, e a janela diz qual. Gerente com a Conta aberta: a janela pede a Loja primeiro; escolha a Loja, ela abre e a janela volta sozinha.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
      {
        title: 'Abra "Avançado", escolha "QR Code no seu servidor WAHA" e clique em "Continuar"',
        body:
          '"Avançado" fica embaixo das duas opções principais. Aqui o servidor é seu: por isso o ConvoFlow pede o endereço e a chave dele.',
      },
      {
        title: 'Preencha os dados do número e do servidor',
        body:
          'Preencha "Nome do número", "Endereço do seu servidor WAHA" (o campo vem com um endereço de exemplo: troque pelo seu), "Chave do servidor WAHA (X-Api-Key)", se o servidor exigir, e "Nome da sessão".',
      },
      {
        title: 'Clique em "Salvar número"',
        body:
          'O ConvoFlow testa se o servidor responde, cria a sessão nele com o endereço de entrega e uma senha só deste número, e guarda endereço, chave e senha no cofre. Aparece "Número WAHA criado". Se o servidor recusar a chave, não responder ou não criar a sessão, a janela diz o motivo e nada é salvo.',
      },
      {
        title: 'Clique em "Conectar pelo QR Code", na linha do número',
        body:
          'Aqui o QR Code não abre sozinho. Se o servidor ainda estiver iniciando a sessão, a janela mostra "Preparando o QR Code..." e tenta de novo sozinha. Leia com o celular do número: WhatsApp › Configurações › Aparelhos conectados › Conectar um aparelho. Ao conectar, aparece "Conectado com sucesso!".',
        note: 'No WAHA não existe código de pareamento: só o QR Code.',
      },
      {
        title: 'Faça um teste real',
        body:
          'De outro celular, mande uma mensagem para o número e confira que ela aparece em Conversas. Responda por ali e veja chegar.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
      {
        title: 'Trocou a chave do servidor? Use "Substituir chave"',
        body:
          'Abra os detalhes do número (o ícone de informação na linha dele), clique em "Substituir chave", digite a chave nova e clique em "Testar e guardar". O ConvoFlow testa antes de guardar; se o servidor recusar, nada muda.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
    ],
  },

  // ------------------------------------------------------------------ 2b
  // Instagram logo depois do WhatsApp: é o segundo canal da Loja, e o mesmo
  // público (quem tem whatsapp.configure). Fatia 4b, 2026-09-25.
  {
    id: 'conectar-instagram',
    title: 'Conectar seu Instagram',
    goal:
      'No fim, a conta profissional do Instagram da Loja estará conectada, com as mensagens do direct entrando em Conversas e as respostas saindo por lá.',
    forWhom:
      'Gerente ou Gestor, com o usuário e a senha da conta do Instagram da Loja em mãos. Atendente não conecta conta.',
    moduleName: 'whatsapp-numbers',
    minRole: 'gestor',
    steps: [
      {
        title: 'Confira se a conta do Instagram é profissional',
        body:
          'No aplicativo do Instagram, em Configurações, o tipo da conta precisa ser "Empresa" ou "Criador de conteúdo". Conta pessoal não conecta: o Instagram só libera as mensagens do direct para conta profissional. Tenha o usuário e a senha dessa conta com você, porque o Instagram vai pedir.',
      },
      {
        title: 'Escolha a Loja no seletor do topo',
        body:
          'A conta do Instagram fica sempre numa Loja, nunca na Conta, do mesmo jeito que o WhatsApp de cada Loja. Gerente: escolha no seletor a Loja dona do Instagram antes de continuar. Gestor: você já está na sua Loja.',
      },
      {
        title: 'Abra Números de WhatsApp e clique em "Conectar Instagram"',
        body:
          'O botão fica na seção "Contas do Instagram", abaixo dos números de WhatsApp. Ao clicar, o ConvoFlow leva você para a página de login do próprio Instagram.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
        note:
          'Se a seção ou o botão não aparecem, confira o seletor do topo: o Instagram só se conecta numa Loja, nunca na Conta. O Atendente também não vê o botão: quem conecta é o Gestor ou o Gerente.',
      },
      {
        title: 'Entre com a conta da Loja e autorize o ConvoFlow',
        body:
          'O Instagram pede usuário e senha mesmo que você já esteja logado no navegador. É de propósito: assim você escolhe a conta, em vez de o ConvoFlow pegar a que estiver aberta. Entre com a conta profissional da Loja e confirme as permissões de mensagens. Em seguida o Instagram devolve você para Números de WhatsApp.',
        note:
          'O pedido vale 10 minutos. Se você cancelar no Instagram ou demorar mais do que isso, nada muda no ConvoFlow: é só clicar de novo em "Conectar Instagram".',
      },
      {
        title: 'Confira o cartão da conta',
        body:
          'De volta à tela, aparece "Instagram conectado" com a data até quando a conexão vale, e a conta entra em "Contas do Instagram" com o @, o selo "Ligada" e "Válida até". A renovação é automática: você não precisa voltar aqui antes da data.',
        note:
          'Se aparecer "Esta conta do Instagram já está conectada em outra Conta ou Loja", nada foi alterado: a conta está no ConvoFlow num lugar fora do seu alcance. Se ela é sua, escreva para contato@convoflow.com.br.',
      },
      {
        title: 'Faça um teste real',
        body:
          'De outra conta do Instagram, mande uma mensagem no direct da Loja. Em Conversas, abra o lado "Instagram" da chave no topo da lista: a conversa aparece ali. Responda por ela e veja a resposta chegar no direct.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
        note:
          'O ConvoFlow só responde dentro de 24 horas da última mensagem do cliente: é a regra do Instagram, e não existe template para reabrir a conversa.',
      },
      {
        title: 'Quando precisar, reconecte ou desligue pelo cartão',
        body:
          '"Reconectar" troca o acesso da mesma conta sem perder nada: use quando o cartão mostrar "Reconectar" ou "Vencida", e entre no Instagram com a MESMA conta do cartão (outra conta é recusada). "Desligar" para de receber as mensagens da conta sem apagar o histórico; as que chegarem enquanto ela estiver desligada não entram no ConvoFlow e não voltam depois. "Religar" volta a receber.',
        screen: '/dashboard/whatsapp-numbers',
        helpKey: 'page:whatsapp-numbers',
      },
    ],
  },

  // ------------------------------------------------------------------ 3
  {
    id: 'configurar-equipe',
    title: 'Convidar pessoas e escolher o cargo',
    goal:
      'No fim, cada pessoa da operação terá o próprio acesso, com o cargo certo e vinculada à Loja onde trabalha.',
    forWhom:
      'Gerente, que administra as Lojas da Conta, e Gestor, que monta a equipe da própria Loja (para o Gestor, os passos 2 e 3 não existem: a Loja já é a dele). O Superadmin faz o mesmo pela Administração.',
    minRole: 'gestor',
    steps: [
      {
        title: 'Decida o cargo de cada pessoa antes de convidar',
        body:
          'São quatro níveis: Atendente atende conversas dentro de uma Loja; Gestor administra uma Loja inteira; Gerente administra várias Lojas; Superadmin opera a plataforma. Como Gerente, você convida Gestor e Atendente; como Gestor, você convida Atendentes para a sua Loja.',
        helpKey: 'page:team',
      },
      {
        title: 'Só o Gerente: crie a Loja em "Nova Loja", se ela ainda não existe',
        body:
          'Gestor e Atendente sempre pertencem a uma Loja, então ela vem primeiro. Em Equipe, clique em "Nova Loja", dê o nome pelo qual o time reconhece a operação e confirme em "Criar Loja". A Loja nasce vazia, dentro da sua Conta. Como Gestor, pule este passo: a sua Loja já existe e você não cria outra.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
        note:
          'Seu plano inclui 5 Lojas, e o contador ao lado do botão mostra quantas já foram usadas. Quando acabam, "Nova Loja" fica cinza. Aí é contratar Lojas adicionais em Configurações › Assinatura.',
      },
      {
        title: 'Só o Gerente: coloque em foco a Loja onde a pessoa vai trabalhar',
        body:
          'Use "Escolher Loja", no topo da tela, ou "Abrir" na lista de Lojas, para entrar na Loja de destino. O convite já vem com a Loja em foco escolhida; com a Conta em foco, você escolhe a Loja na janela do convite. Como Gestor você não tem seletor: está sempre na sua Loja.',
        note:
          'Acabou de criar a Loja? O aviso de sucesso traz o atalho "Abrir a Loja", que já coloca ela em foco.',
      },
      {
        title: 'Abra Equipe e clique em "Convidar"',
        body:
          PUBLIC_SIGNUP_ENABLED
            ? 'A tela lista quem já tem acesso. Convidar por aqui é a forma de alguém entrar na SUA Conta: o cadastro pelo site sempre cria uma Conta nova, separada.'
            : 'A tela lista quem já tem acesso. Convidar por aqui é a única forma de alguém entrar no ConvoFlow: não existe cadastro público.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
      },
      {
        title: 'Preencha nome, sobrenome, email e o Cargo',
        body:
          'Nome, Sobrenome e Email têm asterisco: são obrigatórios. O email é o login da pessoa; o telefone é opcional. Preencha o nome de verdade: é ele que o time vê quando uma conversa é transferida. No "Cargo", o Gerente escolhe Gestor ou Atendente; o Gestor só convida Atendente, que já vem escolhido. O cartão logo abaixo lista o que o cargo pode e o que não pode fazer. Leia antes de enviar: o cargo não muda depois pela Equipe.',
        note:
          'Cada Loja tem 1 Gestor e 2 vagas de Atendente; o convite pendente já ocupa a vaga. Com a Loja cheia, o convite de Atendente não sai: cancele um convite pendente ou suspenda alguém, ou fale com o ConvoFlow (contato@convoflow.com.br) para ter mais vagas.',
      },
      {
        title: 'Escolha a Loja e clique em "Enviar convite"',
        body:
          'Para Gestor e Atendente aparece a lista "Loja", com as Lojas da sua Conta, já marcada na que está em foco (ou na única, se a Conta tem uma só). Para Atendente, cada Loja da lista mostra quantas vagas livres tem. Confira se é a certa antes de enviar: é ela que define quais conversas e contatos a pessoa vai enxergar. Enquanto falta algo, o botão fica cinza e a janela diz o quê.',
        note:
          'Como Gestor você não escolhe nada aqui: o convite entra na sua Loja, que é a única que você administra.',
      },
      {
        title: 'Confirme que a pessoa conseguiu entrar',
        body:
          'Ela recebe um email de convite com um botão e um código de 6 dígitos. Clica no botão, depois em "Continuar", e cai numa tela para criar a própria senha. Depois disso já entra no sistema. Em Equipe, a pessoa aparece com a situação "Pendente" desde o convite; quando ela cria a senha, passa a "Ativo". Login compartilhado quebra relatório por pessoa. Cada um usa o seu.',
        screen: '/dashboard/team',
        note:
          'O convite vale por 24 horas e por UM acesso: depois que o botão ou o código foi usado, os dois deixam de valer. Se ela tentar de novo e vir "Este link expirou ou já foi usado", é só pedir um código novo em "Esqueci minha senha", na tela de login, ou você usa "Redefinir senha" no menu de Ações. A Loja herda o acesso da sua Conta, então quem entra numa Loja nova já cai direto no sistema; se aparecer "Acesso bloqueado", o pagamento pendente é o da Conta. Se a Loja já usa a distribuição automática de conversas, quem acabou de entrar já recebe a própria fatia: as fatias se refazem em divisão igual no momento em que a pessoa aceita o convite.',
      },
      {
        title: 'Remova o acesso de quem sair do time no mesmo dia',
        body:
          'Ainda em Equipe, no menu de Ações da pessoa, use "Suspender" (dá para reativar) ou "Excluir" (de vez; a vaga fica livre e só volta com convite novo). Enquanto o acesso existe, a pessoa continua vendo as conversas e os contatos da Loja. Quem sai é removido da distribuição automática sozinho, mas FICA com as conversas que já tinha: abra Conversas, pílula "Responsável indisponível", e transfira cada uma para quem vai continuar o atendimento.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
        note:
          'Com 2 ou mais atendentes, divida as conversas novas entre eles: o tutorial "Configurar a distribuição de conversas" mostra como.',
      },
    ],
  },

  // ------------------------------------------------------------------ 3b
  // Horário, distribuição e transferência. Conferido em 2026-10-29 contra
  // BusinessHoursSettings, VisibilitySettings, RotationSettings e
  // ResponseRuleSettings (o horário ganhou aba própria no lote 6e).
  {
    id: 'configurar-distribuicao',
    minRole: 'gestor',
    title: 'Configurar a distribuição de conversas',
    goal:
      'No fim, a Loja terá definido o horário em que atende, o que cada atendente vê, como as conversas novas são divididas e o que acontece quando ninguém responde a tempo.',
    forWhom:
      'Gestor da Loja (o Gerente faz o mesmo, com a Loja escolhida no topo). O Atendente vê esta aba só para leitura.',
    steps: [
      {
        title: 'Abra Configurações › Horário, ajuste os dias e clique em "Salvar horário"',
        body:
          'Escolha o fuso, ligue os dias em que a Loja atende e ajuste as horas de abrir e fechar. É o horário que o chatbot usa para "fora do horário" e que a transferência por tempo sem resposta usa para contar minutos. Ele tem botão próprio: salvar o horário não liga nenhuma outra regra.',
        screen: '/dashboard/settings',
        helpKey: 'page:settings-horario',
      },
      {
        title: 'Abra a aba Distribuição e transferência',
        body:
          'São três cartões, na ordem em que a conversa passa por eles: quem vê e quem transfere, como a conversa nova chega e o que acontece se ninguém responde. Tudo aqui vale para a Loja inteira.',
        helpKey: 'page:settings-visibility',
      },
      {
        title: 'No cartão 1, escolha o que o atendente vê e clique em "Salvar alterações"',
        body:
          'Em "O atendente vê", escolha "Todas as conversas da Loja", "Sem responsável + as dele" ou "Só as dele". Depois decida "Atendente pode transferir conversas": desligado, só Gestor e Gerente passam conversas adiante.',
        note: 'Gestor e Gerente sempre veem e transferem tudo.',
      },
      {
        title: 'No cartão 2, ligue "Distribuir conversas novas automaticamente"',
        body:
          'O cartão "Distribuição de conversas novas" só oferece a chave com pelo menos 2 atendentes ativos na Loja; com um só, ele diz isso numa linha. Decida também "Gestor também recebe conversas".',
      },
      {
        title: 'Escolha "Quando a conversa ganha responsável"',
        body:
          '"Na primeira mensagem" dá dono na hora, mesmo com chatbot. "Quando o chatbot terminar" espera o bot acabar; sem bot publicado no número, é na hora.',
        note:
          'Se algum fluxo termina em "Transferir para Atendente" nomeando uma pessoa, escolha "Quando o chatbot terminar": senão a conversa já chega com dono e o bloco não troca.',
        helpKey: 'transfer_agent',
      },
      {
        title: 'Ajuste a "Fatia de cada pessoa" e clique em "Salvar distribuição"',
        body:
          'A soma precisa dar 100; a tela diz quanto falta ou sobra. "Dividir igualmente" refaz as fatias por igual, e 0 tira alguém da distribuição sem tirar da Loja. A distribuição nunca troca uma conversa que já tem responsável, e não toca o sino.',
      },
      {
        title: 'No cartão 3, ligue "Transferir conversa sem resposta" se quiser que a conversa mude de mão',
        body:
          'Defina o "Tempo sem resposta" em minutos de funcionamento (de 5 a 1440) e o "Máximo de transferências por espera" (de 1 a 10). O quadro logo abaixo mostra quantas esperas dos últimos 30 dias teriam passado do limite: use para calibrar.',
        note: 'Vem desligada. Ligue quando o time já souber que isso vai acontecer.',
      },
      {
        title: 'Confira o horário que o cartão 3 mostra e clique em "Salvar regra"',
        body:
          'Só os minutos dentro do horário da Loja contam. Para mudar o horário, use o link "Mudar o horário na aba Horário": o cartão 3 só o mostra.',
      },
      {
        title: 'Acompanhe pelas Conversas e pelo Dashboard',
        body:
          'Em Conversas, a pílula "Responsável indisponível" mostra conversas presas com alguém suspenso ou em 0 %; transfira à mão. No Dashboard, a seção "Por atendente" mostra quanto está com cada pessoa e quantas vezes a regra de tempo agiu.',
        screen: '/dashboard/conversations',
        helpKey: 'concept:conversation-routing',
      },
    ],
  },

  // ------------------------------------------------------------------ 4
  {
    id: 'montar-funil',
    title: 'Montar seu funil de vendas',
    goal:
      'No fim, seu funil terá as etapas do seu processo real e você saberá onde cada contato está parado.',
    forWhom:
      'Quem define o processo comercial da Loja: o Gestor, na Loja dele, ou o Gerente, em qualquer Loja da Conta. O Atendente vê as etapas e move os cards, mas não monta o funil.',
    moduleName: 'funnel',
    minRole: 'gestor',
    steps: [
      {
        title: 'Escreva as etapas do seu processo antes de abrir o sistema',
        body:
          'Liste, na ordem, o que acontece de verdade entre o primeiro contato e a venda. Quatro a seis etapas costumam bastar. Nome específico funciona melhor: "Visita agendada" informa, "Em andamento" não.',
      },
      {
        title: 'Abra o Funil de Vendas e clique em "Configurar etapas"',
        body:
          'A janela mostra duas partes: "Etapas atuais", com o que já existe, e "Adicionar etapa", para criar.',
        note:
          'Gerente: o funil é de cada Loja. Com a Conta em foco no seletor do topo, o Funil pede para escolher a Loja antes; com uma Loja só, "Abrir a Loja" já entra nela.',
        screen: '/dashboard/funnel',
        helpKey: 'page:funnel',
      },
      {
        title: 'Ajuste ou remova as etapas que não servem para você',
        body:
          'Em "Etapas atuais", use o ícone de edição para renomear e o de lixeira para apagar. A lixeira pede confirmação em "Apagar etapa". Faça essa limpeza antes de criar as novas, para não ficar com dois conjuntos de etapas ao mesmo tempo.',
        note:
          'Etapa com contato dentro, ou usada numa sequência de follow up, não pode ser apagada: mova os cartões para outra etapa antes.',
      },
      {
        title: 'Crie cada etapa em "Adicionar etapa"',
        body:
          'Digite o nome em "Nome da etapa", escolha uma cor e clique em "Adicionar etapa". Use as cores como semáforo do processo: frio no começo, quente perto do fechamento. Repita para cada etapa da sua lista.',
        note:
          'Funil ainda vazio? "Usar etapas prontas", na própria tela do Funil, cria Novo contato, Em atendimento, Proposta, Fechado e Perdido de uma vez; depois é só ajustar aqui.',
      },
      {
        title: 'Arraste as etapas para a ordem do seu processo',
        body:
          'Em "Etapas atuais", arraste cada etapa para a posição certa. A ordem aqui é a ordem das colunas no quadro, e é ela que faz a leitura do funil ter sentido. Cada vez que você solta uma etapa, aparece "Ordem das etapas salva".',
      },
      {
        title: 'Feche a configuração e mova um contato de verdade',
        body:
          'No quadro do funil, arraste um card de uma coluna para outra. Mover o card é o que registra que a negociação andou. É assim que o time todo passa a ver a mesma situação.',
        screen: '/dashboard/funnel',
      },
      {
        title: 'Cadastre um contato de teste pelo botão "Novo Lead"',
        body:
          'Preencha o nome e o telefone com DDD, escolha a etapa e clique em "Criar lead". O card aparece na coluna escolhida, e o contato entra em Contatos. Telefone que já é contato da Loja não é duplicado: o card desse contato vai para a etapa. O menu de cada coluna tem "Adicionar lead", que já abre com aquela etapa escolhida.',
        note:
          'Terminado o teste, apague o contato em Contatos: no menu ⋯ da linha dele, clique em "Excluir" e confirme em "Excluir".',
        screen: '/dashboard/funnel',
      },
      {
        title: 'Ligue o funil às automações',
        body:
          'Com as etapas prontas, use o gatilho "Mudança de etapa" (em Automação) para disparar ação no momento em que o contato avança: agendar follow up ao entrar em "Visita agendada", por exemplo.',
        screen: '/dashboard/automation',
        helpKey: 'trigger:funnel_stage_changed',
      },
    ],
  },

  // ------------------------------------------------------------------ 5
  {
    id: 'primeiro-chatbot',
    title: 'Criar seu primeiro chatbot',
    goal:
      'No fim, um chatbot publicado vai atender o primeiro contato, perguntar o que o contato procura e passar a conversa para um atendente.',
    forWhom: 'Gestor ou Gerente. É o fluxo mínimo que funciona, não um tour por todos os blocos.',
    moduleName: 'chatbots',
    steps: [
      {
        title: 'Abra Chatbots e clique em "Novo Chatbot"',
        body:
          'Esta tela administra os bots: quais existem, qual está publicado e em qual número. O desenho do fluxo vem na tela seguinte.',
        screen: '/dashboard/chatbots',
        helpKey: 'page:chatbots',
      },
      {
        title: 'Dê um nome e escolha o número de WhatsApp',
        body:
          'Preencha o Nome. Em "Número de WhatsApp", escolha o número em que o bot responde. Deixar em "Todos os números" faz ele valer para qualquer número conectado. A Prioridade só importa se houver mais de um bot no mesmo número: entra o de número maior.',
      },
      {
        title: 'Marque o gatilho "Primeiro contato"',
        body:
          'Em "Gatilhos", marque "Primeiro contato": o bot entra quando alguém fala com você pela primeira vez. É o gatilho com maior retorno, porque é onde o contato de anúncio chega.',
        note:
          'Se escolher "Palavra-chave", você precisa cadastrar pelo menos uma palavra, senão o formulário não salva.',
      },
      {
        title: 'Clique em "Criar e Abrir Editor"',
        body:
          'O ConvoFlow cria o bot e leva você direto para o construtor dele. À esquerda ficam os blocos, no meio a área de desenho, e à direita o painel de configuração do bloco selecionado.',
        helpKey: 'page:chatbot-builder',
      },
      {
        title: 'Arraste "Início do Fluxo" e ligue nele um "Enviar Texto"',
        body:
          'Arraste "Início do Fluxo" para a área de desenho (só pode existir um) e depois "Enviar Texto". No tablet ou no celular, toque em "Blocos" na barra do topo e escolha cada um. Ligue a bolinha de saída do Início na entrada do Enviar Texto e escreva a saudação no painel da direita.',
        note: 'Bloco solto não executa. Se não houver seta ligando, aquele trecho nunca roda.',
      },
      {
        title: 'Adicione "Fazer Pergunta" e salve a resposta numa variável',
        body:
          'Ligue um bloco "Fazer Pergunta" depois da saudação. Escreva a pergunta (ex.: "Qual bairro você procura?") e preencha "Salvar resposta como variável" com um nome simples, como bairro. Esse valor fica disponível nos blocos seguintes e no contato.',
        helpKey: 'concept:variables',
      },
      {
        title: 'Feche o fluxo com "Transferir para Atendente"',
        body:
          'Ligue um bloco "Transferir para Atendente" no fim. Ele encerra a parte automática, já com o bairro coletado. Em "Transferir para", deixe "Qualquer atendente disponível" para a conversa seguir a distribuição automática da Loja, ou ficar na fila, sem responsável, se a distribuição automática estiver desligado. Escolha "Atendente específico" só se uma pessoa certa deve ficar com ela: aí a conversa passa a ser dessa pessoa, que recebe um aviso no sino. Fluxo que só fala e não entrega deixa o contato sem resposta.',
        note:
          '"Atendente específico" só vale para conversa que ainda não tem responsável. Se a Loja usa a distribuição automática em "Na primeira mensagem", a conversa já chegou com dono antes de o bot rodar e o bloco não troca. Use "Quando o chatbot terminar" em Configurações › Distribuição e transferência.',
        helpKey: 'transfer_agent',
      },
      {
        title: 'Clique em "Publicar" e corrija o que a validação apontar',
        body:
          'Publicar é o que coloca no ar. Ao publicar, o sistema valida o fluxo inteiro e, se houver bloco sem ligação ou campo obrigatório vazio, mostra a lista do que corrigir em vez de publicar quebrado. Depois de publicado, mexa no fluxo e clique em "Publicar" de novo: "Salvar" num bot no ar já vale na hora, sem conferir.',
      },
      {
        title: 'Mande uma mensagem para o número e confirme a resposta',
        body:
          'Use outro celular, escreva para o número e acompanhe em Conversas: enquanto o bot conduz, a conversa mostra o selo "Bot em atendimento", que some quando o fluxo chega em "Transferir para Atendente". Erro de texto e pergunta confusa só aparecem na conversa real.',
        note:
          'Para intervir antes do fim do fluxo, abra o menu ⋮ da conversa e clique em "Encerrar sessão do bot". O item só fica ativo enquanto há bot na conversa.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
    ],
  },

  // ------------------------------------------------------------------ 6
  {
    id: 'primeira-campanha',
    title: 'Disparar sua primeira campanha',
    goal:
      'No fim, você terá enviado uma campanha dentro das regras da Meta, sem colocar o número em risco.',
    forWhom:
      'Gestor e Gerente. O Atendente participa das conversas geradas, mas não dispara campanha.',
    moduleName: 'campaigns',
    minRole: 'gestor',
    steps: [
      {
        title: 'Aprove um template no Gerenciador do WhatsApp Business',
        body:
          'A aprovação do template acontece do lado da Meta, no Gerenciador do WhatsApp Business; o ConvoFlow não cria nem submete template. Cadastre lá o texto que você quer disparar e espere a aprovação antes de continuar.',
        note:
          'Depois de aprovado, ele aparece sozinho na lista do ConvoFlow (confira em Templates). Se ainda não apareceu, clique em "Atualizar" ao lado da lista.',
      },
      {
        title: 'Decida o tipo de envio a partir da janela de 24 horas',
        body:
          'Mensagem de texto livre só é entregue dentro de 24 horas após a última mensagem do contato. Fora dessa janela, só template aprovado passa. Para uma lista fria, que é o caso da maioria das campanhas, o caminho é template.',
      },
      {
        title: 'Prepare a segmentação em Contatos',
        body:
          'Aplique etiquetas nos contatos que devem receber, em vez de mirar a base toda. Campanha separada por etiqueta tem resposta melhor e reduz muito o risco de denúncia por spam.',
        screen: '/dashboard/contacts',
        helpKey: 'page:contacts',
      },
      {
        title: 'Abra Campanhas e clique em "Nova Campanha"',
        body:
          'O assistente tem quatro passos: Conteúdo, Público, Agendamento e Revisão. Ele só libera o passo seguinte quando o atual está válido.',
        screen: '/dashboard/campaigns',
        helpKey: 'page:campaigns',
      },
      {
        title: 'No passo Conteúdo, escolha o número e o tipo de envio',
        body:
          'Dê um nome à campanha, escolha o "Número de WhatsApp" e marque "Só para quem aceita campanhas" para enviar só a quem autorizou. Com número da API Oficial aparece "Tipo de envio", com "Texto livre" marcado: clique em "Template aprovado" e escolha o template na lista, que só mostra os aprovados. O texto dele aparece embaixo, com um campo "Variável" para cada trecho a preencher; use {first_name} para cada contato receber o próprio nome. Com template, o campo de mensagem some: o que sai é o template. Número de QR Code não tem essa escolha: ele envia o texto.',
      },
      {
        title: 'No passo Público, escolha Etiquetas, Contatos ou Planilha',
        body:
          'Selecione por "Etiquetas" para usar a separação que você acabou de preparar. "Contatos" permite escolher um a um, e "Planilha" serve para uma lista de fora (arquivo CSV). Confira o total antes de avançar. Contato do Instagram não aparece em "Contatos" nem entra no total das etiquetas: campanha é disparo de WhatsApp, e ele não tem telefone.',
      },
      {
        title: 'No passo Agendamento, escolha "Enviar imediatamente" ou "Agendar"',
        body:
          'Agendar exige data e hora, sempre no horário de Brasília. Hoje também vale, desde que a hora ainda não tenha passado. Horário comercial responde melhor: disparo de madrugada chega com o cliente dormindo e vira bloqueio ou denúncia na manhã seguinte.',
      },
      {
        title: 'No passo Revisão, confira e dispare',
        body:
          'Confira o resumo. Na primeira vez, comece pequeno: volte ao passo Público e escolha poucos contatos, porque a Revisão não corta a lista. Se preferir revisar depois, use "Salvar como rascunho" (ele está em todos os passos, não só no último). Confirmado, a campanha entra na fila de envio, que roda a cada 5 minutos.',
        note:
          'Número da API Oficial recém-conectado tem teto diário na primeira semana. É proteção contra bloqueio pela Meta, não limite do plano: 50 por dia nos dois primeiros dias, 250 até o quarto, 1.000 até o sétimo; depois disso o teto some. Se a lista passar do teto, o resto fica como "Não enviada" nos Detalhes e não sai sozinho no dia seguinte. Planeje a primeira semana em lotes.',
      },
      {
        title: 'Acompanhe a entrega pelo botão "Relatórios"',
        body:
          'Ainda em Campanhas, abra Relatórios e veja entrega e respostas. Aqui você descobre se o problema foi o texto, a lista ou o horário, e ajusta antes do próximo disparo.',
        screen: '/dashboard/campaigns',
      },
    ],
  },

  // ------------------------------------------------------------------ 7
  // O único tutorial de OPERAÇÃO: os cinco acima montam a Loja; este é o dia
  // a dia de quem atende nela. Vem por último porque pressupõe tudo o que os
  // outros deixam pronto — e é o único que o atendente consegue seguir inteiro.
  {
    id: 'atender-conversas',
    title: 'Atender conversas no dia a dia',
    goal:
      'No fim, você vai saber de quem é cada conversa, como assumir e passar adiante, o que o bot está fazendo, e por que uma conversa pode aparecer ou sumir da sua lista sem você tocar nela.',
    forWhom:
      'Atendente, principalmente, e o Gestor que quer saber o que a equipe vê quando liga cada chave. A Loja já está conectada e com equipe.',
    moduleName: 'conversations',
    steps: [
      {
        title: 'Abra Conversas e leia o cabeçalho: de quem é esta conversa?',
        body:
          'Ao abrir uma conversa, o cabeçalho mostra o responsável por ela. "Sem responsável" quer dizer que ninguém pegou; um nome quer dizer que a conversa é daquela pessoa. A lista tem as pílulas "Minhas" (o que está com você) e "Sem responsável" (a fila) para você separar uma coisa da outra.',
        note:
          'Se a Loja tem Instagram, o topo da lista tem a chave "WhatsApp" / "Instagram": cada lado é uma fila própria, e o número no lado que não está aberto mostra quantas conversas esperam resposta lá.',
        screen: '/dashboard/conversations',
        helpKey: 'page:conversations',
      },
      {
        title: 'Pegue uma conversa da fila: "Sem responsável" → "Assumir"',
        body:
          'Clique em "Sem responsável" no cabeçalho e depois em "Assumir". O seu nome aparece para todo mundo da Loja e a conversa entra em "Minhas". Se duas pessoas clicarem quase ao mesmo tempo, só a primeira fica com ela. A outra vê um aviso dizendo quem pegou.',
        note:
          'Responder numa conversa não a torna sua. Se você respondeu e não assumiu, ela continua "Sem responsável" para os colegas.',
      },
      {
        title: 'Passe uma conversa a um colega: "Transferir…"',
        body:
          'Clique no responsável no cabeçalho, escolha "Transferir…" e a pessoa na lista. Ela recebe "Conversa transferida" no sino. Também dá para transferir para você mesmo uma conversa que está com outra pessoa.',
        note:
          'Se o botão "Transferir…" não aparece para você, a Loja desligou a transferência para atendentes em Configurações › Distribuição e transferência: só o Gestor e o Gerente passam conversas. "Assumir" continua funcionando.',
        helpKey: 'page:settings-visibility',
      },
      {
        title: 'Reconheça o selo "Bot em atendimento" e encerre a sessão antes de responder',
        body:
          'O selo na linha da lista e no cabeçalho (no celular, só na lista) quer dizer que um chatbot está conduzindo a conversa agora. Antes de escrever, abra o menu ⋮, clique em "Encerrar sessão do bot" e confirme em "Encerrar sessão": o bot para e a conversa passa a ser sua para responder. Sem isso, você e o bot falam com o cliente ao mesmo tempo.',
        note:
          'Sem selo, não há bot e o item fica desabilitado. Encerrar a sessão não muda o responsável nem chama a distribuição automática: é uma ação sua, e só.',
        helpKey: 'page:conversations',
      },
      {
        title: 'Entenda o que muda se o Gestor restringir a visibilidade',
        body:
          'Por padrão você vê todas as conversas da Loja. Se o Gestor escolher "Sem responsável + as dele" ou "Só as dele" em Distribuição e transferência, a sua lista encolhe: só o que está com você, o que você já respondeu, o que você passou adiante e, na opção intermediária, a fila sem dono. Uma conversa que sumiu não foi apagada: está com um colega. Os números do Dashboard continuam da Loja inteira, com a etiqueta "Toda a Loja".',
        helpKey: 'page:settings-visibility',
      },
      {
        title: 'Entenda como uma conversa entra e sai de "Minhas" sozinha',
        body:
          'Com a distribuição automática ligada, a conversa nova já chega com responsável, na fatia que o Gestor definiu para cada pessoa, e entra em "Minhas" sem aviso no sino; cliente que volta cai com quem já o atendia. Se a Loja ligou a transferência por tempo sem resposta, uma conversa sua em que o cliente esperou resposta de pessoa por mais minutos de funcionamento do que o limite passa para o próximo da distribuição, e quem recebe ganha "Conversa transferida para você" no sino. Resposta do bot não segura a conversa; só a sua.',
        note:
          'Não é punição: é a Loja garantindo que o cliente não fique sem resposta. Para não perder conversas, responda dentro do limite ou peça ao Gestor para transferir antes.',
        helpKey: 'concept:conversation-routing',
      },
      {
        title: 'Mande voz, áudio ou documento pela conversa',
        body:
          'Com o campo vazio, clique no microfone, fale, clique no quadrado para parar, ouça e envie (a gravação para sozinha em 5 minutos). Para um arquivo, clique no clipe: áudio MP3, M4A, AAC ou OGG de até 16 MB; documento até 30 MB em número de QR Code. Microfone apagado? Passe o mouse ou toque nele: ele diz o motivo.',
        note:
          'Em número da API Oficial, passadas 24 horas sem mensagem do cliente, só um template aprovado reabre a conversa: use "Enviar template", que aparece embaixo, no lugar do campo de mensagem.',
        helpKey: 'page:conversations',
      },
      {
        title: 'Saiba o que o cliente vê: lida, reação e mensagem que falhou',
        body:
          'Ao abrir a conversa, o cliente vê os dois riscos azuis nas mensagens dele, como no WhatsApp; conversa que você não abriu não avisa nada. Para reagir, clique na carinha com + na mensagem e escolha o emoji. Mensagem sua que não saiu fica com o motivo embaixo da bolha e o botão "Reenviar", que manda uma nova com o mesmo texto; a que falhou continua no histórico.',
        note:
          'Na API Oficial, depois de 24 horas sem mensagem do cliente, o "Reenviar" dá lugar ao aviso da janela: use "Enviar template". Arquivo que falhou se anexa de novo.',
        helpKey: 'page:conversations',
      },
      {
        title: 'Use as cores e a pílula "Não respondidas" para priorizar',
        body:
          'Com a sinalização ligada em Configurações › Atendimento, a conversa em que o cliente espera fica amarela, laranja e vermelha conforme as horas passam, e a pílula "Não respondidas" filtra só elas. Responda as vermelhas primeiro: perto de 24 horas sem resposta, um número da API Oficial só reabre com template.',
        note:
          'No Instagram não existe template: passadas 24 horas da última mensagem do cliente, o campo trava e só volta quando ele escrever de novo. Lá a mensagem enviada mostra um risco só, porque o Instagram não avisa entrega nem leitura.',
        screen: '/dashboard/conversations',
        helpKey: 'page:settings-attendance',
      },
    ],
  },
  // ------------------------------------------------------------------ 8
  // Avisos para sistemas (webhooks de saída). Conferido em 2026-10-27 contra
  // IntegrationSettings e webhook-dispatcher.
  {
    id: 'avisos-para-sistemas',
    title: 'Configurar avisos para sistemas',
    goal:
      'No fim, outro sistema seu (um CRM, uma planilha, o n8n) vai receber sozinho um aviso a cada acontecimento que você escolheu no ConvoFlow.',
    forWhom:
      'Gestor da Loja, junto com quem cuida do outro sistema (o Gerente faz o mesmo, numa Loja escolhida no topo). O Atendente não vê esta aba.',
    minRole: 'gestor',
    capacidade: 'store.admin',
    steps: [
      {
        title: 'Pegue no outro sistema o endereço que vai receber os avisos',
        body:
          'No n8n, por exemplo, é o endereço do bloco que o n8n chama de Webhook. Ele precisa começar com http:// ou https://. O ConvoFlow manda os dados no formato que o n8n, o Make e o Zapier recebem sem configuração extra.',
      },
      {
        title: 'Abra Configurações › Avisos para sistemas',
        body:
          'O aviso é da Loja que está aberta e só recebe o que acontece nela. Gerente: escolha a Loja antes, em "Escolher Loja".',
        screen: '/dashboard/settings',
        helpKey: 'page:settings-integrations',
      },
      {
        title: 'Preencha "Nome" e "Endereço do outro sistema"',
        body: 'O nome é só para você reconhecer o aviso na lista (ex.: "Sistema de CRM").',
      },
      {
        title: 'Em "Avisar quando", marque só o que o outro sistema usa',
        body:
          'Por exemplo, "Entra um contato novo" para cadastrar o contato no CRM. "Chega uma mensagem" e "Sai uma mensagem" levam o texto das conversas da Loja inteira: marque só se o outro sistema precisar mesmo.',
      },
      {
        title: 'Preencha a "Senha de conferência"',
        body:
          'É opcional, mas proteja-se: com ela, cada aviso chega assinado no cabeçalho X-ConvoFlow-Signature, e o outro sistema refaz a assinatura com a mesma senha para conferir que veio do ConvoFlow.',
      },
      {
        title: 'Deixe "Aviso ligado" marcado e clique em "Criar aviso"',
        body:
          'Aparece "Aviso criado" e ele entra em "Avisos cadastrados", com o selo "Ligado". Desligado, o cadastro fica salvo mas nada é enviado.',
      },
      {
        title: 'Provoque o acontecimento uma vez e confira no outro sistema',
        body:
          'Não existe botão de teste: cadastre um contato de teste, por exemplo. O aviso sai em até 5 minutos. Se o outro sistema responder com erro, o ConvoFlow tenta de novo, até 5 vezes.',
        note:
          'Para parar, use "Remover" no aviso e confirme em "Remover aviso": o endereço deixa de receber na hora.',
      },
    ],
  },

  // ------------------------------------------------------------------ 8b
  // Chave da API (complemento pago). Conferido em 2026-10-27 contra
  // ApiAddonCard, ApiKeysSettings e api_chave_criar. Só aparece com
  // API_ADDON_RELEASED ligada (ver visibleTutorials).
  {
    id: TUTORIAL_CHAVE_API_ID,
    title: 'Criar e usar a chave da API',
    goal:
      'No fim, outro sistema (uma planilha, um painel, o n8n) vai ler os dados da sua Conta com uma chave que só lê o que você permitiu.',
    forWhom:
      'Gerente da Conta: a chave e a cobrança são da Conta. Gestor e Atendente não veem a aba Chaves de API.',
    minRole: 'gerente',
    steps: [
      {
        title: 'Ligue a API em Configurações › Assinatura',
        body:
          'No cartão "API e integrações", clique em "Ligar a API" (o botão mostra o preço por mês) e confirme em "Contratar a API e integrações?". No primeiro mês entra na próxima fatura só o valor proporcional. Precisa da assinatura paga, depois do teste grátis e com o cartão em dia.',
        screen: '/dashboard/settings',
        helpKey: 'page:settings-subscription',
        note: 'Sem a API ligada, o ConvoFlow recusa criar a chave.',
      },
      {
        title: 'Abra Configurações › Chaves de API e clique em "Nova chave"',
        body:
          'A aba mostra quantas chaves estão em uso (até 10) e o endereço da API, https://api.convoflow.com.br.',
        helpKey: 'page:settings-api',
      },
      {
        title: 'Dê um nome em "Nome da chave"',
        body: 'Use o lugar onde ela vai ser usada, por exemplo Painel de vendas. Até 60 letras.',
      },
      {
        title: 'Em "O que a chave pode ler", deixe marcado só o necessário',
        body:
          'Contatos, conversas, funil, equipe e métricas vêm marcados. O histórico das conversas e as fotos, áudios e documentos vêm desmarcados: marque só se o serviço precisar mesmo. Quanto menos, mais seguro.',
      },
      {
        title: 'Escolha as Lojas e a "Validade"',
        body:
          'Deixe "Todas as Lojas" ou escolha só algumas. Na validade, 30 dias, 90 dias (o padrão) ou 1 ano: vencida, a chave para e você cria outra.',
      },
      {
        title: 'Marque a confirmação e clique em "Criar chave"',
        body:
          'Na janela "Sua chave está pronta", clique em "Copiar chave", guarde num lugar seguro e clique em "Já guardei a chave". Ela não aparece de novo.',
      },
      {
        title: 'Use a chave no outro sistema',
        body:
          'Passe o endereço da API e a chave para quem configura o outro sistema; o passo a passo técnico está em "Ver a documentação", ao lado do endereço. Cada chave aceita 60 pedidos por minuto, e a Conta, 5.000 por dia (o dia vira às 21h de Brasília).',
      },
      {
        title: 'Corte o acesso com "Revogar" quando não usar mais',
        body:
          'Na linha da chave, clique em "Revogar" e confirme em "Revogar chave". Vale na hora e não dá para desfazer. Confira o "Último uso" de vez em quando: uso que você não reconhece é motivo para revogar.',
      },
    ],
  },

  // ------------------------------------------------------------------ 9
  // Cadastro pelo site (teste grátis, entrega 2). Escrito e testado, mas só
  // aparece com PUBLIC_SIGNUP_ENABLED ligada — ver visibleTutorials abaixo.
  {
    id: TUTORIAL_TESTE_GRATIS_ID,
    title: 'Criar sua Conta e começar o teste grátis',
    goal: `No fim, sua Conta estará criada, com a senha definida, o teste grátis de ${TRIAL_DAYS} dias rodando e a primeira Loja pronta para receber o time.`,
    forWhom:
      'Quem vai criar a Conta da empresa pelo site e ser o Gerente dela. Gestor e Atendente não se cadastram: eles entram por convite do Gerente.',
    minRole: 'gerente',
    nextTutorialId: 'configurar-equipe',
    steps: [
      {
        title: 'Cadastre-se pela página do ConvoFlow',
        body:
          'Na página de vendas, clique em "Começar teste grátis" e preencha nome, sobrenome, email, o nome da empresa e um telefone com DDD. Marque o aceite dos Termos de Uso e da Política de Privacidade, espere a verificação "não sou um robô" e clique em "Criar minha conta".',
        helpKey: 'page:cadastro',
        note:
          'A tela seguinte sempre diz "Confira seu email", mesmo se o email já tiver conta. Se você já é cliente, entre pelo login.',
      },
      {
        title: 'Crie sua senha pelo link do email',
        body:
          'Abra o email do ConvoFlow, clique no botão e depois em "Continuar". Na tela de definir senha, escolha a senha e confirme. Você entra no sistema como Gerente da sua Conta.',
        note:
          'O botão e o código de 6 dígitos do email valem por 24 horas e por um acesso. Se o botão não abrir, clique no link do fim do email, logo depois de Onde digitar, e digite o seu email e o código. Ou peça um código novo na mesma tela, em "Esqueci minha senha".',
      },
      {
        title: 'Preencha os dados para a nota fiscal',
        body:
          'Na primeira tela, no quadro "Dados para a nota fiscal", escolha "Empresa (CNPJ)" ou "Pessoa física (CPF)", digite o documento e o nome ou a razão social. Digite o CEP: rua, bairro, cidade e UF se preenchem sozinhos. Complete o número, confira o email que vai receber a nota e clique em "Salvar dados".',
        helpKey: 'page:paywall',
        note:
          'Sem esses dados o botão do teste grátis fica travado. Se a busca do CEP não responder, preencha o endereço à mão. CNPJ com letras (os novos, de 2026) é aceito.',
      },
      {
        title: 'Clique em "Começar teste grátis" e cadastre o cartão',
        body:
          'A mesma tela mostra o que acontece: hoje você não paga nada, e ali estão a data e o valor da primeira cobrança. Clique em "Começar teste grátis" e cadastre o cartão no Stripe.',
        helpKey: 'page:paywall',
      },
      {
        title: 'Espere a confirmação, sem pagar de novo',
        body:
          'De volta do Stripe, a tela "Confirmando seu pagamento" abre o sistema sozinha, normalmente em segundos. Não clique para assinar de novo: seria uma segunda assinatura.',
        helpKey: 'page:paywall',
      },
      {
        title: 'Crie a primeira Loja em "Nova Loja"',
        body:
          'Em Equipe, clique em "Nova Loja", dê o nome pelo qual o time reconhece a operação e confirme em "Criar Loja". É na Loja que ficam o número de WhatsApp, as conversas e o time.',
        screen: '/dashboard/team',
        helpKey: 'page:team',
      },
      {
        title: 'Anote a data do fim do teste',
        body: `Em Configurações › Assinatura, o selo "EM TESTE" mostra até quando o teste vai. Para não ser cobrado, ${COMO_CANCELAR_NO_TESTE}.`,
        screen: '/dashboard/settings',
        helpKey: 'page:settings-subscription',
      },
    ],
  },
  // ------------------------------------------------------------------ 10
  // Cancelar, desfazer e trocar o cartão (teste grátis, entrega 3).
  {
    id: 'cancelar-assinatura',
    title: 'Cancelar a assinatura, desfazer ou trocar o cartão',
    goal:
      'No fim, você terá cancelado sabendo até que dia usa o sistema, desfeito um cancelamento ou trocado o cartão, sem depender de ninguém.',
    forWhom:
      'Gerente da Conta. Gestor e Atendente não veem a aba Assinatura: quem paga é a Conta, e a Conta é do Gerente.',
    minRole: 'gerente',
    steps: [
      {
        title: 'Abra Configurações › Assinatura',
        body:
          'É a aba da assinatura da sua Conta. Se você está numa Loja pelo seletor do topo, tudo bem: a aba mostra sempre a Conta.',
        screen: '/dashboard/settings',
        helpKey: 'page:settings-subscription',
      },
      {
        title: 'Confira o selo e a data antes de mexer',
        body:
          '"EM TESTE" é o teste grátis, com a data em que termina; "ATIVO" é assinatura paga; "PAGAMENTO PENDENTE" é cartão recusado. É essa situação que decide o que acontece se você cancelar.',
      },
      {
        title: 'Clique em "Cancelar assinatura" e leia o aviso',
        body:
          'O aviso diz a data exata até a qual o sistema continua liberado. No teste grátis, nada é cobrado. Depois da primeira cobrança, você usa até o fim do período já pago, sem nova cobrança e sem reembolso dos dias que faltam.',
        note: 'Com pagamento pendente o botão não aparece: atualize o cartão, ou fale com o suporte se não quiser continuar. Quer desistir da contratação com o dinheiro de volta? O botão não faz isso: dentro do prazo de arrependimento dos Termos de Uso (cláusula 4.4), escreva para contato@convoflow.com.br.',
      },
      {
        title: 'Confirme no botão vermelho do aviso',
        body:
          'É "Cancelar o teste" ou "Cancelar a assinatura", conforme o caso. Em alguns segundos a aba mostra "Cancelamento agendado", com a data.',
      },
      {
        title: 'Mudou de ideia? Clique em "Desfazer cancelamento"',
        body:
          'Enquanto a data não chega, o botão deixa a assinatura como estava. No teste grátis, o cartão salvo volta a valer para a cobrança do fim do teste.',
        note: 'Nos últimos minutos antes da data não dá mais para desfazer por aqui: fale com o suporte.',
      },
      {
        title: 'Para trocar o cartão, clique em "Atualizar cartão"',
        body:
          'Abre uma página do Stripe só para cadastrar o cartão novo. Ao terminar, você volta para a aba e as próximas cobranças usam o cartão novo.',
        note: 'No teste grátis com cancelamento agendado o botão some: desfaça o cancelamento primeiro.',
      },
    ],
  },
];

/** Tutorial por id, ou null. */
/**
 * Os tutoriais que a Ajuda mostra (e que a lista "Primeiros passos" do
 * Dashboard abre em "Ver passo a passo").
 *
 * O do cadastro pelo site fica de fora enquanto a chave PUBLIC_SIGNUP_ENABLED
 * está desligada: ensinar um caminho que não está no ar é pior que não ensinar.
 * Ele continua escrito em ALL_TUTORIALS e é conferido pelos testes do mesmo jeito.
 */
export function visibleTutorials(all: Tutorial[], publicSignupEnabled: boolean, apiAddonReleased = true): Tutorial[] {
  return all.filter(
    (t) =>
      (t.id !== TUTORIAL_TESTE_GRATIS_ID || publicSignupEnabled) &&
      (t.id !== TUTORIAL_CHAVE_API_ID || apiAddonReleased),
  );
}

export const TUTORIALS: Tutorial[] = visibleTutorials(ALL_TUTORIALS, PUBLIC_SIGNUP_ENABLED, API_ADDON_RELEASED);

export function getTutorial(id: string | null | undefined): Tutorial | null {
  if (!id) return null;
  return TUTORIALS.find((tutorial) => tutorial.id === id) ?? null;
}

/** Tutorial pela chave de deep link (`tutorial:<id>`), ou null. */
export function getTutorialByKey(key: string | null | undefined): Tutorial | null {
  if (!key || !key.startsWith(TUTORIAL_KEY_PREFIX)) return null;
  return getTutorial(key.slice(TUTORIAL_KEY_PREFIX.length));
}

/**
 * O tutorial casa com a busca? Usa o MESMO motor das entradas de ajuda
 * (matchesSearchTerms), então acento e caixa são ignorados do mesmo jeito.
 */
export function tutorialMatches(tutorial: Tutorial, query: string): boolean {
  return matchesSearchTerms(
    [
      tutorial.title,
      tutorial.goal,
      tutorial.forWhom,
      ...tutorial.steps.flatMap((step) => [step.title, step.body, step.note]),
    ],
    query,
  );
}
