/**
 * Tests for validation utilities
 */

import { describe, it, expect } from 'vitest';
import {
    ValidationSchemas,
    HtmlSanitizer,
    SqlSanitizer,
    UrlSanitizer,
    MediaValidator,
    InputSanitizer,
    validateInput,
} from '@/lib/validation';

describe('ValidationSchemas', () => {
    describe('url', () => {
        it('should validate valid URLs', () => {
            const result = validateInput(ValidationSchemas.url, 'https://example.com');
            expect(result.success).toBe(true);
        });

        it('should reject invalid URLs', () => {
            const result = validateInput(ValidationSchemas.url, 'not-a-url');
            expect(result.success).toBe(false);
        });

        it('should reject empty URLs', () => {
            const result = validateInput(ValidationSchemas.url, '');
            expect(result.success).toBe(false);
        });
    });

    describe('phone', () => {
        it('should validate valid phone numbers', () => {
            const result = validateInput(ValidationSchemas.phone, '+5511999999999');
            expect(result.success).toBe(true);
        });

        it('should reject invalid phone numbers', () => {
            const result = validateInput(ValidationSchemas.phone, 'abc123');
            expect(result.success).toBe(false);
        });

        it('should reject too short phone numbers', () => {
            const result = validateInput(ValidationSchemas.phone, '123');
            expect(result.success).toBe(false);
        });
    });

    describe('email', () => {
        it('should validate valid emails', () => {
            const result = validateInput(ValidationSchemas.email, 'test@example.com');
            expect(result.success).toBe(true);
        });

        it('should reject invalid emails', () => {
            const result = validateInput(ValidationSchemas.email, 'not-an-email');
            expect(result.success).toBe(false);
        });
    });

    describe('instanceName', () => {
        it('should validate valid instance names', () => {
            const result = validateInput(ValidationSchemas.instanceName, 'my-instance_01');
            expect(result.success).toBe(true);
        });

        it('should reject names with special characters', () => {
            const result = validateInput(ValidationSchemas.instanceName, 'my@instance!');
            expect(result.success).toBe(false);
        });

        it('should reject too short names', () => {
            const result = validateInput(ValidationSchemas.instanceName, 'ab');
            expect(result.success).toBe(false);
        });
    });
});

describe('HtmlSanitizer', () => {
    it('should remove script tags', () => {
        const input = '<script>alert("xss")</script>Hello';
        const result = HtmlSanitizer.sanitize(input);
        expect(result).not.toContain('<script>');
        expect(result).not.toContain('alert');
    });

    it('should remove event handlers', () => {
        const input = '<div onclick="alert()">Test</div>';
        const result = HtmlSanitizer.sanitize(input);
        expect(result).not.toContain('onclick');
    });

    it('should remove javascript: URLs', () => {
        const input = '<a href="javascript:alert()">Click</a>';
        const result = HtmlSanitizer.sanitize(input);
        expect(result).not.toContain('javascript:');
    });

    it('should handle empty input', () => {
        expect(HtmlSanitizer.sanitize('')).toBe('');
        expect(HtmlSanitizer.sanitize(null as any)).toBe('');
    });

    describe('stripHtml', () => {
        it('should remove all HTML tags', () => {
            const input = '<p>Hello <strong>World</strong>!</p>';
            const result = HtmlSanitizer.stripHtml(input);
            expect(result).toBe('Hello World!');
        });
    });
});

describe('SqlSanitizer', () => {
    it('should detect SQL injection attempts', () => {
        expect(SqlSanitizer.containsSqlInjection("'; DROP TABLE users; --")).toBe(true);
        expect(SqlSanitizer.containsSqlInjection('SELECT * FROM users')).toBe(true);
        expect(SqlSanitizer.containsSqlInjection('UNION SELECT password FROM users')).toBe(true);
    });

    it('should not flag normal input', () => {
        expect(SqlSanitizer.containsSqlInjection('Hello World')).toBe(false);
        expect(SqlSanitizer.containsSqlInjection('user@example.com')).toBe(false);
    });

    it('should sanitize SQL injection patterns', () => {
        const input = "name'; DROP TABLE users; --";
        const result = SqlSanitizer.sanitize(input);
        expect(result).not.toContain('DROP TABLE');
    });
});

describe('UrlSanitizer', () => {
    describe('isValidUrl', () => {
        it('should accept https URLs', () => {
            expect(UrlSanitizer.isValidUrl('https://example.com')).toBe(true);
        });

        it('should accept http URLs', () => {
            expect(UrlSanitizer.isValidUrl('http://example.com')).toBe(true);
        });

        it('should reject javascript URLs', () => {
            expect(UrlSanitizer.isValidUrl('javascript:alert()')).toBe(false);
        });

        it('should reject data URLs', () => {
            expect(UrlSanitizer.isValidUrl('data:text/html,<script>')).toBe(false);
        });

        it('should reject invalid URLs', () => {
            expect(UrlSanitizer.isValidUrl('not-a-url')).toBe(false);
        });
    });

    describe('sanitizeUrl', () => {
        it('should return valid URLs unchanged', () => {
            const url = 'https://example.com/path?query=1';
            expect(UrlSanitizer.sanitizeUrl(url)).toBe(url);
        });

        it('should return null for invalid protocols', () => {
            expect(UrlSanitizer.sanitizeUrl('ftp://example.com')).toBe(null);
        });

        it('should handle null input', () => {
            expect(UrlSanitizer.sanitizeUrl(null as any)).toBe(null);
        });
    });
});

describe('MediaValidator', () => {
    describe('isValidMediaUrl', () => {
        it('should accept valid media URLs', () => {
            const result = MediaValidator.isValidMediaUrl('https://example.com/image.jpg');
            expect(result.valid).toBe(true);
        });

        it('should reject invalid URLs', () => {
            const result = MediaValidator.isValidMediaUrl('not-a-url');
            expect(result.valid).toBe(false);
        });
    });

    describe('getFileExtension', () => {
        it('should extract extension from URL', () => {
            expect(MediaValidator.getFileExtension('https://example.com/image.jpg')).toBe('jpg');
            expect(MediaValidator.getFileExtension('https://example.com/doc.PDF')).toBe('pdf');
        });

        it('should extract extension from filename', () => {
            expect(MediaValidator.getFileExtension('document.docx')).toBe('docx');
        });

        it('should return null for missing extension', () => {
            expect(MediaValidator.getFileExtension('https://example.com/noext')).toBe(null);
        });
    });

    describe('isAllowedExtension', () => {
        it('should allow valid image extensions', () => {
            expect(MediaValidator.isAllowedExtension('jpg', 'image')).toBe(true);
            expect(MediaValidator.isAllowedExtension('png', 'image')).toBe(true);
            expect(MediaValidator.isAllowedExtension('webp', 'image')).toBe(true);
        });

        it('should reject invalid extensions for type', () => {
            expect(MediaValidator.isAllowedExtension('jpg', 'document')).toBe(false);
            expect(MediaValidator.isAllowedExtension('pdf', 'image')).toBe(false);
        });

        it('should allow valid document extensions', () => {
            expect(MediaValidator.isAllowedExtension('pdf', 'document')).toBe(true);
            expect(MediaValidator.isAllowedExtension('docx', 'document')).toBe(true);
        });
    });

    describe('getMediaType', () => {
        it('should identify image types', () => {
            expect(MediaValidator.getMediaType('jpg')).toBe('image');
            expect(MediaValidator.getMediaType('png')).toBe('image');
        });

        it('should identify video types', () => {
            expect(MediaValidator.getMediaType('mp4')).toBe('video');
        });

        it('should identify audio types', () => {
            expect(MediaValidator.getMediaType('mp3')).toBe('audio');
        });

        it('should identify document types', () => {
            expect(MediaValidator.getMediaType('pdf')).toBe('document');
        });

        it('should return null for unknown types', () => {
            expect(MediaValidator.getMediaType('xyz')).toBe(null);
        });
    });

    describe('validateMedia', () => {
        it('should validate complete media URL', () => {
            const result = MediaValidator.validateMedia('https://example.com/photo.jpg');
            expect(result.valid).toBe(true);
            expect(result.mediaType).toBe('image');
            expect(result.extension).toBe('jpg');
        });

        it('should reject non-allowed file types', () => {
            const result = MediaValidator.validateMedia('https://example.com/file.exe');
            expect(result.valid).toBe(false);
        });

        it('should validate with type constraint', () => {
            const result = MediaValidator.validateMedia('https://example.com/doc.pdf', { type: 'document' });
            expect(result.valid).toBe(true);

            const result2 = MediaValidator.validateMedia('https://example.com/doc.pdf', { type: 'image' });
            expect(result2.valid).toBe(false);
        });
    });
});

describe('InputSanitizer', () => {
    describe('sanitizeString', () => {
        it('should trim whitespace', () => {
            expect(InputSanitizer.sanitizeString('  hello  ')).toBe('hello');
        });

        it('should remove control characters', () => {
            expect(InputSanitizer.sanitizeString('hello\x00world')).toBe('helloworld');
        });

        it('should truncate long strings', () => {
            const long = 'a'.repeat(2000);
            expect(InputSanitizer.sanitizeString(long, 100).length).toBe(100);
        });

        it('should handle empty input', () => {
            expect(InputSanitizer.sanitizeString('')).toBe('');
            expect(InputSanitizer.sanitizeString(null as any)).toBe('');
        });
    });

    describe('sanitizePhoneNumber', () => {
        it('should keep valid phone characters', () => {
            expect(InputSanitizer.sanitizePhoneNumber('+1 (555) 123-4567')).toBe('+1 (555) 123-4567');
        });

        it('should remove invalid characters', () => {
            expect(InputSanitizer.sanitizePhoneNumber('+1abc555')).toBe('+1555');
        });
    });

    describe('sanitizeEmail', () => {
        it('should lowercase emails', () => {
            expect(InputSanitizer.sanitizeEmail('Test@Example.COM')).toBe('test@example.com');
        });

        it('should remove invalid characters', () => {
            expect(InputSanitizer.sanitizeEmail('test<script>@example.com')).toBe('test@example.com');
        });
    });
});
