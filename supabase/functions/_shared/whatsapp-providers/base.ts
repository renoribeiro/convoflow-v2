export interface SendMessageOptions {
    mentions?: string[];
    quotedMessageId?: string;
}

export interface SendMediaOptions extends SendMessageOptions {
    caption?: string;
    mediaType: 'image' | 'video' | 'document' | 'audio';
    fileName?: string;
}

export interface IWhatsAppProvider {
    sendMessage(to: string, content: string, options?: SendMessageOptions): Promise<any>;
    /**
     * Send a media message (image, video, document, or audio).
     * Returns the raw provider response; callers extract the message id via
     * result.key?.id || result.id || result.messageId.
     */
    sendMedia(
        to: string,
        mediaUrl: string,
        options: { caption?: string; mediaType: 'image' | 'video' | 'document' | 'audio'; fileName?: string },
    ): Promise<any>;
    /**
     * Send a pre-approved WhatsApp template message (Meta Cloud API only).
     * Optional on other providers — throws "not implemented" if called on them.
     *
     * Per SKILL.md §2.12: templates bypass the 24-hour service window and are
     * the ONLY outbound option when no customer-initiated message exists in
     * the last 24h.
     *
     * @param to            E.164 phone number (with or without leading +).
     * @param templateName  Exact name of the APPROVED template on the WABA.
     * @param language      BCP-47 language code, e.g. 'pt_BR'.
     * @param bodyParams    Ordered list of strings to fill {{1}}, {{2}}, … in
     *                      the template body component. Pass [] if the template
     *                      body has no variable placeholders.
     * @param options       Reserved for future header/button params extensions.
     */
    sendTemplate?(
        to: string,
        templateName: string,
        language: string,
        bodyParams: string[],
        options?: Record<string, any>,
    ): Promise<any>;
    fetchHistory?(limit: number): Promise<any[]>;
}

export interface ProviderConfig {
    baseUrl: string;
    apiKey: string;
    instanceName: string;
    webhookUrl?: string;
    [key: string]: any;
}