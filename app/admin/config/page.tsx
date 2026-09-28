'use client';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'sonner';
import { 
  Building2, 
  Users, 
  Plus, 
  ToggleLeft, 
  ToggleRight, 
  Loader2, 
  ShieldAlert,
  Save,
  Trash2,
  CheckCircle2,
  ChevronLeft
} from 'lucide-react';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

export default function AdminConfigPage() {
  const readAccess = useVerifiedAccess();
  const [activeTab, setActiveTab] = useState<'sedes' | 'asesoras'>('sedes');
  const [loading, setLoading] = useState(true);
  const [sedes, setSedes] = useState<any[]>([]);
  const [asesoras, setAsesoras] = useState<any[]>([]);
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Forms
  const [newSedeName, setNewSedeName] = useState('');
  const [newAsesora, setNewAsesora] = useState({ nombre: '', sede_id: '', profile_id: '' });
  const [profiles, setProfiles] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    checkAdmin();
  }, []);

  const checkAdmin = async () => {
    setLoading(true);
    try {
      const {user, profile} = await readAccess();
      if (!user) {
        window.location.href = '/login';
        return;
      }
      
      let role = profile?.rol || null;
      
      // -- OFICIAL ADMIN ELEVATION --
      if (user.email === 'dubian.h88@gmail.com') {
        role = 'admin';
        // Ensure profile exists and has the correct role for this official email
        if (profile?.rol !== 'admin') {
           await supabase.from('profiles').upsert({ id: user.id, rol: 'admin', email: user.email }, { onConflict: 'id' });
         }
      }
      
      setUser(user ? { ...user, rol: role, nombre: profile?.nombre } : null);
      setUserRole(role);
      if (role === 'admin') {
        await loadData();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const loadData = async () => {
    const { data: sData } = await supabase.from('sedes').select('*').order('nombre');
    const { data: aData, error: aError } = await supabase.from('asesoras').select('*, sedes(nombre)').order('nombre_completo');
    if (aError) console.error('[DATABASE ERROR] asesoras:', aError.message, aError.details);
    const { data: pData } = await supabase.from('profiles').select('*').order('nombre');
    setSedes(sData || []);
    setAsesoras(aData || []);
    setProfiles(pData || []);
  };

  const handleAddSede = async () => {
    if (!newSedeName.trim()) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('sedes').insert([{ nombre: newSedeName.trim() }]);
      if (error) throw error;
      toast.success('Sede añadida');
      setNewSedeName('');
      loadData();
    } catch (err) {
      toast.error('Error al añadir sede');
    } finally {
      setSaving(false);
    }
  };

  const toggleSedeStatus = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase.from('sedes').update({ activo: !current }).eq('id', id);
      if (error) throw error;
      loadData();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  const handleAddAsesora = async () => {
    if (!newAsesora.nombre.trim() || !newAsesora.sede_id) {
      return toast.error('Completa los campos obligatorios');
    }
    setSaving(true);
    try {
      const payload = {
        nombre: newAsesora.nombre.trim(),
        nombre_completo: newAsesora.nombre.trim(), 
        sede_id: newAsesora.sede_id,
        profile_id: newAsesora.profile_id ? newAsesora.profile_id : null
      };
      
      console.log('Sending payload to asesoras:', payload);
      
      const { error, data } = await supabase.from('asesoras').insert([payload]).select();
      
      if (error) {
        console.error('Supabase Insert Error:', error);
        throw error;
      }
      
      toast.success('Asesora vinculada');
      setNewAsesora({ nombre: '', sede_id: '', profile_id: '' });
      loadData();
    } catch (err: any) {
      console.error('Error al añadir asesora:', err);
      toast.error(`Error Supabase: ${err.message || JSON.stringify(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleAsesoraStatus = async (id: string, current: boolean) => {
    try {
      const { error } = await supabase.from('asesoras').update({ activo: !current }).eq('id', id);
      if (error) throw error;
      loadData();
    } catch (err) {
      toast.error('Error al actualizar estado');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  if (userRole !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <ShieldAlert className="w-16 h-16 text-rose-500 mb-4" />
        <h1 className="text-2xl font-bold text-gray-900">Acceso Restringido</h1>
        <p className="text-gray-500 mt-2">No tienes permisos para ver esta página.</p>
        <Link href="/dashboard" className="mt-6 text-rose-600 font-bold hover:underline flex items-center gap-2">
          Volver al Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Toaster position="top-right" richColors />
      
      <Sidebar user={user} handleLogout={handleLogout} activePage="config" />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
             <Link href="/dashboard" className="p-2 hover:bg-gray-100 rounded-full transition-colors">
               <ChevronLeft className="w-6 h-6 text-gray-600" />
             </Link>
             <h1 className="text-2xl font-black text-gray-900 tracking-tight">Configuración Maestra</h1>
          </div>
          <span className="text-xs bg-rose-100 text-rose-700 font-black px-3 py-1.5 rounded-full uppercase tracking-widest">Administración</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 mt-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          
          {/* SECTION: SEDES */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
               <h2 id="sedes" className="text-xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                 <Building2 className="w-6 h-6 text-rose-500" /> Gestionar Sedes
               </h2>
               <span className="bg-rose-50 text-rose-600 text-[10px] font-black px-2 py-1 rounded-lg border border-rose-100 uppercase italic whitespace-nowrap">Control Maestro</span>
            </div>

            {/* Form Add Sede */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
               <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">Añadir Nueva Sede</h3>
               <div className="flex gap-2">
                 <input 
                   type="text" 
                   value={newSedeName}
                   onChange={(e)=>setNewSedeName(e.target.value)}
                   className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-rose-200 font-bold text-gray-800"
                   placeholder="Ej: Bogotá Norte"
                 />
                 <button 
                   onClick={handleAddSede}
                   disabled={saving || !newSedeName.trim()}
                   className="bg-rose-500 hover:bg-rose-600 shadow-lg shadow-rose-100 text-white px-6 py-3 rounded-xl font-black transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                 >
                   {saving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Plus className="w-5 h-5"/>}
                 </button>
               </div>
            </div>

            {/* List Sedes */}
            <div className="space-y-4">
               {sedes.length === 0 ? (
                 <div className="p-10 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-300">
                   <p className="text-gray-400 font-bold text-sm">No hay sedes registradas.</p>
                 </div>
               ) : (
                  sedes.map((s) => (
                    <div key={s.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                         <div className={`p-2.5 rounded-2xl ${s.activo ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-400'}`}>
                           <Building2 className="w-5 h-5" />
                         </div>
                         <div>
                            <h4 className="font-black text-gray-900 text-sm uppercase">{s.nombre}</h4>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ${s.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {s.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                         </div>
                      </div>
                      <button 
                        onClick={() => toggleSedeStatus(s.id, s.activo)}
                        className={`p-1.5 rounded-xl transition-colors ${s.activo ? 'text-gray-400 hover:text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                      >
                        {s.activo ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                      </button>
                    </div>
                  ))
               )}
            </div>
          </div>

          {/* SECTION: ASESORAS / EQUIPO */}
          <div className="space-y-6">
            <div className="flex items-center justify-between">
               <h2 id="equipo" className="text-xl font-black text-gray-900 flex items-center gap-2 uppercase tracking-tight">
                 <Users className="w-6 h-6 text-rose-500" /> Gestionar Equipo
               </h2>
               <span className="bg-rose-50 text-rose-600 text-[10px] font-black px-2 py-1 rounded-lg border border-rose-100 uppercase italic whitespace-nowrap">Recurso Humano</span>
            </div>

            {/* Form Add Asesora */}
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 space-y-4">
               <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm uppercase tracking-wider">Alta de Asesora</h3>
               <div className="grid grid-cols-1 gap-3">
                 <input 
                   type="text" 
                   value={newAsesora.nombre}
                   onChange={(e)=>setNewAsesora({...newAsesora, nombre: e.target.value})}
                   className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-rose-200 font-bold text-gray-800"
                   placeholder="Nombre Asesora"
                 />
                 <div className="grid grid-cols-2 gap-3">
                   <select 
                     value={newAsesora.sede_id}
                     onChange={(e)=>setNewAsesora({...newAsesora, sede_id: e.target.value})}
                     className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-rose-200 font-bold text-gray-800"
                   >
                     <option value="">Selecciona Sede...</option>
                     {sedes.filter(s => s.activo).map(s => (
                       <option key={s.id} value={s.id}>{s.nombre}</option>
                     ))}
                   </select>
                   <select 
                     value={newAsesora.profile_id}
                     onChange={(e)=>setNewAsesora({...newAsesora, profile_id: e.target.value})}
                     className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-rose-200 font-bold text-gray-800"
                   >
                     <option value="">Vincular Perfil (Opcional)...</option>
                     {profiles.map(p => (
                       <option key={p.id} value={p.id}>{p.nombre} ({p.rol})</option>
                     ))}
                   </select>
                 </div>
               </div>
                <button 
                 onClick={handleAddAsesora}
                 disabled={saving || !newAsesora.nombre.trim() || !newAsesora.sede_id}
                 className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3 rounded-xl font-black shadow-lg shadow-rose-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
               >
                 {saving ? <Loader2 className="w-5 h-5 animate-spin"/> : <Plus className="w-4 h-4"/>} VINCULAR ASESORA
               </button>
            </div>

            {/* List Asesoras */}
            <div className="space-y-4">
               {asesoras.length === 0 ? (
                 <div className="p-10 text-center bg-gray-50 rounded-3xl border border-dashed border-gray-300">
                   <p className="text-gray-400 font-bold text-sm">No hay equipo registrado.</p>
                 </div>
               ) : (
                  asesoras.map((a) => (
                    <div key={a.id} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-shadow">
                      <div className="flex items-center gap-3">
                         <div className={`p-2.5 rounded-2xl ${a.activo ? 'bg-rose-50 text-rose-600' : 'bg-gray-50 text-gray-400'}`}>
                           <Users className="w-5 h-5" />
                         </div>
                         <div>
                            <h4 className="font-black text-gray-900 text-sm uppercase">{a.nombre_completo}</h4>
                            <span className="text-[8px] bg-rose-50 text-rose-500 font-black px-1.5 py-0.5 rounded tracking-widest uppercase">
                              {a.sedes?.nombre || 'SIN SEDE'}
                            </span>
                            <span className={`text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-tighter ml-2 ${a.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                              {a.activo ? 'ACTIVO' : 'INACTIVO'}
                            </span>
                         </div>
                      </div>
                      <button 
                        onClick={() => toggleAsesoraStatus(a.id, a.activo)}
                        className={`p-1.5 rounded-xl transition-colors ${a.activo ? 'text-gray-400 hover:text-rose-600 hover:bg-rose-50' : 'text-emerald-600 hover:bg-emerald-50'}`}
                      >
                        {a.activo ? <ToggleRight className="w-10 h-10" /> : <ToggleLeft className="w-10 h-10" />}
                      </button>
                    </div>
                  ))
               )}
            </div>
          </div>

          </div>
        </div>
      </div>
    </div>
  );
}

