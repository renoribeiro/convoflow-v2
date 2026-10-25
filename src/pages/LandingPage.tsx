
import { HeroSection } from '@/components/landing/HeroSection';
import { FeaturesSection } from '@/components/landing/FeaturesSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { TestimonialsSection } from '@/components/landing/TestimonialsSection';
import { FAQSection } from '@/components/landing/FAQSection';
import { CTASection } from '@/components/landing/CTASection';
import { LandingNavbar } from '@/components/landing/LandingNavbar';
import { LandingFooter } from '@/components/landing/LandingFooter';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-background">
      <LandingNavbar />
      <HeroSection />
      <FeaturesSection />
      <PricingSection />
      {/* O bloco "Empresas que confiam no ConvoFlow" saiu em 2026-10-25
          (achado 1 do checkup, ops-privado/checkup-ux/RELATORIO_CHECKUP_UX.md):
          os seis logos eram inventados ("TechCorp", "Digital Agency"...).
          Volta só com clientes de verdade que autorizarem o nome. */}
      <TestimonialsSection />
      <FAQSection />
      <CTASection />
      <LandingFooter />
    </div>
  );
}
