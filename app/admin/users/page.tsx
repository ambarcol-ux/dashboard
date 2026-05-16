'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, 
  UserPlus, 
  Shield, 
  Mail, 
  MapPin, 
  Loader2, 
  ChevronLeft,
  Search,
  CheckCircle2,
  XCircle,
  MoreVertical
} from 'lucide-react';
import { Toaster, toast } from 'sonner';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';
import { createUserAction } from './actions';

export default function UsersManagementPage() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [createModalLoading, setCreateModalLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    nombre: '',
    sede_id: '',
    rol: 'asesora',
    password: ''
  });
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);

  // Actions State
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ id: '', nombre: '', email: '', sede_id: '' });

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
          
        let role = profile?.rol || null;
        if (user.email === 'dubian.h88@gmail.com') {
          role = 'admin';
        }
        
        setUser({ ...user, rol: role, nombre: profile?.nombre });
        setUserRole(role);
      } else {
        window.location.href = '/login';
      }
    };
    checkUser();
    fetchData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      // Obtener perfiles
      const { data: profiles, error: pErr } = await supabase
        .from('profiles')
        .select('id, email, rol, nombre, sede_id, activo')
        .order('nombre', { ascending: true });
      if (pErr) throw pErr;
      setUsers(profiles || []);

      // Obtener sedes para el select
      const { data: sedesList, error: sErr } = await supabase
        .from('sedes')
        .select('*')
        .eq('activo', true);
      if (sErr) throw sErr;
      setSedes(sedesList || []);

    } catch (err: any) {
      toast.error('Error cargando usuarios: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.email || !formData.nombre || !formData.sede_id || !formData.password) {
      return toast.error('Todos los campos son obligatorios.');
    }

    if (formData.password.length < 6) {
      return toast.error('La contraseña debe tener al menos 6 caracteres.');
    }

    setCreateModalLoading(true);
    try {
      // Llamar a la Server Action para creación segura (Directa en DB/Auth)
      const result = await createUserAction({
        email: formData.email,
        password: formData.password,
        nombre: formData.nombre,
        sede_id: formData.sede_id,
        rol: formData.rol
      });

      if (!result.success) {
        // Mostramos el mensaje detallado que viene del servidor
        toast.error(`Error: ${result.message}`);
        return;
      }

      toast.success(`✅ Usuario ${formData.nombre} creado con éxito. Ya puede iniciar sesión.`);
      setIsModalOpen(false);
      setFormData({ email: '', nombre: '', sede_id: '', rol: 'asesora', password: '' });
      fetchData();
    } catch (err: any) {
      toast.error('Ocurrió un fallo inesperado al comunicarse con el servidor.');
      console.error('Error en handleCreateUser:', err);
    } finally {
      setCreateModalLoading(false);
    }

  };

  const handleEditOpen = (u: any) => {
    setEditFormData({ id: u.id, nombre: u.nombre || '', email: u.email || '', sede_id: u.sede_id || '' });
    setActiveDropdown(null);
    setEditModalOpen(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ nombre: editFormData.nombre, email: editFormData.email, sede_id: editFormData.sede_id || null })
        .eq('id', editFormData.id);
      if (error) throw error;
      toast.success('Perfil actualizado correctamente');
      setEditModalOpen(false);
      fetchData();
    } catch (err: any) {
      toast.error('Error al actualizar perfil: ' + err.message);
    }
  };

  const handleUpdateRole = async (profileId: string, currentRole: string) => {
    try {
      const newRole = currentRole?.toLowerCase() === 'admin' ? 'asesora' : 'admin';
      const { data, error } = await supabase
        .from('profiles')
        .update({ rol: newRole })
        .eq('id', profileId)
        .select();
        
      if (error) throw error;
      if (!data || data.length === 0) throw new Error('No se pudo actualizar el registro (Registro no encontrado o bloqueado por RLS)');
      
      toast.success(`Rol cambiado a ${newRole.toUpperCase()} correctamente`);
      setActiveDropdown(null);
      fetchData();
    } catch (err: any) {
      toast.error('Error al cambiar rol: ' + err.message);
    }
  };

  const handleToggleActive = async (profileId: string, currentStatus: boolean) => {
    if (!confirm(`¿Estás seguro de ${currentStatus ? 'desactivar' : 'reactivar'} este usuario?`)) return;
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ activo: !currentStatus })
        .eq('id', profileId)
        .select();
        
      if (error) throw error;
      if (!data || data.length === 0) throw new Error(`No se pudo ${currentStatus ? 'desactivar' : 'reactivar'} el usuario (Registro no encontrado o bloqueado)`);
      
      toast.success(`Usuario ${currentStatus ? 'desactivado' : 'reactivado'} lógicamente con éxito.`);
      setActiveDropdown(null);
      fetchData();
    } catch (err: any) {
      toast.error(`Error al ${currentStatus ? 'desactivar' : 'reactivar'} usuario: ` + err.message);
    }
  };

  const filteredUsers = users.filter(u => {
    const nameStr = (u.nombre || '').toLowerCase();
    const roleStr = (u.rol || 'asesora').toLowerCase();
    const searchStr = searchTerm.toLowerCase();
    return nameStr.includes(searchStr) || roleStr.includes(searchStr);
  });

  if (!loading && userRole && userRole !== 'admin') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 p-4">
        <Shield className="w-16 h-16 text-rose-500 mb-4" />
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
      
      <Sidebar user={user} handleLogout={handleLogout} activePage="users" />

      <div className="flex-1 overflow-y-auto">
        {/* Header */}
        <header className="bg-white border-b px-8 py-6 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard" 
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-gray-500"
            >
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                <Users className="w-7 h-7 text-rose-500" />
                Gestión de Usuarios
              </h1>
              <p className="text-gray-400 text-sm font-medium">Control de accesos y roles del equipo</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text"
                placeholder="Buscar por nombre o rol..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2.5 bg-gray-100 border-none rounded-xl text-sm w-64 focus:ring-2 focus:ring-rose-500 transition-all outline-none"
              />
            </div>
            <button 
              onClick={() => setIsModalOpen(true)}
              className="bg-rose-500 hover:bg-rose-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg shadow-rose-100"
            >
              <UserPlus className="w-5 h-5" /> Crear Nueva Asesora
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-10">
        
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-[2.5rem] shadow-sm border border-gray-100">
             <Loader2 className="w-12 h-12 animate-spin text-rose-500 mb-4" />
             <p className="text-gray-400 font-bold uppercase tracking-widest text-xs">Cargando Personal...</p>
          </div>
        ) : (
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Usuario / Nombre</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Sede</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400">Rol</th>
                    <th className="px-8 py-5 text-[10px] font-black uppercase tracking-widest text-gray-400 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredUsers.length > 0 ? filteredUsers.map((user) => (
                    <tr key={user.id} className={`hover:bg-rose-50/30 transition-colors group ${user.activo === false ? 'opacity-50 grayscale-[0.2]' : ''}`}>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${user.rol === 'admin' ? 'bg-rose-100 text-rose-600' : 'bg-gray-100 text-gray-600'}`}>
                            {(user.nombre || 'S').charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-bold text-gray-800 flex items-center gap-2">
                              {user.nombre || 'Sin nombre'}
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${
                                user.activo === false ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                              }`}>
                                {user.activo === false ? 'INACTIVO' : 'ACTIVO'}
                              </span>
                            </p>
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <Mail className="w-3 h-3" /> {user.email || 'Sin correo'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-2 text-gray-600 font-medium">
                          <MapPin className="w-4 h-4 text-gray-400" />
                          {user.sede_id ? 'Sede Asignada' : 'Global / Sin sede'}
                        </div>
                      </td>
                      <td className="px-8 py-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
                          user.rol?.toLowerCase() === 'admin' ? 'bg-rose-100 text-rose-600' : 
                          user.rol?.toLowerCase() === 'inactivo' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {user.rol || 'asesora'}
                        </span>
                      </td>
                      <td className="px-8 py-6 text-right relative">
                        <button 
                          onClick={() => setActiveDropdown(activeDropdown === user.id ? null : user.id)}
                          className="p-2 text-gray-300 hover:text-gray-600 hover:bg-white rounded-lg transition-all"
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                        {activeDropdown === user.id && (
                          <div className="absolute right-12 top-10 w-48 bg-white border border-gray-100 shadow-xl rounded-2xl p-2 z-50 text-left">
                            <button onClick={() => handleEditOpen(user)} className="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">Editar Perfil</button>
                            <button onClick={() => handleUpdateRole(user.id, user.rol)} className="w-full text-left px-4 py-2 text-xs font-bold text-gray-700 hover:bg-gray-50 rounded-xl transition-colors">Cambiar Rol</button>
                            <div className="h-px bg-gray-100 my-1"></div>
                            <button onClick={() => handleToggleActive(user.id, user.activo !== false)} className={`w-full text-left px-4 py-2 text-xs font-bold rounded-xl transition-colors ${user.activo === false ? 'text-emerald-600 hover:bg-emerald-50' : 'text-rose-600 hover:bg-rose-50'}`}>
                              {user.activo === false ? 'Reactivar Usuario' : 'Desactivar Usuario'}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center">
                        <p className="text-gray-400 font-medium italic">No se encontraron usuarios.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Modal de Creación Directa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in duration-300 relative">
            <button 
              onClick={() => setIsModalOpen(false)}
              className="absolute top-8 right-8 p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"
            >
              <XCircle className="w-6 h-6" />
            </button>

            <div className="mb-8">
              <h2 className="text-2xl font-black text-gray-900 flex items-center gap-3">
                <UserPlus className="w-7 h-7 text-rose-500" />
                Crear Nueva Asesora
              </h2>
              <p className="text-gray-500 font-medium mt-1">El usuario se activará de inmediato con la clave asignada.</p>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Nombre Completo</label>
                  <input 
                    required
                    type="text"
                    placeholder="Ej: Laura Rodriguez"
                    value={formData.nombre}
                    onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Contraseña Inicial</label>
                  <input 
                    required
                    type="password"
                    placeholder="Min. 6 caracteres"
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Correo Electrónico</label>
                <input 
                  required
                  type="email"
                  placeholder="asesora@ambarcouture.com"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Sede Asignada</label>
                  <select 
                    required
                    value={formData.sede_id}
                    onChange={(e) => setFormData({...formData, sede_id: e.target.value})}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800 appearance-none"
                  >
                    <option value="">Seleccionar...</option>
                    {sedes.map(s => (
                      <option key={s.id} value={s.id}>{s.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Rol de Usuario</label>
                  <select 
                    value={formData.rol}
                    onChange={(e) => setFormData({...formData, rol: e.target.value})}
                    className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800 appearance-none"
                  >
                    <option value="asesora">Asesora (Limitado)</option>
                    <option value="admin">Admin (Full)</option>
                  </select>
                </div>
              </div>

              <div className="pt-4">
                <button 
                  disabled={createModalLoading}
                  className="w-full py-5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-[1.5rem] shadow-xl shadow-rose-200 transition-all flex items-center justify-center gap-3 active:scale-95 disabled:opacity-50"
                >
                  {createModalLoading ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-6 h-6" />
                      CREAR USUARIO AHORA
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal de Edición de Perfil */}
      {editModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[3rem] w-full max-w-lg p-10 shadow-2xl animate-in zoom-in duration-300 relative">
             <button 
               onClick={() => setEditModalOpen(false)}
               className="absolute top-8 right-8 p-2 hover:bg-gray-100 rounded-xl text-gray-400 transition-colors"
             >
               <XCircle className="w-6 h-6" />
             </button>
             <h2 className="text-2xl font-black text-gray-900 mb-6">Editar Perfil</h2>
             <form onSubmit={handleEditSubmit} className="space-y-4">
               <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Nombre Completo</label>
                  <input type="text" value={editFormData.nombre} onChange={e => setEditFormData({...editFormData, nombre: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800" required />
               </div>
               <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Correo Electrónico</label>
                  <input type="email" value={editFormData.email} onChange={e => setEditFormData({...editFormData, email: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800" required />
               </div>
               <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-gray-400 mb-2">Sede Asignada</label>
                  <select value={editFormData.sede_id} onChange={e => setEditFormData({...editFormData, sede_id: e.target.value})} className="w-full px-5 py-4 bg-gray-50 border-2 border-transparent focus:border-rose-500 focus:bg-white rounded-2xl outline-none transition-all font-bold text-gray-800 appearance-none">
                    <option value="">Global / Sin Sede</option>
                    {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                  </select>
               </div>
               <div className="pt-4">
                 <button type="submit" className="w-full py-5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-[1.5rem] shadow-xl shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-3">
                    GUARDAR CAMBIOS
                 </button>
               </div>
             </form>
          </div>
        </div>
      )}
        </main>
      </div>
    </div>
  );
}
