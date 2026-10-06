import { Button } from '@/components/ui/button';
import { HeroHighlight, Highlight } from '@/components/ui/hero-highlight';
import { motion } from 'framer-motion';
import { ArrowRight, Play, MessageSquare, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { salesTrialOn, signupEntryPath, startCtaLabel } from '@/lib/signup/release';
import { TRIAL_DAYS } from '@/lib/billing/trialOffer';

export const HeroSection = () => {
  /**
   * Leva para a seção de Funcionalidades — a mesma âncora `#features` que o
   * rodapé e o menu já usam. O href fica no <a> para o link continuar sendo um
   * link de verdade (teclado, abrir em nova aba, colar o endereço); o
   * preventDefault só entra quando a seção existe, para trocar o salto seco
   * pela rolagem suave, do mesmo jeito que a página de Ajuda faz.
   */
  const rolarParaFuncionalidades = (evento: React.MouseEvent<HTMLAnchorElement>) => {
    const secao = document.getElementById('features');
    if (!secao) return;
    evento.preventDefault();
    secao.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="pt-20 sm:pt-24 md:pt-28 lg:pt-32">
      <HeroHighlight>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-8"
            >
              <div className="inline-flex items-center bg-brand-light/50 rounded-full px-6 py-2 mb-8">
                <MessageSquare className="w-4 h-4 text-brand-dark mr-2" />
                <span className="text-sm font-medium text-brand-dark">
                  Revolucione seu WhatsApp Business
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-foreground mb-4 sm:mb-6 leading-tight px-4 sm:px-0">
                Automatize seu{' '}
                <Highlight className="text-brand-primary">
                  WhatsApp Business
                </Highlight>{' '}
                e multiplique suas vendas
              </h1>

              <p className="text-lg sm:text-xl md:text-2xl text-muted-foreground mb-6 sm:mb-8 max-w-3xl mx-auto leading-relaxed px-4 sm:px-0">
                A única plataforma que você precisa para gerenciar conversas, 
                automatizar respostas e converter mais leads no WhatsApp.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4 mb-8 sm:mb-12 px-4 sm:px-0"
            >
              <Link to={signupEntryPath()}>
                <Button size="xl" variant="whatsapp" className="group w-full sm:w-auto">
                  {startCtaLabel()}
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                </Button>
              </Link>
              
              <a
                href="#features"
                onClick={rolarParaFuncionalidades}
                className="w-full sm:w-auto"
              >
                <Button size="xl" variant="outline" className="group w-full sm:w-auto">
                  <Play className="mr-2 h-5 w-5" />
                  Ver Demonstração
                </Button>
              </a>
            </motion.div>

            {/* O teste grátis só aparece com as duas chaves ligadas
                (src/lib/signup/release.ts). Desligadas, o topo fica como era. */}
            {salesTrialOn() ? (
              <p
                data-testid="hero-teste-gratis"
                className="-mt-4 sm:-mt-8 mb-8 sm:mb-12 px-4 sm:px-0 text-sm sm:text-base text-muted-foreground"
              >
                <strong className="text-foreground">{TRIAL_DAYS} dias grátis.</strong> O cartão só é
                cobrado no fim do teste. Cancele antes e não paga nada.
              </p>
            ) : null}

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 max-w-4xl mx-auto px-4 sm:px-0"
            >
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-brand-dark/10 rounded-full mb-4">
                  <TrendingUp className="w-8 h-8 text-brand-dark" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">+300%</h3>
                <p className="text-muted-foreground">Aumento em conversões</p>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-brand-dark/10 rounded-full mb-4">
                  <Users className="w-8 h-8 text-brand-dark" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">50k+</h3>
                <p className="text-muted-foreground">Empresas atendidas</p>
              </div>
              
              <div className="flex flex-col items-center">
                <div className="flex items-center justify-center w-16 h-16 bg-brand-dark/10 rounded-full mb-4">
                  <MessageSquare className="w-8 h-8 text-brand-dark" />
                </div>
                <h3 className="text-2xl font-bold text-foreground">1M+</h3>
                <p className="text-muted-foreground">Mensagens processadas</p>
              </div>
            </motion.div>
          </div>
        </div>
      </HeroHighlight>
    </section>
  );
};
