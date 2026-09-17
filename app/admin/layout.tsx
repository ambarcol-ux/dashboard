'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, ShieldAlert } from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    try {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        window.location.href = '/login';
        return;
      }

      // Bypas para el administrador principal
      if (user.email === 'dubian.h88@gmail.com') {
        setIsAdmin(true);
        setLoading(false);
        return;
      }

      const { data: profile, error } = await supabase
        .from('profiles')
        .select('rol')
        .eq('id', user.id)
        .single();

      if (error || profile?.rol?.toLowerCase() !== 'admin') {
        setIsAdmin(false);
      } else {
        setIsAdmin(true);
      }
    } catch (err) {
      console.error('Error verificando rol administrativo:', err);
      setIsAdmin(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 animate-spin text-rose-500 mx-auto mb-4" />
          <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Validando Credenciales...</p>
        </div>
      </div>
    );
  }

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
