'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  User, 
  Mail, 
  MapPin, 
  Shield, 
  Lock, 
  KeyRound, 
  Loader2, 
  ChevronLeft,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import Link from 'next/link';

export default function ProfileSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [passwords, setPasswords] = useState({
    newPassword: '',
    confirmPassword: ''
  });

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const { data: { user }, error: authErr } = await supabase.auth.getUser();
      if (authErr || !user) throw new Error("No autenticado");

      const { data: pData, error: pErr } = await supabase
        .from('profiles')
        .select(`
          id, 
          email, 
          rol, 
          nombre, 
          sede_id,
          rol_id,
          roles:rol_id(nombre)
        `)
        .eq('id', user.id)
        .maybeSingle();

      if (pErr) throw pErr;
      // profiles.sede_id has no foreign key to sedes, so the site name is read apart; the role shown is the assigned one (rol_id).
      const { data: sData } = pData?.sede_id ? await supabase.from('sedes').select('nombre').eq('id', pData.sede_id).maybeSingle() : { data: null };
      setProfile(pData ? { ...pData, sedes: sData } : { email: user.email, rol: 'asesora', nombre: 'Usuario' });

    } catch (err: any) {
      toast.error('Error al cargar perfil: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (passwords.newPassword !== passwords.confirmPassword) {
      return toast.error('Las contraseñas no coinciden.');
    }
    if (passwords.newPassword.length < 6) {
      return toast.error('La contraseña debe tener al menos 6 caracteres.');
    }

    setUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: passwords.newPassword
      });

      if (error) throw error;

      toast.success('✅ Contraseña actualizada correctamente');
      setPasswords({ newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error('Error al actualizar contraseña: ' + err.message);
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20 font-sans">
      <Toaster position="top-center" richColors />
      
      {/* Header */}
      <header className="bg-white border-b px-8 py-6 sticky top-0 z-30 shadow-sm">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link 
            href="/dashboard" 
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
          >
            <ChevronLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
              <User className="w-7 h-7 text-rose-500" />
              Configuración de Perfil
            </h1>
            <p className="text-gray-400 text-sm font-medium">Gestiona tu información personal y seguridad</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        
        {/* Profile Info Card */}
        <section className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-rose-500 to-rose-600 px-10 py-12 text-white relative">
             <div className="absolute top-0 right-0 w-48 h-48 bg-white/10 rounded-full -translate-y-10 translate-x-10 blur-3xl"></div>
             <div className="flex items-center gap-6 relative z-10">
                <div className="w-20 h-20 bg-white rounded-3xl flex items-center justify-center text-rose-500 text-3xl font-black shadow-lg">
                  {profile?.nombre?.charAt(0).toUpperCase() || 'U'}
                </div>
                <div>
                   <h2 className="text-3xl font-black tracking-tight">{profile?.nombre || 'Mi Perfil'}</h2>
                   <p className="text-rose-100 font-medium opacity-90 flex items-center gap-2 mt-1">
                     <Shield className="w-4 h-4" /> Rol: <span className="uppercase tracking-widest text-xs font-black">{profile?.roles?.nombre || profile?.rol || 'asesora'}</span>
                   </p>
                </div>
             </div>
          </div>
          
          <div className="p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
             <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5 px-1">
                  <Mail className="w-3 h-3 text-rose-400" /> Correo Electrónico
                </label>
                <div className="bg-gray-50 border border-gray-100 px-5 py-4 rounded-2xl font-bold text-gray-700">
                  {profile?.email}
                </div>
             </div>
             
             <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400 flex items-center gap-1.5 px-1">
                  <MapPin className="w-3 h-3 text-rose-400" /> Sede Asignada
                </label>
                <div className="bg-gray-50 border border-gray-100 px-5 py-4 rounded-2xl font-bold text-gray-700 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-emerald-500" />
                  {profile?.sedes?.nombre || 'Global / Sin sede'}
                </div>
             </div>
          </div>
        </section>

        {/* Password Update Card */}
        <section className="bg-white rounded-[2.5rem] shadow-xl shadow-gray-200/50 border border-gray-100 p-10">
           <div className="flex items-center gap-3 mb-8 border-b border-gray-50 pb-6">
              <div className="p-3 bg-amber-50 rounded-2xl">
                 <Lock className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                 <h3 className="text-xl font-black text-gray-900">Seguridad de la Cuenta</h3>
                 <p className="text-sm text-gray-400 font-medium">Actualiza tu contraseña periódicamente</p>
              </div>
           </div>

           <form onSubmit={handleUpdatePassword} className="space-y-6 max-w-lg">
              <div className="space-y-2">
                 <label className="text-xs font-black uppercase tracking-widest text-gray-500 px-1">Nueva Contraseña</label>
                 <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                    <input 
                       required
                       type="password"
                       placeholder="Mínimo 6 caracteres"
                       value={passwords.newPassword}
                       onChange={(e) => setPasswords({...passwords, newPassword: e.target.value})}
                       className="w-full pl-12 pr-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800"
                    />
                 </div>
              </div>

              <div className="space-y-2">
                 <label className="text-xs font-black uppercase tracking-widest text-gray-500 px-1">Confirmar Contraseña</label>
                 <div className="relative">
                    <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-300" />
                    <input 
                       required
                       type="password"
                       placeholder="Repite la contraseña"
                       value={passwords.confirmPassword}
                       onChange={(e) => setPasswords({...passwords, confirmPassword: e.target.value})}
                       className="w-full pl-12 pr-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800"
                    />
                 </div>
              </div>

              <div className="pt-4 flex flex-col md:flex-row items-center gap-6">
                 <button 
                    disabled={updating}
                    className="w-full md:w-auto px-10 py-4 bg-gray-900 hover:bg-black text-white font-black rounded-2xl shadow-xl shadow-gray-200 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                 >
                    {updating ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="w-6 h-6" />
                        ACTUALIZAR CREDENCIALES
                      </>
                    )}
                 </button>
                 <p className="text-xs text-gray-400 font-medium flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Tu sesión permanecerá activa tras el cambio.
                 </p>
              </div>
           </form>
        </section>

      </main>
    </div>
  );
}
