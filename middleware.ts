import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canAccessPath, DEPOSITS_PATH } from '@/lib/role-access';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const token = bearer || req.cookies.get('sb-access-token')?.value;
  const protectedPath = /^\/(dashboard|contratos|admin|perfil)(\/|$)/.test(path);
  const deny = () => path === '/login' ? NextResponse.next() : req.method === 'GET' || req.method === 'HEAD'
    ? NextResponse.redirect(new URL('/login', req.url))
    : NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 });
  if (!token) return protectedPath ? deny() : NextResponse.next();

  // The subject is only a query hint; getUser below validates the signed token.
  let subject: string;
  try {
    const payload = token.split('.')[1];
    const parsed = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof parsed.sub !== 'string' || !parsed.sub) return deny();
    subject = parsed.sub;
  } catch {
    return deny();
  }

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20000) }),
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    // Auth and the RLS-protected profile lookup are independent network calls.
    const [authResult, profileResult] = await Promise.all([
      client.auth.getUser(token),
      client.from('profiles').select('id,rol,activo').eq('id', subject).single(),
    ]);
    const user = authResult.data.user;
    const profile = profileResult.data;
    if (authResult.error?.status === 0) {
      return NextResponse.json({ error: 'La validación de acceso no respondió. Intenta de nuevo.' }, { status: 503 });
    }
    if (authResult.error || !user || user.id !== subject ||
        profileResult.error || !profile || profile.id !== user.id || profile.activo === false) return deny();
    if (!canAccessPath(profile.rol, path)) {
      return req.method === 'GET' || req.method === 'HEAD'
      ? NextResponse.redirect(new URL(DEPOSITS_PATH, req.url))
      : NextResponse.json({ error: 'Contabilidad solo tiene acceso a depósitos y devoluciones.' }, { status: 403 });
    }
    return NextResponse.next();
  } catch (error) {
    console.error('La validación de acceso tardó demasiado:', error);
    return NextResponse.json({ error: 'No fue posible validar el acceso. Intenta recargar la página.' }, { status: 503 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
