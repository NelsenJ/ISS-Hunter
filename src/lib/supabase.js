import { createClient } from '@supabase/supabase-js';
import { loadConfig } from '../config.js';
import { AppError } from './errors.js';

let customClient = null;

/**
 * Mengatur klien Supabase kustom (berguna untuk pengujian unit/mock).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient | null} client
 */
export function setSupabaseClient(client) {
  customClient = client;
}

/**
 * Mengembalikan klien Supabase dengan kunci rahasia (Secret Key / Service Role).
 * Klien ini melewati Row Level Security (RLS) dan hanya digunakan di server.
 *
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
export function getSupabaseAdmin() {
  if (customClient) {
    return customClient;
  }

  const config = loadConfig();
  const { url, secretKey } = config.supabase;

  if (!url || !secretKey) {
    throw new AppError(
      500,
      'SUPABASE_NOT_CONFIGURED',
      'Layanan database Supabase belum dikonfigurasi di server.',
    );
  }

  return createClient(url, secretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
