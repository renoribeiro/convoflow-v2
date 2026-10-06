import { supabase } from '@/integrations/supabase/client';
import type {
  EvolutionInstance,
  DetailedEvolutionInstance,
  WebhookEvent,
  IncomingMessage,
  MessageTemplate,
  EvolutionConfig,
  WebhookConfig,
  WebhookConfigEvent,
  SendTextPayload,
  SendImagePayload,
  SendVideoPayload,
  SendAudioPayload,
  SendDocumentPayload,
  SendStickerPayload,
  SendLocationPayload,
  SendContactPayload,
  SendReactionPayload,
  SendPollPayload,
  SendButtonsPayload,
  SendListPayload,
  FindContactsBody,
  FindChatsBody,
  FindMessagesBody
} from '../types/evolution.types';
import { logger } from '../lib/logger';
import { ValidationSchemas, validateInput, UrlSanitizer } from '../lib/validation';
import { toast } from 'sonner';

export class EvolutionApiService {
  // Public readonly para o hook conseguir gravar em whatsapp_instances.connection_config
  // sem reabrir tenants.settings ou .env — a fonte da verdade fica no service ativo.
  public readonly baseUrl: string;
  public readonly apiKey: string;

  constructor(baseUrl: string, apiKey: string) {
    // Validate and sanitize inputs
    const urlValidation = validateInput(ValidationSchemas.url, baseUrl);
    const apiKeyValidation = validateInput(ValidationSchemas.apiKey, apiKey);

    if (!urlValidation.success) {
      throw new Error(`Invalid base URL: ${urlValidation.error}`);
    }

    if (!apiKeyValidation.success) {
      throw new Error(`Invalid API key: ${apiKeyValidation.error}`);
    }

    const sanitizedUrl = UrlSanitizer.sanitizeUrl(baseUrl);
    if (!sanitizedUrl) {
      throw new Error('Invalid or unsafe base URL');
    }

    this.baseUrl = sanitizedUrl.replace(/\/$/, ''); // Remove trailing slash
    this.apiKey = apiKey;

    logger.info('Evolution API service initialized', {
      baseUrl: this.baseUrl.replace(/\/[^/]*$/, '/***'), // Hide sensitive parts
      hasApiKey: !!this.apiKey
    });
  }

  public async makeRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      'apikey': this.apiKey,
      ...options.headers,
    };

    // Log request (without sensitive data)
    logger.debug('Making Evolution API request', {
      endpoint,
      method: options.method || 'GET',
      hasBody: !!options.body
    });



    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });



      if (!response.ok) {
        const rawBody = await response.text();
        let errorData: any;
        try {
          errorData = rawBody ? JSON.parse(rawBody) : { message: response.statusText };
        } catch {
          errorData = { message: rawBody || response.statusText };
        }

        // Tratamento específico para erros de chave estrangeira do Evolution API
        if (response.status === 400 && JSON.stringify(errorData).includes('Foreign key constraint failed')) {

          logger.warn('Evolution API foreign key constraint error', {
            endpoint,
            status: response.status,
            error: errorData
          });

          // Para erros de chave estrangeira, retornamos um erro mais amigável
          throw new Error('Erro de sincronização com o servidor WhatsApp. Tente novamente em alguns instantes.');
        }

        const error = new Error(`HTTP ${response.status}: ${response.statusText} - ${JSON.stringify(errorData)}`);

        logger.error('Evolution API request failed', {
          endpoint,
          status: response.status,
          statusText: response.statusText,
          error: errorData
        }, error);

        throw error;
      }

      const data = await response.json();

      logger.debug('Evolution API request successful', {
        endpoint,
        status: response.status
      });

      return data;
    } catch (error: any) {
      if (error.name === 'TypeError' && error.message.includes('fetch')) {
        logger.error('Network error in Evolution API request', {
          endpoint,
          error: error.message
        }, error);
        throw new Error('Erro de conexão com a Evolution API');
      }
      throw error;
    }
  }

  // Instance Management
  public createInstance = async (params: { instanceName: string; webhookUrl?: string; settings?: any; }) => {
    logger.debug('Creating Evolution instance', { instanceName: params.instanceName });

    // Garantir que instanceName seja uma string simples
    const instanceName = typeof params.instanceName === 'string'
      ? params.instanceName
      : String(params.instanceName);

    // Payload seguindo o modelo oficial da Evolution API V2
    // Inclui configuração inline de webhook (best practice V2)
    const body: Record<string, any> = {
      integration: "WHATSAPP-BAILEYS",
      instanceName,
      qrcode: true,
      rejectCall: true,
      groupsIgnore: true,
      alwaysOnline: true,
      readMessages: false,
      readStatus: false
    };

    // V2 best practice: configure webhook inline with instance creation
    if (params.webhookUrl) {
      body.webhook = {
        url: params.webhookUrl,
        enabled: true,
        byEvents: false,
        base64: false,
        events: [
          'QRCODE_UPDATED',
          'CONNECTION_UPDATE',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE'
        ]
      };
    }

    return this.makeRequest('/instance/create', {
      method: 'POST',
      body: JSON.stringify(body)
    });
  };

  /**
   * Creates a WhatsApp instance with automatic webhook configuration
   * Implements retry logic and comprehensive logging for webhook setup
   */
  public createInstanceWithWebhook = async (params: {
    instanceName: string;
    webhookUrl?: string;
    settings?: any;
    retryAttempts?: number;
    retryDelay?: number;
  }) => {
    const {
      instanceName,
      webhookUrl,
      settings,
      retryAttempts = 3,
      retryDelay = 2000
    } = params;

    logger.info('Starting instance creation with webhook automation', {
      instanceName,
      hasWebhookUrl: !!webhookUrl,
      retryAttempts,
      retryDelay
    });

    try {
      // Step 1: Create the instance
      console.log('🚀 [createInstanceWithWebhook] Creating instance:', instanceName);
      const instanceResult = await this.createInstance({ instanceName, settings }) as Record<string, any>;

      logger.info('Instance created successfully', {
        instanceName,
        status: instanceResult.status
      });

      // Step 2: Configure webhook if URL is provided
      if (webhookUrl) {
        console.log('🔗 [createInstanceWithWebhook] Configuring webhook for:', instanceName);
        await this.configureWebhookWithRetry(instanceName, webhookUrl, retryAttempts, retryDelay);
      } else {
        // Use default webhook URL from Supabase Edge Function
        const defaultWebhookUrl = await this.getDefaultWebhookUrl();
        if (defaultWebhookUrl) {
          console.log('🔗 [createInstanceWithWebhook] Using default webhook URL for:', instanceName);
          await this.configureWebhookWithRetry(instanceName, defaultWebhookUrl, retryAttempts, retryDelay);
        }
      }

      return {
        ...(instanceResult || {}),
        webhookConfigured: true,
        webhookUrl: webhookUrl || await this.getDefaultWebhookUrl()
      };
    } catch (error) {
      logger.error('Failed to create instance with webhook', {
        instanceName,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, error as Error);
      throw error;
    }
  };

  /**
   * Configures webhook for an instance with retry logic
   */
  private configureWebhookWithRetry = async (
    instanceName: string,
    webhookUrl: string,
    maxRetries: number = 3,
    delay: number = 2000
  ): Promise<void> => {
    const essentialEvents = [
      'QRCODE_UPDATED',
      'CONNECTION_UPDATE',
      'MESSAGES_UPSERT',
      'MESSAGES_UPDATE',
      'SEND_MESSAGE',
      'CONTACTS_UPSERT',
      'CONTACTS_UPDATE'
    ];

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 [configureWebhookWithRetry] Attempt ${attempt}/${maxRetries} for ${instanceName}`);

        await this.setWebhook(instanceName, webhookUrl, essentialEvents);

        // Log successful webhook configuration
        await this.logWebhookEvent(instanceName, 'WEBHOOK_CONFIGURED', {
          webhookUrl,
          events: essentialEvents,
          attempt,
          success: true
        });

        logger.info('Webhook configured successfully', {
          instanceName,
          webhookUrl,
          events: essentialEvents,
          attempt
        });

        console.log('✅ [configureWebhookWithRetry] Webhook configured successfully for:', instanceName);
        return;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Log failed attempt
        await this.logWebhookEvent(instanceName, 'WEBHOOK_CONFIG_FAILED', {
          webhookUrl,
          events: essentialEvents,
          attempt,
          error: errorMessage,
          success: false
        });

        logger.warn('Webhook configuration attempt failed', {
          instanceName,
          attempt,
          maxRetries,
          error: errorMessage
        });

        if (attempt === maxRetries) {
          logger.error('All webhook configuration attempts failed', {
            instanceName,
            webhookUrl,
            totalAttempts: maxRetries,
            finalError: errorMessage
          });
          throw new Error(`Failed to configure webhook after ${maxRetries} attempts: ${errorMessage}`);
        }

        // Wait before retry
        console.log(`⏳ [configureWebhookWithRetry] Waiting ${delay}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  /**
   * Gets the default webhook URL from Supabase project
   */
  private getDefaultWebhookUrl = async (): Promise<string | null> => {
    try {
      // Use Vite env vars (not process.env which doesn't work in Vite)
      const supabaseUrl = typeof import.meta !== 'undefined'
        ? (import.meta as any).env?.VITE_SUPABASE_URL
        : undefined;
      if (supabaseUrl) {
        return `${supabaseUrl}/functions/v1/evolution-webhook`;
      }
      return null;
    } catch (error) {
      logger.warn('Failed to get default webhook URL', { error });
      return null;
    }
  };

  /**
   * Logs webhook events to database for monitoring
   */
  private logWebhookEvent = async (
    instanceName: string,
    eventType: string,
    eventData: any
  ): Promise<void> => {
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      
      const logEntry = {
        instance_name: instanceName,
        event_type: eventType,
        event_data: typeof eventData === 'string' ? eventData : JSON.stringify(eventData).substring(0, 10000),
        processed_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('webhook_logs')
        .insert(logEntry);

      if (error) {
        // Silently fail — logging should never break the main flow
        console.warn('[logWebhookEvent] Failed to persist log:', error.message);
      }
    } catch (error) {
      console.warn('[logWebhookEvent] Error:', error);
    }
  };

  async deleteInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  /**
   * Get detailed information about a specific instance from Evolution API v2
   * Returns comprehensive instance data including owner, profile info, and integration details
   * @param instanceName - The name of the instance to get detailed info for
   * @returns Promise<DetailedEvolutionInstance> - Detailed instance information
   */
  async getDetailedInstanceInfo(instanceName: string): Promise<DetailedEvolutionInstance> {
    return this.makeRequest<DetailedEvolutionInstance>(`/instance/fetchInstances/${instanceName}`);
  }

  async getAllInstances(): Promise<EvolutionInstance[]> {
    const response = await this.makeRequest<EvolutionInstance[]>('/instance/fetchInstances');
    return Array.isArray(response) ? response : [];
  }

  async restartInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/restart/${instanceName}`, {
      method: 'PUT',
    });
  }

  async getInstanceStatus(instanceName: string): Promise<{ instance: { state: string } }> {
    return this.makeRequest<{ instance: { state: string } }>(`/instance/connectionState/${instanceName}`);
  }

  async connectInstance(instanceName: string): Promise<{ pairingCode: string; code: string; count: number; base64?: string }> {
    return this.makeRequest<{ pairingCode: string; code: string; count: number; base64?: string }>(`/instance/connect/${instanceName}`, {
      method: 'GET',
    });
  }

  async disconnectInstance(instanceName: string): Promise<void> {
    await this.makeRequest(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async getQRCode(instanceName: string): Promise<{ qrcode: string }> {
    return this.makeRequest<{ qrcode: string }>(`/instance/qrcode/${instanceName}`);
  }

  async refreshQRCode(instanceName: string): Promise<{ qrcode: string }> {
    return this.makeRequest<{ qrcode: string }>(`/instance/qrcode/${instanceName}`, {
      method: 'GET',
    });
  }

  // Message Management - Evolution API V2
  async sendMessage(instanceName: string, remoteJid: string, message: string, options?: any): Promise<any> {
    const payload: SendTextPayload = {
      number: remoteJid,
      text: message,
      delay: options?.delay || 0,
      quoted: options?.quoted,
      mentions: options?.mentions,
      linkPreview: options?.linkPreview !== false
    };

    return this.makeRequest(`/message/sendText/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send an image message via Evolution API V2.
   * Uses POST /message/sendMedia/{instance} with mediatype: 'image'
   */
  async sendImageMessage(
    instanceName: string,
    remoteJid: string,
    mediaUrl: string,
    caption?: string,
    options?: any
  ): Promise<any> {
    const payload: SendImagePayload = {
      number: remoteJid,
      mediatype: 'image',
      media: mediaUrl,
      caption,
      delay: options?.delay || 0,
      quoted: options?.quoted,
      mentions: options?.mentions
    };

    return this.makeRequest(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send a video message via Evolution API V2.
   * Uses POST /message/sendMedia/{instance} with mediatype: 'video'
   */
  async sendVideoMessage(
    instanceName: string,
    remoteJid: string,
    mediaUrl: string,
    caption?: string,
    options?: any
  ): Promise<any> {
    const payload: SendVideoPayload = {
      number: remoteJid,
      mediatype: 'video',
      media: mediaUrl,
      caption,
      delay: options?.delay || 0,
      quoted: options?.quoted
    };

    return this.makeRequest(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send an audio message via Evolution API V2.
   * Uses POST /message/sendWhatsAppAudio/{instance}
   */
  async sendAudioMessage(instanceName: string, remoteJid: string, audioUrl: string, options?: any): Promise<any> {
    const payload: SendAudioPayload = {
      number: remoteJid,
      audio: audioUrl,
      delay: options?.delay || 0
    };

    return this.makeRequest(`/message/sendWhatsAppAudio/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send a document via Evolution API V2.
   * Uses POST /message/sendMedia/{instance} with mediatype: 'document'
   */
  async sendDocumentMessage(
    instanceName: string,
    remoteJid: string,
    documentUrl: string,
    fileName: string,
    options?: any
  ): Promise<any> {
    const payload: SendDocumentPayload = {
      number: remoteJid,
      mediatype: 'document',
      media: documentUrl,
      fileName,
      caption: options?.caption,
      delay: options?.delay || 0
    };

    return this.makeRequest(`/message/sendMedia/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send a sticker via Evolution API V2.
   * Uses POST /message/sendSticker/{instance}
   */
  async sendStickerMessage(
    instanceName: string,
    remoteJid: string,
    stickerUrl: string,
    options?: any
  ): Promise<any> {
    const payload: SendStickerPayload = {
      number: remoteJid,
      sticker: stickerUrl,
      delay: options?.delay || 0
    };

    return this.makeRequest(`/message/sendSticker/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Backward compatibility: routes to the correct media sender based on detected type.
   */
  async sendMediaMessage(
    instanceName: string,
    remoteJid: string,
    mediaUrl: string,
    caption?: string,
    options?: any
  ): Promise<any> {
    // Default to image if no mediaType specified
    const mediaType = options?.mediaType || 'image';
    switch (mediaType) {
      case 'video':
        return this.sendVideoMessage(instanceName, remoteJid, mediaUrl, caption, options);
      case 'document':
        return this.sendDocumentMessage(instanceName, remoteJid, mediaUrl, options?.fileName || 'file', options);
      case 'audio':
        return this.sendAudioMessage(instanceName, remoteJid, mediaUrl, options);
      case 'image':
      default:
        return this.sendImageMessage(instanceName, remoteJid, mediaUrl, caption, options);
    }
  }

  async sendLocationMessage(
    instanceName: string,
    remoteJid: string,
    latitude: number,
    longitude: number,
    name?: string,
    address?: string
  ): Promise<any> {
    const payload: SendLocationPayload = {
      number: remoteJid,
      latitude,
      longitude,
      name,
      address
    };

    return this.makeRequest(`/message/sendLocation/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendContactMessage(
    instanceName: string,
    remoteJid: string,
    contact: { fullName: string; wuid: string; phoneNumber: string }
  ): Promise<any> {
    const payload: SendContactPayload = {
      number: remoteJid,
      contact: [contact]
    };

    return this.makeRequest(`/message/sendContact/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendReactionMessage(
    instanceName: string,
    messageKey: { remoteJid: string; fromMe: boolean; id: string },
    reaction: string
  ): Promise<any> {
    const payload: SendReactionPayload = {
      key: messageKey,
      reaction
    };

    return this.makeRequest(`/message/sendReaction/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send a poll message via Evolution API V2.
   * Uses POST /message/sendPoll/{instance}
   */
  async sendPollMessage(
    instanceName: string,
    remoteJid: string,
    pollName: string,
    values: string[],
    selectableCount: number = 1
  ): Promise<any> {
    const payload: SendPollPayload = {
      number: remoteJid,
      name: pollName,
      selectableCount,
      values
    };

    return this.makeRequest(`/message/sendPoll/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send an interactive buttons message via Evolution API V2.
   * Uses POST /message/sendButtons/{instance}
   */
  async sendButtonsMessage(
    instanceName: string,
    payload: SendButtonsPayload
  ): Promise<any> {
    return this.makeRequest(`/message/sendButtons/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  /**
   * Send an interactive list message via Evolution API V2.
   * Uses POST /message/sendList/{instance}
   */
  async sendListMessage(
    instanceName: string,
    payload: SendListPayload
  ): Promise<any> {
    return this.makeRequest(`/message/sendList/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  // Group Management
  async createGroup(instanceName: string, subject: string, participants: string[]): Promise<any> {
    const payload = {
      subject,
      participants
    };

    return this.makeRequest(`/group/create/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getGroupInfo(instanceName: string, groupJid: string): Promise<any> {
    return this.makeRequest(`/group/findGroup/${instanceName}?groupJid=${groupJid}`);
  }

  async addParticipants(instanceName: string, groupJid: string, participants: string[]): Promise<any> {
    const payload = {
      groupJid,
      participants
    };

    return this.makeRequest(`/group/updateParticipant/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async removeParticipants(instanceName: string, groupJid: string, participants: string[]): Promise<any> {
    const payload = {
      groupJid,
      participants,
      action: 'remove'
    };

    return this.makeRequest(`/group/updateParticipant/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async promoteParticipants(instanceName: string, groupJid: string, participants: string[]): Promise<any> {
    const payload = {
      groupJid,
      participants,
      action: 'promote'
    };

    return this.makeRequest(`/group/updateParticipant/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async demoteParticipants(instanceName: string, groupJid: string, participants: string[]): Promise<any> {
    const payload = {
      groupJid,
      participants,
      action: 'demote'
    };

    return this.makeRequest(`/group/updateParticipant/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateGroupSubject(instanceName: string, groupJid: string, subject: string): Promise<any> {
    const payload = {
      groupJid,
      subject
    };

    return this.makeRequest(`/group/updateGroupSubject/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async updateGroupDescription(instanceName: string, groupJid: string, description: string): Promise<any> {
    const payload = {
      groupJid,
      description
    };

    return this.makeRequest(`/group/updateGroupDescription/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async leaveGroup(instanceName: string, groupJid: string): Promise<any> {
    const payload = {
      groupJid
    };

    return this.makeRequest(`/group/leaveGroup/${instanceName}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    });
  }

  // Contact Management - Evolution API V2 (POST with body)
  async getContacts(instanceName: string, where?: { id?: string; pushName?: string }): Promise<any> {
    const body: FindContactsBody = { where };
    return this.makeRequest(`/chat/findContacts/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getContactInfo(instanceName: string, number: string): Promise<any> {
    return this.makeRequest(`/chat/whatsappNumbers/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ numbers: [number] }),
    });
  }

  async getProfilePicture(instanceName: string, number: string): Promise<any> {
    return this.makeRequest(`/chat/fetchProfilePictureUrl/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ number }),
    });
  }

  async getChats(instanceName: string): Promise<any> {
    const body: FindChatsBody = {};
    return this.makeRequest(`/chat/findChats/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async getChatMessages(instanceName: string, remoteJid: string, limit: number = 20): Promise<any> {
    const body: FindMessagesBody = {
      where: {
        key: { remoteJid }
      },
      limit
    };
    return this.makeRequest(`/chat/findMessages/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async markMessageAsRead(instanceName: string, remoteJid: string, messageIds: string[]): Promise<any> {
    const payload = {
      readMessages: messageIds.map(id => ({
        remoteJid,
        fromMe: false,
        id
      }))
    };

    return this.makeRequest(`/chat/markMessageAsRead/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async archiveChat(instanceName: string, remoteJid: string, archive: boolean = true): Promise<any> {
    const payload = {
      lastMessage: {
        key: {
          remoteJid
        },
        messageTimestamp: Math.floor(Date.now() / 1000)
      },
      archive
    };

    return this.makeRequest(`/chat/archiveChat/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async deleteMessage(instanceName: string, remoteJid: string, messageId: string, deleteForEveryone: boolean = false): Promise<any> {
    const payload = {
      remoteJid,
      fromMe: true,
      id: messageId,
      participant: deleteForEveryone ? undefined : remoteJid
    };

    return this.makeRequest(`/chat/deleteMessage/${instanceName}`, {
      method: 'DELETE',
      body: JSON.stringify(payload),
    });
  }

  // Instance Settings
  async updateInstanceSettings(instanceName: string, settings: Partial<EvolutionInstance['settings']>): Promise<void> {
    await this.makeRequest(`/instance/settings/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Set webhook configuration - Evolution API V2
   * The API requires the payload to be wrapped in a "webhook" root key
   */
  async setWebhook(instanceName: string, webhookUrl: string, events: string[]): Promise<void> {
    const webhookConfig: WebhookConfig = {
      enabled: true,
      url: webhookUrl,
      byEvents: false,
      base64: false,
      events: events as WebhookConfigEvent[],
    };

    await this.makeRequest(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({ webhook: webhookConfig }),
    });
  }

  /**
   * Get current webhook configuration from Evolution API V2
   */
  async getWebhookConfig(instanceName: string): Promise<WebhookConfig | null> {
    try {
      return await this.makeRequest<WebhookConfig>(`/webhook/find/${instanceName}`, {
        method: 'GET',
      });
    } catch (error) {
      logger.warn('Failed to get webhook config', { instanceName, error });
      return null;
    }
  }

  async setPresence(instanceName: string, presence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused'): Promise<any> {
    const payload = {
      presence
    };

    return this.makeRequest(`/chat/updatePresence/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async blockContact(instanceName: string, number: string): Promise<any> {
    const payload = {
      number,
      status: 'block'
    };

    return this.makeRequest(`/chat/updateContactStatus/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }

  async unblockContact(instanceName: string, number: string): Promise<any> {
    const payload = {
      number,
      status: 'unblock'
    };

    return this.makeRequest(`/chat/updateContactStatus/${instanceName}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  }
}

// Service factory
export const createEvolutionApiService = (serverUrl: string, apiKey: string) => {
  return new EvolutionApiService(serverUrl, apiKey);
};