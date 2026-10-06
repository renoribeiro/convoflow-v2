import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { env } from '../../lib/env';
import { logger } from '../../lib/logger';

// Create a single supabase client for interacting with your database
export const supabase = createClient<Database>(
  env.get('SUPABASE_URL'),
  env.get('SUPABASE_ANON_KEY'),
  {
    auth: {
      persistSession: true,
      storageKey: 'convoflow-auth',
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);

// Log initialization in development
if (env.isDevelopment()) {
  logger.info('Supabase client initialized', {
    url: env.get('SUPABASE_URL'),
    environment: env.get('ENVIRONMENT')
  });
}