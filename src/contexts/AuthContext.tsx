
import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { clearActiveTenant } from '@/lib/activeTenant';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  logout: () => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const previousUserId = useRef<string | null>(null);

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const newUserId = session?.user?.id ?? null;

        // Limpa o cache do TanStack Query quando o usuário muda (login, logout,
        // troca de conta). Sem isso, dados do tenant anterior podem aparecer
        // no dashboard do novo usuário porque queries com queryKey customizado
        // não incluem tenant_id automaticamente.
        if (previousUserId.current !== newUserId) {
          queryClient.clear();
          previousUserId.current = newUserId;
        }

        setSession(session);
        // Preserva a MESMA referência de `user` quando é o mesmo usuário (ex.:
        // TOKEN_REFRESHED ao voltar o foco na janela). Sem isso, o TenantContext
        // (deps: [user]) recarregava a cada foco, remontando a página atual e
        // resetando estado local — como a aba ativa em Configurações.
        setUser((prev) => {
          const next = session?.user ?? null;
          if (prev?.id && next?.id && prev.id === next.id) return prev;
          return next;
        });
        setIsLoading(false);
      }
    );

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      previousUserId.current = session?.user?.id ?? null;
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);



  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast({
          title: "Erro no login",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      // fire-and-forget: registra evento de login para tracking de atividade.
      // Falha aqui não pode bloquear o login.
      supabase.functions.invoke('track-login').catch((err) => {
        console.warn('[AuthContext] track-login failed:', err);
      });

      toast({
        title: "Login realizado com sucesso!",
        description: "Bem-vindo de volta.",
      });
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email: string, password: string, firstName: string, lastName: string) => {
    setIsLoading(true);
    try {
      const redirectUrl = `${window.location.origin}/`;

      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl,
          data: {
            first_name: firstName,
            last_name: lastName,
          }
        }
      });

      if (error) {
        toast({
          title: "Erro no registro",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      toast({
        title: "Registro realizado com sucesso!",
        description: "Verifique seu email para confirmar a conta.",
      });
    } catch (error) {
      console.error('Register error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        toast({
          title: "Erro ao sair",
          description: error.message,
          variant: "destructive",
        });
        throw error;
      }

      // A Conta ativa (impersonação do superadmin / Loja do gerente) fica no
      // localStorage e não pode sobreviver para o próximo usuário do navegador.
      clearActiveTenant();

      toast({
        title: "Logout realizado com sucesso!",
        description: "Até logo!",
      });
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, session, login, register, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};
