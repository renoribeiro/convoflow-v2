import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { EvolutionInstance } from '../types/evolution.types';
import { EvolutionApiService } from '../services/evolutionApi';
// WebhookHandler removido — webhooks são processados exclusivamente pela Edge Function server-side

export interface Message {
  id: string;
  instanceName: string;
  remoteJid: string;
  fromMe: boolean;
  participant?: string;
  pushName?: string;
  messageText: string;
  messageType: string;
  messageData: any;
  timestamp: Date;
  status: string;
  deleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Contact {
  instanceName: string;
  jid: string;
  name?: string;
  pushName?: string;
  profilePicture?: string;
  presence?: string;
  lastSeen?: Date;
  isBusiness?: boolean;
  isEnterprise?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Chat {
  id: string;
  instanceName: string;
  name?: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessageTime?: Date;
  archived: boolean;
  pinned: boolean;
  muted?: Date;
  deleted?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Group {
  id: string;
  instanceName: string;
  subject?: string;
  subjectOwner?: string;
  subjectTime?: Date;
  creation?: Date;
  owner?: string;
  description?: string;
  descriptionOwner?: string;
  descriptionId?: string;
  restrict?: boolean;
  announce?: boolean;
  participants: any[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EvolutionState {
  // API Service
  apiService: EvolutionApiService | null;
  /** @deprecated Webhooks são processados server-side pela Edge Function */
  webhookHandler: null;
  
  // Instances
  instances: EvolutionInstance[];
  selectedInstance: EvolutionInstance | null;
  instancesLoading: boolean;
  instancesError: string | null;
  
  // Messages
  messages: Message[];
  messagesLoading: boolean;
  messagesError: string | null;
  selectedChat: string | null;
  
  // Contacts
  contacts: Contact[];
  contactsLoading: boolean;
  contactsError: string | null;
  
  // Chats
  chats: Chat[];
  chatsLoading: boolean;
  chatsError: string | null;
  
  // Groups
  groups: Group[];
  groupsLoading: boolean;
  groupsError: string | null;
  
  // Real-time updates
  isConnected: boolean;
  lastUpdate: Date | null;
  
  // Actions
  initializeApi: (baseUrl: string, apiKey: string) => void;
  
  // Instance actions
  fetchInstances: () => Promise<void>;
  createInstance: (data: Partial<EvolutionInstance>) => Promise<EvolutionInstance>;
  updateInstance: (name: string, data: Partial<EvolutionInstance>) => Promise<void>;
  deleteInstance: (name: string) => Promise<void>;
  connectInstance: (name: string) => Promise<void>;
  disconnectInstance: (name: string) => Promise<void>;
  restartInstance: (name: string) => Promise<void>;
  getQRCode: (name: string) => Promise<string>;
  refreshQRCode: (name: string) => Promise<string>;
  setSelectedInstance: (instance: EvolutionInstance | null) => void;
  
  // Message actions
  fetchMessages: (instanceName: string, remoteJid?: string) => Promise<void>;
  sendMessage: (instanceName: string, remoteJid: string, text: string, options?: any) => Promise<void>;
  sendMediaMessage: (instanceName: string, remoteJid: string, media: any, options?: any) => Promise<void>;
  sendAudioMessage: (instanceName: string, remoteJid: string, audio: any, options?: any) => Promise<void>;
  sendDocumentMessage: (instanceName: string, remoteJid: string, document: any, options?: any) => Promise<void>;
  sendLocationMessage: (instanceName: string, remoteJid: string, location: any, options?: any) => Promise<void>;
  sendContactMessage: (instanceName: string, remoteJid: string, contact: any, options?: any) => Promise<void>;
  sendReactionMessage: (instanceName: string, remoteJid: string, reaction: any, options?: any) => Promise<void>;
  markMessageAsRead: (instanceName: string, remoteJid: string, messageIds: string[]) => Promise<void>;
  deleteMessage: (instanceName: string, remoteJid: string, messageId: string, deleteForEveryone?: boolean) => Promise<void>;
  setSelectedChat: (chatId: string | null) => void;
  
  // Contact actions
  fetchContacts: (instanceName: string) => Promise<void>;
  getContactInfo: (instanceName: string, number: string) => Promise<Contact>;
  getProfilePicture: (instanceName: string, number: string) => Promise<string>;
  blockContact: (instanceName: string, number: string) => Promise<void>;
  unblockContact: (instanceName: string, number: string) => Promise<void>;
  
  // Chat actions
  fetchChats: (instanceName: string) => Promise<void>;
  archiveChat: (instanceName: string, remoteJid: string, archive?: boolean) => Promise<void>;
  
  // Group actions
  fetchGroups: (instanceName: string) => Promise<void>;
  createGroup: (instanceName: string, subject: string, participants: string[]) => Promise<Group>;
  getGroupInfo: (instanceName: string, groupJid: string) => Promise<Group>;
  addParticipants: (instanceName: string, groupJid: string, participants: string[]) => Promise<void>;
  removeParticipants: (instanceName: string, groupJid: string, participants: string[]) => Promise<void>;
  promoteParticipants: (instanceName: string, groupJid: string, participants: string[]) => Promise<void>;
  demoteParticipants: (instanceName: string, groupJid: string, participants: string[]) => Promise<void>;
  updateGroupSubject: (instanceName: string, groupJid: string, subject: string) => Promise<void>;
  updateGroupDescription: (instanceName: string, groupJid: string, description: string) => Promise<void>;
  leaveGroup: (instanceName: string, groupJid: string) => Promise<void>;
  
  // Presence actions
  setPresence: (instanceName: string, presence: string) => Promise<void>;
  
  // Webhook actions
  processWebhookEvent: (event: any) => Promise<void>;
  
  // Utility actions
  clearError: (type: string) => void;
  reset: () => void;
}

const initialState = {
  apiService: null,
  webhookHandler: null,
  instances: [],
  selectedInstance: null,
  instancesLoading: false,
  instancesError: null,
  messages: [],
  messagesLoading: false,
  messagesError: null,
  selectedChat: null,
  contacts: [],
  contactsLoading: false,
  contactsError: null,
  chats: [],
  chatsLoading: false,
  chatsError: null,
  groups: [],
  groupsLoading: false,
  groupsError: null,
  isConnected: false,
  lastUpdate: null,
};

export const useEvolutionStore = create<EvolutionState>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,
        
        initializeApi: (baseUrl: string, apiKey: string) => {
          const apiService = new EvolutionApiService(baseUrl, apiKey);
          
          set({ 
            apiService, 
            isConnected: true,
            lastUpdate: new Date()
          });
        },
        
        // Instance actions
        fetchInstances: async () => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ instancesLoading: true, instancesError: null });
          
          try {
            const instances = await apiService.getAllInstances();
            set({ instances, instancesLoading: false });
          } catch (error: any) {
            set({ instancesError: error.message, instancesLoading: false });
            throw error;
          }
        },
        
        createInstance: async (data: Partial<EvolutionInstance>) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ instancesLoading: true, instancesError: null });
          
          try {
            const instance = await apiService.createInstance(data);
            const instances = [...get().instances, instance];
            set({ instances, instancesLoading: false });
            return instance;
          } catch (error: any) {
            set({ instancesError: error.message, instancesLoading: false });
            throw error;
          }
        },
        
        updateInstance: async (name: string, data: Partial<EvolutionInstance>) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ instancesLoading: true, instancesError: null });
          
          try {
            await apiService.updateInstanceSettings(name, data.settings || {});
            const instances = get().instances.map(inst => 
              inst.name === name ? { ...inst, ...data } : inst
            );
            set({ instances, instancesLoading: false });
          } catch (error: any) {
            set({ instancesError: error.message, instancesLoading: false });
            throw error;
          }
        },
        
        deleteInstance: async (name: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ instancesLoading: true, instancesError: null });
          
          try {
            await apiService.deleteInstance(name);
            const instances = get().instances.filter(inst => inst.name !== name);
            set({ instances, instancesLoading: false });
          } catch (error: any) {
            set({ instancesError: error.message, instancesLoading: false });
            throw error;
          }
        },
        
        connectInstance: async (name: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.connectInstance(name);
            const instances = get().instances.map(inst => 
              inst.name === name ? { ...inst, status: 'connecting' } : inst
            );
            set({ instances });
          } catch (error: any) {
            set({ instancesError: error.message });
            throw error;
          }
        },
        
        disconnectInstance: async (name: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.disconnectInstance(name);
            const instances = get().instances.map(inst => 
              inst.name === name ? { ...inst, status: 'disconnected' } : inst
            );
            set({ instances });
          } catch (error: any) {
            set({ instancesError: error.message });
            throw error;
          }
        },
        
        restartInstance: async (name: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.restartInstance(name);
            const instances = get().instances.map(inst => 
              inst.name === name ? { ...inst, status: 'restarting' } : inst
            );
            set({ instances });
          } catch (error: any) {
            set({ instancesError: error.message });
            throw error;
          }
        },
        
        getQRCode: async (name: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            const qrCode = await apiService.getQRCode(name);
            return qrCode;
          } catch (error: any) {
            set({ instancesError: error.message });
            throw error;
          }
        },
        
        refreshQRCode: async (name: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            const qrCode = await apiService.refreshQRCode(name);
            return qrCode;
          } catch (error: any) {
            set({ instancesError: error.message });
            throw error;
          }
        },
        
        setSelectedInstance: (instance: EvolutionInstance | null) => {
          set({ selectedInstance: instance });
        },
        
        // Message actions
        fetchMessages: async (instanceName: string, remoteJid?: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ messagesLoading: true, messagesError: null });
          
          try {
            let messages: Message[] = [];
            if (remoteJid) {
              const response = await apiService.getChatMessages(instanceName, remoteJid);
              messages = response.messages || [];
            }
            set({ messages, messagesLoading: false });
          } catch (error: any) {
            set({ messagesError: error.message, messagesLoading: false });
            throw error;
          }
        },
        
        sendMessage: async (instanceName: string, remoteJid: string, text: string, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendMessage(instanceName, remoteJid, text, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        sendMediaMessage: async (instanceName: string, remoteJid: string, media: any, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendMediaMessage(instanceName, remoteJid, media, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        sendAudioMessage: async (instanceName: string, remoteJid: string, audio: any, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendAudioMessage(instanceName, remoteJid, audio, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        sendDocumentMessage: async (instanceName: string, remoteJid: string, document: any, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendDocumentMessage(instanceName, remoteJid, document, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        sendLocationMessage: async (instanceName: string, remoteJid: string, location: any, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendLocationMessage(instanceName, remoteJid, location, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        sendContactMessage: async (instanceName: string, remoteJid: string, contact: any, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendContactMessage(instanceName, remoteJid, contact, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        sendReactionMessage: async (instanceName: string, remoteJid: string, reaction: any, options?: any) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.sendReactionMessage(instanceName, remoteJid, reaction, options);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        markMessageAsRead: async (instanceName: string, remoteJid: string, messageIds: string[]) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.markMessageAsRead(instanceName, remoteJid, messageIds);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        deleteMessage: async (instanceName: string, remoteJid: string, messageId: string, deleteForEveryone?: boolean) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.deleteMessage(instanceName, remoteJid, messageId, deleteForEveryone);
          } catch (error: any) {
            set({ messagesError: error.message });
            throw error;
          }
        },
        
        setSelectedChat: (chatId: string | null) => {
          set({ selectedChat: chatId });
        },
        
        // Contact actions
        fetchContacts: async (instanceName: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ contactsLoading: true, contactsError: null });
          
          try {
            const response = await apiService.getContacts(instanceName);
            const contacts = response.contacts || [];
            set({ contacts, contactsLoading: false });
          } catch (error: any) {
            set({ contactsError: error.message, contactsLoading: false });
            throw error;
          }
        },
        
        getContactInfo: async (instanceName: string, number: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            const contact = await apiService.getContactInfo(instanceName, number);
            return contact;
          } catch (error: any) {
            set({ contactsError: error.message });
            throw error;
          }
        },
        
        getProfilePicture: async (instanceName: string, number: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            const response = await apiService.getProfilePicture(instanceName, number);
            return response.profilePictureUrl || '';
          } catch (error: any) {
            set({ contactsError: error.message });
            throw error;
          }
        },
        
        blockContact: async (instanceName: string, number: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.blockContact(instanceName, number);
          } catch (error: any) {
            set({ contactsError: error.message });
            throw error;
          }
        },
        
        unblockContact: async (instanceName: string, number: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.unblockContact(instanceName, number);
          } catch (error: any) {
            set({ contactsError: error.message });
            throw error;
          }
        },
        
        // Chat actions
        fetchChats: async (instanceName: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ chatsLoading: true, chatsError: null });
          
          try {
            const response = await apiService.getChats(instanceName);
            const chats = response.chats || [];
            set({ chats, chatsLoading: false });
          } catch (error: any) {
            set({ chatsError: error.message, chatsLoading: false });
            throw error;
          }
        },
        
        archiveChat: async (instanceName: string, remoteJid: string, archive: boolean = true) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.archiveChat(instanceName, remoteJid, archive);
          } catch (error: any) {
            set({ chatsError: error.message });
            throw error;
          }
        },
        
        // Group actions
        fetchGroups: async (instanceName: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          set({ groupsLoading: true, groupsError: null });
          
          try {
            // Note: Evolution API doesn't have a direct endpoint for all groups
            // This would need to be implemented based on chats that are groups
            const response = await apiService.getChats(instanceName);
            const groups = (response.chats || []).filter((chat: any) => chat.id.includes('@g.us'));
            set({ groups, groupsLoading: false });
          } catch (error: any) {
            set({ groupsError: error.message, groupsLoading: false });
            throw error;
          }
        },
        
        createGroup: async (instanceName: string, subject: string, participants: string[]) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            const group = await apiService.createGroup(instanceName, subject, participants);
            const groups = [...get().groups, group];
            set({ groups });
            return group;
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        getGroupInfo: async (instanceName: string, groupJid: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            const group = await apiService.getGroupInfo(instanceName, groupJid);
            return group;
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        addParticipants: async (instanceName: string, groupJid: string, participants: string[]) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.addParticipants(instanceName, groupJid, participants);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        removeParticipants: async (instanceName: string, groupJid: string, participants: string[]) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.removeParticipants(instanceName, groupJid, participants);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        promoteParticipants: async (instanceName: string, groupJid: string, participants: string[]) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.promoteParticipants(instanceName, groupJid, participants);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        demoteParticipants: async (instanceName: string, groupJid: string, participants: string[]) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.demoteParticipants(instanceName, groupJid, participants);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        updateGroupSubject: async (instanceName: string, groupJid: string, subject: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.updateGroupSubject(instanceName, groupJid, subject);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        updateGroupDescription: async (instanceName: string, groupJid: string, description: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.updateGroupDescription(instanceName, groupJid, description);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        leaveGroup: async (instanceName: string, groupJid: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.leaveGroup(instanceName, groupJid);
          } catch (error: any) {
            set({ groupsError: error.message });
            throw error;
          }
        },
        
        // Presence actions
        setPresence: async (instanceName: string, presence: string) => {
          const { apiService } = get();
          if (!apiService) throw new Error('API service not initialized');
          
          try {
            await apiService.setPresence(instanceName, presence as any);
          } catch (error: any) {
            set({ instancesError: error.message });
            throw error;
          }
        },
        
        // Webhook actions
        processWebhookEvent: async (_event: any) => {
          // Webhooks são processados exclusivamente pela Edge Function server-side (evolution-webhook)
          // Este método é mantido para compatibilidade mas não faz processamento duplicado
          console.warn('[EvolutionStore] processWebhookEvent is deprecated. Webhooks are processed server-side.');
          set({ lastUpdate: new Date() });
        },
        
        // Utility actions
        clearError: (type: string) => {
          set({ [`${type}Error`]: null } as any);
        },
        
        reset: () => {
          set(initialState);
        },
      }),
      {
        name: 'evolution-store',
        partialize: (state) => ({
          selectedInstance: state.selectedInstance,
          selectedChat: state.selectedChat,
        }),
      }
    ),
    {
      name: 'evolution-store',
    }
  ),
);

export default useEvolutionStore;