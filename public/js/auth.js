/**
 * ISS Hunter — Auth Client
 * Mengatur autentikasi berbasis username dan password (tanpa input email pengguna).
 */

let client = null;

export function isSupabaseAvailable() {
  return typeof window !== 'undefined' && typeof window.supabase?.createClient === 'function';
}

export function isAuthReady() {
  return client !== null;
}

/**
 * Mengubah username menjadi email deterministik untuk Supabase Auth.
 * Format selalu memenuhi spesifikasi email RFC dan GoTrue Supabase.
 *
 * @param {string} username
 * @returns {string}
 */
export function usernameToEmail(username) {
  const clean = String(username || '')
    .trim()
    .toLowerCase();
  const escaped = clean.replace(/[^a-z0-9]/g, (ch) => `_${ch.charCodeAt(0).toString(16)}`);
  return `${escaped}@isshunter.app`;
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

/**
 * Mendaftarkan akun baru dengan username dan password saja.
 * Memanggil endpoint backend /api/profile/register agar email_confirm langsung aktif.
 * Setelah pendaftaran berhasil, fungsi langsung melakukan sign-in agar sesi aktif.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ user: any, session: any }>}
 */
export async function signUp(username, password) {
  if (!client) {
    throw new Error('Layanan autentikasi belum terhubung. Konfigurasi Supabase diperlukan.');
  }

  const res = await fetch('/api/profile/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok || !payload?.ok) {
    const error = new Error(payload?.error?.message || 'Gagal mendaftar akun.');
    error.code = payload?.error?.code;
    error.status = res.status;
    throw error;
  }

  // Langsung sign-in agar klien browser mendapatkan token sesi JWT Supabase
  return await signIn(username, password);
}

/**
 * Masuk menggunakan username dan password.
 * Username dipetakan secara deterministik ke format akun Supabase Auth.
 *
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ user: any, session: any }>}
 */
export async function signIn(username, password) {
  if (!client) {
    throw new Error('Layanan autentikasi belum terhubung. Konfigurasi Supabase diperlukan.');
  }

  const email = usernameToEmail(username);
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    if (error.message?.toLowerCase().includes('invalid login credentials')) {
      const err = new Error('Username atau kata sandi salah.');
      err.status = 401;
      throw err;
    }
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
