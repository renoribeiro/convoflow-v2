/**
 * Input validation and sanitization utilities
 * Provides security-focused validation functions
 */

import { z } from 'zod';

// Common validation schemas
export const ValidationSchemas = {
  // URL validation
  url: z.string().url('URL inválida').min(1, 'URL é obrigatória'),

  // API Key validation
  apiKey: z.string()
    .min(10, 'Chave API deve ter pelo menos 10 caracteres')
    .max(500, 'Chave API muito longa')
    .regex(/^[a-zA-Z0-9_\-\.]+$/, 'Chave API contém caracteres inválidos'),

  // Phone number validation
  phone: z.string()
    .regex(/^\+?[1-9]\d{1,14}$/, 'Número de telefone inválido')
    .min(8, 'Número muito curto')
    .max(15, 'Número muito longo'),

  // Email validation
  email: z.string().email('Email inválido'),

  // Password validation
  password: z.string()
    .min(8, 'Senha deve ter pelo menos 8 caracteres')
    .max(128, 'Senha muito longa')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, 'Senha deve conter ao menos uma letra minúscula, maiúscula e um número'),

  // Instance name validation
  instanceName: z.string()
    .min(3, 'Nome deve ter pelo menos 3 caracteres')
    .max(50, 'Nome muito longo')
    .regex(/^[a-zA-Z0-9_\-]+$/, 'Nome pode conter apenas letras, números, _ e -'),

  // Message content validation
  messageContent: z.string()
    .min(1, 'Mensagem não pode estar vazia')
    .max(4096, 'Mensagem muito longa'),

  // Webhook URL validation
  webhookUrl: z.string().url('URL do webhook inválida').optional(),

  // Tenant ID validation
  tenantId: z.string().uuid('ID do tenant inválido'),

  // Contact name validation
  contactName: z.string()
    .min(1, 'Nome é obrigatório')
    .max(100, 'Nome muito longo')
    .regex(/^[\p{L}\p{N}\s\-\.]+$/u, 'Nome contém caracteres inválidos'),
};

// HTML sanitization
export class HtmlSanitizer {
  private static readonly ALLOWED_TAGS = ['b', 'i', 'u', 'strong', 'em', 'br', 'p'];
  private static readonly DANGEROUS_PATTERNS = [
    /<script[^>]*>.*?<\/script>/gi,
    /<iframe[^>]*>.*?<\/iframe>/gi,
    /<object[^>]*>.*?<\/object>/gi,
    /<embed[^>]*>/gi,
    /<link[^>]*>/gi,
    /<meta[^>]*>/gi,
    /javascript:/gi,
    /vbscript:/gi,
    /data:/gi,
    /on\w+\s*=/gi, // Event handlers like onclick, onload, etc.
  ];

  static sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    let sanitized = input;

    // Remove dangerous patterns
    this.DANGEROUS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Remove all HTML tags except allowed ones
    const allowedTagsRegex = new RegExp(
      `<(?!\/?(?:${this.ALLOWED_TAGS.join('|')})\b)[^>]*>`,
      'gi'
    );
    sanitized = sanitized.replace(allowedTagsRegex, '');

    // Encode remaining special characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');

    return sanitized.trim();
  }

  static stripHtml(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/<[^>]*>/g, '') // Remove all HTML tags
      .replace(/&\w+;/g, ' ') // Remove HTML entities
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}

// SQL injection prevention
export class SqlSanitizer {
  private static readonly SQL_INJECTION_PATTERNS = [
    /('|(\-\-)|(;)|(\||\|)|(\*|\*))/gi,
    /(exec(\s|\+)+(s|x)p\w+)/gi,
    /union[\s\w]*select/gi,
    /select[\s\w]*from/gi,
    /insert[\s\w]*into/gi,
    /delete[\s\w]*from/gi,
    /update[\s\w]*set/gi,
    /drop[\s\w]*table/gi,
    /create[\s\w]*table/gi,
    /alter[\s\w]*table/gi,
  ];

  static containsSqlInjection(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    return this.SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
  }

  static sanitize(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    // Remove potential SQL injection patterns
    let sanitized = input;
    this.SQL_INJECTION_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    return sanitized.trim();
  }
}

// URL validation and sanitization
export class UrlSanitizer {
  private static readonly ALLOWED_PROTOCOLS = ['http:', 'https:'];
  private static readonly DANGEROUS_DOMAINS = [
    'javascript',
    'data',
    'vbscript',
    'file',
    'ftp'
  ];

  static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.ALLOWED_PROTOCOLS.includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  static sanitizeUrl(url: string): string | null {
    if (!url || typeof url !== 'string') {
      return null;
    }

    try {
      const parsed = new URL(url);

      // Check protocol
      if (!this.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
        return null;
      }

      // Check for dangerous domains
      if (this.DANGEROUS_DOMAINS.some(domain =>
        parsed.hostname.toLowerCase().includes(domain)
      )) {
        return null;
      }

      return parsed.toString();
    } catch {
      return null;
    }
  }
}

// Media URL validation
export class MediaValidator {
  // Allowed MIME types for different media categories
  private static readonly ALLOWED_IMAGE_TYPES = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
  ];

  private static readonly ALLOWED_VIDEO_TYPES = [
    'video/mp4',
    'video/webm',
    'video/ogg',
  ];

  private static readonly ALLOWED_AUDIO_TYPES = [
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/webm',
  ];

  private static readonly ALLOWED_DOCUMENT_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ];

  // File extension to MIME type mapping
  private static readonly EXTENSION_TO_MIME: Record<string, string[]> = {
    jpg: ['image/jpeg'],
    jpeg: ['image/jpeg'],
    png: ['image/png'],
    gif: ['image/gif'],
    webp: ['image/webp'],
    svg: ['image/svg+xml'],
    mp4: ['video/mp4'],
    webm: ['video/webm', 'audio/webm'],
    ogg: ['video/ogg', 'audio/ogg'],
    mp3: ['audio/mpeg'],
    wav: ['audio/wav'],
    pdf: ['application/pdf'],
    doc: ['application/msword'],
    docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    xls: ['application/vnd.ms-excel'],
    xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    txt: ['text/plain'],
  };

  // Maximum file sizes in bytes
  private static readonly MAX_FILE_SIZES = {
    image: 10 * 1024 * 1024,    // 10MB
    video: 100 * 1024 * 1024,   // 100MB
    audio: 50 * 1024 * 1024,    // 50MB
    document: 25 * 1024 * 1024, // 25MB
  };

  /**
   * Validate if a URL is a valid media URL
   */
  static isValidMediaUrl(url: string): { valid: boolean; error?: string } {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL não fornecida' };
    }

    // Check URL format
    if (!UrlSanitizer.isValidUrl(url)) {
      return { valid: false, error: 'URL inválida' };
    }

    // Check for dangerous URL schemes
    if (!UrlSanitizer.sanitizeUrl(url)) {
      return { valid: false, error: 'URL potencialmente perigosa' };
    }

    return { valid: true };
  }

  /**
   * Validate file extension from URL or filename
   */
  static getFileExtension(urlOrFilename: string): string | null {
    try {
      const url = new URL(urlOrFilename);
      const pathname = url.pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]+)$/);
      return match ? match[1].toLowerCase() : null;
    } catch {
      // Not a URL, try as filename
      const match = urlOrFilename.match(/\.([a-zA-Z0-9]+)$/);
      return match ? match[1].toLowerCase() : null;
    }
  }

  /**
   * Check if file extension is allowed
   */
  static isAllowedExtension(extension: string, type?: 'image' | 'video' | 'audio' | 'document'): boolean {
    const ext = extension.toLowerCase();
    const mimes = this.EXTENSION_TO_MIME[ext];

    if (!mimes) return false;

    if (!type) return true;

    const allowedMimes = {
      image: this.ALLOWED_IMAGE_TYPES,
      video: this.ALLOWED_VIDEO_TYPES,
      audio: this.ALLOWED_AUDIO_TYPES,
      document: this.ALLOWED_DOCUMENT_TYPES,
    }[type];

    return mimes.some(mime => allowedMimes.includes(mime));
  }

  /**
   * Get media type from file extension
   */
  static getMediaType(extension: string): 'image' | 'video' | 'audio' | 'document' | null {
    const ext = extension.toLowerCase();
    const mimes = this.EXTENSION_TO_MIME[ext];

    if (!mimes) return null;

    const mime = mimes[0];
    if (this.ALLOWED_IMAGE_TYPES.includes(mime)) return 'image';
    if (this.ALLOWED_VIDEO_TYPES.includes(mime)) return 'video';
    if (this.ALLOWED_AUDIO_TYPES.includes(mime)) return 'audio';
    if (this.ALLOWED_DOCUMENT_TYPES.includes(mime)) return 'document';

    return null;
  }

  /**
   * Check if file size is within limits
   */
  static isFileSizeAllowed(sizeInBytes: number, type: 'image' | 'video' | 'audio' | 'document'): boolean {
    return sizeInBytes <= this.MAX_FILE_SIZES[type];
  }

  /**
   * Get maximum file size for a media type
   */
  static getMaxFileSize(type: 'image' | 'video' | 'audio' | 'document'): number {
    return this.MAX_FILE_SIZES[type];
  }

  /**
   * Validate a complete media input
   */
  static validateMedia(
    url: string,
    options?: {
      type?: 'image' | 'video' | 'audio' | 'document';
      maxSize?: number;
    }
  ): { valid: boolean; error?: string; mediaType?: string; extension?: string } {
    // Validate URL
    const urlValidation = this.isValidMediaUrl(url);
    if (!urlValidation.valid) {
      return urlValidation;
    }

    // Get and validate extension
    const extension = this.getFileExtension(url);
    if (!extension) {
      return { valid: false, error: 'Não foi possível determinar o tipo de arquivo' };
    }

    // Check if extension is allowed
    if (!this.isAllowedExtension(extension, options?.type)) {
      return {
        valid: false,
        error: `Tipo de arquivo não permitido: .${extension}`
      };
    }

    // Get media type
    const mediaType = this.getMediaType(extension);
    if (!mediaType) {
      return { valid: false, error: 'Tipo de mídia não reconhecido' };
    }

    return {
      valid: true,
      mediaType,
      extension
    };
  }
}

// General input sanitizer
export class InputSanitizer {
  static sanitizeString(input: string, maxLength: number = 1000): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .slice(0, maxLength)
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
      .trim();
  }

  static sanitizePhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    return phone
      .replace(/[^\d+\-\s()]/g, '') // Keep only digits, +, -, spaces, parentheses
      .trim();
  }

  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      return '';
    }

    return email
      .toLowerCase()
      // Remove tags HTML inteiras primeiro: sem isso, '<script>' vira 'script'
      // e acaba grudado no local part (test<script>@x.example -> testscript@x.example).
      .replace(/<[^>]*>/g, '')
      .replace(/[^a-z0-9@._\-]/g, '') // Keep only valid email characters
      .trim();
  }
}

// Validation result type
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Generic validation function
export function validateInput<T>(
  schema: z.ZodSchema<T>,
  input: unknown
): ValidationResult<T> {
  try {
    const data = schema.parse(input);
    return { success: true, data };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: error.errors.map(e => e.message).join(', ')
      };
    }
    return {
      success: false,
      error: 'Erro de validação desconhecido'
    };
  }
}