// Analytics Components
export { PerformanceAnalytics } from './analytics/PerformanceAnalytics';

// Settings Components
export { AdvancedSettings } from './settings/AdvancedSettings';

// Monitoring Components
export { SystemMonitor } from './monitoring/SystemMonitor';

// Integration Components
export { IntegrationManager } from './integrations/IntegrationManager';

// Reports Components
export { AdvancedReports } from './reports/AdvancedReports';

// Templates Components

// API Components
export { ApiSettings } from './api/ApiSettings';

// Backup Components
export { BackupManager } from './backup/BackupManager';

// UI Components (re-export from ui folder)
export { Button } from './ui/button';
export { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card';
export { Input } from './ui/input';
export { Label } from './ui/label';
export { Textarea } from './ui/textarea';
export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
export { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
export { Badge } from './ui/badge';
export { Alert, AlertDescription, AlertTitle } from './ui/alert';
export { Progress } from './ui/progress';
export { Switch } from './ui/switch';
export { Checkbox } from './ui/checkbox';
export { RadioGroup, RadioGroupItem } from './ui/radio-group';
export { Separator } from './ui/separator';
export { ScrollArea } from './ui/scroll-area';
export { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog';
export { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
export { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
export { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from './ui/sheet';
export { Calendar } from './ui/calendar';
export { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from './ui/command';
export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from './ui/table';
export { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
export { Skeleton } from './ui/skeleton';
export { Slider } from './ui/slider';
export { Toggle } from './ui/toggle';
export { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
export { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './ui/accordion';
export { AspectRatio } from './ui/aspect-ratio';
export { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';
export { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu';
export { HoverCard, HoverCardContent, HoverCardTrigger } from './ui/hover-card';
export { Menubar, MenubarContent, MenubarItem, MenubarMenu, MenubarSeparator, MenubarShortcut, MenubarTrigger } from './ui/menubar';
export { NavigationMenu, NavigationMenuContent, NavigationMenuItem, NavigationMenuLink, NavigationMenuList, NavigationMenuTrigger } from './ui/navigation-menu';
export { Resizable, ResizableHandle, ResizablePanel, ResizablePanelGroup } from './ui/resizable';

// Types and Interfaces
export type { ButtonProps } from './ui/button';
export type { CardProps } from './ui/card';
export type { InputProps } from './ui/input';
export type { LabelProps } from './ui/label';
export type { TextareaProps } from './ui/textarea';
export type { SelectProps } from './ui/select';
export type { TabsProps } from './ui/tabs';
export type { BadgeProps } from './ui/badge';
export type { AlertProps } from './ui/alert';
export type { ProgressProps } from './ui/progress';
export type { SwitchProps } from './ui/switch';
export type { CheckboxProps } from './ui/checkbox';
export type { RadioGroupProps } from './ui/radio-group';
export type { SeparatorProps } from './ui/separator';
export type { ScrollAreaProps } from './ui/scroll-area';
export type { DialogProps } from './ui/dialog';
export type { PopoverProps } from './ui/popover';
export type { TooltipProps } from './ui/tooltip';
export type { DropdownMenuProps } from './ui/dropdown-menu';
export type { SheetProps } from './ui/sheet';
export type { CalendarProps } from './ui/calendar';
export type { CommandProps } from './ui/command';
export type { TableProps } from './ui/table';
export type { AvatarProps } from './ui/avatar';
export type { SkeletonProps } from './ui/skeleton';
export type { SliderProps } from './ui/slider';
export type { ToggleProps } from './ui/toggle';
export type { ToggleGroupProps } from './ui/toggle-group';
export type { AccordionProps } from './ui/accordion';
export type { AspectRatioProps } from './ui/aspect-ratio';
export type { CollapsibleProps } from './ui/collapsible';
export type { ContextMenuProps } from './ui/context-menu';
export type { HoverCardProps } from './ui/hover-card';
export type { MenubarProps } from './ui/menubar';
export type { NavigationMenuProps } from './ui/navigation-menu';
export type { ResizableProps } from './ui/resizable';

// Component Groups for easier organization
export const AnalyticsComponents = {
  PerformanceAnalytics
};

export const SettingsComponents = {
  AdvancedSettings
};

export const MonitoringComponents = {
  SystemMonitor
};

export const IntegrationComponents = {
  IntegrationManager
};

export const ReportsComponents = {
  AdvancedReports
};

export const ApiComponents = {
  ApiSettings
};

export const BackupComponents = {
  BackupManager
};

// All main components in one object
export const ConvoFlowComponents = {
  // Analytics
  PerformanceAnalytics,
  
  // Settings
  AdvancedSettings,
  
  // Monitoring
  SystemMonitor,
  
  // Integrations
  IntegrationManager,
  
  // Reports
  AdvancedReports,
  
  // API
  ApiSettings,
  
  // Backup
  BackupManager
};

// Default export
export default ConvoFlowComponents;

// Component metadata for documentation
export const ComponentMetadata = {
  PerformanceAnalytics: {
    name: 'PerformanceAnalytics',
    description: 'Análise detalhada de performance do sistema',
    category: 'Analytics',
    features: ['Métricas de sistema', 'Análise de conversas', 'Engajamento de usuários', 'Alertas de performance']
  },
  AdvancedSettings: {
    name: 'AdvancedSettings',
    description: 'Configurações avançadas do sistema',
    category: 'Settings',
    features: ['Configurações gerais', 'Performance', 'Segurança', 'Notificações', 'WhatsApp', 'Interface']
  },
  SystemMonitor: {
    name: 'SystemMonitor',
    description: 'Monitoramento de recursos em tempo real',
    category: 'Monitoring',
    features: ['Métricas de sistema', 'Status de serviços', 'Alertas', 'Gráficos de performance']
  },
  IntegrationManager: {
    name: 'IntegrationManager',
    description: 'Gerenciamento de integrações com APIs externas',
    category: 'Integrations',
    features: ['Integrações ativas', 'Templates de integração', 'Configuração de APIs', 'Monitoramento']
  },
  AdvancedReports: {
    name: 'AdvancedReports',
    description: 'Sistema de relatórios avançados e personalizáveis',
    category: 'Reports',
    features: ['Relatórios personalizados', 'Múltiplos tipos de gráfico', 'Filtros avançados', 'Exportação']
  },
  ApiSettings: {
    name: 'ApiSettings',
    description: 'Configurações e documentação de APIs',
    category: 'API',
    features: ['Gerenciamento de endpoints', 'Chaves de API', 'Webhooks', 'Documentação interativa']
  },
  BackupManager: {
    name: 'BackupManager',
    description: 'Sistema de backup e recuperação de dados',
    category: 'Backup',
    features: ['Backups automáticos', 'Agendamento', 'Restauração', 'Histórico de backups']
  }
};