const DEFAULT_PORT = 3000;
const ENVIRONMENTS = ['development', 'production', 'test'];

/**
 * Membaca dan memvalidasi environment variable di satu tempat.
 * Menerima objek `env` (bukan process.env langsung) supaya mudah diuji.
 * Jika ada nilai yang salah, fungsi ini melempar error dengan pesan yang jelas
 * sehingga server gagal start di awal, bukan error aneh di tengah jalan.
 */
export function loadConfig(env = process.env, { requireSupabase = false } = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  if (!ENVIRONMENTS.includes(nodeEnv)) {
    throw new Error(
      `NODE_ENV tidak valid: "${nodeEnv}". Pilih salah satu: ${ENVIRONMENTS.join(', ')}.`,
    );
  }

  const shouldRequireSupabase =
    requireSupabase || (nodeEnv === 'production' && env.NODE_ENV !== 'test');

  if (shouldRequireSupabase) {
    if (!env.SUPABASE_URL) {
      throw new Error('SUPABASE_URL wajib diisi.');
    }
    if (!env.SUPABASE_PUBLISHABLE_KEY) {
      throw new Error('SUPABASE_PUBLISHABLE_KEY wajib diisi.');
    }
    if (!env.SUPABASE_SECRET_KEY) {
      throw new Error('SUPABASE_SECRET_KEY wajib diisi.');
    }
  }

  return Object.freeze({
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: parsePort(env.PORT),
    supabase: Object.freeze({
      url: env.SUPABASE_URL || '',
      publishableKey: env.SUPABASE_PUBLISHABLE_KEY || '',
      secretKey: env.SUPABASE_SECRET_KEY || '',
    }),
  });
}

function parsePort(value) {
  if (value === undefined || value === '') return DEFAULT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT tidak valid: "${value}". Isi dengan angka 1-65535.`);
  }
  return port;
}
