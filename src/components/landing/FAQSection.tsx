
import { motion } from 'framer-motion';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { salesTrialOn } from '@/lib/signup/release';
import { COMO_CANCELAR_NO_TESTE, TRIAL_DAYS } from '@/lib/billing/trialOffer';

export const FAQSection = () => {
  // O teste grátis só aparece com as duas chaves ligadas
  // (src/lib/signup/release.ts). Desligadas, a FAQ não fala dele.
  const comTeste = salesTrialOn();

  const faqs = [
    {
      question: 'Como funciona a integração com o WhatsApp Business?',
      answer: 'O ConvoFlow se conecta à API oficial do WhatsApp Business, da Meta. O número é o mesmo que seus clientes já conhecem. O que muda é onde ele é atendido: as conversas passam para a plataforma e o número deixa de ser usado no aplicativo do WhatsApp no celular.'
    },
    {
      question: 'É possível integrar com meu CRM/ERP atual?',
      answer: 'Sim, por webhooks: o ConvoFlow avisa a outra ferramenta no instante em que algo acontece aqui: mensagem recebida, contato criado ou atualizado, campanha iniciada ou concluída, follow-up agendado, chatbot acionado. É assim que ele se liga ao que você já usa, normalmente por uma ferramenta de automação como n8n ou Make, sem ninguém copiar lead na mão.'
    },
    {
      question: 'Os chatbots funcionam em português?',
      answer: 'Sim. Você monta o fluxo em português num construtor visual: mensagens, menus de opções, perguntas cujas respostas o bot guarda no contato e o ponto em que ele passa a conversa para alguém do time. O cliente responde escolhendo entre as opções que você definiu. O bot não interpreta texto livre, e é por isso que responde na hora e não inventa.'
    },
    {
      question: 'Quantas mensagens posso enviar por mês?',
      answer: 'O ConvoFlow não cobra por mensagem nem limita a quantidade: o plano é por loja, e as mensagens na plataforma são ilimitadas. O que existe é a cobrança da própria Meta pelas conversas na API oficial, feita direto no cartão do seu portfólio empresarial. Os valores atuais estão em developers.facebook.com/docs/whatsapp/pricing. A Meta também aplica um limite diário de quantas pessoas você pode abordar primeiro (responder quem te escreveu não conta), e ele cresce sozinho conforme o número é bem usado.'
    },
    {
      question: 'Meus dados ficam seguros?',
      answer: 'Sim. Seus dados ficam em servidores no Brasil, com criptografia em trânsito e em repouso, e seguimos a LGPD. Eles só são compartilhados com quem precisa deles para o serviço funcionar (a Meta, que entrega as mensagens do WhatsApp, e o processador de pagamento), como descreve nossa Política de Privacidade.'
    },
    {
      question: 'Como funciona o suporte técnico?',
      answer: 'Por e-mail, em português, em horário comercial: contato@convoflow.com.br. Dentro do produto, a Ajuda tem tutoriais passo-a-passo e a documentação de cada tela, para a sua equipe aprender sozinha, e a gente responde o que ela não resolver.'
    },
    ...(comTeste
      ? [
          {
            question: 'Como funciona o teste grátis?',
            answer: `A primeira assinatura de cada Conta começa com ${TRIAL_DAYS} dias grátis. Você cria a Conta pelo site e cadastra o cartão no Stripe, mas nada é cobrado durante o teste: a primeira mensalidade só é cobrada no dia em que ele termina, e essa data aparece antes de você cadastrar o cartão e depois em Configurações › Assinatura. Para não pagar nada, ${COMO_CANCELAR_NO_TESTE}; o sistema continua aberto até o fim do teste. O teste vale uma vez por Conta.`,
          },
        ]
      : []),
    {
      question: 'Posso cancelar a qualquer momento?',
      answer: `Sim, não há fidelidade. O Gerente da Conta cancela sozinho, sem falar com ninguém: é o botão "Cancelar assinatura", em Configurações › Assinatura. Antes de confirmar, a tela mostra até que dia o acesso continua. Ele permanece ativo até o fim ${comTeste ? 'do teste grátis ou ' : ''}do ciclo já pago.`
    }
  ];

  return (
    <section id="faq" className="py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Perguntas{' '}
            <span className="text-brand-primary">Frequentes</span>
          </h2>
          <p className="text-xl text-muted-foreground">
            Tire suas dúvidas sobre o ConvoFlow
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left hover:text-brand-primary transition-colors">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground leading-relaxed">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </section>
  );
};
