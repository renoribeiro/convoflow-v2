
// Evolution API V2 - Complete Type Definitions

// ============================================
// Instance Types
// ============================================

export interface EvolutionInstance {
  instanceName: string;
  status: 'open' | 'close' | 'connecting' | 'qrcode';
  serverUrl: string;
  apiKey: string;
  qrcode?: string;
  webhookUrl?: string;
  profilePicUrl?: string;
  profileName?: string;
  settings: {
    rejectCall: boolean;
    msgCall: string;
    groupsIgnore: boolean;
    alwaysOnline: boolean;
    readMessages: boolean;
    readStatus: boolean;
  };
  createdAt: Date;
  lastActivity?: Date;
}

// Detailed instance information from Evolution API v2
export interface DetailedEvolutionInstance {
  instance: {
    instanceName: string;
    instanceId: string;
    owner?: string;
    profileName?: string;
    profilePictureUrl?: string;
    profileStatus?: string;
    status: 'open' | 'close' | 'connecting' | 'qrcode';
    serverUrl: string;
    apikey: string;
    integration?: {
      integration?: string;
      token?: string;
      webhook_wa_business?: string;
    };
  };
}

// ============================================
// Webhook V2 Types
// ============================================

/** All webhook event types supported by Evolution API V2 */
export type WebhookEventType =
  | 'application.startup'
  | 'qrcode.updated'
  | 'connection.update'
  | 'messages.set'
  | 'messages.upsert'
  | 'messages.update'
  | 'messages.delete'
  | 'send.message'
  | 'contacts.set'
  | 'contacts.upsert'
  | 'contacts.update'
  | 'presence.update'
  | 'chats.set'
  | 'chats.upsert'
  | 'chats.update'
  | 'chats.delete'
  | 'groups.upsert'
  | 'groups.update'
  | 'group.participants.update'
  | 'call'
  | 'typebot'
  | 'labels.edit'
  | 'labels.association';

/** Webhook event names used in API configuration (UPPER_CASE) */
export type WebhookConfigEvent =
  | 'APPLICATION_STARTUP'
  | 'QRCODE_UPDATED'
  | 'CONNECTION_UPDATE'
  | 'MESSAGES_SET'
  | 'MESSAGES_UPSERT'
  | 'MESSAGES_UPDATE'
  | 'MESSAGES_DELETE'
  | 'SEND_MESSAGE'
  | 'CONTACTS_SET'
  | 'CONTACTS_UPSERT'
  | 'CONTACTS_UPDATE'
  | 'PRESENCE_UPDATE'
  | 'CHATS_SET'
  | 'CHATS_UPSERT'
  | 'CHATS_UPDATE'
  | 'CHATS_DELETE'
  | 'GROUPS_UPSERT'
  | 'GROUPS_UPDATE'
  | 'GROUP_PARTICIPANTS_UPDATE'
  | 'CALL'
  | 'TYPEBOT'
  | 'LABELS_EDIT'
  | 'LABELS_ASSOCIATION';

/** Root webhook payload from Evolution API V2 */
export interface WebhookEvent {
  event: WebhookEventType | string;
  instance: string;
  data: any;
  server_url: string;
  apikey: string;
  destination?: string;
  date_time?: string;
  sender?: string;
}

// ============================================
// Message Types
// ============================================

export interface MessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
}

export interface IncomingMessage {
  key: MessageKey;
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
      contextInfo?: any;
    };
    imageMessage?: {
      caption?: string;
      mimetype: string;
      url?: string;
      mediaUrl?: string;
    };
    videoMessage?: {
      caption?: string;
      mimetype: string;
      url?: string;
      mediaUrl?: string;
    };
    audioMessage?: {
      mimetype: string;
      url?: string;
      ptt?: boolean;
    };
    documentMessage?: {
      title?: string;
      fileName?: string;
      mimetype: string;
      url?: string;
    };
    locationMessage?: {
      degreesLatitude: number;
      degreesLongitude: number;
      name?: string;
      address?: string;
    };
    contactMessage?: {
      displayName: string;
      vcard: string;
    };
    reactionMessage?: {
      key: MessageKey;
      text: string;
    };
    stickerMessage?: {
      mimetype: string;
      url?: string;
    };
    buttonsResponseMessage?: {
      selectedButtonId: string;
      selectedDisplayText: string;
    };
    listResponseMessage?: {
      title: string;
      listType: number;
      singleSelectReply: {
        selectedRowId: string;
      };
    };
    protocolMessage?: any;
  };
  messageTimestamp: number;
  pushName?: string;
  status?: 'ERROR' | 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'PLAYED';
  messageType?: string;
}

// ============================================
// Send Message Payloads (V2 format)
// ============================================

export interface SendTextPayload {
  number: string;
  text: string;
  delay?: number;
  quoted?: any;
  mentions?: any;
  linkPreview?: boolean;
}

export interface SendImagePayload {
  number: string;
  mediatype: 'image';
  media: string;
  caption?: string;
  delay?: number;
  quoted?: any;
  mentions?: any;
}

export interface SendVideoPayload {
  number: string;
  mediatype: 'video';
  media: string;
  caption?: string;
  delay?: number;
  quoted?: any;
}

export interface SendAudioPayload {
  number: string;
  audio: string;
  delay?: number;
}

export interface SendDocumentPayload {
  number: string;
  mediatype: 'document';
  media: string;
  fileName: string;
  caption?: string;
  delay?: number;
}

export interface SendStickerPayload {
  number: string;
  sticker: string;
  delay?: number;
}

export interface SendLocationPayload {
  number: string;
  name?: string;
  address?: string;
  latitude: number;
  longitude: number;
  delay?: number;
}

export interface SendContactPayload {
  number: string;
  contact: Array<{
    fullName: string;
    wuid: string;
    phoneNumber: string;
  }>;
  delay?: number;
}

export interface SendReactionPayload {
  key: MessageKey;
  reaction: string;
}

export interface SendPollPayload {
  number: string;
  name: string;
  selectableCount: number;
  values: string[];
  delay?: number;
}

export interface SendButtonsPayload {
  number: string;
  title: string;
  description: string;
  footer?: string;
  buttons: Array<{
    type: string;
    reply: {
      title: string;
      id: string;
    };
  }>;
  delay?: number;
}

export interface SendListPayload {
  number: string;
  title: string;
  description: string;
  buttonText: string;
  footerText?: string;
  sections: Array<{
    title: string;
    rows: Array<{
      title: string;
      description?: string;
      rowId: string;
    }>;
  }>;
  delay?: number;
}

// ============================================
// Webhook Configuration (V2 format)
// ============================================

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  byEvents?: boolean;
  base64?: boolean;
  events: WebhookConfigEvent[];
}

// ============================================
// Template & Config Types
// ============================================

export interface MessageTemplate {
  id: string;
  name: string;
  content: string;
  variables: string[];
  category: 'greeting' | 'response' | 'fallback' | 'transfer';
  isActive: boolean;
}

export interface EvolutionConfig {
  serverUrl: string;
  apiKey: string;
  instances: EvolutionInstance[];
  webhookSettings: WebhookConfig;
  messageTemplates: MessageTemplate[];
}

// ============================================
// Contact & Chat Types (V2)
// ============================================

export interface ContactData {
  id: string;
  name?: string;
  pushName?: string;
  profilePictureUrl?: string;
  isBusiness?: boolean;
  isEnterprise?: boolean;
}

export interface ChatData {
  id: string;
  name?: string;
  unreadCount?: number;
  conversationTimestamp?: number;
  archived?: boolean;
  pinned?: boolean;
  muteEndTime?: number;
}

export interface GroupData {
  id: string;
  subject?: string;
  subjectOwner?: string;
  subjectTime?: number;
  creation?: number;
  owner?: string;
  desc?: string;
  descOwner?: string;
  descId?: string;
  restrict?: boolean;
  announce?: boolean;
  participants: Array<{
    id: string;
    admin?: 'admin' | 'superadmin' | null;
  }>;
}

export interface PresenceData {
  id: string;
  presences: {
    [key: string]: {
      lastKnownPresence: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused';
      lastSeen?: number;
    };
  };
}

// ============================================
// Find Contacts/Chats/Messages (V2 POST body)
// ============================================

export interface FindContactsBody {
  where?: {
    id?: string;
    pushName?: string;
  };
}

export interface FindChatsBody {
  where?: {
    id?: string;
  };
}

export interface FindMessagesBody {
  where: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
      id?: string;
    };
  };
  limit?: number;
}
