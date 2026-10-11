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
import { AuthGuard } from '@/components/auth/AuthGuard';
import { ModuleGuard } from '@/components/auth/ModuleGuard';
import { RoleGuard } from '@/components/auth/RoleGuard';
import { MaintenanceGuard } from '@/components/maintenance/MaintenanceGuard';
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

// Dashboard Pages (lazy loading)
const Index = React.lazy(() => import("./pages/Index"));
const Conversations = React.lazy(() => import("./pages/Conversations"));
const Contacts = React.lazy(() => import("./pages/Contacts"));
const Funnel = React.lazy(() => import("./pages/Funnel"));
const Tracking = React.lazy(() => import("./pages/Tracking"));
const Reports = React.lazy(() => import("./pages/Reports"));
const Chatbots = React.lazy(() => import("./pages/Chatbots"));
const Campaigns = React.lazy(() => import("./pages/Campaigns"));
const Templates = React.lazy(() => import("./pages/Templates"));
const Followups = React.lazy(() => import("./pages/Followups"));
const Automation = React.lazy(() => import("./pages/Automation"));
const Settings = React.lazy(() => import("./pages/Settings"));
const ProfileSettings = React.lazy(() => import("@/components/settings/ProfileSettings").then(module => ({ default: module.ProfileSettings })));
const Notifications = React.lazy(() => import("./pages/Notifications"));
const Help = React.lazy(() => import("./pages/Help"));
const AdminDashboard = React.lazy(() => import("./pages/dashboard/AdminDashboard"));
const UsersPage = React.lazy(() => import("./pages/dashboard/admin/UsersPage"));
const UsageLimitsPage = React.lazy(() => import("./pages/dashboard/admin/UsageLimitsPage"));
const TeamPage = React.lazy(() => import("./pages/dashboard/TeamPage"));
const StoreComparison = React.lazy(() => import("./pages/dashboard/StoreComparison"));
const WhatsAppNumbers = React.lazy(() => import("./pages/WhatsAppNumbers"));
const ChatbotFlowBuilder = React.lazy(() => import("./pages/ChatbotFlowBuilder"));
// Cadastro pelo site: pública, e só carrega com a chave ligada (release.ts).
const Cadastro = React.lazy(() => import("./pages/Cadastro"));

// Use optimized query client configuration
import { createQueryClient } from '@/lib/queryClient';
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
                {/* Convite e recuperacao de senha caem aqui. Rota PUBLICA de
                    proposito: quem chega ainda nao tem senha para logar, so a
                    sessao que o link do e-mail criou. */}
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
                <Route path="/terms-of-service" element={<TermsOfService />} />
                <Route path="/privacy-policy" element={<PrivacyPolicy />} />
                <Route path="/exclusao-de-dados" element={<DataDeletion />} />

                {/* Protected Dashboard Routes */}
                {/* MaintenanceGuard fica ENTRE o AuthGuard e o layout: e o
                    unico no por onde toda rota autenticada passa, e o perfil ja
                    esta carregado quando ele monta (o AuthGuard garante). Ele
                    nao encosta no paywall -- sao duas perguntas diferentes. */}
                <Route path="/dashboard" element={
                  <AuthGuard>
                    <MaintenanceGuard>
                      <DashboardLayout />
                    </MaintenanceGuard>
                  </AuthGuard>
                }>
                  <Route index element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <Index />
                    </Suspense>
                  } />
                  <Route path="conversations" element={
                    <ModuleGuard moduleName="conversations">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Conversations />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="contacts" element={
                    <ModuleGuard moduleName="contacts">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Contacts />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="funnel" element={
                    <ModuleGuard moduleName="funnel">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Funnel />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="tracking" element={
                    <ModuleGuard moduleName="tracking">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Tracking />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="reports" element={
                    <ModuleGuard moduleName="reports">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Reports />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="chatbots" element={
                    <ModuleGuard moduleName="chatbots">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Chatbots />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="chatbots/:id/builder" element={
                    <ModuleGuard moduleName="chatbots">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <ChatbotFlowBuilder />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="campaigns" element={
                    <ModuleGuard moduleName="campaigns">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Campaigns />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  {/* Templates: sem ModuleGuard e sem RoleGuard de propósito —
                      é consulta somente-leitura do que a Meta já aprovou, e o
                      atendente é justamente quem precisa dela antes de
                      responder. A edge function list-whatsapp-templates já
                      confere a Conta do caller e não exige cargo mínimo. */}
                  <Route path="templates" element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <Templates />
                    </Suspense>
                  } />
                  <Route path="followups" element={
                    <ModuleGuard moduleName="followups">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Followups />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="automation" element={
                    <ModuleGuard moduleName="automation">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <Automation />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="whatsapp-numbers" element={
                    <ModuleGuard moduleName="whatsapp-numbers">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <WhatsAppNumbers />
                      </Suspense>
                    </ModuleGuard>
                  } />
                  <Route path="settings" element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <Settings />
                    </Suspense>
                  } />
                  <Route path="admin" element={
                    <RoleGuard role="superadmin" fallbackPath="/dashboard">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <AdminDashboard />
                      </Suspense>
                    </RoleGuard>
                  } />
                  <Route path="admin/users" element={
                    <RoleGuard role="superadmin" fallbackPath="/dashboard">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <UsersPage />
                      </Suspense>
                    </RoleGuard>
                  } />
                  <Route path="admin/usage-limits" element={
                    <RoleGuard role="superadmin" fallbackPath="/dashboard">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <UsageLimitsPage />
                      </Suspense>
                    </RoleGuard>
                  } />
                  {/* minRole="gestor": o Gestor administra a equipe da Loja
                      dele (convida os atendentes: 2 por Loja, mais com o
                      ConvoFlow). O backend ja permitia
                      isso desde sempre -- so a rota estava fechada. */}
                  <Route path="team" element={
                    <RoleGuard minRole="gestor" fallbackPath="/dashboard">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <TeamPage />
                      </Suspense>
                    </RoleGuard>
                  } />
                  <Route path="store-comparison" element={
                    <RoleGuard role="gerente" fallbackPath="/dashboard">
                      <Suspense fallback={<PageLoadingSkeleton />}>
                        <StoreComparison />
                      </Suspense>
                    </RoleGuard>
                  } />
                  <Route path="profile" element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <ProfileSettings />
                    </Suspense>
                  } />
                  <Route path="notifications" element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <Notifications />
                    </Suspense>
                  } />
                  {/* Ajuda: sem ModuleGuard e sem RoleGuard de propósito — a
                      documentação abre para qualquer sessão, como settings,
                      profile e notifications. */}
                  <Route path="help" element={
                    <Suspense fallback={<PageLoadingSkeleton />}>
                      <Help />
                    </Suspense>
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
