import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Settings, 
  Search, 
  ToggleLeft, 
  ToggleRight, 
  Eye, 
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { useModules } from '@/hooks/useModules';
import { toast } from 'sonner';
import { Database } from '@/integrations/supabase/types';
import { AuthDebug } from '@/components/debug/AuthDebug';
import { SupabaseDebug } from '@/components/debug/SupabaseDebug';
import { StorageDebug } from '@/components/debug/StorageDebug';

type ModuleSettings = Database['public']['Tables']['module_settings']['Row'];

interface ModuleCardProps {
  module: ModuleSettings;
  onToggle: (moduleId: string, currentStatus: boolean) => void;
  isUpdating: boolean;
  isSuperAdmin: boolean;
}

const ModuleCard: React.FC<ModuleCardProps> = ({ 
  module, 
  onToggle, 
  isUpdating, 
  isSuperAdmin 
}) => {
  return (
    <Card className={`transition-all duration-200 ${
      module.is_enabled ? 'border-success/30 bg-success/10' : 'border-border bg-muted/50'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${
              module.is_enabled ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
            }`}>
              {module.is_enabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </div>
            <div>
              <CardTitle className="text-base">{module.display_name}</CardTitle>
              <CardDescription className="text-sm">
                Rota: <code className="text-xs bg-muted px-1 py-0.5 rounded">
                  {module.route_path}
                </code>
              </CardDescription>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Badge variant={module.is_enabled ? 'default' : 'secondary'}>
              {module.is_enabled ? 'Ativo' : 'Inativo'}
            </Badge>
            
            {isSuperAdmin && (
              <Switch
                checked={module.is_enabled}
                onCheckedChange={() => onToggle(module.id, module.is_enabled)}
                disabled={isUpdating}
                className="data-[state=checked]:bg-success"
              />
            )}
          </div>
        </div>
      </CardHeader>
      
      {module.description && (
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">{module.description}</p>
        </CardContent>
      )}
    </Card>
  );
};

export const ModuleSettings: React.FC = () => {
  const {
    isSuperAdmin,
    isLoading,
    error,
    allModules,
    visibleModules,
    toggleModuleStatus,
    enableAllModules,
    disableAllModules,
    isUpdatingStatus,
    isUpdatingMultiple
  } = useModules();
  
  const [searchTerm, setSearchTerm] = useState('');
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  
  // Filtrar módulos baseado na busca e filtros
  const filteredModules = React.useMemo(() => {
    let modules = isSuperAdmin ? allModules : visibleModules;
    
    if (searchTerm) {
      modules = modules.filter(module => 
        module.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        module.module_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        module.route_path.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (showOnlyEnabled) {
      modules = modules.filter(module => module.is_enabled);
    }
    
    return modules.sort((a, b) => {
      // Ordenar por status (ativos primeiro) e depois por nome
      if (a.is_enabled !== b.is_enabled) {
        return a.is_enabled ? -1 : 1;
      }
      return a.display_name.localeCompare(b.display_name);
    });
  }, [allModules, visibleModules, isSuperAdmin, searchTerm, showOnlyEnabled]);
  
  const enabledCount = filteredModules.filter(m => m.is_enabled).length;
  const totalCount = filteredModules.length;
  
  if (!isSuperAdmin) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-warning" />
            Acesso Restrito
          </CardTitle>
          <CardDescription>
            Esta seção é exclusiva para super administradores.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Você não tem permissão para acessar as configurações de módulos. 
              Entre em contato com um administrador se precisar de acesso.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Carregando Módulos...
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }
  
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="w-5 h-5" />
            Erro ao Carregar Módulos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Ocorreu um erro ao carregar os módulos. Tente recarregar a página.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* <AuthDebug /> */}
      {/* <SupabaseDebug /> */}
      {/* <StorageDebug /> */}
      {/* Header com estatísticas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Gerenciamento de Módulos
          </CardTitle>
          <CardDescription>
            Configure quais módulos estão visíveis para os usuários da aplicação.
            Apenas super administradores podem ver e modificar essas configurações.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex items-center gap-3 p-3 bg-success/10 rounded-lg border border-success/30">
              <CheckCircle2 className="w-5 h-5 text-success" />
              <div>
                <p className="text-sm font-medium text-success">Módulos Ativos</p>
                <p className="text-lg font-bold text-success">{enabledCount}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-muted rounded-lg border border-border">
              <EyeOff className="w-5 h-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium text-foreground">Módulos Inativos</p>
                <p className="text-lg font-bold text-foreground">{totalCount - enabledCount}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3 p-3 bg-info/10 rounded-lg border border-info/30">
              <Eye className="w-5 h-5 text-info" />
              <div>
                <p className="text-sm font-medium text-info">Total de Módulos</p>
                <p className="text-lg font-bold text-info">{totalCount}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Controles e filtros */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Controles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Busca */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Buscar módulos</Label>
              <div className="relative mt-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                <Input
                  id="search"
                  placeholder="Buscar por nome, rota ou descrição..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex items-end gap-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-enabled"
                  checked={showOnlyEnabled}
                  onCheckedChange={setShowOnlyEnabled}
                />
                <Label htmlFor="show-enabled" className="text-sm">
                  Apenas ativos
                </Label>
              </div>
            </div>
          </div>
          
          <Separator />
          
          {/* Ações em lote */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={enableAllModules}
              disabled={isUpdatingMultiple || enabledCount === totalCount}
              className="flex items-center gap-2"
            >
              {isUpdatingMultiple ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ToggleRight className="w-4 h-4" />
              )}
              Ativar Todos
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={disableAllModules}
              disabled={isUpdatingMultiple || enabledCount === 0}
              className="flex items-center gap-2"
            >
              {isUpdatingMultiple ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ToggleLeft className="w-4 h-4" />
              )}
              Desativar Todos
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.reload()}
              className="flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar
            </Button>
          </div>
        </CardContent>
      </Card>
      
      {/* Lista de módulos */}
      <div className="space-y-3">
        {filteredModules.length === 0 ? (
          <Card>
            <CardContent className="py-8">
              <div className="text-center text-muted-foreground">
                <Eye className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium">Nenhum módulo encontrado</p>
                <p className="text-sm">
                  {searchTerm ? 'Tente ajustar os filtros de busca.' : 'Não há módulos configurados.'}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          filteredModules.map((module) => (
            <ModuleCard
              key={module.id}
              module={module}
              onToggle={toggleModuleStatus}
              isUpdating={isUpdatingStatus}
              isSuperAdmin={isSuperAdmin}
            />
          ))
        )}
      </div>
      
      {/* Informações adicionais */}
      <Card>
        <CardContent className="pt-6">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Importante:</strong> As alterações nos módulos afetam imediatamente a visibilidade 
              para todos os usuários da aplicação. Super administradores sempre têm acesso a todos os módulos, 
              independentemente do status de ativação.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModuleSettings;