
import { motion } from 'framer-motion';
import { Star, Quote } from 'lucide-react';

export const TestimonialsSection = () => {
  const testimonials = [
    {
      name: 'Ana Beatriz Souza',
      role: 'Diretora de Marketing, Grupo Horizonte Tech',
      avatar: '👩‍💼',
      rating: 5,
      text: 'Os relatórios ajudam bastante a gente a enxergar o que tá funcionando de verdade. O chatbot é intuitivo e a gente conseguiu adaptar rápido. Ainda estamos ajustando algumas automações mais complexas, mas já sentimos diferença no tempo de resposta e nas conversões desde o primeiro mês.'
    },
    {
      name: 'Roberto Almeida',
      role: 'Gerente Comercial, Vendas Ágeis',
      avatar: '🧑‍💼',
      rating: 4,
      text: 'O que mais gostei foi o atendimento automático de madrugada. Já pegamos lead que chegava 1h, 2h da manhã e a gente só via no outro dia. Não é milagre, mas ajuda pra caramba a não perder oportunidade. A automação liberou a equipe pra focar em fechar venda.'
    },
    {
      name: 'Juliana Ferreira',
      role: 'Fundadora, Consultoria Horizonte',
      avatar: '👩‍🎓',
      rating: 5,
      text: 'Interface bem fácil e o suporte respondeu rápido quando precisei. Implementamos em poucos dias e na primeira semana já vimos movimento. Recomendo, especialmente pra quem tá começando a organizar o atendimento no WhatsApp. Ainda tem o que melhorar em alguns relatórios, mas no geral está ótimo.'
    },
    {
      name: 'Carlos Ribeiro',
      role: 'CEO, Loja Nova Digital',
      avatar: '👨‍💼',
      rating: 4,
      text: 'A gente tava se perdendo no WhatsApp com o volume de mensagens. Depois que colocamos o ConvoFlow, a equipe conseguiu organizar melhor e atender bem mais gente. No começo deu um trabalhinho pra configurar os fluxos, mas depois ficou bem mais leve. Conversões subiram bastante, algo em torno de 80-90%.'
    }
  ];

  return (
    <section id="testimonials" className="py-20 bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            O que nossos clientes{' '}
            <span className="text-brand-primary">estão dizendo</span>
          </h2>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Histórias reais de empresas que transformaram seus resultados com o ConvoFlow
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {testimonials.map((testimonial, index) => (
            <motion.div
              key={testimonial.name}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.1 }}
              viewport={{ once: true }}
              className="bg-card rounded-xl border border-border p-6 hover:shadow-lg transition-shadow duration-300 relative"
            >
              <Quote className="absolute top-6 right-6 w-8 h-8 text-brand-primary/20" />
              
              <div className="flex items-center mb-4">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-2xl mr-4">
                  {testimonial.avatar}
                </div>
                <div>
                  <h4 className="font-semibold text-foreground">{testimonial.name}</h4>
                  <p className="text-sm text-muted-foreground">{testimonial.role}</p>
                </div>
              </div>

              <div className="flex items-center mb-4">
                {[...Array(5)].map((_, i) => (
                  <Star
                    key={i}
                    className={
                      i < testimonial.rating
                        ? 'w-4 h-4 text-yellow-500 fill-current'
                        : 'w-4 h-4 text-muted-foreground/40'
                    }
                  />
                ))}
              </div>

              <p className="text-muted-foreground leading-relaxed">
                "{testimonial.text}"
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
