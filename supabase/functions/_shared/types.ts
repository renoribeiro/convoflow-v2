// Evolution API V2 - Shared Types for Edge Functions

export interface WebhookEvent {
  event: 'messages.upsert' | 'messages.update' | 'messages.delete' | 'connection.update' |
  'qrcode.updated' | 'send.message' | 'contacts.upsert' | 'contacts.update' |
  'contacts.set' | 'chats.upsert' | 'chats.update' | 'chats.delete' | 'chats.set' |
  'groups.upsert' | 'groups.update' | 'group.participants.update' |
  'presence.update' | 'call' | 'application.startup' | string;
  instance: string;
  data: any;
  server_url: string;
  /** Token da instância; `null` quando o servidor tem AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false. */
  apikey: string | null;
  destination?: string;
  date_time?: string;
  sender?: string;
}

export interface MessageKey {
  remoteJid: string;
  fromMe: boolean;
  id: string;
  participant?: string;
}

export interface ExtendedTextMessage {
  text: string;
  contextInfo?: any;
}

export interface MessageContent {
  conversation?: string;
  extendedTextMessage?: ExtendedTextMessage;
  imageMessage?: {
    caption?: string;
    mimetype?: string;
    url?: string;
    mediaUrl?: string;
  };
  videoMessage?: {
    caption?: string;
    mimetype?: string;
    url?: string;
    mediaUrl?: string;
  };
  audioMessage?: {
    mimetype?: string;
    url?: string;
    ptt?: boolean;
  };
  documentMessage?: {
    title?: string;
    fileName?: string;
    mimetype?: string;
    url?: string;
  };
  locationMessage?: {
    degreesLatitude?: number;
    degreesLongitude?: number;
    name?: string;
    address?: string;
  };
  contactMessage?: {
    displayName?: string;
    vcard?: string;
  };
  reactionMessage?: {
    key?: MessageKey;
    text?: string;
  };
  stickerMessage?: {
    mimetype?: string;
    url?: string;
  };
  protocolMessage?: any;
  buttonsResponseMessage?: any;
  listResponseMessage?: any;
  messageType?: string;
}

export interface MessageData {
  key: MessageKey;
  pushName?: string;
  message: MessageContent;
  messageTimestamp: number;
  status?: string;
  messageType?: string;
}

export interface ConnectionUpdateData {
  state: 'open' | 'close' | 'connecting';
  qr?: string;
  statusReason?: number;
}

export interface QrCodeUpdateData {
  qrcode?: {
    code?: string;
    base64?: string;
  };
  qr?: string;
}

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
  participants?: Array<{
    id: string;
    admin?: 'admin' | 'superadmin' | null;
  }>;
}

export interface PresenceData {
  id: string;
  presences?: {
    [key: string]: {
      lastKnownPresence: string;
      lastSeen?: number;
    };
  };
}

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: MessageData | ConnectionUpdateData | QrCodeUpdateData | ContactData | ChatData | GroupData | PresenceData | any;
  server_url: string;
  /** Token da instância; `null` quando o servidor tem AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=false. */
  apikey: string | null;
  destination?: string;
  date_time?: string;
  sender?: string;
}

export interface SupabaseResponse<T = any> {
  data: T | null;
  error: any | null;
}
