import { MessageCircle, Clock, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRecentConversations } from '@/hooks/useRecentConversations';



const statusColors = {
  new: 'bg-status-info text-white',
  in_progress: 'bg-status-warning text-white',
  waiting: 'bg-status-success text-white',
  closed: 'bg-muted text-muted-foreground'
};

const statusLabels = {
  new: 'Nova',
  in_progress: 'Em andamento',
  waiting: 'Aguardando',
  closed: 'Fechada'
};

export const RecentConversations = () => {
  const navigate = useNavigate();
  const { conversations, isLoading } = useRecentConversations(5);
  
  const handleViewAll = () => {
    navigate('/dashboard/conversations');
  };
  
  const handleConversationClick = (conversationId: string) => {
    navigate(`/dashboard/conversations?selected=${conversationId}`);
  };
  
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-lg font-semibold">Conversas Recentes</CardTitle>
        <Button variant="outline" size="sm" onClick={handleViewAll}>
          Ver todas
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-3 p-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-48" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))
        ) : conversations.length === 0 ? (
          <div className="text-center py-8">
            <MessageCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">Nenhuma conversa recente</p>
            <p className="text-sm text-muted-foreground mt-1">
              Suas conversas aparecerão aqui
            </p>
          </div>
        ) : (
          conversations.map((conversation) => (
          <div
            key={conversation.id}
            className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-accent/50 transition-colors cursor-pointer"
            onClick={() => handleConversationClick(conversation.id)}
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-accent rounded-full flex items-center justify-center">
                <MessageCircle className="h-5 w-5 text-accent-foreground" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <h4 className="text-sm font-medium text-foreground">
                    {conversation.contactName}
                  </h4>
                  <Badge className={statusColors[conversation.status]}>
                    {statusLabels[conversation.status]}
                  </Badge>
                </div>
                
                <p className="text-sm text-muted-foreground truncate max-w-xs">
                  {conversation.lastMessage}
                </p>
                
                {conversation.assignedTo && (
                  <div className="flex items-center space-x-1 mt-1">
                    <User className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {conversation.assignedTo}
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="text-right">
              <div className="flex items-center space-x-1 text-xs text-muted-foreground mb-1">
                <Clock className="h-3 w-3" />
                <span>{conversation.timestamp}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {conversation.whatsappNumber}
              </p>
            </div>
          </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};