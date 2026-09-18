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

  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return deny();
  const { data: profile, error: profileError } = await client.from('profiles').select('rol,activo').eq('id', user.id).single();
  if (profileError || !profile || profile.activo === false) return deny();
  if (!canAccessPath(profile.rol, path)) {
    return req.method === 'GET' || req.method === 'HEAD'
      ? NextResponse.redirect(new URL(DEPOSITS_PATH, req.url))
      : NextResponse.json({ error: 'Contabilidad solo tiene acceso a depósitos y devoluciones.' }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
