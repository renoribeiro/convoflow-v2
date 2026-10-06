/**
 * Environment variables utility
 * Provides type-safe access to environment variables
 */

interface EnvConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  EVOLUTION_API_URL?: string;
  EVOLUTION_API_KEY?: string;
  EVOLUTION_WEBHOOK_SECRET?: string;
  EVOLUTION_X_API_KEY?: string;
  FACEBOOK_APP_ID?: string;
  META_CONFIG_ID?: string;
  REWARDFUL_API_KEY?: string;
  /** Chave pública (site key) do Cloudflare Turnstile do cadastro pelo site. */
  TURNSTILE_SITE_KEY?: string;
  APP_NAME: string;
  APP_VERSION: string;
  ENVIRONMENT: 'development' | 'staging' | 'production';
  ENABLE_DEBUG_LOGS: boolean;
  ENABLE_CONSOLE_LOGS: boolean;
  TRACKING_DOMAIN: string;
  STRIPE_PAYMENT_LINK: string;
}

export class EnvironmentManager {
  private static instance: EnvironmentManager;
  private config: EnvConfig;

  private constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  static getInstance(): EnvironmentManager {
    if (!EnvironmentManager.instance) {
      EnvironmentManager.instance = new EnvironmentManager();
    }
    return EnvironmentManager.instance;
  }

  private loadConfig(): EnvConfig {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    // Validate required environment variables at startup
    if (!supabaseUrl) {
      throw new Error(
        'VITE_SUPABASE_URL is required. Please add it to your .env file.'
      );
    }
    if (!supabaseAnonKey) {
      throw new Error(
        'VITE_SUPABASE_ANON_KEY is required. Please add it to your .env file.'
      );
    }

    return {
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseAnonKey,
      EVOLUTION_API_URL: import.meta.env.VITE_EVOLUTION_API_URL,
      EVOLUTION_API_KEY: import.meta.env.VITE_EVOLUTION_API_KEY,
      EVOLUTION_WEBHOOK_SECRET: import.meta.env.VITE_EVOLUTION_WEBHOOK_SECRET,
      EVOLUTION_X_API_KEY: import.meta.env.VITE_EVOLUTION_X_API_KEY,
      FACEBOOK_APP_ID: import.meta.env.VITE_FACEBOOK_APP_ID,
      META_CONFIG_ID: import.meta.env.VITE_META_CONFIG_ID,
      REWARDFUL_API_KEY: import.meta.env.VITE_REWARDFUL_API_KEY,
      TURNSTILE_SITE_KEY: import.meta.env.VITE_TURNSTILE_SITE_KEY,
      APP_NAME: import.meta.env.VITE_APP_NAME || 'ConvoFlow',
      APP_VERSION: import.meta.env.VITE_APP_VERSION || '1.0.0',
      ENVIRONMENT: (import.meta.env.VITE_ENVIRONMENT as EnvConfig['ENVIRONMENT']) || 'development',
      ENABLE_DEBUG_LOGS: import.meta.env.VITE_ENABLE_DEBUG_LOGS === 'true',
      ENABLE_CONSOLE_LOGS: import.meta.env.VITE_ENABLE_CONSOLE_LOGS === 'true' || import.meta.env.DEV,
      TRACKING_DOMAIN: import.meta.env.VITE_TRACKING_DOMAIN || 'track.convoflow.com',
      STRIPE_PAYMENT_LINK: import.meta.env.VITE_STRIPE_PAYMENT_LINK || '',
    };
  }

  private validateConfig(): void {
    const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY'] as const;
    
    for (const key of required) {
      if (!this.config[key]) {
        throw new Error(`Missing required environment variable: VITE_${key}`);
      }
    }

    // Validate URL format
    try {
      new URL(this.config.SUPABASE_URL);
    } catch {
      throw new Error('Invalid SUPABASE_URL format');
    }

    if (this.config.EVOLUTION_API_URL) {
      try {
        new URL(this.config.EVOLUTION_API_URL);
      } catch {
        throw new Error('Invalid EVOLUTION_API_URL format');
      }
    }
  }

  get<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
    return this.config[key];
  }

  getAll(): Readonly<EnvConfig> {
    return Object.freeze({ ...this.config });
  }

  getConfig(): EnvConfig {
    return { ...this.config };
  }

  getNodeEnv(): string {
    return import.meta.env.MODE || 'development';
  }

  isDevelopment(): boolean {
    return this.config.ENVIRONMENT === 'development';
  }

  isProduction(): boolean {
    return this.config.ENVIRONMENT === 'production';
  }

  isDebugEnabled(): boolean {
    return this.config.ENABLE_DEBUG_LOGS;
  }

  isConsoleLogsEnabled(): boolean {
    return this.config.ENABLE_CONSOLE_LOGS;
  }
}

// Singleton instance
export const env = EnvironmentManager.getInstance();

// Export types for external use
export type { EnvConfig };