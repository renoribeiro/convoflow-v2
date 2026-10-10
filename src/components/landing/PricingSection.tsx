import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Check, ArrowRight, Crown, Gift } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { salesTrialOn, signupEntryPath, startCtaLabel } from '@/lib/signup/release';
import { COMO_CANCELAR_NO_TESTE, TRIAL_DAYS } from '@/lib/billing/trialOffer';

export const PricingSection = () => {
  const navigate = useNavigate();
  // O teste grátis só aparece com as duas chaves ligadas
  // (src/lib/signup/release.ts). Desligadas, o preço fica como era.
  const comTeste = salesTrialOn();

  const features = [
    '5 lojas incluídas (extra por R$ 99,90/mês)',
    '1 gestor e 2 atendentes por loja (mais sob consulta)',
    'WhatsApp Business API integrado',
    'Chatbots inteligentes ilimitados',
    'Multi-atendimento em tempo real',
    'Analytics e relatórios avançados',
    'Automação de fluxos completa',
    'Templates de mensagem profissionais',
    'Segmentação avançada de contatos',
    'Webhooks para integrar com CRM, ERP ou n8n',
    'Suporte técnico prioritário',
    'Tutoriais e ajuda dentro do produto'
  ];

  const handleSubscribe = () => {
    // Login enquanto o cadastro pelo site está desligado; o formulário de
    // cadastro quando ligar (src/lib/signup/release.ts).
    navigate(signupEntryPath());
  };

  return (
    <section id="pricing" className="py-12 sm:py-16 md:py-20 bg-muted/30">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <Badge className="mb-4" variant="outline">
            <Crown className="w-4 h-4 mr-2" />
            Plano Gerente
          </Badge>
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 px-4 sm:px-0">
            Preço simples e{' '}
            <span className="text-brand-primary">transparente</span>
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground px-4 sm:px-0">
            Sem pegadinhas: um plano, preço fixo. As conversas na API oficial são cobradas pela Meta, direto de você.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="bg-card rounded-2xl border-2 border-brand-primary/20 p-6 sm:p-8 md:p-12 relative overflow-hidden"
        >
          {/* Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 to-transparent" />

          <div className="relative z-10">
            {/* Preço único */}
            <div className="text-center mb-8">
              {comTeste ? (
                <div
                  data-testid="preco-teste-gratis-selo"
                  className="inline-flex items-center rounded-full bg-brand-primary/10 px-4 py-1.5 mb-4 text-sm font-medium text-brand-dark"
                >
                  <Gift className="w-4 h-4 mr-2" />
                  {TRIAL_DAYS} dias grátis para testar
                </div>
              ) : null}
              <div className="mb-6">
                <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-foreground mb-2">
                  R$ 499,90
                  <span className="text-xl sm:text-2xl text-muted-foreground font-normal">/mês</span>
                </div>
                <div className="text-sm sm:text-base text-muted-foreground px-4 sm:px-0">
                  Plano Gerente com 5 lojas incluídas
                </div>
                <div className="text-xs sm:text-sm text-muted-foreground/80 px-4 sm:px-0 mt-1">
                  Loja adicional por R$ 99,90/mês
                </div>
              </div>

              <Button
                size="xl"
                variant="whatsapp"
                onClick={handleSubscribe}
                className="group mb-6 sm:mb-8 w-full sm:w-auto"
              >
                {startCtaLabel(comTeste)}
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>

              {comTeste ? (
                <p
                  data-testid="preco-teste-gratis"
                  className="text-sm text-muted-foreground px-4 sm:px-0 mb-2 max-w-xl mx-auto"
                >
                  Você cadastra o cartão ao começar e nada é cobrado nos {TRIAL_DAYS} dias de teste. A
                  primeira mensalidade só é cobrada no dia em que o teste termina. Para não pagar nada,{' '}
                  {COMO_CANCELAR_NO_TESTE}. Um teste por Conta.
                </p>
              ) : null}
              <p className="text-sm text-muted-foreground px-4 sm:px-0">
                Cancele quando quiser
              </p>
            </div>

            {/* Features List */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              {features.map((feature, index) => (
                <motion.div
                  key={feature}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.4, delay: index * 0.05 }}
                  viewport={{ once: true }}
                  className="flex items-center"
                >
                  <div className="w-5 h-5 rounded-full bg-brand-primary flex items-center justify-center mr-3 flex-shrink-0">
                    <Check className="w-3 h-3 text-primary-foreground" />
                  </div>
                  <span className="text-sm sm:text-base text-foreground">{feature}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
