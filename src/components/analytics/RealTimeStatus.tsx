import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Pause, 
  Play, 
  AlertCircle, 
  CheckCircle,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface RealTimeStatusProps {
  isConnected: boolean;
  isLoading: boolean;
  isPaused: boolean;
  error: string | null;
  lastUpdate: Date | null;
  onRefresh: () => void;
  onPause: () => void;
  onResume: () => void;
  className?: string;
}

const RealTimeStatus: React.FC<RealTimeStatusProps> = ({
  isConnected,
  isLoading,
  isPaused,
  error,
  lastUpdate,
  onRefresh,
  onPause,
  onResume,
  className
}) => {
  // Função para formatar tempo relativo
  const formatTimeAgo = (date: Date): string => {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) {
      return 'agora mesmo';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes}min atrás`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours}h atrás`;
    } else {
      return date.toLocaleDateString();
    }
  };

  // Determinar status geral
  const getStatus = () => {
    if (error) return 'error';
    if (isPaused) return 'paused';
    if (isLoading) return 'loading';
    if (isConnected) return 'connected';
    return 'disconnected';
  };

  const status = getStatus();

  // Configurações de status
  const statusConfig = {
    connected: {
      icon: CheckCircle,
      color: 'bg-status-success/15 text-status-success border-status-success/30',
      label: 'Conectado',
      description: 'Recebendo atualizações em tempo real'
    },
    disconnected: {
      icon: WifiOff,
      color: 'bg-status-error/15 text-status-error border-status-error/30',
      label: 'Desconectado',
      description: 'Sem conexão com o servidor'
    },
    loading: {
      icon: RefreshCw,
      color: 'bg-status-info/15 text-status-info border-status-info/30',
      label: 'Carregando',
      description: 'Atualizando dados...'
    },
    paused: {
      icon: Pause,
      color: 'bg-status-warning/15 text-status-warning border-status-warning/30',
      label: 'Pausado',
      description: 'Atualizações pausadas pelo usuário'
    },
    error: {
      icon: AlertCircle,
      color: 'bg-status-error/15 text-status-error border-status-error/30',
      label: 'Erro',
      description: error || 'Erro desconhecido'
    }
  };

  const config = statusConfig[status];
  const StatusIcon = config.icon;

  return (
    <TooltipProvider>
      <div className={cn("flex items-center space-x-3", className)}>
        {/* Status Badge */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge 
              variant="outline" 
              className={cn(
                "flex items-center space-x-1 px-2 py-1 text-xs font-medium border",
                config.color
              )}
            >
              <StatusIcon 
                className={cn(
                  "h-3 w-3",
                  status === 'loading' && "animate-spin"
                )} 
              />
              <span>{config.label}</span>
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{config.description}</p>
          </TooltipContent>
        </Tooltip>

        {/* Última atualização */}
        {lastUpdate && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span>{formatTimeAgo(lastUpdate)}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Última atualização: {lastUpdate.toLocaleString()}</p>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Controles */}
        <div className="flex items-center space-x-1">
          {/* Botão Pausar/Retomar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={isPaused ? onResume : onPause}
                className="h-7 w-7 p-0"
              >
                {isPaused ? (
                  <Play className="h-3 w-3" />
                ) : (
                  <Pause className="h-3 w-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isPaused ? 'Retomar atualizações' : 'Pausar atualizações'}</p>
            </TooltipContent>
          </Tooltip>

          {/* Botão Atualizar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRefresh}
                disabled={isLoading}
                className="h-7 w-7 p-0"
              >
                <RefreshCw 
                  className={cn(
                    "h-3 w-3",
                    isLoading && "animate-spin"
                  )} 
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Atualizar agora</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Indicador de conexão WebSocket */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center">
              {isConnected ? (
                <Wifi className="h-3 w-3 text-status-success" />
              ) : (
                <WifiOff className="h-3 w-3 text-status-error" />
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              WebSocket: {isConnected ? 'Conectado' : 'Desconectado'}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
};

export default RealTimeStatus;