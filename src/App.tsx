import React, { Suspense } from 'react';
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/layout/DashboardLayout";
import { ChatbotProvider } from "@/contexts/ChatbotContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { TenantProvider } from "@/contexts/TenantContext";
import { PortaDeEntrada } from '@/components/auth/PortaDeEntrada';
import { TelaGuard } from '@/components/auth/TelaGuard';
import { DashboardCardSkeleton } from "@/components/shared/Skeleton";

// Landing Page (carregamento imediato)
import LandingPage from "./pages/LandingPage";
import Login from "./pages/Login";
import { Auth } from "./pages/Auth";
import { DefinirSenha } from "./pages/DefinirSenha";
import TermsOfService from "./pages/TermsOfService";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import DataDeletion from "./pages/DataDeletion";
import NotFound from "./pages/NotFound";

// Dashboard Pages (lazy loading). O mapa é o primeiro segmento depois de
// /dashboard/: a mesma função baixa a tela no React.lazy e no precarregar.
const TELAS_DO_PAINEL = {
  '': () => import("./pages/Index"),
  conversations: () => import("./pages/Conversations"),
  contacts: () => import("./pages/Contacts"),
  funnel: () => import("./pages/Funnel"),
  tracking: () => import("./pages/Tracking"),
  reports: () => import("./pages/Reports"),
  chatbots: () => import("./pages/Chatbots"),
  campaigns: () => import("./pages/Campaigns"),
  templates: () => import("./pages/Templates"),
  followups: () => import("./pages/Followups"),
  automation: () => import("./pages/Automation"),
  settings: () => import("./pages/Settings"),
  notifications: () => import("./pages/Notifications"),
  help: () => import("./pages/Help"),
  admin: () => import("./pages/dashboard/AdminDashboard"),
  team: () => import("./pages/dashboard/TeamPage"),
  'store-comparison': () => import("./pages/dashboard/StoreComparison"),
  'whatsapp-numbers': () => import("./pages/WhatsAppNumbers"),
} as const;

const Index = React.lazy(TELAS_DO_PAINEL['']);
const Conversations = React.lazy(TELAS_DO_PAINEL.conversations);
const Contacts = React.lazy(TELAS_DO_PAINEL.contacts);
const Funnel = React.lazy(TELAS_DO_PAINEL.funnel);
const Tracking = React.lazy(TELAS_DO_PAINEL.tracking);
const Reports = React.lazy(TELAS_DO_PAINEL.reports);
const Chatbots = React.lazy(TELAS_DO_PAINEL.chatbots);
const Campaigns = React.lazy(TELAS_DO_PAINEL.campaigns);
const Templates = React.lazy(TELAS_DO_PAINEL.templates);
const Followups = React.lazy(TELAS_DO_PAINEL.followups);
const Automation = React.lazy(TELAS_DO_PAINEL.automation);
const Settings = React.lazy(TELAS_DO_PAINEL.settings);
const ProfileSettings = React.lazy(() => import("@/components/settings/ProfileSettings").then(module => ({ default: module.ProfileSettings })));
const Notifications = React.lazy(TELAS_DO_PAINEL.notifications);
const Help = React.lazy(TELAS_DO_PAINEL.help);
const AdminDashboard = React.lazy(TELAS_DO_PAINEL.admin);
const UsersPage = React.lazy(() => import("./pages/dashboard/admin/UsersPage"));
const UsageLimitsPage = React.lazy(() => import("./pages/dashboard/admin/UsageLimitsPage"));
const TeamPage = React.lazy(TELAS_DO_PAINEL.team);
const StoreComparison = React.lazy(TELAS_DO_PAINEL['store-comparison']);
const WhatsAppNumbers = React.lazy(TELAS_DO_PAINEL['whatsapp-numbers']);
const ChatbotFlowBuilder = React.lazy(() => import("./pages/ChatbotFlowBuilder"));

// Quem abre o painel direto numa tela (link, favorito, recarregar) já começa a
// baixar a tela junto com a sessão, em vez de esperar a porta de entrada
// decidir (lote 6f, B14). Uma tela que a pessoa não pode ver só fica no cache.
if (typeof window !== 'undefined') {
  const caminho = /^\/dashboard(?:\/([^/]*))?/.exec(window.location.pathname);
  const carregar = caminho ? TELAS_DO_PAINEL[(caminho[1] ?? '') as keyof typeof TELAS_DO_PAINEL] : undefined;
  if (carregar) void carregar().catch(() => {});
}

// Cadastro pelo site: pública, e só carrega com a chave ligada (release.ts).
const Cadastro = React.lazy(() => import("./pages/Cadastro"));
// Documentação pública da API: só existe com a chave API_ADDON_RELEASED ligada.
const ApiDocs = React.lazy(() => import("./pages/ApiDocs"));

// Use optimized query client configuration
import { createQueryClient } from '@/lib/queryClient';
import { API_ADDON_RELEASED, API_DOCS_PATH } from '@/lib/api/release';
import { LOGIN_PATH, PUBLIC_SIGNUP_ENABLED, signupEntryPath } from '@/lib/signup/release';
const queryClient = createQueryClient();

// Componente de loading para páginas
const PageLoadingSkeleton = () => (
  <div className="space-y-6 p-6" data-testid="carregando-pagina">
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <DashboardCardSkeleton key={i} />
      ))}
    </div>
    <div className="grid gap-6 md:grid-cols-2">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className="p-6 border rounded-lg space-y-4">
          <DashboardCardSkeleton />
        </div>
      ))}
    </div>
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
    <TooltipProvider>
      <AuthProvider>
        <TenantProvider>
          <ChatbotProvider>
            <Toaster />
            <Sonner />
            {/* React Router 7: a troca de tela vai dentro de startTransition
                (a tela atual fica um instante enquanto a nova baixa, depois
                vem o esqueleto). Era o aviso v7_startTransition, ligado no 6
                antes da troca de versão. */}
            <BrowserRouter>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<LandingPage />} />
                <Route path="/auth" element={<Auth />} />
                {/* Convite, nova senha e "Esqueci minha senha" caem aqui. Rota
                    PUBLICA de proposito: quem chega ainda nao tem senha para
                    logar, so o link ou o codigo do e-mail. */}
                <Route path="/definir-senha" element={<DefinirSenha />} />
                <Route path="/login" element={<Login />} />
                {/* Cadastro pelo site (teste grátis, entrega 2). Com a chave
                    PUBLIC_SIGNUP_ENABLED desligada (src/lib/signup/release.ts),
                    /cadastro e /register levam ao login e a página nem é
                    baixada. A trava de verdade é o secret da edge function
                    public-signup: sem ele, ninguém se cadastra. */}
                <Route path="/cadastro" element={
                  PUBLIC_SIGNUP_ENABLED ? (
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <Cadastro />
                    </Suspense>
                  ) : (
                    <Navigate to={LOGIN_PATH} replace />
                  )
                } />
                <Route path="/register" element={<Navigate to={signupEntryPath()} replace />} />
                <Route path={API_DOCS_PATH} element={
                  API_ADDON_RELEASED ? (
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <ApiDocs />
                    </Suspense>
                  ) : (
                    <Navigate to="/" replace />
                  )
                } />
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/exclusao-de-dados" element={<DataDeletion />} />

                {/* Protected Dashboard Routes */}
                {/* PortaDeEntrada: sessão, cadastro pendente, manutenção e
                    pagamento numa espera só, com um esqueleto só (lote 6f,
                    B14). As regras estão em src/lib/access/entrada.ts. */}
                <Route path="/dashboard" element={
                  <PortaDeEntrada>
                    <DashboardLayout />
                  </PortaDeEntrada>
                }>
                  {/* Toda rota do painel passa pela TelaGuard, que lê o registro
                      único de telas (src/lib/access/telas.ts): módulo ligado e
                      capacidade do cargo. Quem não alcança vê "Você não tem
                      acesso a esta tela", e não é mais jogado para outra página. */}
                  <Route index element={
                    <TelaGuard chave="">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Index />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="conversations" element={
                    <TelaGuard chave="conversations">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Conversations />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="contacts" element={
                    <TelaGuard chave="contacts">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Contacts />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="funnel" element={
                    <TelaGuard chave="funnel">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Funnel />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="tracking" element={
                    <TelaGuard chave="tracking">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Tracking />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="reports" element={
                    <TelaGuard chave="reports">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Reports />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="chatbots" element={
                    <TelaGuard chave="chatbots">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Chatbots />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="chatbots/:id/builder" element={
                    <TelaGuard chave="chatbots">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <ChatbotFlowBuilder />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="campaigns" element={
                    <TelaGuard chave="campaigns">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Campaigns />
                      </Suspense>
                    </TelaGuard>
                  } />
                  {/* Templates: sem módulo e sem capacidade no registro, de
                      propósito: é consulta só de leitura do que a Meta já
                      aprovou, e o atendente é quem precisa dela antes de
                      responder. A edge function list-whatsapp-templates já
                      confere a Conta de quem chama e não exige cargo. */}
                  <Route path="templates" element={
                    <TelaGuard chave="templates">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Templates />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="followups" element={
                    <TelaGuard chave="followups">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Followups />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="automation" element={
                    <TelaGuard chave="automation">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Automation />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="whatsapp-numbers" element={
                    <TelaGuard chave="whatsapp-numbers">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <WhatsAppNumbers />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="settings" element={
                    <TelaGuard chave="settings">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Settings />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="admin" element={
                    <TelaGuard chave="admin">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <AdminDashboard />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="admin/users" element={
                    <TelaGuard chave="admin/users">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <UsersPage />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="admin/usage-limits" element={
                    <TelaGuard chave="admin/usage-limits">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <UsageLimitsPage />
                      </Suspense>
                    </TelaGuard>
                  } />
                  {/* Equipe exige store.admin (Gestor, Gerente, Superadmin): o
                      Gestor administra a equipe da Loja dele (convida os
                      atendentes: 2 por Loja, mais com o ConvoFlow). */}
                  <Route path="team" element={
                    <TelaGuard chave="team">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <TeamPage />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="store-comparison" element={
                    <TelaGuard chave="store-comparison">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <StoreComparison />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="profile" element={
                    <TelaGuard chave="profile">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <ProfileSettings />
                      </Suspense>
                    </TelaGuard>
                  } />
                  <Route path="notifications" element={
                    <TelaGuard chave="notifications">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Notifications />
                      </Suspense>
                    </TelaGuard>
                  } />
                  {/* Ajuda: sem módulo e sem capacidade de propósito, a
                      documentação abre para qualquer sessão, como settings,
                      profile e notifications. */}
                  <Route path="help" element={
                    <TelaGuard chave="help">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Help />
                      </Suspense>
                    </TelaGuard>
                  } />

                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </BrowserRouter>
          </ChatbotProvider>
        </TenantProvider>
      </AuthProvider>
    </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
