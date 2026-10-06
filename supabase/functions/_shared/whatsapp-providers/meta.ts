import { IWhatsAppProvider, ProviderConfig, SendMessageOptions } from './base.ts';

export interface MetaProviderConfig extends ProviderConfig {
    phoneNumberId: string;
    wabaId?: string;
    accessToken: string;
    graphApiVersion?: string;
}

export class MetaProvider implements IWhatsAppProvider {
    private config: MetaProviderConfig;
    private graphRoot: string;

    constructor(config: MetaProviderConfig) {
        this.config = config;
        const version = config.graphApiVersion || 'v20.0';
        this.graphRoot = `https://graph.facebook.com/${version}`;
    }

    private formatTo(phone: string): string {
        return phone.replace(/\D/g, '');
    }

    async sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any> {
        const url = `${this.graphRoot}/${this.config.phoneNumberId}/messages`;

        const body: Record<string, any> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatTo(to),
            type: 'text',
            text: { body: content, preview_url: false },
        };

        if (options?.quotedMessageId) {
            body.context = { message_id: options.quotedMessageId };
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Send media via Meta Cloud API.
     * The media must be accessible via a public URL or pre-uploaded to Meta's
     * media endpoint. We use the link-by-URL approach (supported since Graph v13).
     *
     * TODO: Meta Cloud API media-send is not yet validated against
     * .agent/skills/meta-cloud-api/SKILL.md — add full validation when that
     * SKILL file is available. Current implementation follows the documented
     * Graph API pattern for sending media messages by URL link.
     */
    async sendMedia(
        to: string,
        mediaUrl: string,
        options: { caption?: string; mediaType: 'image' | 'video' | 'document' | 'audio'; fileName?: string },
    ): Promise<any> {
        const { caption, mediaType, fileName } = options;
        const url = `${this.graphRoot}/${this.config.phoneNumberId}/messages`;

        const mediaObj: Record<string, string> = { link: mediaUrl };
        if (caption) mediaObj.caption = caption;
        if (fileName && (mediaType === 'document' || mediaType === 'audio')) {
            mediaObj.filename = fileName;
        }

        const body: Record<string, any> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatTo(to),
            type: mediaType,
            [mediaType]: mediaObj,
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Send a pre-approved template message via Meta Cloud API.
     *
     * Reference: SKILL.md §2.12 — templates bypass the 24-hour service window
     * and must be used when no customer-initiated message was received in the
     * last 24h. Templates must be APPROVED on the WABA before calling this.
     *
     * Only the body component is populated here via bodyParams. If your template
     * has header/button components with variables, extend this method or pass
     * pre-built components via options.components.
     */
    async sendTemplate(
        to: string,
        templateName: string,
        language: string,
        bodyParams: string[],
        _options?: Record<string, any>,
    ): Promise<any> {
        const url = `${this.graphRoot}/${this.config.phoneNumberId}/messages`;

        // Build the body component array only when there are actual parameters
        // to fill in. An empty components array is valid per Graph API spec.
        const components: Record<string, any>[] = bodyParams.length > 0
            ? [
                {
                    type: 'body',
                    parameters: bodyParams.map((t) => ({ type: 'text', text: t })),
                },
            ]
            : [];

        const body: Record<string, any> = {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: this.formatTo(to),
            type: 'template',
            template: {
                name: templateName,
                language: { code: language },
                components,
            },
        };

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        return await response.json();
    }

    /**
     * Meta Cloud API does not expose a public endpoint to fetch historical
     * conversations — incoming messages must be received via webhook events.
     * Returning an empty array keeps the IWhatsAppProvider contract.
     */
    async fetchHistory(_limit: number = 50): Promise<any[]> {
        return [];
    }

    /**
     * List message templates for the WABA.
     *
     * Reference: SKILL.md §7.1 — GET /{WABA_ID}/message_templates with fields
     * name,status,category,language,components. Requires wabaId in the config.
     * Returns the raw template objects (including status APPROVED/PENDING/etc.).
     */
    async listTemplates(): Promise<any[]> {
        if (!this.config.wabaId) {
            throw new Error('Missing wabaId: não é possível listar templates da Meta.');
        }
        // `components` já traz cabeçalho, rodapé e botões — a edge function
        // list-whatsapp-templates os normaliza a partir daqui, sem custo extra.
        //
        // NÃO acrescente `quality_score` nem `rejected_reason` a este `fields=`.
        // Já foi avaliado e recusado de propósito:
        //   - `quality_score` só é preenchido depois que o template acumula
        //     volume de envio. Template novo volta vazio, e a UI mostraria uma
        //     coluna em branco que parece bug.
        //   - `rejected_reason` é um balde genérico (ABUSIVE_CONTENT,
        //     INVALID_FORMAT, NONE). A explicação de verdade da recusa só existe
        //     no WhatsApp Manager — prometer o motivo aqui frustra quem clica.
        // Se um dia forem mesmo necessários, valide antes contra a resposta viva
        // da Graph API em vez de confiar na doc.
        const url =
            `${this.graphRoot}/${this.config.wabaId}/message_templates` +
            `?fields=name,status,category,language,components&limit=200`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return Array.isArray(data?.data) ? data.data : [];
    }

    /**
     * Resolve an inbound media_id to a short-lived signed download URL.
     *
     * Reference: SKILL.md §4.1 — GET /{MEDIA_ID} with a Bearer token returns
     * { url, mime_type, file_size, sha256 }. The `url` is signed and only valid
     * for ~5 minutes, so the caller must download it immediately (§4.2).
     */
    async getMediaUrl(mediaId: string): Promise<{ url: string; mimeType: string; fileSize?: number }> {
        const url = `${this.graphRoot}/${mediaId}`;

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        const data = await response.json();
        return {
            url: data.url,
            mimeType: data.mime_type,
            fileSize: typeof data.file_size === 'number' ? data.file_size : undefined,
        };
    }

    /**
     * Download the raw bytes of a media file from the signed URL returned by
     * getMediaUrl().
     *
     * Reference: SKILL.md §4.2 — the Bearer token is REQUIRED on this request
     * too; without it Meta rejects with 401. The caller should persist the bytes
     * (e.g. to Supabase Storage) since the signed URL expires.
     */
    async downloadMedia(signedUrl: string): Promise<{ bytes: Uint8Array; contentType: string }> {
        const response = await fetch(signedUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${this.config.accessToken}`,
            },
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Meta Cloud API Error (${response.status}): ${errorText}`);
        }

        const bytes = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        return { bytes, contentType };
    }
}
