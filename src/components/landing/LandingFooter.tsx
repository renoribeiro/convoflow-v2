
import { Mail, MapPin } from 'lucide-react';
import { Link } from 'react-router-dom';
import logoHorizontalDark from '@/assets/logos/logo-horizontal-dark.svg';

export const LandingFooter = () => {
  return (
    <footer className="bg-business-dark text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 sm:gap-8">
          {/* Company Info */}
          <div className="col-span-1 sm:col-span-2 md:col-span-2">
            <div className="flex items-center mb-4">
              <img src={logoHorizontalDark} alt="ConvoFlow" className="h-7 sm:h-9 w-auto" />
            </div>
            <p className="text-sm sm:text-base text-gray-300 mb-4 sm:mb-6 max-w-md">
              A plataforma mais completa para automatizar e gerenciar seu WhatsApp Business. 
              Transforme conversas em vendas.
            </p>
            <div className="space-y-2">
              <div className="flex items-center text-gray-300 text-sm sm:text-base">
                <Mail className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>contato@convoflow.com.br</span>
              </div>
              <div className="flex items-center text-gray-300 text-sm sm:text-base">
                <MapPin className="w-4 h-4 mr-2 flex-shrink-0" />
                <span>Fortaleza, CE - Brasil</span>
              </div>
            </div>
          </div>

          {/* Product Links */}
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Produto</h3>
            <ul className="space-y-2">
              <li><a href="#features" className="text-sm sm:text-base text-gray-300 hover:text-brand-primary transition-colors">Funcionalidades</a></li>
              <li><a href="#pricing" className="text-sm sm:text-base text-gray-300 hover:text-brand-primary transition-colors">Preços</a></li>
            </ul>
          </div>

          {/* Access Links */}
          <div>
            <h3 className="font-semibold text-base sm:text-lg mb-3 sm:mb-4">Acesso</h3>
            <ul className="space-y-2">
              <li><Link to="/login" className="text-sm sm:text-base text-gray-300 hover:text-brand-primary transition-colors">Entrar</Link></li>
              <li><Link to="/dashboard" className="text-sm sm:text-base text-gray-300 hover:text-brand-primary transition-colors">Painel</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-700 mt-6 sm:mt-8 pt-6 sm:pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 text-gray-400">
          <p className="text-xs sm:text-sm text-center sm:text-left">
            &copy; {new Date().getFullYear()} ConvoFlow. Todos os direitos reservados.
          </p>
          <nav className="flex items-center gap-4 sm:gap-6">
            <Link to="/terms-of-service" className="text-xs sm:text-sm hover:text-brand-primary transition-colors">
              Termos de Uso
            </Link>
            <Link to="/privacy-policy" className="text-xs sm:text-sm hover:text-brand-primary transition-colors">
              Política de Privacidade
            </Link>
            <Link to="/exclusao-de-dados" className="text-xs sm:text-sm hover:text-brand-primary transition-colors">
              Exclusão de Dados
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};
