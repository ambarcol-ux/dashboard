'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Search, Package, MapPin, ArrowLeftRight, Loader2, 
  Trash2, Plus, Filter, LayoutGrid, List as ListIcon, CheckCircle2, ChevronLeft, ShieldAlert, ChevronDown
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import Link from 'next/link';
import Sidebar from '@/components/Sidebar';

export default function InventoryPage() {
  const [loading, setLoading] = useState(true);
  const [vestidos, setVestidos] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingId, setUpdatingId] = useState<string | number | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('table');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newDress, setNewDress] = useState({
    codigo: '',
    nombre: '',
    categoria: 'XV',
    talla: '',
    color: '',
    sede_actual_id: ''
  });
  const [user, setUser] = useState<any>(null);
  const [sedeFilter, setSedeFilter] = useState<string>(''); // Filtro por Sede Principal
  const [editState, setEditState] = useState<Record<number, any>>({}); // Estado local de edición por vestidoid

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();
        setUser({ ...user, role: profile?.rol, nombre: profile?.nombre });
      }
    };
    checkUser();
    loadData();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleAddDress = async () => {
    if (!newDress.codigo || !newDress.sede_actual_id) {
       toast.error('Código y Sede Base son obligatorios');
       return;
    }
    setSaving(true);
    try {
      // 0. Alerta de Duplicidad en la misma Sede
      const { data: duplicate } = await supabase
        .from('vestidos')
        .select('id')
        .eq('codigo', newDress.codigo)
        .eq('sede_actual_id', newDress.sede_actual_id)
        .maybeSingle();

      if (duplicate) {
        toast.warning(`⚠️ El código ${newDress.codigo} ya existe en esta sede. Se registrará una nueva unidad con el mismo código.`);
      }

      // 1. Mapeo Quirúrgico: Solo enviamos lo que el usuario confirmó
      const insertData = {
        codigo: newDress.codigo,
        nombre: newDress.nombre,
        talla: newDress.talla,
        color: newDress.color,
        sede_principal_id: newDress.sede_actual_id,
        sede_actual_id: newDress.sede_actual_id,
        estado: 'Disponible'
      };
      
      const { error } = await supabase
        .from('vestidos')
        .insert([insertData]);
      
      if (error) throw error;
      toast.success('Vestido registrado correctamente 💎');
      
      setIsModalOpen(false);
      setNewDress({ 
        codigo: '', 
        nombre: '', 
        categoria: 'XV', 
        talla: '', 
        color: '', 
        sede_actual_id: '' 
      });
      loadData();
    } catch (err: any) {
      console.error('Error detallado de DB:', err.message, err.details, err.hint);
      toast.error('Error al registrar: ' + (err.message || 'Error desconocido'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeBajaVestido = async (id: number, codigo: string) => {
    const motivo = confirm(`¿Dar de BAJA el vestido ${codigo} por DAÑO? OK para DAÑO, Cancelar para VENTA.`);
    const nuevoEstado = motivo ? 'Dañado/Baja' : 'Vendido';
    
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('vestidos')
        .update({ estado: nuevoEstado })
        .eq('id', id);
      
      if (error) throw error;
      toast.success(`Vestido marcado como ${nuevoEstado} 💎`);
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al dar de baja: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const loadData = async () => {
    setLoading(true);
    let sData: any[] = [];
    let vData: any[] = [];

    // 1. FETCH SEDES (ULTRA SIMPLE - MINUSCULAS)
    try {
      const { data, error } = await supabase
        .from('sedes')
        .select('id, nombre');
      
      if (error) {
        console.error('Error Sedes detallado:', JSON.stringify(error, null, 2));
      } else {
        sData = data || [];
        console.log('Sedes cargadas OK:', sData);
      }
    } catch (err) {
      console.error('Crash Sedes:', JSON.stringify(err, null, 2));
    }

    // 2. FETCH VESTIDOS
    try {
      const { data, error } = await supabase
        .from('vestidos')
        .select('id, codigo, nombre, talla, color, sede_principal_id, sede_actual_id, estado, precio_sugerido, stock_total')
        .order('codigo', { ascending: true });
      
      if (error) {
        console.error('Error Vestidos detallado:', JSON.stringify(error, null, 2));
      } else {
        vData = data || [];
      }
    } catch (err) {
      console.error('Crash Vestidos:', JSON.stringify(err, null, 2));
    }

    // 3. MAPPING & STATE
    const mapped = vData.map(v => ({
      ...v,
      sede: sData.find(s => s.id === v.sede_actual_id) || null
    }));

    setSedes(sData);
    setVestidos(mapped);
    setLoading(false);
  };

  const handleEditChange = (id: number, field: string, value: any) => {
    setEditState(prev => ({
      ...prev,
      [id]: { 
        ...(prev[id] || {}), 
        [field]: field === 'precio_sugerido' || field === 'stock_total' ? Number(value) : value 
      }
    }));
  };

  const handleSaveVestido = async (id: number) => {
    const changes = editState[id];
    if (!changes) return;

    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('vestidos')
        .update(changes)
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Cambios guardados con éxito 💎');
      
      // Limpiar estado de edición para esta fila y recargar
      setEditState(prev => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleTransfer = async (v: any, newSedeId: string) => {
    if (!newSedeId || newSedeId === v.sede_actual_id) return;
    
    setUpdatingId(v.id);
    try {
      // 1. Insertar en traslados_bitacora
      const { error: bitacoraError } = await supabase
        .from('traslados_bitacora')
        .insert({
          vestido_id: v.id,
          sede_origen_id: v.sede_actual_id,
          sede_destino_id: newSedeId,
          motivo: 'Traslado de inventario por baja rotación',
          usuario_id: user?.id
        });
      
      if (bitacoraError) throw bitacoraError;

      // 2. Actualizar vestido (sede_principal y sede_actual)
      const { error: dressError } = await supabase
        .from('vestidos')
        .update({ 
          sede_principal_id: newSedeId,
          sede_actual_id: newSedeId,
          estado: 'Disponible' // Al trasladar vuelve a estar disponible en sede
        })
        .eq('id', v.id);
      
      if (dressError) throw dressError;

      toast.success('Traslado registrado en historial y completado con éxito 💎');
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al procesar traslado: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteVestido = async (id: number, codigo: string) => {
    if (!confirm(`¿Estás seguro de eliminar el vestido ${codigo}? Esta acción no se puede deshacer.`)) return;
    
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('vestidos')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      toast.success('Vestido eliminado del inventario 🔥');
      loadData();
    } catch (err: any) {
      console.error(err);
      toast.error('Error al borrar: ' + err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  const filtered = vestidos.filter(v => {
    const searchMatch = 
      (v.codigo || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (v.categoria && v.categoria.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (v.nombre && v.nombre.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const sedeMatch = sedeFilter === '' || v.sede_principal_id === sedeFilter;
    
    return searchMatch && sedeMatch;
  });

  if (loading && vestidos.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Toaster position="top-right" richColors />
      
      <Sidebar user={user} handleLogout={handleLogout} activePage="inventory" />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard" 
              className="p-3 bg-white text-gray-400 hover:text-rose-500 rounded-2xl border border-gray-100 shadow-sm transition-all active:scale-95 group"
            >
              <ChevronLeft className="w-6 h-6 group-hover:-translate-x-1 transition-transform" />
            </Link>
            <div>
              <h1 className="text-3xl font-black text-gray-900 flex items-center gap-3 tracking-tight">
                <Package className="w-8 h-8 text-rose-500" /> LOGÍSTICA DE VESTIDOS
              </h1>
              <p className="text-gray-500 font-bold text-sm mt-1 uppercase tracking-widest">Inventory & Transfer Control</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
             <Link href="/dashboard" className="p-3 bg-white text-gray-400 hover:text-gray-600 rounded-2xl border border-gray-100 shadow-sm transition-all active:scale-95">
               <ArrowLeftRight className="w-5 h-5 rotate-90" />
             </Link>
             <div className="flex items-center gap-2 bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
              <button 
                onClick={() => setViewMode('table')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'table' ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <ListIcon className="w-5 h-5" />
              </button>
              <button 
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-xl transition-all ${viewMode === 'grid' ? 'bg-rose-500 text-white shadow-lg shadow-rose-100' : 'text-gray-400 hover:bg-gray-50'}`}
              >
                <LayoutGrid className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>

        {/* Filters & Actions */}
        <div className="bg-white p-4 rounded-[2rem] shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input 
              type="text" 
              placeholder="Buscar por código, nombre o categoría..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 transition-all"
            />
          </div>

          <div className="w-full md:w-64">
            <select 
              className="w-full px-4 py-4 bg-gray-50 border-none rounded-2xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none transition-all"
              value={sedeFilter}
              onChange={(e) => setSedeFilter(e.target.value)}
            >
              <option value="">🏠 Todas las Sedes</option>
              {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
             <div className="px-6 py-4 bg-gray-50 rounded-2xl text-gray-400 font-black text-[10px] uppercase tracking-widest border border-gray-100 italic">
               TOTAL STOCK: {filtered.length}
             </div>
             <button 
               onClick={() => {
                 loadData(); // Force database read
                 setIsModalOpen(true);
               }}
               className="flex-1 md:flex-none px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-2"
             >
               <Plus className="w-4 h-4" /> Nuevo Vestido
             </button>
          </div>
        </div>

        {/* Modal Nuevo Vestido */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="bg-white w-full max-w-xl rounded-[3rem] shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="bg-rose-500 p-8 text-center relative">
                 <h2 className="text-2xl font-black text-white tracking-tight uppercase">Registrar Prenda V2</h2>
                 <p className="text-rose-100 text-[10px] font-bold uppercase tracking-widest mt-1">Conexión Directa con Sedes</p>
                 <button onClick={() => setIsModalOpen(false)} className="absolute top-6 right-6 text-white/80 hover:text-white transition-colors">
                   <Trash2 className="w-6 h-6 rotate-45" />
                 </button>
              </div>
              
              <div className="p-10 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Código de Referencia</label>
                    <input 
                      type="text" 
                      placeholder="Ej: BOG-2024-001"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none uppercase"
                      value={newDress.codigo}
                      onChange={(e) => setNewDress({...newDress, codigo: e.target.value.toUpperCase()})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Clasificación</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.categoria}
                      onChange={(e) => setNewDress({...newDress, categoria: e.target.value})}
                    >
                      <option value="XV">XV Años</option>
                      <option value="Gala">Gala</option>
                      <option value="Novia">Novia</option>
                      <option value="Cambio">Vestido de Cambio</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Nombre / Descripción Simple</label>
                  <input 
                    type="text" 
                    placeholder="Ej: Vestido Rosado con Pedrería"
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                    value={newDress.nombre}
                    onChange={(e) => setNewDress({...newDress, nombre: e.target.value})}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Talla</label>
                    <input 
                      type="text" 
                      placeholder="Ej: S, 8, M"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none uppercase"
                      value={newDress.talla}
                      onChange={(e) => setNewDress({...newDress, talla: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Color</label>
                    <input 
                      type="text" 
                      placeholder="Ej: Rose Gold"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.color}
                      onChange={(e) => setNewDress({...newDress, color: e.target.value})}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Sede Base</label>
                    <select 
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-rose-200 font-bold text-gray-700 outline-none"
                      value={newDress.sede_actual_id}
                      onChange={(e) => setNewDress({...newDress, sede_actual_id: e.target.value})}
                    >
                      <option value="">Selecciona...</option>
                      {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                    </select>
                  </div>
                </div>

                <button 
                  onClick={handleAddDress}
                  disabled={saving || !newDress.codigo || !newDress.sede_actual_id}
                  className="w-full py-5 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl shadow-rose-100 transition-all active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 mt-4"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  GUARDAR EN INVENTARIO
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Content */}
        {viewMode === 'table' ? (
          <div className="bg-white rounded-[2.5rem] shadow-xl border border-gray-100 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50/50 border-b border-gray-100">
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Prenda</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Atributos</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Precio Sugerido</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Stock</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Ubicación / Logística</th>
                    <th className="px-6 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtered.map((v) => (
                    <tr key={v.id} className="hover:bg-rose-50/30 transition-colors group">
                      <td className="px-8 py-6">
                        <div className="flex items-center gap-4">
                          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black shadow-sm shrink-0 ${
                            v.estado === 'De Baja' ? 'bg-rose-600 text-white rotate-0' :
                            v.estado === 'Traslado' ? 'bg-amber-100 text-amber-600 animate-pulse' : 
                            'bg-rose-100 text-rose-500'
                          }`}>
                            {v.estado === 'De Baja' ? 'X' : v.codigo.substring(0, 2)}
                          </div>
                          <div>
                            <div className="font-black text-gray-900 text-base tracking-tighter uppercase leading-none mb-1">{v.codigo}</div>
                            <input 
                              type="text"
                              value={editState[v.id]?.nombre !== undefined ? editState[v.id].nombre : (v.nombre || '')}
                              onChange={(e) => handleEditChange(v.id, 'nombre', e.target.value)}
                              className="text-[10px] text-gray-700 bg-gray-50 border border-transparent hover:border-gray-200 focus:bg-white focus:border-rose-300 w-full rounded-md px-1 py-0.5 font-bold uppercase tracking-widest transition-all outline-none"
                              placeholder="Sin nombre"
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6">
                         <div className="flex flex-wrap gap-1.5 items-center">
                            <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[9px] font-black uppercase tracking-tighter border border-gray-200">
                              {v.categoria || 'N/A'}
                            </span>
                            <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[9px] font-black uppercase tracking-tighter border border-indigo-100">
                              {v.talla || 'ÚNICA'}
                            </span>
                            <span className="px-2 py-0.5 bg-rose-50 text-rose-600 rounded text-[9px] font-black uppercase tracking-tighter border border-rose-100">
                              {v.color || 'ST'}
                            </span>
                         </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                        <div className="flex items-center justify-center gap-1 border border-gray-200 bg-white rounded-lg px-2 overflow-hidden focus-within:ring-2 focus-within:ring-rose-200 transition-all text-sm w-32 mx-auto">
                          <span className="text-gray-400 font-bold">$</span>
                          <input 
                            type="number"
                            className="bg-transparent w-full py-2 text-gray-700 font-bold text-center outline-none"
                            value={editState[v.id]?.precio_sugerido !== undefined ? editState[v.id].precio_sugerido : (v.precio_sugerido || 0)}
                            onChange={(e) => handleEditChange(v.id, 'precio_sugerido', e.target.value)}
                            placeholder="0"
                          />
                        </div>
                      </td>
                      <td className="px-6 py-6 text-center">
                         <div className="w-16 mx-auto">
                            <input 
                              type="number"
                              min="0"
                              className="w-full bg-white border border-gray-200 rounded-lg px-2 py-2 text-center text-sm font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200"
                              value={editState[v.id]?.stock_total !== undefined ? editState[v.id].stock_total : (v.stock_total || 0)}
                              onChange={(e) => handleEditChange(v.id, 'stock_total', e.target.value)}
                            />
                         </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex flex-col gap-2">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Sede Actual</label>
                          <div className="relative group/select">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-rose-400 z-10" />
                            <select 
                              className="w-full bg-white border border-gray-200 hover:border-rose-300 rounded-xl pl-8 pr-10 py-2.5 text-[10px] font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200 transition-all cursor-pointer appearance-none shadow-sm hover:bg-rose-50/50"
                              value={v.sede_actual_id || ''}
                              disabled={updatingId === v.id}
                              onChange={(e) => {
                                if (window.confirm(`¿Confirmar traslado de ${v.codigo} a la sede seleccionada?`)) {
                                  handleTransfer(v, e.target.value);
                                }
                              }}
                            >
                               {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 group-hover/select:text-rose-500 transition-colors pointer-events-none" />
                          </div>
                          <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border text-center ${
                            v.estado === 'De Baja' || v.estado === 'Dañado/Baja'
                            ? 'bg-rose-600 text-white border-rose-700 shadow-sm'
                            : v.estado === 'Vendido'
                            ? 'bg-gray-800 text-white border-gray-900'
                            : v.estado === 'Traslado' 
                            ? 'bg-amber-100 text-amber-700 border-amber-200' 
                            : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                          }`}>
                            {v.estado === 'De Baja' ? '⛔ DE BAJA' : (v.estado || 'Disponible')}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center justify-center gap-2">
                          <button 
                            onClick={() => handleSaveVestido(v.id)}
                            disabled={!editState[v.id] || updatingId === v.id}
                            className="p-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white rounded-xl shadow-lg shadow-blue-100 transition-all active:scale-95 group"
                            title="Guardar Cambios"
                          >
                            {updatingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                          </button>
                          <button 
                            onClick={() => handleDeleteVestido(v.id, v.codigo)}
                            disabled={updatingId === v.id}
                            className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-all active:scale-95 group"
                            title="Eliminar del Sistema"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                          {user?.role === 'admin' && (
                            <button 
                              onClick={() => handleDeBajaVestido(v.id, v.codigo)}
                              disabled={updatingId === v.id || v.estado === 'Vendido' || v.estado === 'Dañado/Baja'}
                              className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition-all active:scale-95 group"
                              title="Dar de Baja (Venta/Daño)"
                            >
                              <ShieldAlert className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-8 py-20 text-center">
                        <Package className="w-16 h-16 text-gray-100 mx-auto mb-4" />
                        <p className="text-gray-400 font-bold">No se encontraron vestidos en el inventario.</p>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filtered.map((v) => (
              <div key={v.id} className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-gray-100 hover:shadow-xl hover:scale-[1.02] transition-all group">
                <div className="flex justify-between items-start mb-4">
                  <div className="w-14 h-14 bg-rose-100 text-rose-500 rounded-3xl flex items-center justify-center text-xl font-black shadow-inner rotate-3 group-hover:rotate-0 transition-transform">
                    {v.codigo?.substring(0, 2) || '??'}
                  </div>
                  <span className="text-[10px] font-black tracking-widest text-gray-300 uppercase">STOCK</span>
                </div>
                <h3 className="text-xl font-black text-gray-900 tracking-tighter uppercase mb-1">{v.codigo}</h3>
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-6 italic">{v.categoria || 'Sin Clasificar'}</p>
                
                <div className="space-y-4 pt-4 border-t border-gray-50">
                  {v.estado === 'De Baja' && (
                    <div className="bg-rose-600 text-white p-3 rounded-2xl mb-2 text-center animate-pulse">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em]">⚠️ FUERA DE SERVICIO</p>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 pb-4">
                     <div>
                       <span className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Stock</span>
                       <input 
                         type="number"
                         className="w-full bg-gray-50 border border-gray-100 rounded-lg px-3 py-2 text-center text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200"
                         value={editState[v.id]?.stock_total !== undefined ? editState[v.id].stock_total : (v.stock_total || 0)}
                         onChange={(e) => handleEditChange(v.id, 'stock_total', e.target.value)}
                       />
                     </div>
                     <div>
                       <span className="block text-[9px] text-gray-400 font-bold uppercase mb-1">Precio Sugerido</span>
                       <div className="flex items-center gap-1 bg-gray-50 border border-gray-100 rounded-lg px-2 overflow-hidden focus-within:ring-2 focus-within:ring-rose-200">
                          <span className="text-gray-400 text-xs font-bold">$</span>
                          <input 
                            type="number"
                            className="w-full text-xs font-black text-gray-700 bg-transparent py-2 outline-none"
                            value={editState[v.id]?.precio_sugerido !== undefined ? editState[v.id].precio_sugerido : (v.precio_sugerido || 0)}
                            onChange={(e) => handleEditChange(v.id, 'precio_sugerido', e.target.value)}
                          />
                       </div>
                     </div>
                  </div>

                  <div className="space-y-2 pt-4 border-t border-gray-50">
                      <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Sede / Ubicación</label>
                      <div className="relative group/select">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-rose-400 z-10" />
                        <select 
                          className="w-full bg-white border border-gray-200 hover:border-rose-300 rounded-xl pl-10 pr-12 py-3 text-xs font-black text-gray-700 outline-none focus:ring-2 focus:ring-rose-200 transition-all cursor-pointer appearance-none shadow-sm hover:bg-rose-50/50"
                          value={v.sede_actual_id || ''}
                          disabled={updatingId === v.id}
                          onChange={(e) => {
                            if (window.confirm(`¿Confirmar traslado de ${v.codigo} a la sede seleccionada?`)) {
                              handleTransfer(v, e.target.value);
                            }
                          }}
                        >
                           {sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
                        </select>
                        <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-hover/select:text-rose-500 transition-colors pointer-events-none" />
                      </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-6">
                    <button 
                      onClick={() => handleSaveVestido(v.id)}
                      disabled={!editState[v.id] || updatingId === v.id}
                      className="flex-1 py-3 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-100 transition-all flex items-center justify-center gap-2"
                    >
                      {updatingId === v.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      GUARDAR
                    </button>
                    <button 
                      onClick={() => handleDeleteVestido(v.id, v.codigo)}
                      disabled={updatingId === v.id}
                      className="p-3 bg-rose-50 hover:bg-rose-100 text-rose-500 rounded-xl transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {user?.role === 'admin' && (
                      <button 
                        onClick={() => handleDeBajaVestido(v.id, v.codigo)}
                        disabled={updatingId === v.id || v.estado === 'Vendido' || v.estado === 'Dañado/Baja'}
                        className="p-3 bg-orange-50 hover:bg-orange-100 text-orange-600 rounded-xl transition-all"
                        title="Dar de Baja"
                      >
                        <ShieldAlert className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        </div>
      </main>
    </div>
  );
}
