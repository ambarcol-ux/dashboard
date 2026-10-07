'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'sonner';
import { Loader2, Mail, Lock, LogIn } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [mode,setMode]=useState<'login'|'recover'|'update'>('login');
  const [confirmation,setConfirmation]=useState('');
  const [message,setMessage]=useState('');
  const recoveryStarted=useRef(false);
  useEffect(()=>{
    const {data:{subscription}}=supabase.auth.onAuthStateChange(event=>{if(event==='PASSWORD_RECOVERY')setMode('update');});
    const hash=new URLSearchParams(window.location.hash.slice(1));
    const token=hash.get('recovery_token');
    if(token&&!recoveryStarted.current){
      recoveryStarted.current=true;window.history.replaceState(null,'',window.location.pathname);setLoading(true);
      void supabase.auth.verifyOtp({token_hash:token,type:'recovery'}).then(({error})=>{
        if(error){setMode('recover');setMessage('El enlace venció o ya fue utilizado. Solicita uno nuevo.');}
        else setMode('update');
      }).catch(()=>{setMode('recover');setMessage('No se pudo validar el enlace. Intenta solicitar uno nuevo.');}).finally(()=>setLoading(false));
    }
    return()=>subscription.unsubscribe();
  },[]);
  const recoverAccess=async()=>{
    if(!formData.email.trim()){setMessage('Indica tu correo de acceso.');return;}
    setLoading(true);setMessage('');
    try{
      const {error}=await supabase.auth.resetPasswordForEmail(formData.email.trim(),{redirectTo:`${window.location.origin}/login`});
      if(error)throw error;
      setMessage('Si el correo está registrado, recibirás un enlace para elegir una nueva contraseña.');
    }catch{setMessage('No se pudo enviar el enlace de recuperación. Contacta con Administración.');}
    finally{setLoading(false);}
  };
  const updatePassword=async()=>{
    if(formData.password.length<8||formData.password!==confirmation){setMessage('Usa al menos 8 caracteres y confirma la misma contraseña.');return;}
    setLoading(true);setMessage('');
    try{
      const {error}=await supabase.auth.updateUser({password:formData.password});if(error)throw error;
      await supabase.auth.signOut();document.cookie='sb-access-token=;path=/;max-age=0';
      setFormData(prev=>({...prev,password:''}));setConfirmation('');setMode('login');setMessage('Contraseña actualizada. Ya puedes iniciar sesión.');
    }catch{setMessage('No se pudo cambiar la contraseña. Solicita un enlace nuevo e inténtalo de nuevo.');}
    finally{setLoading(false);}
  };
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if(mode==='recover'){await recoverAccess();return;}
    if(mode==='update'){await updatePassword();return;}
    setLoading(true);
    let loginTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      const { data, error } = await Promise.race([
        supabase.auth.signInWithPassword({
          email: formData.email,
          password: formData.password,
        }),
        new Promise<never>((_, reject) => {
          loginTimeout = setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 20000);
        }),
      ]);

      if (error) throw error;

      // Guardamos un token en las cookies para que el Middleware de Next.js lo pueda leer
      if (data.session) {
        const maxAge = Math.max(0, (data.session.expires_at ?? 0) - Math.floor(Date.now() / 1000));
        document.cookie = `sb-access-token=${data.session.access_token}; path=/; max-age=${maxAge}; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
        toast.success('¡Bienvenida a Ambar Couture!');
        
        // El middleware valida el perfil y dirige a contabilidad a su pantalla autorizada.
        router.replace('/dashboard');
        router.refresh();
      }

    } catch (err: any) {
      console.error(err);
      toast.error(err?.message === 'AUTH_TIMEOUT'
        ? 'El servicio de inicio de sesión está tardando. Inténtalo de nuevo en unos momentos.'
        : 'No fue posible iniciar sesión. Verifica tus datos e inténtalo de nuevo.');
    } finally {
      if (loginTimeout) clearTimeout(loginTimeout);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-rose-50/50 flex flex-col justify-center items-center p-4">
      <Toaster position="top-center" richColors />
      
      <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-rose-100 p-8 sm:p-10 relative overflow-hidden">
        
        {/* Adorno superior sutil */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-rose-300 to-rose-400"></div>

        <div className="text-center mb-10 mt-2">
          <h1 className="text-3xl font-black text-gray-900 tracking-tight mb-2">Ambar Couture</h1>
          <p className="text-sm font-semibold text-rose-500 uppercase tracking-widest">
            Portal Administrativo
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          {mode!=='update'&&<div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700 block">Correo Electrónico</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Mail className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                placeholder="asesora@ambar.com"
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 transition-all font-medium"
                required
              />
            </div>
          </div>}

          {mode!=='recover'&&<div className="space-y-1.5">
            <label className="text-sm font-bold text-gray-700 block">{mode==='update'?'Nueva contraseña':'Contraseña'}</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-400" />
              </div>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full pl-11 pr-4 py-3.5 bg-gray-50 border border-gray-200 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 transition-all font-medium"
                required
              />
            </div>
          </div>}
          {mode==='update'&&<label className="block text-sm font-bold text-gray-700">Confirmar nueva contraseña<input aria-label="Confirmar nueva contraseña" type="password" autoComplete="new-password" required minLength={8} value={confirmation} onChange={e=>setConfirmation(e.target.value)} className="mt-2 w-full rounded-xl border border-gray-200 p-3"/></label>}
          {message&&<p role="status" className="text-sm text-gray-700">{message}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-rose-500 hover:bg-rose-600 active:bg-rose-700 text-white font-bold text-lg py-4 rounded-xl shadow-lg shadow-rose-200 hover:shadow-xl hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2 mt-4 disabled:opacity-70 disabled:cursor-wait"
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <LogIn className="w-5 h-5" /> {mode==='recover'?'Enviar enlace de recuperación':mode==='update'?'Guardar nueva contraseña':'Entrar al Sistema'}
              </>
            )}
          </button>
        </form>
        {mode!=='update'&&<button type="button" disabled={loading} onClick={()=>{setMessage('');setMode(mode==='login'?'recover':'login');}} className="mt-5 w-full text-center text-sm font-bold text-rose-600">{mode==='login'?'Olvidé mi contraseña':'Volver a iniciar sesión'}</button>}
        
        <div className="mt-8 text-center text-xs font-semibold text-gray-400">
          Uso exclusivo para personal autorizado de Ámbar Couture.
        </div>
      </div>
    </div>
  );
}
