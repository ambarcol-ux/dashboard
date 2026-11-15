import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { firstAllowedPanel, isSupplierProfile, panelAccess, panelForPath } from '@/lib/panel-access';
import { DEPOSIT_PROFILE_HEADER, type DepositProfile } from '@/lib/deposit-profile';

export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const requestHeaders = new Headers(req.headers);
  // Never trust a profile supplied by the browser. Only this request's verified
  // Auth + RLS result may be forwarded to the server component.
  requestHeaders.delete(DEPOSIT_PROFILE_HEADER);
  requestHeaders.delete('x-ambar-profile-verified-at');
  requestHeaders.delete('x-ambar-panel-ok');
  const next = () => NextResponse.next({ request: { headers: requestHeaders } });
  // Closed referral program: its public pages are not served (404); the files stay in the project.
  if (path === '/unete' || path === '/recomendar' || path.startsWith('/recomendar/')) return new NextResponse('<!doctype html><html lang="es"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Página no encontrada</title><body style="font-family:system-ui;text-align:center;padding:4rem">Página no encontrada</body></html>', { status: 404, headers: { 'content-type': 'text/html; charset=utf-8' } });
  // Login must render even when Supabase Auth is slow or an old cookie exists.
  if (path === '/login' || path === '/agendar-primera-cita' || path === '/api/primeras-citas' || path === '/api/primeras-citas/gestionar' || path === '/api/primeras-citas/recuperar' || path === '/reprogramar-primera-cita' || path === '/api/primeras-citas/procesar' || path === '/api/correo/procesar' || path === '/api/whatsapp/retomar' || path === '/api/whatsapp/analisis' || path === '/api/seguimientos/automaticos' || path === '/api/inventario/describir-fotos' || path === '/api/crm/automatico' || path === '/api/meta/redes/sincronizar' || path === '/api/marketing/publicar' || path === '/api/contratos/post-evento' || path === '/api/integraciones/whatsapp' || path === '/api/marketing/reglas' || path === '/api/marketing/media' || path === '/api/integraciones/tiktok/callback' || path === '/api/documentos/ia' || path === '/api/primeras-citas/correos' || path === '/api/primeras-citas/whatsapp-script' || path === '/api/primeras-citas/eventos-crm' || path === '/api/primeras-citas/whatsapp' || path === '/agendar-primera-cita/gestionar' || path === '/llegue' || path === '/api/primeras-citas/llegada' || path === '/api/reportes/embudo') return next();
  const bearer = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const token = bearer || req.cookies.get('sb-access-token')?.value;
  const protectedPath = /^\/(dashboard|contratos|admin|perfil|disponibilidad|proveedor)(\/|$)/.test(path) || path === '/api/dashboard/contracts';
  const deny = () => path === '/api/dashboard/contracts' ? NextResponse.json({error: 'Inicia sesión para continuar.'}, {status: 401}) : path === '/login' ? next() : req.method === 'GET' || req.method === 'HEAD'
    ? NextResponse.redirect(new URL('/login', req.url))
    : NextResponse.json({ error: 'Inicia sesión para continuar.' }, { status: 401 });
  if (!token) return protectedPath ? deny() : next();

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
    const panel = panelForPath(path);
    const [authResult, profileResult, accessResult, permissionsResult] = await Promise.all([
      client.auth.getUser(token),
      client.from('profiles').select('id,nombre,email,rol,rol_id,sede_id,activo,estado_ficha').eq('id', subject).single<DepositProfile>(),
      // Manual panel changes are only needed for menu pages.
      Promise.resolve({ data: [], error: null }),
      // Permissions of all the user's roles decide which menu pages they can open.
      panel ? client.rpc('mis_permisos') : Promise.resolve({ data: null, error: null }),
    ]);
    const user = authResult.data.user;
    const profile = profileResult.data;
    if (authResult.error?.status === 0) {
      return NextResponse.json({ error: 'La validación de acceso no respondió. Intenta de nuevo.' }, { status: 503 });
    }
    if (authResult.error || !user || user.id !== subject ||
        profileResult.error || !profile || profile.id !== user.id || profile.activo === false) return deny();
    if (panel && (accessResult.error || permissionsResult.error)) {
      return NextResponse.json({ error: 'No fue posible validar tus accesos. Intenta recargar la página.' }, { status: 503 });
    }
    const permissions = Array.isArray(permissionsResult.data) ? permissionsResult.data as string[] : null;
    // Suppliers only use their portal.
    if (isSupplierProfile(profile)) {
      if (!['/proveedor', '/login'].includes(path.replace(/(.)\/$/, '$1'))) {
        return req.method === 'GET' || req.method === 'HEAD'
          ? NextResponse.redirect(new URL('/proveedor', req.url))
          : NextResponse.json({ error: 'Los proveedores solo tienen acceso a su portal.' }, { status: 403 });
      }
    } else if (panel && !panelAccess(panel.id, profile, null, permissions)) {
      // Menu pages: only the person's role (rol_id + roles_permisos) decides.
      const home = firstAllowedPanel(profile, null, permissions) || '/perfil';
      return path.startsWith('/api/') || !['GET','HEAD'].includes(req.method)
        ? NextResponse.json({ error: 'No tienes acceso a este panel. Pide al administrador que te lo habilite.' }, { status: 403 })
        : NextResponse.redirect(new URL(home === path ? '/perfil' : `${home}?sin_acceso=${encodeURIComponent(panel.id)}`, req.url));
    }
    requestHeaders.set(DEPOSIT_PROFILE_HEADER, encodeURIComponent(JSON.stringify({...profile, authEmail: user.email ?? null})));
    requestHeaders.set('x-ambar-profile-verified-at', String(Date.now()));
    // The person's role grants this menu page (checked above): /admin pages open for granted roles too.
    if (panel) requestHeaders.set('x-ambar-panel-ok', panel.id);
    return next();
  } catch (error) {
    console.error('La validación de acceso tardó demasiado:', error);
    return NextResponse.json({ error: 'No fue posible validar el acceso. Intenta recargar la página.' }, { status: 503 });
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|ico)$).*)'],
};
