import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Instruções públicas de exclusão de dados. A Meta exige uma URL pública com
 * esse conteúdo para publicar o app (Data Deletion Instructions URL). Mesmo
 * layout das outras duas páginas legais (TermsOfService / PrivacyPolicy).
 */
export default function DataDeletion() {
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
              <CardTitle className="text-3xl text-center">Instruções para Exclusão de Dados</CardTitle>
              <p className="text-center text-muted-foreground">
                Última atualização: 12 de setembro de 2026
              </p>
            </CardHeader>
            <CardContent className="prose prose-slate dark:prose-invert max-w-none">
              <div className="space-y-8">
                <section className="bg-primary/5 p-6 rounded-lg border">
                  <h2 className="text-xl font-semibold mb-4">1. Quem somos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    <strong>CONVOFLOW TECNOLOGIA LTDA</strong>, CNPJ 68.930.380/0001-05, com sede na Rua Pereira
                    Valente, 578, Sala 207, Meireles, Fortaleza/CE, CEP 60.160-250, responsável pela plataforma
                    ConvoFlow.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">2. Como solicitar a exclusão dos seus dados</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    A solicitação é feita por e-mail para <strong>contato@convoflow.com.br</strong>, com o assunto
                    "Exclusão de dados". Informe o e-mail cadastrado na plataforma e, se houver, o número de
                    telefone conectado à plataforma. A plataforma não possui área de autoatendimento para
                    exclusão, por isso o pedido é processado manualmente pela nossa equipe.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">3. Prazos</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Confirmamos o recebimento do pedido em até 5 (cinco) dias úteis e concluímos a exclusão em
                    até 15 (quinze) dias corridos, contados da confirmação da sua identidade. Você recebe uma
                    confirmação por e-mail quando a exclusão for concluída.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">4. O que é excluído</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Dados cadastrais da conta, dados de acesso e o histórico de conversas e contatos vinculados
                    à conta solicitante.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">5. O que pode ser mantido</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Registros que a legislação brasileira obriga a guardar, como registros de acesso a
                    aplicações de internet pelo prazo previsto no Marco Civil da Internet e documentos fiscais
                    pelo prazo exigido pela legislação tributária. Esses registros ficam restritos a essa
                    finalidade e são eliminados ao fim do prazo legal.
                  </p>
                </section>

                <section>
                  <h2 className="text-xl font-semibold mb-4">6. Como desconectar o ConvoFlow da sua conta Meta</h2>
                  <p className="text-muted-foreground leading-relaxed">
                    Além do pedido acima, você pode remover a integração diretamente na Meta: acesse sua conta
                    do Facebook, vá em <strong>Configurações e privacidade</strong>, depois{' '}
                    <strong>Configurações</strong>, depois <strong>Integrações empresariais</strong>, localize o
                    ConvoFlow e clique em <strong>Remover</strong>. Isso encerra o acesso do ConvoFlow aos seus
                    dados na Meta, mas não exclui os dados já armazenados na nossa plataforma, o que exige a
                    solicitação da seção 2.
                  </p>
                </section>

                <section className="bg-muted/50 p-6 rounded-lg">
                  <h2 className="text-xl font-semibold mb-4">7. Contato</h2>
                  <p className="text-muted-foreground mb-0">
                    <span className="font-medium">contato@convoflow.com.br</span>
                  </p>
                </section>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
