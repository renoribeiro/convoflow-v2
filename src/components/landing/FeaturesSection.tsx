
import { motion } from 'framer-motion';
import { 
  MessageSquare, 
  Bot, 
  BarChart3, 
  Users, 
  Zap, 
  Shield,
  Clock,
  Target,
  Smartphone
} from 'lucide-react';

export const FeaturesSection = () => {
  const features = [
    {
      icon: Bot,
      title: 'Chatbots Inteligentes',
      description: 'Crie chatbots personalizados que respondem automaticamente e qualificam leads 24/7.',
      color: 'bg-blue-500'
    },
    {
      icon: MessageSquare,
      title: 'Multi-atendimento',
      description: 'Gerencie múltiplas conversas simultaneamente com interface intuitiva e organizada.',
      color: 'bg-brand-primary'
    },
    {
      icon: BarChart3,
      title: 'Analytics Avançado',
      description: 'Relatórios detalhados sobre performance, conversões e métricas de engajamento.',
      color: 'bg-purple-500'
    },
    {
      icon: Users,
      title: 'Gestão de Equipe',
      description: 'Organize sua equipe, distribua conversas e monitore performance individual.',
      color: 'bg-orange-500'
    },
    {
      icon: Zap,
      title: 'Automação Completa',
      description: 'Fluxos automáticos para captura, qualificação e nutrição de leads.',
      color: 'bg-yellow-500'
    },
    {
      icon: Shield,
      title: 'Segurança Avançada',
      description: 'Criptografia em trânsito e em repouso, dados no Brasil e conformidade com a LGPD.',
      color: 'bg-red-500'
    },
    {
      icon: Clock,
      title: 'Respostas Instantâneas',
      description: 'Templates prontos e respostas rápidas para agilizar o atendimento.',
      color: 'bg-indigo-500'
    },
    {
      icon: Target,
      title: 'Segmentação Inteligente',
      description: 'Organize contatos por tags, comportamento e histórico de interações.',
      color: 'bg-pink-500'
    },
    {
      icon: Smartphone,
      title: 'Multi-dispositivos',
      description: 'Acesse de qualquer lugar: desktop, tablet ou smartphone com sincronização.',
      color: 'bg-green-500'
    }
  ];

  return (
    <section id="features" className="py-12 sm:py-16 md:py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12 sm:mb-16"
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-foreground mb-4 px-4 sm:px-0">
            Tudo que você precisa para{' '}
            <span className="text-brand-dark">dominar o WhatsApp</span>
          </h2>
          <p className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto px-4 sm:px-0">
            Recursos avançados desenvolvidos especificamente para maximizar 
            seus resultados no WhatsApp Business
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {features.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="group p-6 rounded-xl border border-border hover:border-brand-primary/50 transition-all duration-300 hover:shadow-lg bg-card"
            >
              <div className={`w-12 h-12 rounded-lg ${feature.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
                <feature.icon className="w-6 h-6 text-white" />
              </div>
              
              <h3 className="text-xl font-semibold text-foreground mb-3 group-hover:text-brand-primary transition-colors">
                {feature.title}
              </h3>
              
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
