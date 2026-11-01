import React from 'react';
import {headers} from 'next/headers';
import {redirect} from 'next/navigation';
import {DEPOSIT_PROFILE_HEADER,parseDepositProfile} from '@/lib/deposit-profile';
import {ShieldAlert} from 'lucide-react';
import Link from 'next/link';

export default async function AdminLayout({children}: {children: React.ReactNode}) {
  const h = await headers();
  const profile = parseDepositProfile(h.get(DEPOSIT_PROFILE_HEADER));
  if (!profile || profile.activo === false) redirect('/login');
  const isAdmin = profile.authEmail === 'dubian.h88@gmail.com' || profile.rol.toLowerCase() === 'admin' || !!h.get('x-ambar-panel-ok');
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-rose-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-[3rem] p-12 text-center shadow-2xl border border-rose-100 animate-in zoom-in duration-300">
          <div className="w-20 h-20 bg-rose-100 text-rose-600 rounded-3xl flex items-center justify-center mx-auto mb-8 rotate-12">
            <ShieldAlert className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Acceso Restringido</h1>
          <p className="text-gray-500 mb-8 font-medium leading-relaxed">
            Lo sentimos, no tienes permisos de administrador para acceder a esta sección. Si crees que esto es un error, contacta al soporte técnico.
          </p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center justify-center px-10 py-5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl transition-all active:scale-95 shadow-lg shadow-rose-200"
          >
            Volver al Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

