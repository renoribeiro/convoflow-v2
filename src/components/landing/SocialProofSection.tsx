
import { motion } from 'framer-motion';

export const SocialProofSection = () => {
  const companies = [
    { name: 'TechCorp', logo: '🏢' },
    { name: 'Marketing Pro', logo: '📊' },
    { name: 'E-commerce Plus', logo: '🛒' },
    { name: 'Consultoria Max', logo: '💼' },
    { name: 'Vendas Online', logo: '💰' },
    { name: 'Digital Agency', logo: '🎨' },
  ];

  return (
    <section className="py-16 bg-muted/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-8">
            Empresas que confiam no ConvoFlow
          </p>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 items-center">
            {companies.map((company, index) => (
              <motion.div
                key={company.name}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                viewport={{ once: true }}
                className="flex flex-col items-center justify-center p-4 rounded-lg hover:bg-background transition-colors"
              >
                <div className="text-4xl mb-2">{company.logo}</div>
                <span className="text-sm font-medium text-muted-foreground">
                  {company.name}
                </span>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};
