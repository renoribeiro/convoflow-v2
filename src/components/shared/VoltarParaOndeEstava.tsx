import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

/**
 * "Voltar" das páginas públicas (Termos, Política, Exclusão de dados).
 *
 * Antes era um link fixo para /auth: quem chegava pela página de vendas ou de
 * dentro do sistema caía no login (achado 10). Agora volta no histórico quando
 * a pessoa veio de outra tela do ConvoFlow; quem abriu o endereço direto (sem
 * histórico desta aba) vai para o início.
 */
export function VoltarParaOndeEstava() {
  const navigate = useNavigate();

  const voltar = () => {
    // O BrowserRouter guarda a posição no histórico em history.state.idx;
    // 0 (ou ausente) quer dizer que esta é a primeira tela da aba.
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else navigate('/');
  };

  return (
    <button
      type="button"
      onClick={voltar}
      className="inline-flex items-center text-brand-primary hover:text-brand-secondary transition-colors mb-4"
    >
      <ArrowLeft className="w-4 h-4 mr-2" />
      Voltar
    </button>
  );
}
