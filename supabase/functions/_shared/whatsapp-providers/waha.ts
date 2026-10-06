import { IWhatsAppProvider, ProviderConfig, SendMessageOptions } from './base.ts';

/**
 * Provider server-side da WAHA API.
 *
 * Endpoints e payloads validados contra `.agent/skills/waha/SKILL.md` e o
 * relatório de instalação do deploy oficial (memudecore — engine NOWEB).
 *
 * Pontos importantes:
 *  - O nome da sessão vai no BODY (`session`), nunca como path param desta
 *    família de endpoints "/api/sendXxx".
 *  - O destinatário é sempre `chatId` no formato `<numero>@c.us`.
 *  - Header de auth: `X-Api-Key: {API_KEY}`.
 */
export class WahaProvider implements IWhatsAppProvider {
    private config: ProviderConfig;
    private baseUrl: string;

    constructor(config: ProviderConfig) {
        this.config = config;
        this.baseUrl = (config.baseUrl || '').replace(/\/+$/, '');
    }

    private formatChatId(phone: string): string {
        const numericPhone = phone.replace(/\D/g, '');
        return `${numericPhone}@c.us`;
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (this.config.apiKey) {
            headers['X-Api-Key'] = this.config.apiKey;
        }
        return headers;
    }

    private async request<T = any>(
        path: string,
        init: { method?: string; body?: unknown } = {},
    ): Promise<T> {
        const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
        const response = await fetch(url, {
            method: init.method || 'POST',
            headers: this.buildHeaders(),
            body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`Waha API Error (${response.status}): ${errorText}`);
        }

        if (response.status === 204) return undefined as T;

        const text = await response.text();
        if (!text) return undefined as T;
        try {
            return JSON.parse(text) as T;
        } catch {
            return text as unknown as T;
        }
    }

    /**
     * Send media via WAHA API.
     *
     * image   → POST /api/sendImage   (SKILL.md §3.2)
     * video   → POST /api/sendVideo   (SKILL.md §3.3)
     * document→ POST /api/sendFile    (SKILL.md §3.4)
     * audio   → POST /api/sendVoice   (SKILL.md §3.5) — prefers ogg/opus PTT
     *
     * All endpoints share the same body shape:
     *   { session, chatId, file: { url, filename, mimetype }, caption? }
     */
    async sendMedia(
        to: string,
        mediaUrl: string,
        options: { caption?: string; mediaType: 'image' | 'video' | 'document' | 'audio'; fileName?: string },
    ): Promise<any> {
        const { caption, mediaType, fileName } = options;

        const endpointMap: Record<string, string> = {
            image: '/api/sendImage',
            video: '/api/sendVideo',
            document: '/api/sendFile',
            audio: '/api/sendVoice',
        };

        const mimetypeMap: Record<string, string> = {
            image: 'image/jpeg',
            video: 'video/mp4',
            document: 'application/octet-stream',
            audio: 'audio/ogg; codecs=opus',
        };

        const endpoint = endpointMap[mediaType];
        const mimetype = mimetypeMap[mediaType];
        const resolvedFileName = fileName || `media.${mediaType === 'image' ? 'jpg' : mediaType === 'video' ? 'mp4' : mediaType === 'audio' ? 'ogg' : 'bin'}`;

        const body: Record<string, unknown> = {
            session: this.config.instanceName,
            chatId: this.formatChatId(to),
            file: {
                url: mediaUrl,
                filename: resolvedFileName,
                mimetype,
            },
        };

        if (caption) body.caption = caption;

        // audio: request server-side conversion to ogg/opus (WAHA Plus feature)
        if (mediaType === 'audio') body.convert = true;

        return this.request(endpoint, { method: 'POST', body });
    }

    async sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any> {
        return this.request('/api/sendText', {
            method: 'POST',
            body: {
                session: this.config.instanceName,
                chatId: this.formatChatId(to),
                text: content,
                linkPreview: true,
                reply_to: options?.quotedMessageId ?? null,
            },
        });
    }

    async fetchHistory(limit: number = 50): Promise<any[]> {
        const session = encodeURIComponent(this.config.instanceName);
        const url = `${this.baseUrl}/api/${session}/chats?limit=${limit}&sortBy=conversationTimestamp&sortOrder=desc`;
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: this.buildHeaders(),
            });
            if (!response.ok) return [];
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch {
            return [];
        }
    }

    /**
     * Cria (ou atualiza) a sessão WAHA com o webhook do ConvoFlow configurado.
     * Idempotente: se a sessão já existe, o body é mesclado.
     */
    async ensureSession(opts: {
        webhookUrl?: string;
        hmacKey?: string;
        events?: string[];
    } = {}): Promise<any> {
        const events = opts.events ?? ['message', 'message.ack', 'session.status'];
        const webhooks = opts.webhookUrl
            ? [{
                url: opts.webhookUrl,
                events,
                ...(opts.hmacKey ? { hmac: { key: opts.hmacKey } } : {}),
                retries: { delaySeconds: 2, attempts: 5 },
            }]
            : [];

        return this.request('/api/sessions', {
            method: 'POST',
            body: {
                name: this.config.instanceName,
                start: true,
                config: { webhooks },
            },
        });
    }

    async getSessionStatus(): Promise<any> {
        const session = encodeURIComponent(this.config.instanceName);
        return this.request(`/api/sessions/${session}`, { method: 'GET' });
    }
}
