import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  // Verificamos si existe la cookie que establecemos en el login
  const token = req.cookies.get('sb-access-token');

  // Si intentan entrar a dashboard o contratos sin token, redirigimos a login
  if (req.nextUrl.pathname.startsWith('/dashboard') || req.nextUrl.pathname.startsWith('/contratos')) {
    if (!token) {
      const loginUrl = new URL('/login', req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Rutas públicas como /firma/[id] o /login continúan normalmente
  return NextResponse.next();
}

// Configurar el matcher para que el middleware solo se ejecute en estas rutas
export const config = {
  matcher: ['/dashboard/:path*', '/contratos/:path*'],
};
