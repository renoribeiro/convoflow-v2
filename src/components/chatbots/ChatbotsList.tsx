
import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Bot, 
  Edit, 
  Trash2, 
  Copy, 
  Play, 
  Pause, 
  MessageSquare,
  TestTube,
  Eye,
  MoreHorizontal,
  Download,
  Upload
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/shared/EmptyState';
import { ConfirmationDialog } from '@/components/shared/ConfirmationDialog';
import { Pagination } from '@/components/shared/Pagination';
import { usePagination } from '@/hooks/usePagination';
import { ChatbotCardSkeleton } from '@/components/shared/Skeleton';
import { useChatbot } from '@/contexts/ChatbotContext';
import { useToast } from '@/hooks/use-toast';
import { logger } from '@/lib/logger';

interface ChatbotsListProps {
  onEdit: (botId: string) => void;
  onTest: (botId: string) => void;
  selectedBot?: string | null;
}

export const ChatbotsList = ({ onEdit, onTest }: ChatbotsListProps) => {
  const { chatbots, loading, toggleChatbot, deleteChatbot, duplicateChatbot, exportChatbot } = useChatbot();
  const { toast } = useToast();
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    chatbotId: string | null;
    chatbotName: string;
  }>({ isOpen: false, chatbotId: null, chatbotName: '' });
  const [isDeleting, setIsDeleting] = useState(false);

  // Configurar paginação
  const pagination = usePagination({
    totalItems: chatbots.length,
    initialItemsPerPage: 9
  });

  // Aplicar paginação aos chatbots
  const paginatedChatbots = useMemo(() => {
    const startIndex = pagination.startIndex;
    const endIndex = startIndex + pagination.itemsPerPage;
    return chatbots.slice(startIndex, endIndex);
  }, [chatbots, pagination.startIndex, pagination.itemsPerPage]);

  const handleExport = async (botId: string) => {
    try {
      const exportData = await exportChatbot(botId);
      const blob = new Blob([exportData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chatbot-${botId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      toast({
        title: "Erro ao exportar",
        description: "Não foi possível exportar o chatbot.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteClick = (botId: string, botName: string) => {
    setDeleteConfirmation({
      isOpen: true,
      chatbotId: botId,
      chatbotName: botName
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmation.chatbotId) return;

    try {
      setIsDeleting(true);
      
      logger.info('Iniciando exclusão de chatbot', {
        category: 'chatbot_management',
        action: 'delete_chatbot',
        chatbotId: deleteConfirmation.chatbotId,
        chatbotName: deleteConfirmation.chatbotName
      });

      await deleteChatbot(deleteConfirmation.chatbotId);

      logger.info('Chatbot excluído com sucesso', {
        category: 'chatbot_management',
        action: 'delete_chatbot',
        chatbotId: deleteConfirmation.chatbotId,
        chatbotName: deleteConfirmation.chatbotName,
        status: 'success'
      });

      setDeleteConfirmation({ isOpen: false, chatbotId: null, chatbotName: '' });
    } catch (error) {
      logger.error('Erro ao excluir chatbot', {
        category: 'chatbot_management',
        action: 'delete_chatbot',
        chatbotId: deleteConfirmation.chatbotId,
        chatbotName: deleteConfirmation.chatbotName,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirmation({ isOpen: false, chatbotId: null, chatbotName: '' });
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <ChatbotCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (chatbots.length === 0) {
    return (
      <EmptyState
        icon={<Bot className="w-full h-full" />}
        title="Nenhum chatbot criado"
        description="Crie seu primeiro chatbot para automatizar o atendimento no WhatsApp"
        action={{
          label: "Criar Primeiro Chatbot",
          onClick: () => onEdit('new')
        }}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {paginatedChatbots.map((bot) => (
        <Card key={bot.id} className="relative group hover:shadow-lg transition-shadow">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${bot.isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">{bot.name}</CardTitle>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant={bot.type === 'flow' ? 'default' : 'secondary'}>
                      {bot.type === 'flow' ? 'Fluxo' : 'Simples'}
                    </Badge>
                    <Badge variant={bot.isActive ? 'default' : 'secondary'}>
                      {bot.isActive ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onEdit(bot.id)}>
                    <Edit className="mr-2 h-4 w-4" />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onTest(bot.id)}>
                    <TestTube className="mr-2 h-4 w-4" />
                    Testar
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Eye className="mr-2 h-4 w-4" />
                    Visualizar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => duplicateChatbot(bot.id)}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport(bot.id)}>
                    <Download className="mr-2 h-4 w-4" />
                    Exportar
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => handleDeleteClick(bot.id, bot.name)}
                    className="text-red-600"
                    disabled={isDeleting}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{bot.description}</p>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">GATILHOS ({bot.triggers.length})</p>
                <div className="flex flex-wrap gap-1">
                  {bot.triggers.slice(0, 3).map((trigger, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {trigger.phrase}
                    </Badge>
                  ))}
                  {bot.triggers.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{bot.triggers.length - 3} mais
                    </Badge>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{bot.analytics.totalInteractions} interações</span>
                </div>
                <span className="text-muted-foreground">
                  {bot.analytics.successRate.toFixed(1)}% sucesso
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t">
              <div className="flex items-center gap-2">
                <Switch
                  checked={bot.isActive}
                  onCheckedChange={() => toggleChatbot(bot.id)}
                />
                <span className="text-sm font-medium">
                  {bot.isActive ? 'Ativo' : 'Inativo'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onTest(bot.id)}
                >
                  <TestTube className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onEdit(bot.id)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant={bot.isActive ? "outline" : "default"}
                  size="sm"
                  onClick={() => toggleChatbot(bot.id)}
                >
                  {bot.isActive ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
        ))}
      </div>

      {/* Paginação */}
      {chatbots.length > 0 && (
        <div className="mt-6">
          <Pagination
            currentPage={pagination.currentPage}
            totalPages={pagination.totalPages}
            totalItems={chatbots.length}
            itemsPerPage={pagination.itemsPerPage}
            onPageChange={pagination.goToPage}
            onItemsPerPageChange={pagination.setItemsPerPage}
            showItemsPerPage={true}
            itemsPerPageOptions={[6, 9, 12, 18]}
          />
        </div>
      )}
      
      <ConfirmationDialog
        isOpen={deleteConfirmation.isOpen}
        onClose={handleDeleteCancel}
        onConfirm={handleDeleteConfirm}
        title="Excluir Chatbot"
        description={`Tem certeza que deseja excluir o chatbot "${deleteConfirmation.chatbotName}"? Esta ação não pode ser desfeita e todas as configurações e estatísticas serão perdidas.`}
        confirmText="Excluir"
        cancelText="Cancelar"
        variant="destructive"
        isLoading={isDeleting}
        icon={<Trash2 className="h-5 w-5 text-red-500" />}
      />
    </>
  );
};
