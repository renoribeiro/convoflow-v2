import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowLeft, Shield, Eye, Database, Users } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-gradient-background p-4">
      <div className="container mx-auto max-w-4xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="text-center mb-8">
            <Link to="/auth" className="inline-flex items-center text-brand-primary hover:text-brand-secondary transition-colors mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Link>
            
            <div className="flex items-center justify-center mb-4">
              <MessageSquare className="w-8 h-8 text-brand-primary mr-3" />
              <span className="text-2xl font-bold text-foreground">ConvoFlow</span>
            </div>
          </div>

          <Card className="border-border/50 shadow-lg">
            <CardHeader>
              <CardTitle className="text-3xl text-center">Política de Privacidade</CardTitle>
              <p className="text-center text-muted-foreground">
                Última atualização: 12 de setembro de 2026 • Conforme LGPD
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <div className="space-y-8">
                <section className="bg-primary/5 p-6 rounded-lg border">
                  <div className="flex items-center mb-4">
                    <Shield className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">1. Informações Gerais</h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed">
                    Esta Política de Privacidade descreve como o ConvoFlow coleta, usa, armazena e protege suas informações pessoais,
                    em conformidade com a Lei Geral de Proteção de Dados (LGPD - Lei 13.709/2018) e demais legislações aplicáveis.
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    O ConvoFlow é uma plataforma de automação para WhatsApp operada por
                    <strong> CONVOFLOW TECNOLOGIA LTDA</strong>, inscrita no CNPJ sob nº 68.930.380/0001-05,
                    com sede na Rua Pereira Valente, nº 578, Sala 207, Meireles, Fortaleza/CE,
                    CEP 60.160-250 (doravante denominada simplesmente "ConvoFlow").
                  </p>
                  <p className="text-muted-foreground leading-relaxed mt-3">
                    O ConvoFlow atua ora como <strong>controlador</strong>, ora como <strong>operador</strong> de
                    dados pessoais, conforme o tipo de dado tratado. Essa distinção é essencial para a correta
                    leitura desta Política e está detalhada na seção 2 abaixo.
                  </p>
                  <div className="mt-4 p-4 bg-background rounded border-l-4 border-primary">
                    <p className="text-sm text-muted-foreground mb-0">
                      <strong>Empresa responsável pela plataforma:</strong> CONVOFLOW TECNOLOGIA LTDA (CNPJ 68.930.380/0001-05)<br />
                      <strong>Encarregado de Dados (DPO):</strong> contato@convoflow.com.br<br />
                      <strong>Endereço:</strong> Rua Pereira Valente, 578, Sala 207, Meireles, Fortaleza/CE, CEP 60.160-250
                    </p>
                  </div>
                </section>

                <section className="bg-primary/5 p-6 rounded-lg border">
                  <div className="flex items-center mb-4">
                    <Users className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">2. Papéis no Tratamento de Dados</h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Nos termos do art. 5º da LGPD, o ConvoFlow assume papéis distintos conforme a natureza dos dados
                    tratados. Compreender essa divisão é fundamental para saber a quem dirigir solicitações relativas
                    a dados pessoais.
                  </p>

                  <div className="space-y-4">
                    <div className="p-4 bg-background rounded border-l-4 border-primary">
                      <h3 className="font-medium mb-2">ConvoFlow como Controlador</h3>
                      <p className="text-muted-foreground text-sm mb-2">
                        O ConvoFlow é o <strong>controlador</strong> dos dados pessoais de seus próprios usuários, as
                        pessoas que contratam e operam a plataforma (proprietários, gestores e atendentes da loja
                        cliente). Nessa condição, o ConvoFlow define as finalidades e os meios do tratamento de:
                      </p>
                      <ul className="list-disc pl-6 text-muted-foreground text-sm">
                        <li>Dados de cadastro e de perfil do usuário da plataforma</li>
                        <li>Dados de faturamento e da relação contratual</li>
                        <li>Logs de acesso, registros de autenticação e dados técnicos de uso da plataforma</li>
                        <li>Comunicações de suporte mantidas diretamente com o ConvoFlow</li>
                      </ul>
                    </div>

                    <div className="p-4 bg-background rounded border-l-4 border-amber-500">
                      <h3 className="font-medium mb-2">ConvoFlow como Operador</h3>
                      <p className="text-muted-foreground text-sm mb-2">
                        Em relação aos dados dos <strong>clientes finais</strong> (as pessoas com quem a loja cliente
                        se comunica por WhatsApp), o ConvoFlow atua exclusivamente como <strong>operador</strong>,
                        tratando os dados por conta e ordem da loja cliente e conforme as instruções desta. São dados
                        tratados nessa condição:
                      </p>
                      <ul className="list-disc pl-6 text-muted-foreground text-sm">
                        <li>Contatos: nome, número de telefone, etiquetas e campos personalizados</li>
                        <li>Conteúdo das mensagens trocadas e mídias enviadas ou recebidas</li>
                        <li>Métricas e histórico das conversas, incluindo status de entrega e leitura</li>
                      </ul>
                      <p className="text-muted-foreground text-sm mt-3 mb-0">
                        A <strong>loja cliente é a controladora</strong> desses dados. Cabe exclusivamente a ela
                        definir as finalidades do tratamento, assegurar a base legal adequada, obter e comprovar o
                        consentimento (opt-in) dos destinatários, respeitar pedidos de descadastramento (opt-out) e
                        responder às solicitações dos titulares. O ConvoFlow não utiliza esses dados para finalidades
                        próprias, não os comercializa e não os emprega para treinar modelos ou para publicidade.
                      </p>
                    </div>

                    <div className="p-4 bg-muted/30 rounded">
                      <p className="text-muted-foreground text-sm mb-0">
                        <strong>A quem se dirigir:</strong> se você é cliente final de uma loja que utiliza o ConvoFlow
                        e deseja exercer seus direitos sobre mensagens ou dados de contato, a solicitação deve ser
                        encaminhada diretamente à loja com a qual você se comunicou, na condição de controladora.
                        Recebendo tal solicitação, o ConvoFlow a encaminhará à loja responsável e prestará o apoio
                        técnico necessário, sem, contudo, decidir sobre o pedido.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center mb-4">
                    <Database className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">3. Dados Coletados</h2>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Dados Fornecidos Diretamente:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Cadastro:</strong> Nome, e-mail, telefone, empresa</li>
                        <li><strong>Perfil:</strong> Informações profissionais, preferências</li>
                        <li><strong>Pagamento:</strong> Dados de faturamento (processados por terceiros seguros)</li>
                        <li><strong>Suporte:</strong> Histórico de conversas e solicitações</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h3 className="font-medium mb-2">Dados Coletados Automaticamente:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Uso da Plataforma:</strong> Logs de acesso, funcionalidades utilizadas</li>
                        <li><strong>Técnicos:</strong> Endereço IP, tipo de dispositivo, navegador</li>
                        <li><strong>Performance:</strong> Métricas de uso para melhorias</li>
                        <li><strong>Cookies:</strong> Preferências e dados de sessão</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">
                        Dados de Clientes Finais (WhatsApp), tratados na condição de operador:
                      </h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Mensagens:</strong> Conteúdo das conversas processadas</li>
                        <li><strong>Contatos:</strong> Números e perfis de destinatários</li>
                        <li><strong>Métricas:</strong> Status de entrega e engajamento</li>
                      </ul>
                      <p className="text-sm text-muted-foreground mt-2 mb-0">
                        Estes dados são fornecidos e controlados pela loja cliente, conforme a seção 2. O ConvoFlow os
                        trata apenas para viabilizar o serviço contratado por ela.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center mb-4">
                    <Eye className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">4. Finalidade do Tratamento</h2>
                  </div>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-medium mb-2">Prestação do Serviço:</h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Autenticação e acesso</li>
                        <li>• Processamento de mensagens</li>
                        <li>• Geração de relatórios</li>
                        <li>• Suporte técnico</li>
                      </ul>
                    </div>
                    
                    <div className="p-4 bg-muted/30 rounded-lg">
                      <h3 className="font-medium mb-2">Melhorias e Marketing:</h3>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        <li>• Desenvolvimento da plataforma</li>
                        <li>• Análise de uso</li>
                        <li>• Comunicações relevantes</li>
                        <li>• Segurança e prevenção</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section>
                  <div className="flex items-center mb-4">
                    <Users className="w-6 h-6 text-primary mr-3" />
                    <h2 className="text-xl font-semibold mb-0">5. Compartilhamento de Dados</h2>
                  </div>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    Seus dados podem ser compartilhados nas seguintes situações:
                  </p>
                  
                  <div className="space-y-3">
                    <div className="p-3 border-l-4 border-green-500 bg-green-50 dark:bg-green-950/20">
                      <strong className="text-green-700 dark:text-green-400">Parceiros Essenciais:</strong>
                      <span className="text-muted-foreground"> WhatsApp Business API, provedores de pagamento, infraestrutura cloud</span>
                    </div>
                    <div className="p-3 border-l-4 border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                      <strong className="text-yellow-700 dark:text-yellow-400">Obrigações Legais:</strong>
                      <span className="text-muted-foreground"> Quando exigido por autoridades competentes</span>
                    </div>
                    <div className="p-3 border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-950/20">
                      <strong className="text-blue-700 dark:text-blue-400">Transferência de Negócio:</strong>
                      <span className="text-muted-foreground"> Em caso de fusão, aquisição ou venda (com notificação prévia)</span>
                    </div>
                  </div>
                </section>

                <section className="bg-green-50 dark:bg-green-950/20 p-6 rounded-lg border border-green-200 dark:border-green-900">
                  <h2 className="text-xl font-semibold mb-4">6. Integração com WhatsApp Business e Meta Platforms</h2>
                  <p className="text-muted-foreground leading-relaxed mb-4">
                    O ConvoFlow se integra à <strong>WhatsApp Business Platform</strong> (Meta Cloud API) e à infraestrutura
                    da <strong>Meta Platforms, Inc.</strong> para viabilizar o envio e recebimento de mensagens em nome de
                    nossos clientes. Esta seção descreve, em conformidade com as exigências da Meta e da LGPD, como esses
                    dados são tratados.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium mb-2">Dados transmitidos à Meta:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Números de telefone de remetentes e destinatários (formato E.164)</li>
                        <li>Conteúdo das mensagens enviadas (texto, mídia, templates, mensagens interativas)</li>
                        <li>Metadados técnicos: timestamps, identificadores de mensagem (wamid), status de entrega</li>
                        <li>Identificadores da conta WhatsApp Business (Phone Number ID e WABA ID)</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Finalidades:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Roteamento e entrega de mensagens entre cliente e destinatário final</li>
                        <li>Confirmação de leitura, entrega e métricas de engajamento</li>
                        <li>Cumprimento das políticas da Meta sobre janelas de atendimento de 24 horas e uso de templates</li>
                        <li>Prevenção a fraudes, spam e abuso da plataforma WhatsApp</li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Bases legais e responsabilidades:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>
                          <strong>Execução de contrato</strong> com o cliente que contratou o ConvoFlow e
                          <strong> consentimento</strong> dos destinatários finais (opt-in), conforme exigido pela
                          WhatsApp Business Policy. A base legal do tratamento dos dados dos destinatários é definida
                          e assegurada pela loja cliente, na condição de controladora (seção 2).
                        </li>
                        <li>
                          A Meta atua como <strong>operadora</strong> dos dados de mensageria conforme seus próprios termos e
                          política de privacidade, disponíveis em{' '}
                          <a href="https://www.whatsapp.com/legal/business-policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            whatsapp.com/legal/business-policy
                          </a>{' '}
                          e{' '}
                          <a href="https://www.facebook.com/privacy/policy" target="_blank" rel="noopener noreferrer" className="text-primary underline">
                            facebook.com/privacy/policy
                          </a>.
                        </li>
                        <li>
                          O cliente do ConvoFlow é responsável por obter o consentimento prévio e expresso dos
                          destinatários antes de iniciar qualquer comunicação por WhatsApp e por respeitar pedidos de
                          descadastramento (opt-out).
                        </li>
                      </ul>
                    </div>

                    {/*
                      NOTA (retenção): não existe expurgo automático. Não há cron, job
                      agendado nem configuração de retenção por Conta em nenhum ponto do
                      produto — as mensagens e mídias ficam armazenadas enquanto a Conta
                      existir. Por isso o texto abaixo NÃO promete prazo de eliminação
                      automática: a exclusão é feita mediante solicitação, o que hoje é
                      um procedimento manual e atendível.
                      Se um dia for implementado expurgo automático, este texto e o da
                      seção 7 podem voltar a declarar um prazo — mas só depois disso.
                    */}
                    <div>
                      <h3 className="font-medium mb-2">Retenção e exclusão:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>O conteúdo das mensagens e as mídias correspondentes são armazenados em nossa infraestrutura enquanto a Conta da loja cliente permanecer ativa, por serem parte do histórico de atendimento que constitui o próprio objeto do serviço contratado.</li>
                        <li>Encerrada a Conta, os dados são mantidos pelos prazos legais aplicáveis e eliminados mediante solicitação da loja cliente, ressalvadas as hipóteses de guarda obrigatória previstas em lei.</li>
                        <li>O wamid e os metadados de status seguem o mesmo tratamento, para fins de auditoria e suporte.</li>
                        <li>A loja cliente, na condição de controladora, pode solicitar a qualquer momento a exclusão de contatos, de conversas específicas ou da totalidade do histórico, pelo e-mail contato@convoflow.com.br.</li>
                        <li>A Meta mantém os dados conforme seus próprios prazos, descritos na política de privacidade da Meta; a exclusão junto à Meta deve ser solicitada diretamente a ela.</li>
                      </ul>
                      <p className="text-muted-foreground mt-3">
                        O passo a passo para pedir a exclusão está em{' '}
                        <Link to="/exclusao-de-dados" className="text-primary underline">Instruções para Exclusão de Dados</Link>.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Transferência internacional:</h3>
                      <p className="text-muted-foreground">
                        Por se tratar de empresa sediada nos Estados Unidos, a Meta processa parte dos dados em servidores
                        fora do Brasil. A transferência é amparada pelas hipóteses do art. 33 da LGPD,
                        em especial pela execução de contrato e pelo consentimento específico do titular ao utilizar o
                        WhatsApp.
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">7. Armazenamento e Segurança</h2>
                  <div className="space-y-4">
                    {/*
                      NOTA (retenção): não existe expurgo automático de mensagens, mídias
                      ou logs. Ver a nota equivalente na seção 6. Os prazos abaixo que
                      mencionam anos decorrem de obrigação legal (fiscal/contratual) e não
                      dependem de rotina nossa; os demais itens não declaram prazo de
                      eliminação automática justamente porque ela não existe.
                    */}
                    <div>
                      <h3 className="font-medium mb-2">Período de Retenção:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li><strong>Dados de conta:</strong> Durante a vigência do contrato + 5 anos</li>
                        <li><strong>Dados de mensagens e mídias:</strong> Enquanto a Conta estiver ativa; após o encerramento, eliminados mediante solicitação</li>
                        <li><strong>Logs de acesso:</strong> 6 meses para segurança</li>
                        <li><strong>Dados financeiros:</strong> Conforme legislação fiscal (5-10 anos)</li>
                      </ul>
                    </div>
                    
                    <div>
                      <h3 className="font-medium mb-2">Medidas de Segurança:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Criptografia em trânsito e em repouso</li>
                        <li>Controle de acesso baseado em funções</li>
                        <li>Monitoramento contínuo de segurança</li>
                        <li>Backups seguros e redundantes</li>
                        <li>Auditoria regular de sistemas</li>
                      </ul>
                    </div>
                  </div>
                </section>

                <section className="bg-primary/5 p-6 rounded-lg border">
                  <h2 className="text-xl font-semibold mb-4">8. Seus Direitos (LGPD)</h2>
                  <p className="text-muted-foreground mb-4">
                    Como titular de dados pessoais, você possui os seguintes direitos:
                  </p>
                  
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Confirmação:</strong> Saber se tratamos seus dados</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Acesso:</strong> Obter cópia dos seus dados</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Correção:</strong> Corrigir dados incompletos ou incorretos</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Eliminação:</strong> Excluir dados desnecessários</span>
                        </li>
                      </ul>
                    </div>
                    <div>
                      <ul className="space-y-2 text-sm">
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Portabilidade:</strong> Receber dados em formato estruturado</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Oposição:</strong> Opor-se ao tratamento</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Informação:</strong> Conhecer entidades com quem compartilhamos</span>
                        </li>
                        <li className="flex items-start">
                          <span className="w-2 h-2 bg-primary rounded-full mt-2 mr-3 flex-shrink-0"></span>
                          <span><strong>Revogação:</strong> Retirar consentimento a qualquer momento</span>
                        </li>
                      </ul>
                    </div>
                  </div>
                  
                  <div className="mt-4 p-4 bg-background rounded border space-y-3">
                    <p className="text-sm text-muted-foreground mb-0">
                      <strong>Como exercer seus direitos:</strong> Entre em contato através do e-mail
                      contato@convoflow.com.br. Responderemos em até 15 dias úteis. O atendimento às
                      solicitações é feito por esse canal; a plataforma não dispõe de área de autoatendimento
                      para exportação ou exclusão de dados.
                    </p>
                    <p className="text-sm text-muted-foreground mb-0">
                      <strong>Se você é cliente final de uma loja:</strong> os direitos acima devem ser exercidos
                      perante a loja com a qual você se comunicou, que é a controladora desses dados (seção 2).
                      Solicitações recebidas por nós serão encaminhadas a ela, à qual cabe a decisão sobre o pedido.
                    </p>
                  </div>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">9. Cookies e Tecnologias Similares</h2>
                  {/*
                    NÃO ALTERAR SEM VERIFICAR O CÓDIGO.
                    Esta seção descreve exatamente o que a aplicação grava hoje no navegador:
                      - localStorage 'convoflow-auth' — sessão do Supabase (essencial)
                      - cookie 'sidebar:state' (7 dias) — estado da barra lateral (preferência)
                      - localStorage — Conta ativa, agrupamento de conversas, painel de contato
                    NÃO existe Google Analytics, Meta Pixel, Hotjar ou similar em index.html
                    nem no bundle. Se algum rastreador for adicionado — inclusive ativando o
                    Rewardful via VITE_REWARDFUL_API_KEY, que injeta r.wdfl.co/rw.js e grava
                    cookie de indicação — esta seção passa a estar incorreta e um banner de
                    consentimento passa a ser exigível. Atualize os dois juntos.
                  */}
                  <p className="text-muted-foreground leading-relaxed">
                    O ConvoFlow utiliza <strong>apenas cookies e armazenamento local estritamente necessários</strong>
                    {' '}ao funcionamento da plataforma. Não utilizamos cookies de publicidade, de rastreamento
                    comportamental ou de análise de audiência por terceiros.
                  </p>

                  <div className="mt-4 space-y-3">
                    <div>
                      <h3 className="font-medium mb-2">Necessários à autenticação:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>
                          Token de sessão armazenado localmente no navegador, sob a chave
                          {' '}<code className="text-xs">convoflow-auth</code>, indispensável para manter você
                          autenticado. Sem ele, não é possível acessar a plataforma.
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Preferências de interface:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>Estado da barra lateral (recolhida ou expandida), com validade de 7 dias.</li>
                        <li>Conta ativa selecionada, forma de exibição das conversas e visibilidade do painel de contato.</li>
                      </ul>
                      <p className="text-sm text-muted-foreground mt-2 mb-0">
                        São gravados exclusivamente no seu navegador, em decorrência de ações suas na interface, e
                        não são transmitidos a terceiros.
                      </p>
                    </div>

                    <div>
                      <h3 className="font-medium mb-2">Componentes de terceiros:</h3>
                      <ul className="list-disc pl-6 text-muted-foreground">
                        <li>
                          O SDK da Meta (<code className="text-xs">connect.facebook.net</code>) é carregado
                          somente dentro da área autenticada e apenas quando o usuário opta por conectar um número
                          de WhatsApp pelo cadastro incorporado da Meta. Nessa hipótese, a Meta poderá gravar seus
                          próprios cookies, conforme a política de privacidade dela.
                        </li>
                      </ul>
                    </div>
                  </div>

                  <p className="text-muted-foreground leading-relaxed mt-4">
                    Por se limitarem ao estritamente necessário e às preferências decorrentes de ação do próprio
                    usuário, esses registros dispensam banner de consentimento, nos termos do Guia Orientativo da
                    ANPD sobre cookies. Você pode, ainda assim, bloqueá-los ou removê-los nas configurações do seu
                    navegador, ciente de que isso impedirá a autenticação na plataforma. Caso venhamos a adotar
                    cookies não essenciais, solicitaremos seu consentimento previamente e atualizaremos esta seção.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">10. Alterações na Política</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Esta política pode ser atualizada periodicamente. Notificaremos sobre mudanças significativas 
                    por e-mail e através da plataforma. Recomendamos revisar esta política regularmente.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">11. Base Legal para Tratamento</h2>
                  <p className="text-muted-foreground mb-3">
                    As bases legais abaixo aplicam-se ao tratamento em que o ConvoFlow atua como controlador,
                    conforme a seção 2:
                  </p>
                  <div className="space-y-2 text-muted-foreground">
                    <p><strong>Execução de contrato:</strong> Prestação dos serviços contratados</p>
                    <p><strong>Interesse legítimo:</strong> Melhorias, segurança e prevenção à fraude</p>
                    <p><strong>Consentimento:</strong> Marketing e comunicações opcionais</p>
                    <p><strong>Cumprimento legal:</strong> Obrigações fiscais e regulatórias</p>
                  </div>
                  <p className="text-muted-foreground mt-3">
                    Quanto aos dados de clientes finais, tratados na condição de operador, a definição e a
                    comprovação da base legal competem à loja cliente, na qualidade de controladora.
                  </p>
                </section>

                <section className="bg-muted/50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">Contato e Ouvidoria</h2>
                  <div className="grid md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p><strong>Encarregado de Dados (DPO):</strong></p>
                      <p>contato@convoflow.com.br</p>
                      <p>CONVOFLOW TECNOLOGIA LTDA</p>
                      <p>Rua Pereira Valente, 578, Sala 207</p>
                      <p>Meireles, Fortaleza/CE, CEP 60.160-250</p>
                    </div>
                    <div>
                      <p><strong>Autoridade Nacional (ANPD):</strong></p>
                      <p>Se não ficar satisfeito com nossa resposta, você pode contatar a ANPD</p>
                      <p>www.gov.br/anpd</p>
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}