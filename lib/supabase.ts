import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);


// Keep the server route check aligned with automatic session refreshes and logout.
if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((_event, session) => {
    document.cookie = session
      ? `sb-access-token=${session.access_token}; path=/; max-age=${Math.max(0, (session.expires_at ?? 0) - Math.floor(Date.now() / 1000))}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`
      : 'sb-access-token=; path=/; max-age=0; SameSite=Lax';
  });
}
