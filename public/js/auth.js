/**
 * ISS Hunter — Auth Client
 * Satu-satunya modul pembungkus yang mengakses objek global `window.supabase`.
 */

let client = null;

export function isSupabaseAvailable() {
  return typeof window !== 'undefined' && typeof window.supabase?.createClient === 'function';
}

export function isAuthReady() {
  return client !== null;
}

/**
 * Inisialisasi klien Supabase browser dengan URL dan publishable key dari server.
 *
 * @param {{ supabaseUrl: string, supabasePublishableKey: string }} config
 * @returns {boolean} Status kesiapan klien
 */
export function initAuth(config) {
  if (!isSupabaseAvailable()) {
    console.warn('Pustaka supabase-js belum dimuat dari CDN.');
    return false;
  }

  if (!config?.supabaseUrl || !config?.supabasePublishableKey) {
    return false;
  }

  try {
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
    return true;
  } catch (err) {
    console.error('Gagal menginisialisasi klien Supabase:', err);
    client = null;
    return false;
  }
}

export async function getSession() {
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error) {
    console.warn('Gagal membaca sesi:', error.message);
    return null;
  }
  return data.session;
}

export async function getAccessToken() {
  const session = await getSession();
  return session?.access_token ?? null;
}

export async function signUp(email, password) {
  if (!client) {
    throw new Error('Layanan autentikasi belum terhubung. Konfigurasi Supabase diperlukan.');
  }

  const { data, error } = await client.auth.signUp({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signIn(email, password) {
  if (!client) {
    throw new Error('Layanan autentikasi belum terhubung. Konfigurasi Supabase diperlukan.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signOut() {
  if (!client) return;
  const { error } = await client.auth.signOut();
  if (error) {
    console.warn('Gagal keluar sesi:', error.message);
  }
}

export function onAuthStateChange(callback) {
  if (!client) return () => {};
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return () => data.subscription.unsubscribe();
}
