import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

// Retry a stalled password login once. Other reads and writes keep their existing behavior.
const authFetch: typeof fetch = async (input, init) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isPasswordLogin = url.includes('/auth/v1/token?grant_type=password') && init?.method === 'POST';
  if (!isPasswordLogin) return fetch(input, init);

  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8500);
    try {
      const response = await fetch(input, { ...init, signal: controller.signal });
      if (attempt === 0 && [502, 503, 504].includes(response.status)) continue;
      return response;
    } catch (error) {
      if (attempt === 1 || !controller.signal.aborted) throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error('El servicio de inicio de sesión no respondió.');
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: { fetch: authFetch },
});


// Keep the server route check aligned with automatic session refreshes and logout.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    document.cookie = session
      ? `sb-access-token=${session.access_token}; path=/; max-age=${Math.max(0, (session.expires_at ?? 0) - Math.floor(Date.now() / 1000))}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      : 'sb-access-token=; path=/; max-age=0; SameSite=Lax';
  });
}
