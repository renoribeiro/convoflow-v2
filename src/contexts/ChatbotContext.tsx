
import React, { createContext, useContext, ReactNode } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useChatbots, useChatbotSettings, useChatbotAnalytics } from '@/hooks/useChatbots';
import type { Chatbot, ChatbotSettings, ChatbotInteraction } from '@/types/chatbot.types';

interface ChatbotContextType {
  chatbots: Chatbot[];
  interactions: ChatbotInteraction[];
  settings: ChatbotSettings;
  isLoading: boolean;
  
  // Chatbot operations
  createChatbot: (chatbot: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'analytics'>) => void;
  updateChatbot: (id: string, updates: Partial<Chatbot>) => void;
  deleteChatbot: (id: string) => void;
  duplicateChatbot: (chatbot: Chatbot) => void;
  toggleChatbotStatus: (id: string, isActive: boolean) => void;
  
  // Settings operations
  updateSettings: (settings: Partial<ChatbotSettings>) => void;
  
  // Analytics operations
  getChatbotAnalytics: (id: string) => Promise<any>;
  
  // Testing operations
  testChatbot: (id: string, message: string) => Promise<string>;
  
  // Import/Export operations
  exportChatbot: (id: string) => Promise<string>;
  importChatbot: (data: string) => Promise<void>;
  
  // Data loading
  loadChatbots: () => void;
  loadInteractions: () => void;
  
  // Loading states
  isCreating: boolean;
  isUpdating: boolean;
  isDeleting: boolean;
  isToggling: boolean;
  isDuplicating: boolean;
  isUpdatingSettings: boolean;
}

const ChatbotContext = createContext<ChatbotContextType | undefined>(undefined);

export const useChatbot = () => {
  const context = useContext(ChatbotContext);
  if (!context) {
    throw new Error('useChatbot must be used within a ChatbotProvider');
  }
  return context;
};



export const ChatbotProvider = ({ children }: { children: ReactNode }) => {
  const { toast } = useToast();
  
  // Use real hooks for data management
  const {
    chatbots,
    isLoading: isLoadingChatbots,
    createChatbot: createChatbotMutation,
    updateChatbot: updateChatbotMutation,
    deleteChatbot: deleteChatbotMutation,
    toggleChatbotStatus: toggleChatbotStatusMutation,
    duplicateChatbot: duplicateChatbotMutation,
    refetch: refetchChatbots,
    isCreating,
    isUpdating,
    isDeleting,
    isToggling,
    isDuplicating
  } = useChatbots();
  
  const {
    settings,
    isLoading: isLoadingSettings,
    updateSettings: updateSettingsMutation,
    isUpdating: isUpdatingSettings
  } = useChatbotSettings();
  
  // Mock interactions for now - can be implemented later
  const interactions: ChatbotInteraction[] = [];
  const isLoading = isLoadingChatbots || isLoadingSettings;



  const loadChatbots = () => {
    refetchChatbots();
  };



  const loadInteractions = () => {
    // TODO: Implement interactions loading when needed
    console.log('Loading interactions...');
  };

  // Wrapper functions to maintain the same interface
  const createChatbot = (chatbotData: Omit<Chatbot, 'id' | 'createdAt' | 'updatedAt' | 'version' | 'analytics'>) => {
    createChatbotMutation(chatbotData);
  };

  const updateChatbot = (id: string, updates: Partial<Chatbot>) => {
    updateChatbotMutation({ id, ...updates });
  };

  const deleteChatbot = (id: string) => {
    deleteChatbotMutation(id);
  };

  const duplicateChatbot = (chatbot: Chatbot) => {
    duplicateChatbotMutation(chatbot);
  };

  const toggleChatbotStatus = (id: string, isActive: boolean) => {
    toggleChatbotStatusMutation({ id, isActive });
  };

  const updateSettings = (newSettings: Partial<ChatbotSettings>) => {
    updateSettingsMutation(newSettings);
  };

  const testChatbot = async (id: string, message: string): Promise<string> => {
    try {
      const chatbot = chatbots.find(bot => bot.id === id);
      if (!chatbot) throw new Error('Chatbot não encontrado');

      // Simple trigger matching
      const matchedTrigger = chatbot.triggers.find(trigger => 
        trigger.isActive && message.toLowerCase().includes(trigger.phrase.toLowerCase())
      );

      if (matchedTrigger && chatbot.responses.length > 0) {
        return chatbot.responses[0].message;
      }

      return settings.fallbackMessage;
    } catch (error) {
      throw new Error('Erro ao testar chatbot');
    }
  };

  const getChatbotAnalytics = async (id: string) => {
    try {
      const chatbot = chatbots.find(bot => bot.id === id);
      return chatbot?.analytics || null;
    } catch (error) {
      throw new Error('Erro ao carregar analytics');
    }
  };

  const exportChatbot = async (id: string): Promise<string> => {
    try {
      const chatbot = chatbots.find(bot => bot.id === id);
      if (!chatbot) throw new Error('Chatbot não encontrado');

      return JSON.stringify(chatbot, null, 2);
    } catch (error) {
      throw new Error('Erro ao exportar chatbot');
    }
  };

  const importChatbot = async (data: string) => {
    try {
      const chatbotData = JSON.parse(data);
      await createChatbot({
        ...chatbotData,
        name: `${chatbotData.name} (Importado)`
      });
    } catch (error) {
      throw new Error('Erro ao importar chatbot');
    }
  };

  return (
    <ChatbotContext.Provider value={{
      chatbots,
      interactions,
      settings,
      isLoading,
      createChatbot,
      updateChatbot,
      deleteChatbot,
      duplicateChatbot,
      toggleChatbotStatus,
      updateSettings,
      getChatbotAnalytics,
      testChatbot,
      exportChatbot,
      importChatbot,
      loadChatbots,
      loadInteractions,
      isCreating,
      isUpdating,
      isDeleting,
      isToggling,
      isDuplicating,
      isUpdatingSettings
    }}>
      {children}
    </ChatbotContext.Provider>
  );
};
