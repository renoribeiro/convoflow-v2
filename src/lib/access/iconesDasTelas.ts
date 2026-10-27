/**
 * Um ícone por tela, o MESMO no menu lateral e na busca rápida (Ctrl+K).
 *
 * Até o lote 5 do checkup de usabilidade (2026-10-27) cada um tinha a sua
 * lista e o mesmo lugar aparecia com dois ícones (Dashboard era gráfico de
 * barras no menu e quadro na busca; Follow ups era pessoa num e avião de papel
 * no outro), e Relatórios e Templates dividiam o mesmo ícone. Tela nova ganha
 * a linha dela aqui; `iconesDasTelas.test.ts` falha se faltar ou repetir.
 */
import {
  Bell,
  Bot,
  CalendarClock,
  CircleUser,
  FileBarChart,
  FileCheck2,
  Filter,
  GaugeCircle,
  HelpCircle,
  LayoutDashboard,
  Megaphone,
  MessageSquare,
  Settings,
  ShieldCheck,
  Smartphone,
  Store,
  TrendingUp,
  UserCog,
  Users,
  UsersRound,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export const ICONES_DAS_TELAS: Readonly<Record<string, LucideIcon>> = {
  '': LayoutDashboard,
  conversations: MessageSquare,
  contacts: Users,
  funnel: Filter,
  tracking: TrendingUp,
  reports: FileBarChart,
  chatbots: Bot,
  campaigns: Megaphone,
  templates: FileCheck2,
  followups: CalendarClock,
  automation: Workflow,
  'whatsapp-numbers': Smartphone,
  settings: Settings,
  help: HelpCircle,
  team: UsersRound,
  'store-comparison': Store,
  admin: ShieldCheck,
  'admin/users': UserCog,
  'admin/usage-limits': GaugeCircle,
  profile: CircleUser,
  notifications: Bell,
};
