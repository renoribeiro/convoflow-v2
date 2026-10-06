import { IWhatsAppProvider, ProviderConfig, SendMessageOptions } from './base.ts';

/** Map our generic mediaType to Evolution's mimetype for common formats. */
function guessMimetype(mediaType: 'image' | 'video' | 'document' | 'audio', fileName?: string): string {
    if (mediaType === 'image') return 'image/jpeg';
    if (mediaType === 'video') return 'video/mp4';
    if (mediaType === 'audio') return 'audio/mpeg';
    // document — try to infer from extension
    if (fileName) {
        const ext = fileName.split('.').pop()?.toLowerCase();
        if (ext === 'pdf') return 'application/pdf';
        if (ext === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        if (ext === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }
    return 'application/octet-stream';
}

export class EvolutionProvider implements IWhatsAppProvider {
    private config: ProviderConfig;

    constructor(config: ProviderConfig) {
        this.config = config;
    }

    async sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any> {
        const url = `${this.config.baseUrl}/message/sendText/${this.config.instanceName}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.config.apiKey,
            },
            body: JSON.stringify({
                number: to,
                text: content,
                quoted: options?.quotedMessageId ? { key: { id: options.quotedMessageId } } : undefined,
                mentions: options?.mentions
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Evolution API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Send media via Evolution API v2.
     *
     * image/video/document → POST /message/sendMedia/{INSTANCE}
     *   SKILL.md §3.2: fields: number, mediatype, mimetype, caption, media, fileName
     * audio → POST /message/sendWhatsAppAudio/{INSTANCE}
     *   SKILL.md §3.3: fields: number, audio, encoding
     */
    async sendMedia(
        to: string,
        mediaUrl: string,
        options: { caption?: string; mediaType: 'image' | 'video' | 'document' | 'audio'; fileName?: string },
    ): Promise<any> {
        const { caption, mediaType, fileName } = options;

        if (mediaType === 'audio') {
            // SKILL.md §3.3 — sendWhatsAppAudio
            const url = `${this.config.baseUrl}/message/sendWhatsAppAudio/${this.config.instanceName}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': this.config.apiKey,
                },
                body: JSON.stringify({
                    number: to,
                    audio: mediaUrl,
                    encoding: true,
                }),
            });
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Evolution API Error (${response.status}): ${errorText}`);
            }
            return await response.json();
        }

        // SKILL.md §3.2 — sendMedia (image, video, document)
        const url = `${this.config.baseUrl}/message/sendMedia/${this.config.instanceName}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.config.apiKey,
            },
            body: JSON.stringify({
                number: to,
                mediatype: mediaType,
                mimetype: guessMimetype(mediaType, fileName),
                caption: caption || '',
                media: mediaUrl,
                fileName: fileName || '',
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Evolution API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    async fetchHistory(limit: number = 50): Promise<any[]> {
        // Evolution typically allows fetching messages by chat. Fetching ALL history might require different endpoint.
        // This is a placeholder for the endpoint /chat/findMessages
        const url = `${this.config.baseUrl}/chat/findMessages/${this.config.instanceName}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': this.config.apiKey,
            },
            body: JSON.stringify({
                where: {},
                limit: limit
            })
        });

        if (!response.ok) return [];
        const data = await response.json();
        return data.messages || []; // Adjust based on actual response structure
    }
}