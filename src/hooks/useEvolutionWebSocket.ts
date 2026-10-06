import { useEffect, useRef, useState, useCallback } from 'react';
import { useEvolutionStore } from '../stores/evolutionStore';
// Tipo inline para evitar dependência do webhookHandler depreciado
interface WebhookEvent {
  event: string;
  instance: string;
  data: any;
  destination?: string;
  sender?: string;
  server_url?: string;
  apikey?: string;
}

interface WebSocketConfig {
  url: string;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  heartbeatInterval?: number;
}

interface WebSocketState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  reconnectAttempts: number;
}

export const useEvolutionWebSocket = (config: WebSocketConfig) => {
  const {
    // Missing dependencies removed to avoid TS errors
  } = useEvolutionStore();

  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    reconnectAttempts: 0
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const {
    url,
    reconnectInterval = 5000,
    maxReconnectAttempts = 10,
    heartbeatInterval = 30000
  } = config;

  // Limpar timeouts
  const clearTimeouts = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // Configurar heartbeat
  const setupHeartbeat = useCallback(() => {
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }

    heartbeatIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, heartbeatInterval);
  }, [heartbeatInterval]);

  // Processar mensagens recebidas
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data = JSON.parse(event.data);
      
      // Ignorar mensagens de pong
      if (data.type === 'pong') {
        return;
      }

      // Processar eventos da Evolution API
      if (data.event && data.instance && data.data) {
        // const webhookEvent: WebhookEvent = data;
        
        // Atualizar estado específico baseado no tipo de evento retirado porque os métodos não existem na store
      }
    } catch (error) {
      console.error('[WebSocket] Error parsing message:', error);
    }
  }, []);

  // Conectar WebSocket
  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    
    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setState(prev => ({ ...prev, isConnecting: true, error: null }));

    try {
      wsRef.current = new WebSocket(url);

      wsRef.current.onopen = () => {
        if (!mountedRef.current) return;
        
        console.log('[WebSocket] Connected to Evolution API');
        setState(prev => ({
          ...prev,
          isConnected: true,
          isConnecting: false,
          error: null,
          reconnectAttempts: 0
        }));
        
        setupHeartbeat();
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onclose = (event) => {
        if (!mountedRef.current) return;
        
        console.log('[WebSocket] Connection closed:', event.code, event.reason);
        setState(prev => ({ ...prev, isConnected: false, isConnecting: false }));
        
        clearTimeouts();
        
        // Tentar reconectar se não foi fechamento intencional
        if (event.code !== 1000 && state.reconnectAttempts < maxReconnectAttempts) {
          const delay = Math.min(reconnectInterval * Math.pow(2, state.reconnectAttempts), 30000);
          
          setState(prev => ({ 
            ...prev, 
            reconnectAttempts: prev.reconnectAttempts + 1,
            error: `Tentando reconectar... (${prev.reconnectAttempts + 1}/${maxReconnectAttempts})`
          }));
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (mountedRef.current) {
              connect();
            }
          }, delay);
        } else if (state.reconnectAttempts >= maxReconnectAttempts) {
          setState(prev => ({ 
            ...prev, 
            error: 'Máximo de tentativas de reconexão atingido'
          }));
        }
      };

      wsRef.current.onerror = (error) => {
        if (!mountedRef.current) return;
        
        console.error('[WebSocket] Error:', error);
        setState(prev => ({ 
          ...prev, 
          error: 'Erro de conexão WebSocket',
          isConnecting: false
        }));
      };

    } catch (error) {
      console.error('[WebSocket] Failed to create connection:', error);
      setState(prev => ({ 
        ...prev, 
        error: 'Falha ao criar conexão WebSocket',
        isConnecting: false
      }));
    }
  }, [url, handleMessage, setupHeartbeat, clearTimeouts, state.reconnectAttempts, maxReconnectAttempts, reconnectInterval]);

  // Desconectar WebSocket
  const disconnect = useCallback(() => {
    clearTimeouts();
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Disconnected by user');
      wsRef.current = null;
    }
    
    setState({
      isConnected: false,
      isConnecting: false,
      error: null,
      reconnectAttempts: 0
    });
  }, [clearTimeouts]);

  // Enviar mensagem
  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Reconectar manualmente
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(() => {
      if (mountedRef.current) {
        connect();
      }
    }, 1000);
  }, [disconnect, connect]);

  // Efeito para conectar automaticamente
  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      disconnect();
    };
  }, [connect, disconnect]);

  // Efeito para reconectar quando a aba volta ao foco
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden && !state.isConnected && !state.isConnecting) {
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [connect, state.isConnected, state.isConnecting]);

  return {
    ...state,
    connect,
    disconnect,
    reconnect,
    sendMessage
  };
};

export default useEvolutionWebSocket;