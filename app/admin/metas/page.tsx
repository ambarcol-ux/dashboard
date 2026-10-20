'use client';
import SalesGoals from '@/components/metas/SalesGoals';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Toaster, toast } from 'sonner';
import { 
  Target, TrendingUp, Calendar, Plus, X, Loader2, 
  Store, User as UserIcon, Award, Star, TrendingDown,
  ChevronLeft, ChevronRight, MoreVertical, AlertTriangle
} from 'lucide-react';
import Sidebar from '@/components/Sidebar';

const normName = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
const sameName = (a: unknown, b: unknown) => !!normName(a) && normName(a) === normName(b);

export default function MetasPage() {
  const readAccess = useVerifiedAccess();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [metas, setMetas] = useState<any[]>([]);
  const [sedes, setSedes] = useState<any[]>([]);
  const [asesoras, setAsesoras] = useState<any[]>([]);
  
  // Filters
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalLoading, setModalLoading] = useState(false);
  const [newMeta, setNewMeta] = useState({
    tipo: 'Sede',
    nombre: '',
    monto_objetivo: '',
    mes: new Date().getMonth() + 1,
    anio: new Date().getFullYear()
  });

  // Edit & Delete State
  const [editingMeta, setEditingMeta] = useState<any>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingMetaId, setDeletingMetaId] = useState<string | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const isAdmin = String(user?.rol || '').toLowerCase() === 'admin';
  const metasAsesora = metas.filter(m => String(m.tipo || '').toLowerCase() !== 'sede');

  const months = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];

  useEffect(() => {
    const checkUser = async () => {
      const {user, profile} = await readAccess();
      if (user) {
        setUser({ ...user, rol: profile?.rol, nombre: profile?.nombre, sede_id: profile?.sede_id ?? null });
      }
      setLoading(false);
    };
    void checkUser().catch(() => {window.location.href='/login';});
    fetchSupportData();
  }, []);

  useEffect(() => {
    fetchMetasWithPerformance();
  }, [selectedMonth, selectedYear]);

  const fetchSupportData = async () => {
    const { data: sedesData } = await supabase.from('sedes').select('id, nombre, activo');
    const { data: asesorasData } = await supabase.from('asesoras').select('id, nombre_completo, profile_id, activo');
    setSedes(sedesData || []);
    setAsesoras(asesorasData || []);
  };

  const fetchMetasWithPerformance = async () => {
    setLoading(true);
    try {
      // Every active site gets its monthly goal ($50.000.000) automatically when missing.
      await supabase.rpc('asegurar_metas_mes', { p_mes: selectedMonth, p_anio: selectedYear });

      // 1. Fetch Metas, Sedes, and Asesoras in parallel
      const [metasRes, sedesRes, asesorasRes] = await Promise.all([
        supabase
          .from('metas')
          .select('*')
          .eq('mes', selectedMonth)
          .eq('anio', selectedYear),
        supabase
          .from('sedes')
          .select('id, nombre, activo'),
        supabase
          .from('asesoras')
          .select('id, nombre_completo, profile_id, activo')
      ]);

      if (metasRes.error) throw metasRes.error;
      if (sedesRes.error) throw sedesRes.error;
      if (asesorasRes.error) throw asesorasRes.error;

      const metasData = metasRes.data || [];
      const currentSedes = sedesRes.data || [];
      const currentAsesoras = asesorasRes.data || [];

      // Update state for sedes and asesoras to ensure consistency
      setSedes(currentSedes);
      setAsesoras(currentAsesoras);

      // 2. Fetch Payments (Recaudo Real) for this period to calculate performance
      // For pagos, fecha_pago is usually YYYY-MM-DD
      const firstDay = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(selectedYear, selectedMonth, 0).toISOString().split('T')[0];

      const { data: pagos, error: pagosError } = await supabase
        .from('pagos')
        .select('valor_pagado, fecha_pago, contratos!inner(sede_id, asesora_id, estado, sede, asesora)')
        .gte('fecha_pago', firstDay)
        .lte('fecha_pago', lastDay);

      if (pagosError) throw pagosError;

      // Filter out payments belonging to cancelled/voided contracts just in case
      const validPagos = (pagos || []).filter((p: any) => {
        const estado = p.contratos?.estado?.toLowerCase() || '';
        return !['cancelado', 'borrador', 'anulado'].includes(estado);
      });

      // 3. Process achievement based on real collected payments
      const processedMetas = (metasData || []).map(meta => {
        const achieved = validPagos.reduce((acc, pago: any) => {
          const contrato = pago.contratos;
          if (!contrato) return acc;
          
          let match = false;
          if (meta.tipo?.toLowerCase() === 'sede') {
            const matchedSede = currentSedes.find(s => s.id === meta.identificador_id) || currentSedes.find(s => sameName(s.nombre, meta.nombre_objetivo));
            if (matchedSede) {
              match = contrato.sede_id === matchedSede.id;
            } else {
              match = sameName(contrato.sede, meta.nombre_objetivo);
            }
          } else {
            const matchedAsesora = currentAsesoras.find(a => a.nombre_completo?.toLowerCase() === meta.nombre_objetivo?.toLowerCase());
            if (matchedAsesora) {
              if (matchedAsesora.profile_id) {
                const matchingAsesoraIds = currentAsesoras
                  .filter(a => a.profile_id === matchedAsesora.profile_id)
                  .map(a => a.id);
                match = matchingAsesoraIds.includes(contrato.asesora_id);
              } else {
                match = contrato.asesora_id === matchedAsesora.id || contrato.asesora?.toLowerCase() === meta.nombre_objetivo?.toLowerCase();
              }
            } else {
              match = contrato.asesora?.toLowerCase() === meta.nombre_objetivo?.toLowerCase();
            }
          }
          return match ? acc + Number(pago.valor_pagado || 0) : acc;
        }, 0);

        const progress = Math.min(Math.round((achieved / (meta.monto_meta || 1)) * 100), 200); // UI limit at 200%
        
        return { ...meta, monto_alcanzado: achieved, progress };
      });

      setMetas(processedMetas);
    } catch (err) {
      console.error('Error fetching metas:', err);
      toast.error('Error al cargar las metas');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateMeta = async () => {
    if (!newMeta.nombre || !newMeta.monto_objetivo) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    setModalLoading(true);
    try {
      const payload = {
        tipo: newMeta.tipo.toLowerCase(),
        nombre_objetivo: newMeta.nombre,
        monto_meta: Number(newMeta.monto_objetivo),
        mes: Number(newMeta.mes),
        anio: Number(newMeta.anio)
      };

      console.log('Payload de Meta:', payload);

      const { error } = await supabase
        .from('metas')
        .insert([payload]);

      if (error) throw error;

      toast.success('Meta configurada correctamente');
      setIsModalOpen(false);
      fetchMetasWithPerformance();
    } catch (err: any) {
      toast.error('Error al crear la meta: ' + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleEditMeta = async () => {
    if (!editingMeta || !editingMeta.monto_meta) {
      toast.error('El monto es requerido');
      return;
    }
    setModalLoading(true);
    try {
      const { error } = await supabase
        .from('metas')
        .update({
          monto_meta: Number(editingMeta.monto_meta),
          nombre_objetivo: editingMeta.nombre_objetivo
        })
        .eq('id', editingMeta.id);

      if (error) throw error;
      toast.success('Meta actualizada correctamente');
      setIsEditModalOpen(false);
      setEditingMeta(null);
      fetchMetasWithPerformance();
    } catch (err: any) {
      toast.error('Error al editar: ' + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteMeta = async () => {
    if (!deletingMetaId) return;
    setModalLoading(true);
    try {
      const { error } = await supabase
        .from('metas')
        .delete()
        .eq('id', deletingMetaId);

      if (error) throw error;
      toast.success('Meta eliminada correctamente');
      setIsDeleteModalOpen(false);
      setDeletingMetaId(null);
      fetchMetasWithPerformance();
    } catch (err: any) {
      toast.error('Error al eliminar: ' + err.message);
    } finally {
      setModalLoading(false);
    }
  };

  const getProgressColor = (progress: number) => {
    if (progress <= 40) return 'bg-rose-500';
    if (progress <= 80) return 'bg-amber-400';
    if (progress <= 100) return 'bg-emerald-500';
    return 'bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-500 animate-shimmer';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  if (loading && metas.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 animate-spin text-rose-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex">
      <Toaster position="top-right" richColors />
      
      <Sidebar user={user} handleLogout={handleLogout} activePage="metas" />

      <main className="flex-1 p-8 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Header & Filters */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div>
              <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                <Target className="w-8 h-8 text-rose-500" /> Metas y Ventas
              </h1>
              <p className="text-rose-500 font-bold uppercase tracking-widest text-[10px] mt-1 ml-1">Rendimiento Operativo · Ambar Couture</p>
            </div>

            <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
               <button 
                 onClick={() => {
                   if (selectedMonth === 1) {
                     setSelectedMonth(12);
                     setSelectedYear(selectedYear - 1);
                   } else {
                     setSelectedMonth(selectedMonth - 1);
                   }
                 }}
                 className="p-2 hover:bg-gray-50 rounded-xl transition-colors"
               >
                 <ChevronLeft className="w-5 h-5 text-gray-400" />
               </button>
               
               <div className="flex items-center gap-2 px-4 min-w-[160px] justify-center">
                  <Calendar className="w-4 h-4 text-rose-400" />
                  <span className="font-black text-gray-900 uppercase text-xs tracking-widest">
                    {months[selectedMonth - 1]} {selectedYear}
                  </span>
               </div>

               <button 
                 onClick={() => {
                   if (selectedMonth === 12) {
                     setSelectedMonth(1);
                     setSelectedYear(selectedYear + 1);
                   } else {
                     setSelectedMonth(selectedMonth + 1);
                   }
                 }}
                 className="p-2 hover:bg-gray-50 rounded-xl transition-colors"
               >
                 <ChevronRight className="w-5 h-5 text-gray-400" />
               </button>

               {isAdmin && <div className="h-8 w-px bg-gray-100 mx-2"></div>}

               {isAdmin && <button 
                 onClick={() => setIsModalOpen(true)}
                 className="flex items-center gap-2 px-5 py-2.5 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-xl transition-all shadow-lg shadow-rose-100 active:scale-95 text-xs uppercase"
               >
                 <Plus className="w-4 h-4" /> Meta por asesora
               </button>}
            </div>
          </div>

          {user && <SalesGoals mes={selectedMonth} anio={selectedYear} profile={{ rol: user.rol, sede_id: user.sede_id }} />}

          {metasAsesora.length > 0 && <h2 className="text-lg font-black text-gray-900 pt-4">Metas por asesora</h2>}
          {/* Grid de Metas */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {metasAsesora.map((meta) => (
              <div key={meta.id} className="bg-white rounded-[2rem] p-8 shadow-sm border border-gray-100 hover:shadow-xl hover:shadow-rose-100/30 transition-all group overflow-hidden relative">
                
                {/* Background Decoration */}
                <div className={`absolute top-0 right-0 w-32 h-32 opacity-[0.03] -translate-y-8 translate-x-8 group-hover:scale-110 transition-transform ${meta.progress > 100 ? 'text-amber-500' : 'text-gray-900'}`}>
                   {meta.tipo === 'Sede' ? <Store className="w-full h-full" /> : <UserIcon className="w-full h-full" />}
                </div>

                <div className="relative z-10 flex flex-col h-full">
                   <div className="flex justify-between items-start mb-6">
                      <div className="p-3 bg-gray-50 rounded-2xl border border-gray-100 group-hover:bg-rose-50 group-hover:border-rose-100 transition-colors">
                        {meta.tipo === 'Sede' ? <Store className="w-6 h-6 text-rose-500" /> : <UserIcon className="w-6 h-6 text-rose-500" />}
                      </div>
                      
                      <div className="flex flex-col items-end gap-2 relative">
                        {meta.progress > 100 && (
                          <div className="flex items-center gap-1 bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-[10px] font-black uppercase border border-amber-200 animate-bounce">
                             <Award className="w-3 h-3" /> Superada
                          </div>
                        )}
                        {isAdmin && <div className="relative">
                          <button 
                            onClick={() => setActiveMenuId(activeMenuId === meta.id ? null : meta.id)}
                            className="p-1 hover:bg-gray-100 rounded-lg transition-colors text-gray-400"
                          >
                            <MoreVertical className="w-5 h-5" />
                          </button>
                          
                          {activeMenuId === meta.id && (
                            <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-gray-100 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-200">
                              <button 
                                onClick={() => {
                                  setEditingMeta(meta);
                                  setIsEditModalOpen(true);
                                  setActiveMenuId(null);
                                }}
                                className="w-full text-left px-4 py-3 text-xs font-bold text-gray-700 hover:bg-gray-50 transition-colors border-b border-gray-50 flex items-center gap-2"
                              >
                                <span>✏️</span> Editar
                              </button>
                              <button 
                                onClick={() => {
                                  setDeletingMetaId(meta.id);
                                  setIsDeleteModalOpen(true);
                                  setActiveMenuId(null);
                                }}
                                className="w-full text-left px-4 py-3 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors flex items-center gap-2"
                              >
                                <span>🗑️</span> Eliminar
                              </button>
                            </div>
                          )}
                        </div>}
                      </div>
                   </div>

                   <h3 className="text-xl font-black text-gray-900 tracking-tight mb-1">{meta.nombre_objetivo}</h3>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-6">Meta de {meta.tipo}</p>

                   <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-end">
                         <div>
                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Logrado</p>
                            <p className="text-2xl font-black text-gray-900 tracking-tighter">{formatCurrency(meta.monto_alcanzado)}</p>
                         </div>
                         <div className="text-right">
                            <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Objetivo</p>
                            <p className="text-sm font-bold text-gray-500">{formatCurrency(meta.monto_meta)}</p>
                         </div>
                      </div>

                      <div className="relative pt-2">
                         <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Progreso Actual</span>
                            <span className={`text-sm font-black ${meta.progress > 100 ? 'text-amber-500' : 'text-rose-500'}`}>{meta.progress}%</span>
                         </div>
                         <div className="w-full h-3 bg-gray-100 rounded-full overflow-hidden">
                            <div 
                              className={`h-full transition-all duration-1000 ease-out flex items-center justify-end pr-1 ${getProgressColor(meta.progress)}`}
                              style={{ width: `${Math.min(meta.progress, 100)}%` }}
                            >
                               {meta.progress >= 10 && <div className="w-1 h-1 bg-white/40 rounded-full"></div>}
                            </div>
                         </div>
                         {meta.progress > 100 && (
                           <div className="absolute -bottom-2 right-0">
                              <Star className="w-4 h-4 text-amber-400 fill-amber-400 animate-pulse" />
                           </div>
                         )}
                      </div>
                   </div>

                   <div className="mt-auto pt-6 border-t border-gray-50 flex justify-between items-center text-[10px] font-black uppercase text-gray-300 tracking-widest">
                      <span>Cierre de Mes</span>
                      <div className="flex items-center gap-1">
                        {meta.progress >= 100 ? <TrendingUp className="w-3 h-3 text-emerald-400" /> : <TrendingDown className="w-3 h-3 text-rose-300" />}
                        <span>{meta.progress}% del Total</span>
                      </div>
                   </div>
                </div>
              </div>
            ))}

            {false && (
              <div className="col-span-full py-24 bg-white rounded-[3rem] border border-dashed border-gray-200 flex flex-col items-center justify-center gap-4 text-center">
                 <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center text-gray-300 mb-2">
                    <Target className="w-10 h-10" />
                 </div>
                 <h4 className="text-lg font-black text-gray-900 uppercase">Sin metas configuradas</h4>
                 <p className="text-gray-400 text-sm max-w-xs font-medium">No se han definido objetivos para {months[selectedMonth-1]} {selectedYear}.</p>
                 <button 
                  onClick={() => setIsModalOpen(true)}
                  className="mt-4 px-8 py-3 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-100 transition-all active:scale-95 text-xs uppercase"
                 >
                   Empezar ahora
                 </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* MODAL: Configuración de Meta */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-rose-100 animate-in zoom-in-95 duration-300">
              <div className="p-8">
                 <div className="flex justify-between items-center mb-6">
                    <div>
                       <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                         <span className="p-2 bg-rose-100 rounded-xl">🎯</span> Configurar Meta
                       </h2>
                       <p className="text-rose-500 text-xs font-bold uppercase tracking-widest mt-2 ml-1">Planificación de Rendimiento</p>
                    </div>
                    <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-rose-50 rounded-full transition-colors">
                       <X className="w-6 h-6 text-gray-400" />
                    </button>
                 </div>

                 <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-3 p-1 bg-gray-100 rounded-2xl">
                       <button 
                         onClick={() => setNewMeta({...newMeta, tipo: 'Sede', nombre: ''})}
                         className={`py-3 rounded-xl font-black text-[10px] uppercase transition-all ${newMeta.tipo === 'Sede' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                       >Por Sede</button>
                       <button 
                         onClick={() => setNewMeta({...newMeta, tipo: 'Asesora', nombre: ''})}
                         className={`py-3 rounded-xl font-black text-[10px] uppercase transition-all ${newMeta.tipo === 'Asesora' ? 'bg-white text-rose-500 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                       >Por Asesora</button>
                    </div>

                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
                         Seleccionar {newMeta.tipo}
                       </label>
                       <select 
                         value={newMeta.nombre}
                         onChange={(e) => setNewMeta({...newMeta, nombre: e.target.value})}
                         className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all font-bold text-gray-900 appearance-none"
                       >
                         <option value="">Selecciona una opción...</option>
                         {newMeta.tipo === 'Sede' ? (
                           sedes.filter(s => s.activo !== false).map(s => <option key={s.nombre} value={s.nombre}>{s.nombre}</option>)
                         ) : (
                           asesoras.filter(a => a.activo !== false).map(a => <option key={a.nombre_completo} value={a.nombre_completo}>{a.nombre_completo}</option>)
                         )}
                       </select>
                    </div>

                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
                         Monto Objetivo (COP)
                       </label>
                       <input 
                         type="number"
                         value={newMeta.monto_objetivo}
                         onChange={(e) => setNewMeta({...newMeta, monto_objetivo: e.target.value})}
                         placeholder="Ej: 50.000.000"
                         className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all font-bold text-gray-900"
                       />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Mes</label>
                          <select 
                            value={newMeta.mes}
                            onChange={(e) => setNewMeta({...newMeta, mes: Number(e.target.value)})}
                            className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 transition-all font-bold text-gray-900"
                          >
                            {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                          </select>
                       </div>
                       <div>
                          <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">Año</label>
                          <input 
                            type="number"
                            value={newMeta.anio}
                            onChange={(e) => setNewMeta({...newMeta, anio: Number(e.target.value)})}
                            className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 transition-all font-bold text-gray-900"
                          />
                       </div>
                    </div>

                    <div className="flex gap-3 pt-2">
                       <button 
                         onClick={() => setIsModalOpen(false)}
                         disabled={modalLoading}
                         className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase"
                       >Cancelar</button>
                       <button 
                         onClick={handleCreateMeta}
                         disabled={modalLoading}
                         className="flex-[1.5] py-4 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-rose-700 active:border-b-0 active:translate-y-1 disabled:opacity-50 text-[10px] uppercase"
                       >
                         {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Establecer Objetivo'}
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: Editar Meta */}
      {isEditModalOpen && editingMeta && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-md overflow-hidden shadow-2xl border border-rose-100 animate-in zoom-in-95 duration-300">
              <div className="p-8">
                 <div className="flex justify-between items-center mb-6">
                    <div>
                       <h2 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-3">
                         <span className="p-2 bg-rose-100 rounded-xl">✏️</span> Editar Meta
                       </h2>
                       <p className="text-rose-500 text-xs font-bold uppercase tracking-widest mt-2 ml-1">Modificar Objetivo</p>
                    </div>
                    <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-rose-50 rounded-full transition-colors">
                       <X className="w-6 h-6 text-gray-400" />
                    </button>
                 </div>

                 <div className="space-y-6">
                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
                         Objetivo de la meta
                       </label>
                       <input 
                         type="text"
                         value={editingMeta.nombre_objetivo}
                         onChange={(e) => setEditingMeta({...editingMeta, nombre_objetivo: e.target.value})}
                         className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all font-bold text-gray-900"
                       />
                    </div>

                    <div>
                       <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-2 ml-1">
                         Monto Objetivo (COP)
                       </label>
                       <input 
                         type="number"
                         value={editingMeta.monto_meta}
                         onChange={(e) => setEditingMeta({...editingMeta, monto_meta: e.target.value})}
                         className="w-full px-4 py-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-rose-500 focus:ring-4 focus:ring-rose-50 transition-all font-bold text-gray-900"
                       />
                    </div>

                    <div className="flex gap-3 pt-2">
                       <button 
                         onClick={() => setIsEditModalOpen(false)}
                         disabled={modalLoading}
                         className="flex-1 py-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase"
                       >Cancelar</button>
                       <button 
                         onClick={handleEditMeta}
                         disabled={modalLoading}
                         className="flex-[1.5] py-4 bg-rose-500 hover:bg-rose-600 text-white font-black rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-2 border-b-4 border-rose-700 active:border-b-0 active:translate-y-1 disabled:opacity-50 text-[10px] uppercase"
                       >
                         {modalLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Guardar Cambios'}
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {/* MODAL: Confirmar Eliminación */}
      {isDeleteModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-in fade-in duration-300">
           <div className="bg-white rounded-[2.5rem] w-full max-w-sm overflow-hidden shadow-2xl border border-rose-100 animate-in zoom-in-95 duration-300">
              <div className="p-8 text-center space-y-4">
                 <div className="w-16 h-16 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <AlertTriangle className="w-8 h-8 text-rose-500" />
                 </div>
                 <h3 className="text-xl font-black text-gray-900 tracking-tight">¿Eliminar Meta?</h3>
                 <p className="text-sm font-medium text-gray-500 leading-relaxed">
                   ¿Estás seguro de que deseas eliminar esta meta? Esta acción no se puede deshacer y los datos históricos de progreso para este objetivo se perderán.
                 </p>
                 <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => setIsDeleteModalOpen(false)}
                      disabled={modalLoading}
                      className="flex-1 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-black rounded-2xl transition-all active:scale-95 disabled:opacity-50 text-[10px] uppercase"
                    >Cancelar</button>
                    <button 
                      onClick={handleDeleteMeta}
                      disabled={modalLoading}
                      className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-black rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50 text-[10px] uppercase"
                    >
                      {modalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Sí, Eliminar'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .animate-shimmer {
          background-size: 200% 100%;
          animation: shimmer 3s infinite linear;
        }
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
        .animate-pulse-slow {
          animation: pulse-slow 3s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}

