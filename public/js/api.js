const DEFAULT_TIMEOUT_MS = 30_000;

/** Error dari server atau jaringan, dengan kode yang bisa dipakai UI. */
export class ApiError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Satu pintu untuk semua permintaan ke server kita.
 * Server selalu menjawab { ok, data } atau { ok: false, error: { code, message } },
 * sehingga jawaban gagal diubah menjadi ApiError dan data dikembalikan saat berhasil.
 */
export async function apiRequest(
  path,
  { method = 'GET', body, token, timeoutMs = DEFAULT_TIMEOUT_MS } = {},
) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 'Server tidak terjangkau. Periksa koneksimu.', 0);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    throw new ApiError(
      payload?.error?.code ?? 'UNKNOWN_ERROR',
      payload?.error?.message ?? 'Terjadi kesalahan. Coba lagi.',
      response.status,
    );
  }
  return payload.data;
}

// Pemeriksaan server dan konfigurasi publik
export const getHealth = () => apiRequest('/api/health', { timeoutMs: 15_000 });
export const getConfig = () => apiRequest('/api/config', { timeoutMs: 15_000 });

// Profil dan autentikasi pemain
export const createProfile = (displayName, token) =>
  apiRequest('/api/profile', {
    method: 'POST',
    body: { display_name: displayName },
    token,
  });

export const getMe = (token) =>
  apiRequest('/api/me', {
    method: 'GET',
    token,
  });

// Ronde permainan
export const startRound = (token) =>
  apiRequest('/api/rounds', {
    method: 'POST',
    token,
  });

export const submitGuess = (roundId, { lat, lng }, token) =>
  apiRequest(`/api/rounds/${roundId}/guess`, {
    method: 'POST',
    body: { lat, lng },
    token,
  });
