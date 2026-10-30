
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowRight, Mail, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { salesTrialOn, signupEntryPath, startCtaLabel } from '@/lib/signup/release';
import { TRIAL_DAYS } from '@/lib/billing/trialOffer';
import { ctaSubtitle } from '@/lib/landing/socialProof';

export const CTASection = () => {
  return (
    // Começa no lilás escuro (--brand-secondary-dark), fixo nos dois temas:
    // texto claro sobre o lilás claro da marca dava 3,8:1, abaixo do AA.
    // superficie-carvao: dentro da faixa valem as tintas claras (lote 7).
    <section className="superficie-carvao py-12 sm:py-16 md:py-20 bg-gradient-to-r from-brand-secondary-dark to-brand-dark relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30" 
           style={{
             backgroundImage: `url("data:image/svg+xml,%3csvg width='60' height='60' xmlns='http://www.w3.org/2000/svg'%3e%3cdefs%3e%3cpattern id='dots' width='60' height='60' patternUnits='userSpaceOnUse'%3e%3ccircle cx='30' cy='30' r='2' fill='white' fill-opacity='0.4'/%3e%3c/pattern%3e%3c/defs%3e%3crect width='100%25' height='100%25' fill='url(%23dots)'/%3e%3c/svg%3e")`
           }} />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
          className="text-center text-foreground"
        >
          <div className="inline-flex items-center bg-foreground/20 rounded-full px-4 sm:px-6 py-2 mb-6 sm:mb-8">
            <Zap className="w-4 h-4 mr-2" />
            <span className="text-xs sm:text-sm font-medium">
              Transforme seu WhatsApp hoje mesmo
            </span>
          </div>

          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold mb-4 sm:mb-6 leading-tight px-4 sm:px-0">
            Pronto para multiplicar suas vendas no WhatsApp?
          </h2>
          
          {/* "Mais de X empresas" só com a chave ligada
              (src/lib/landing/socialProof.ts). Desligada, uma frase sem número. */}
          <p
            data-testid="cta-subtitulo"
            className="text-lg sm:text-xl mb-6 sm:mb-8 opacity-90 max-w-2xl mx-auto px-4 sm:px-0"
          >
            {ctaSubtitle()}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 px-4 sm:px-0">
            <Link to={signupEntryPath()} className="w-full sm:w-auto">
              <Button 
                size="xl" 
                variant="secondary"
                className="bg-papel text-brand-dark hover:bg-papel/90 group w-full sm:w-auto"
              >
                {startCtaLabel()}
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
            
            <a 
              href="mailto:contato@convoflow.com.br?subject=Quero%20falar%20do%20ConvoFlow"
              className="w-full sm:w-auto"
            >
              <Button 
                size="xl" 
                className="bg-background text-foreground hover:bg-background/90 w-full sm:w-auto"
              >
                Falar com Especialista
                <Mail className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>

          {/* O teste grátis só aparece com as duas chaves ligadas
              (src/lib/signup/release.ts). Desligadas, a chamada fica como era. */}
          {salesTrialOn() ? (
            <p data-testid="cta-teste-gratis" className="text-sm sm:text-base mt-4 sm:mt-6 font-medium px-4 sm:px-0">
              {TRIAL_DAYS} dias grátis: cancele antes do fim do teste e não paga nada.
            </p>
          ) : null}
          <p className="text-xs sm:text-sm mt-4 sm:mt-6 opacity-75 px-4 sm:px-0">
            ⚡ Cancele quando quiser • 🛡️ Seguro e confiável • ✉️ Suporte brasileiro
          </p>
        </motion.div>
      </div>
    </section>
  );
};
