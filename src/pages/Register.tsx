import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * O fluxo de signup público foi descontinuado. Toda criação de conta agora
 * passa pela hierarquia (Superadmin convida Gestor de Contas/Enterprise;
 * Gestor convida Enterprise; Enterprise convida Usuário).
 *
 * Este componente é mantido apenas como redirecionamento para a página de
 * login, com toast informativo em PT-BR, para não quebrar links externos
 * antigos para `/register`.
 */
export default function Register() {
  useEffect(() => {
    toast.info('Cadastro disponível apenas por convite.', {
      description:
        'Solicite ao administrador da sua conta um convite para acessar a plataforma.',
      duration: 6000,
    });
  }, []);

  return <Navigate to="/login" replace />;
}
