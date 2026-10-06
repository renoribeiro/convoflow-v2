/**
 * Chat History Sync Service
 * 
 * Responsible for synchronizing WhatsApp chat history from the Evolution API
 * into Supabase. Handles:
 * - Fetching all chats from the connected instance
 * - Creating/updating contacts in Supabase
 * - Creating/updating conversations in Supabase
 * - Inserting messages with deduplication via evolution_message_id
 * 
 * Limits: 20 messages per chat, ignores group chats.
 */

import { supabase } from '@/integrations/supabase/client';
import { EvolutionApiService } from './evolutionApi';
import { logger } from '../lib/logger';

const MESSAGES_PER_CHAT = 20;

/**
 * `messages.source` das linhas importadas do histórico do Evolution. As
 * mensagens `fromMe` antigas entram pela sessão de quem clicou em sincronizar,
 * com is_from_bot false — e o banco define "resposta humana" como outbound,
 * não-bot, `source IS NULL` (trg_set_message_sender, trg_record_conversation_
 * participant, response_rule_turn_start). Sem esta origem, quem sincronizou
 * seria registrado como autor e participante de todo o histórico importado.
 * Com ela, o histórico entra sem dono (o que ele é) e não conta como resposta
 * humana nas métricas. Convive com 'campaign' / 'chatbot' / 'followup' /
 * 'automation' (20260605120010) e não ganha selo na bolha (OriginBadge).
 */
export const HISTORY_SYNC_SOURCE = 'history_sync';

export interface SyncProgress {
  phase: 'idle' | 'fetching_chats' | 'syncing_messages' | 'done' | 'error';
  totalChats: number;
  processedChats: number;
  totalNewMessages: number;
  error?: string;
}

export interface SyncResult {
  success: boolean;
  chatsProcessed: number;
  messagesInserted: number;
  contactsCreated: number;
  conversationsCreated: number;
  errors: string[];
}

/**
 * Extract a clean phone number from a WhatsApp JID.
 * Returns null for group JIDs or invalid numbers.
 *
 * Evolution V2 / Baileys novo retorna muitos chats com remoteJid em formato
 * LID (`12345@lid`) e o phone real só aparece no `remoteJidAlt`. Quando o JID
 * primário for LID, o caller passa `altJid` (vindo de lastMessage.key.remoteJidAlt)
 * pra recuperarmos o phone.
 */
function extractPhoneFromJid(jid: string, altJid?: string | null): string | null {
  // Tenta com altJid quando o jid primário é LID/inutilizável.
  const candidate = (jid && !jid.includes('@lid')) ? jid : (altJid || '');
  if (!candidate) return null;
  if (candidate.includes('@g.us')) return null;
  if (candidate.includes('@lid')) return null; // ainda LID mesmo no alt — desiste
  if (candidate === 'status@broadcast') return null;

  const phone = candidate.replace('@s.whatsapp.net', '').replace('@c.us', '');
  // basic validation: must be digits only and > 8 chars
  if (!/^\d{8,}$/.test(phone)) return null;
  return phone;
}

/**
 * Determine message content and type from Evolution API message object.
 */
function extractMessageContent(message: any): { content: string; messageType: string } {
  if (!message) return { content: '', messageType: 'unknown' };

  if (message.conversation) {
    return { content: message.conversation, messageType: 'text' };
  }
  if (message.extendedTextMessage?.text) {
    return { content: message.extendedTextMessage.text, messageType: 'text' };
  }
  if (message.imageMessage) {
    return { content: message.imageMessage.caption || '[Imagem]', messageType: 'image' };
  }
  if (message.videoMessage) {
    return { content: message.videoMessage.caption || '[Vídeo]', messageType: 'video' };
  }
  if (message.audioMessage) {
    return { content: message.audioMessage.ptt ? '[Áudio]' : '[Arquivo de Áudio]', messageType: 'audio' };
  }
  if (message.documentMessage) {
    return { content: message.documentMessage.fileName || '[Documento]', messageType: 'document' };
  }
  if (message.locationMessage) {
    return { content: '[Localização]', messageType: 'location' };
  }
  if (message.contactMessage) {
    return { content: message.contactMessage.displayName || '[Contato]', messageType: 'contact' };
  }
  if (message.stickerMessage) {
    return { content: '[Figurinha]', messageType: 'sticker' };
  }
  if (message.reactionMessage) {
    return { content: message.reactionMessage.text || '', messageType: 'reaction' };
  }
  if (message.protocolMessage) {
    return { content: '', messageType: 'protocol' };
  }
  return { content: '[Mensagem não suportada]', messageType: 'unknown' };
}

/**
 * Parse the response from getChatMessages into a flat array of message objects.
 * Handles all known Evolution API v2 response formats.
 */
function parseMessagesResponse(response: any): any[] {
  if (!response) return [];

  // Direct array
  if (Array.isArray(response)) return response;

  // Paginated: { messages: { total, records: [...] } }
  if (Array.isArray(response?.messages?.records)) return response.messages.records;

  // Wrapped array: { messages: [...] }
  if (Array.isArray(response?.messages)) return response.messages;

  // Alternative wrapper: { data: [...] }
  if (Array.isArray(response?.data)) return response.data;

  // Alternative wrapper: { records: [...] }
  if (Array.isArray(response?.records)) return response.records;

  // Single object that looks like a message (has key.id)
  if (response?.key?.id) return [response];

  return [];
}

/**
 * Find or create a contact in Supabase.
 * Returns the contact id.
 */
async function findOrCreateContact(
  phone: string,
  tenantId: string,
  instanceId: string,
  pushName?: string,
  profilePicUrl?: string
): Promise<string | null> {
  try {
    // Try to find existing contact (escopo por instância)
    const { data: existing } = await supabase
      .from('contacts')
      .select('id, name')
      .eq('phone', phone)
      .eq('tenant_id', tenantId)
      .eq('whatsapp_instance_id', instanceId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (profilePicUrl) updates.avatar_url = profilePicUrl;
      // Promover name placeholder (igual ao phone) pro pushName recebido.
      // Não sobrescreve nomes já editados pelo usuário.
      const isPlaceholder = !existing.name || existing.name === phone;
      if (pushName && isPlaceholder) updates.name = pushName;
      if (Object.keys(updates).length > 0) {
        await supabase
          .from('contacts')
          .update(updates)
          .eq('id', existing.id);
      }
      return existing.id;
    }

    // Create new contact
    const { data: newContact, error } = await supabase
      .from('contacts')
      .insert({
        phone,
        name: pushName || phone,
        tenant_id: tenantId,
        whatsapp_instance_id: instanceId,
        avatar_url: profilePicUrl || null,
      })
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) {
      // Could be a race condition, try to find again (escopo por instância)
      const { data: retryFind } = await supabase
        .from('contacts')
        .select('id')
        .eq('phone', phone)
        .eq('tenant_id', tenantId)
        .eq('whatsapp_instance_id', instanceId)
        .limit(1)
        .maybeSingle();
      return retryFind?.id || null;
    }

    return newContact?.id || null;
  } catch (err) {
    logger.error('Error finding/creating contact', { phone, error: err });
    return null;
  }
}

/**
 * Find or create a conversation in Supabase.
 * Returns the conversation id.
 */
async function findOrCreateConversation(
  contactId: string,
  tenantId: string,
  instanceId: string,
  lastMessageAt?: string
): Promise<string | null> {
  try {
    // Try to find existing conversation by contact and tenant only
    const { data: existing } = await supabase
      .from('conversations')
      .select('id')
      .eq('contact_id', contactId)
      .eq('tenant_id', tenantId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update last_message_at and whatsapp_instance_id
      if (lastMessageAt || instanceId) {
        const updateData: any = { updated_at: new Date().toISOString() };
        if (lastMessageAt) updateData.last_message_at = lastMessageAt;
        if (instanceId) updateData.whatsapp_instance_id = instanceId;

        await supabase
          .from('conversations')
          .update(updateData)
          .eq('id', existing.id);
      }
      return existing.id;
    }

    // Create new conversation
    const { data: newConv, error } = await supabase
      .from('conversations')
      .insert({
        contact_id: contactId,
        tenant_id: tenantId,
        whatsapp_instance_id: instanceId,
        last_message_at: lastMessageAt || new Date().toISOString(),
        unread_count: 0,
        is_archived: false,
      })
      .select('id')
      .limit(1)
      .maybeSingle();

    if (error) {
      // Race condition fallback
      const { data: retryFind } = await supabase
        .from('conversations')
        .select('id')
        .eq('contact_id', contactId)
        .eq('tenant_id', tenantId)
        .eq('whatsapp_instance_id', instanceId)
        .limit(1)
        .maybeSingle();
      return retryFind?.id || null;
    }

    return newConv?.id || null;
  } catch (err) {
    logger.error('Error finding/creating conversation', { contactId, error: err });
    return null;
  }
}

/**
 * Main sync function: pulls all chats and their messages from Evolution API
 * and persists them in Supabase.
 */
export async function syncChatHistory(
  apiService: EvolutionApiService,
  instanceName: string,
  tenantId: string,
  instanceId: string,
  onProgress?: (progress: SyncProgress) => void
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    chatsProcessed: 0,
    messagesInserted: 0,
    contactsCreated: 0,
    conversationsCreated: 0,
    errors: [],
  };

  const progress: SyncProgress = {
    phase: 'fetching_chats',
    totalChats: 0,
    processedChats: 0,
    totalNewMessages: 0,
  };

  try {
    onProgress?.(progress);

    // Step 1: Fetch all chats from Evolution API
    logger.info('Starting chat history sync', { instanceName });
    let chats: any[] = [];

    try {
      const chatsResponse = await apiService.getChats(instanceName);
      chats = Array.isArray(chatsResponse) ? chatsResponse : (chatsResponse?.chats || chatsResponse || []);
    } catch (err) {
      logger.error('Failed to fetch chats from Evolution API', { error: err });
      result.errors.push('Falha ao buscar chats da API');
      progress.phase = 'error';
      progress.error = 'Falha ao buscar chats';
      onProgress?.(progress);
      return result;
    }

    // Filter out groups
    const individualChats = chats.filter((chat: any) => {
      const chatId = chat.remoteJid || chat.id || '';
      return !chatId.includes('@g.us') && chatId !== 'status@broadcast';
    });

    progress.totalChats = individualChats.length;
    progress.phase = 'syncing_messages';
    onProgress?.(progress);

    logger.info(`Found ${individualChats.length} individual chats to sync`, { instanceName });

    // Step 2: Process each chat
    for (const chat of individualChats) {
      try {
        const chatId = chat.remoteJid || chat.id || '';
        // Evolution V2 envia remoteJidAlt dentro de lastMessage.key quando o JID
        // primário é LID. Tentamos esses fallbacks pra resgatar o phone real.
        const altJid =
          chat.lastMessage?.key?.remoteJidAlt ||
          chat.lastMessage?.remoteJidAlt ||
          chat.remoteJidAlt ||
          null;
        const phone = extractPhoneFromJid(chatId, altJid);

        if (!phone) {
          progress.processedChats++;
          onProgress?.(progress);
          continue;
        }

        // Find or create contact
        const contactId = await findOrCreateContact(
          phone, 
          tenantId, 
          instanceId, 
          chat.pushName || chat.name,
          chat.profilePicUrl
        );
        if (!contactId) {
          progress.processedChats++;
          onProgress?.(progress);
          continue;
        }

        // Fetch messages for this chat
        let messages: any[] = [];
        try {
          const messagesResponse = await apiService.getChatMessages(instanceName, chatId, MESSAGES_PER_CHAT);
          messages = parseMessagesResponse(messagesResponse);
        } catch (err) {
          logger.warn(`Failed to fetch messages for chat ${chatId}`, { error: err });
          result.errors.push(`Falha ao buscar mensagens do chat ${phone}`);
          // Don't continue yet, we might have lastMessage!
        }

        // If messages is empty but we have lastMessage from chat, use it!
        if (messages.length === 0 && chat.lastMessage) {
          messages = [chat.lastMessage];
        }

        if (messages.length === 0) {
          // Even with no messages, update conversation timestamp from chat metadata
          if (chat.conversationTimestamp) {
            const ts = typeof chat.conversationTimestamp === 'number'
              ? chat.conversationTimestamp * 1000
              : Number(chat.conversationTimestamp) * 1000;
            if (!isNaN(ts)) {
              await findOrCreateConversation(contactId, tenantId, instanceId, new Date(ts).toISOString());
            }
          }
          progress.processedChats++;
          onProgress?.(progress);
          continue;
        }

        // Get existing evolution_message_ids to avoid duplicates
        const existingMsgIds = new Set<string>();
        if (messages.length > 0) {
          const evolutionIds = messages
            .map((m: any) => m.key?.id)
            .filter(Boolean);

          if (evolutionIds.length > 0) {
            const { data: existingMsgs } = await supabase
              .from('messages')
              .select('evolution_message_id')
              .eq('contact_id', contactId)
              .eq('tenant_id', tenantId)
              .in('evolution_message_id', evolutionIds);

            if (existingMsgs) {
              existingMsgs.forEach((m: any) => existingMsgIds.add(m.evolution_message_id));
            }
          }
        }

        // Find the most recent message timestamp for conversation.
        // Use chat metadata timestamp as the initial value (most reliable source).
        let latestTimestamp: string | null = null;
        if (chat.conversationTimestamp) {
          const ts = typeof chat.conversationTimestamp === 'number'
            ? chat.conversationTimestamp * 1000
            : Number(chat.conversationTimestamp) * 1000;
          if (!isNaN(ts)) {
            latestTimestamp = new Date(ts).toISOString();
          }
        }

        // Insert new messages
        const newMessages: any[] = [];
        const currentBatchMsgIds = new Set<string>(); // Tracker to prevent duplicates within the same API payload
        
        for (const msg of messages) {
          const msgId = msg.key?.id;
          if (!msgId) continue;

          // Track latest timestamp from ALL messages (before dedup)
          const timestamp = msg.messageTimestamp
            ? new Date(typeof msg.messageTimestamp === 'number'
              ? msg.messageTimestamp * 1000
              : msg.messageTimestamp
            ).toISOString()
            : null;

          if (timestamp && (!latestTimestamp || timestamp > latestTimestamp)) {
            latestTimestamp = timestamp;
          }

          // Skip already-synced or duplicate messages
          if (existingMsgIds.has(msgId) || currentBatchMsgIds.has(msgId)) continue;
          currentBatchMsgIds.add(msgId);

          // Skip protocol messages
          const { content, messageType } = extractMessageContent(msg.message || msg);
          if (messageType === 'protocol' || !content) continue;

          const fromMe = msg.key?.fromMe || false;

          newMessages.push({
            contact_id: contactId,
            tenant_id: tenantId,
            whatsapp_instance_id: instanceId,
            direction: fromMe ? 'outbound' : 'inbound',
            message_type: messageType,
            content,
            evolution_message_id: msgId,
            status: fromMe ? 'sent' : 'received',
            is_from_bot: false,
            // Histórico importado: sem esta origem, quem clicou em sincronizar
            // viraria AUTOR (messages.sender_profile_id) e PARTICIPANTE de toda
            // conversa importada — os dois triggers pulam linhas com `source`.
            source: HISTORY_SYNC_SOURCE,
            created_at: timestamp || new Date().toISOString(),
          });
        }

        // Create/update conversation FIRST so the database trigger won't fail
        const conversationId = await findOrCreateConversation(contactId, tenantId, instanceId, latestTimestamp || undefined);

        // Batch insert messages
        if (newMessages.length > 0) {
          const { error: insertError } = await supabase
            .from('messages')
            .insert(newMessages);

          if (insertError) {
            logger.warn(`Failed to insert messages for chat ${phone}`, { error: insertError });
            result.errors.push(`Falha ao inserir mensagens do chat ${phone}`);
          } else {
            result.messagesInserted += newMessages.length;
            progress.totalNewMessages += newMessages.length;
            
            // Critical Fix: The database trigger sets last_message_at to the created_at of the inserted message.
            // When syncing old history, this destroys the correct timestamp. We must restore it AFTER the insert.
            if (conversationId && latestTimestamp) {
              await supabase
                .from('conversations')
                .update({ last_message_at: latestTimestamp })
                .eq('id', conversationId);
            }
          }
        }

        result.chatsProcessed++;
        progress.processedChats++;
        onProgress?.(progress);

        // Small delay to avoid overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (chatError) {
        logger.error('Error processing chat during sync', { error: chatError });
        result.errors.push('Erro ao processar chat');
        progress.processedChats++;
        onProgress?.(progress);
      }
    }

    result.success = true;
    progress.phase = 'done';
    onProgress?.(progress);

    logger.info('Chat history sync completed', {
      instanceName,
      chatsProcessed: result.chatsProcessed,
      messagesInserted: result.messagesInserted,
    });

    return result;

  } catch (err) {
    logger.error('Chat history sync failed', { error: err });
    result.errors.push('Erro geral na sincronização');
    progress.phase = 'error';
    progress.error = err instanceof Error ? err.message : 'Erro desconhecido';
    onProgress?.(progress);
    return result;
  }
}

/**
 * Sync messages for a single conversation on-demand.
 * Used when the user opens a specific chat to ensure it's up to date.
 */
export async function syncSingleChat(
  apiService: EvolutionApiService,
  instanceName: string,
  tenantId: string,
  instanceId: string,
  contactPhone: string,
  contactId: string
): Promise<{ newMessages: number; error?: string }> {
  try {
    console.log(`[syncSingleChat] Starting sync for phone: ${contactPhone} (contactId: ${contactId})`);

    // First, verify the correct JID for the number (solves Brazilian 9th digit automatically)
    let remoteJid = `${contactPhone}@s.whatsapp.net`;
    try {
      const waInfo = await apiService.getContactInfo(instanceName, contactPhone);
      console.log('[syncSingleChat] whatsappNumbers result:', waInfo);
      if (Array.isArray(waInfo) && waInfo[0]?.exists && waInfo[0]?.jid) {
        remoteJid = waInfo[0].jid;
        console.log(`[syncSingleChat] Resolved true JID: ${remoteJid}`);
      }
    } catch (err) {
      console.warn(`[syncSingleChat] Could not resolve JID for ${contactPhone}. Proceeding with fallback JID.`, err);
    }

    // Fetch messages from Evolution API
    let messages: any[] = [];
    let debugResponse: any = null;
    try {
      let response = await apiService.getChatMessages(instanceName, remoteJid, MESSAGES_PER_CHAT);
      debugResponse = response;
      messages = parseMessagesResponse(response);
      
      // Auto-fix for Brazilian numbers missing the 9th digit (if JID resolution failed or returned empty)
      if (messages.length === 0 && contactPhone.startsWith('55') && contactPhone.length === 12 && !remoteJid.includes('9')) {
        const ddd = contactPhone.substring(2, 4);
        const number = contactPhone.substring(4);
        const jidWith9 = `55${ddd}9${number}@s.whatsapp.net`;
        console.log(`[syncSingleChat] No messages found for ${remoteJid}. Fallback to 9th digit: ${jidWith9}`);
        
        response = await apiService.getChatMessages(instanceName, jidWith9, MESSAGES_PER_CHAT);
        debugResponse = response;
        messages = parseMessagesResponse(response);
      }

      console.log(`[syncSingleChat] Parsed ${messages.length} messages`);
    } catch (err) {
      console.error('[syncSingleChat] API call failed:', err);
      return { newMessages: 0, error: 'Falha ao buscar mensagens da API' };
    }

    if (messages.length === 0) {
      return { 
        newMessages: 0, 
        error: `JID: ${remoteJid}. Resposta: ${JSON.stringify(debugResponse).substring(0, 100)}` 
      };
    }

    // Get existing evolution_message_ids
    const evolutionIds = messages.map((m: any) => m.key?.id).filter(Boolean);
    const existingMsgIds = new Set<string>();

    if (evolutionIds.length > 0) {
      const { data: existingMsgs } = await supabase
        .from('messages')
        .select('evolution_message_id, contact_id')
        .eq('tenant_id', tenantId)
        .in('evolution_message_id', evolutionIds);

      if (existingMsgs) {
        const idsToUpdate: string[] = [];
        existingMsgs.forEach((m: any) => {
          existingMsgIds.add(m.evolution_message_id);
          // If the message exists but is assigned to a different contact (webhook 9th digit issue), fix it
          if (m.contact_id !== contactId) {
            idsToUpdate.push(m.evolution_message_id);
          }
        });

        // Merge messages into the correct conversation
        if (idsToUpdate.length > 0) {
          console.log(`[syncSingleChat] Merging ${idsToUpdate.length} duplicate webhook messages to correct contact`);
          await supabase
            .from('messages')
            .update({ contact_id: contactId })
            .in('evolution_message_id', idsToUpdate);
        }
      }
    }

    // Build new messages
    const newMessages: any[] = [];
    // Insert tracking for current batch
    const currentBatchMsgIds = new Set<string>();

    for (const msg of messages) {
      const msgId = msg.key?.id;
      if (!msgId || existingMsgIds.has(msgId) || currentBatchMsgIds.has(msgId)) continue;
      
      currentBatchMsgIds.add(msgId);

      const { content, messageType } = extractMessageContent(msg.message || msg);
      if (messageType === 'protocol' || !content) continue;

      const fromMe = msg.key?.fromMe || false;
      const timestamp = msg.messageTimestamp
        ? new Date(typeof msg.messageTimestamp === 'number'
          ? msg.messageTimestamp * 1000
          : msg.messageTimestamp
        ).toISOString()
        : new Date().toISOString();

      newMessages.push({
        contact_id: contactId,
        tenant_id: tenantId,
        whatsapp_instance_id: instanceId,
        direction: fromMe ? 'outbound' : 'inbound',
        message_type: messageType,
        content,
        evolution_message_id: msgId,
        status: fromMe ? 'sent' : 'received',
        is_from_bot: false,
        // Mesma origem da sincronização completa: ver HISTORY_SYNC_SOURCE.
        source: HISTORY_SYNC_SOURCE,
        created_at: timestamp,
      });
    }

    if (newMessages.length > 0) {
      // Create/update conversation FIRST so the database trigger won't fail
      const conversationId = await findOrCreateConversation(contactId, tenantId, instanceId);

      const { error } = await supabase
        .from('messages')
        .insert(newMessages);
      if (error) {
        logger.warn('Failed to insert on-demand sync messages', { error });
        return { newMessages: 0, error: 'Falha ao salvar mensagens' };
      }

      // Restore correct timestamp after trigger messed it up
      if (conversationId) {
        // Find latest timestamp among new messages
        const latestMsg = newMessages.reduce((latest, msg) => {
          return (!latest || msg.created_at > latest) ? msg.created_at : latest;
        }, null);
        
        if (latestMsg) {
          await supabase
            .from('conversations')
            .update({ last_message_at: latestMsg })
            .eq('id', conversationId);
        }
      }
    }

    if (newMessages.length === 0 && messages.length > 0) {
      return { 
        newMessages: 0, 
        error: `Achou ${messages.length} msgs na API, mas todas já existem no BD.` 
      };
    }

    return { newMessages: newMessages.length };

  } catch (err) {
    logger.error('Single chat sync failed', { error: err });
    return { newMessages: 0, error: 'Erro na sincronização' };
  }
}
