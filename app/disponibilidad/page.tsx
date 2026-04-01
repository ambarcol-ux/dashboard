'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Search, 
  Calendar, 
  ChevronLeft, 
  Clock, 
  User, 
  FileText, 
  AlertTriangle,
  Loader2,
  Package,
  CalendarDays,
  Trash2,
  History,
  X,
  ShieldAlert,
  CheckCircle2,
  Info
} from 'lucide-react';
import Link from 'next/link';
import { toast, Toaster } from 'sonner';

interface BusyPeriod {
  start: Date;
  end: Date;
  contractNumber: string;
  clientName: string;
  type: string;
  id: string;
}

export default function AvailabilityPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dress, setDress] = useState<any>(null);
  const [periods, setPeriods] = useState<BusyPeriod[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [possibleDresses, setPossibleDresses] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [deactivateForm, setDeactivateForm] = useState({ motivo: 'Dañado', detalle: '' });
  const [submittingBaja, setSubmittingBaja] = useState(false);

  useEffect(() => {
    const getProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email, rol, nombre')
          .eq('id', user.id)
          .single();
        setUserProfile(profile);
      }
    };
    getProfile();
  }, []);

  const getBlockingDays = (tipoEvento: string, tipoEntrega: string) => {
    if (tipoEntrega === 'Nacional') return 8;
    if (tipoEvento === 'PreXV') return 1;
    return 5;
  };

  const handleSearch = async (e?: React.FormEvent, manualDressId?: string) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() && !manualDressId) return;

    setLoading(true);
    setError(null);
    if (!manualDressId) {
      setDress(null);
      setPossibleDresses([]);
    }
    setPeriods([]);

    try {
      // 1. Buscar Vestido(s)
      if (manualDressId) {
        // Cargar uno específico si ya fue seleccionado de la lista
        const { data: d, error: de } = await supabase
          .from('vestidos')
          .select('id, codigo, nombre, categoria, talla, color, estado, sede_actual_id, sedes:sede_actual_id(nombre)')
          .eq('id', manualDressId)
          .single();
        if (de) throw de;
        setDress(d);
        await fetchUnifiedHistory(d.id);
        setPossibleDresses([]);
      } else {
        const { data: results, error: dressError } = await supabase
          .from('vestidos')
          .select('id, codigo, nombre, categoria, talla, color, estado, sede_actual_id, sedes:sede_actual_id(nombre)')
          .or(`codigo.ilike.%${searchQuery.trim()}%,nombre.ilike.%${searchQuery.trim()}%,categoria.ilike.%${searchQuery.trim()}%`);

        if (dressError) throw dressError;

        if (!results || results.length === 0) {
          setError('No se encontró ningún vestido con esa referencia.');
          setLoading(false);
          return;
        }

        if (results.length === 1) {
          setDress(results[0]);
          await fetchUnifiedHistory(results[0].id);
        } else {
          // Múltiples resultados: mostrar lista para elegir
          setPossibleDresses(results);
        }
      }
    } catch (err: any) {
      console.error(err);
      setError('Error al consultar la disponibilidad.');
    } finally {
      setLoading(false);
    }
  };

  const fetchUnifiedHistory = async (dressId: string) => {
    try {
      // 1. Fetch Alquileres
      const { data: contracts, error: contrError } = await supabase
        .from('contrato_items_vestidos')
        .select(`
          contrato_id,
          contratos!inner (
            id,
            numero_contrato,
            cliente_nombre,
            fecha_evento,
            tipo_evento,
            tipo_entrega,
            estado,
            fecha_entrega_envio,
            created_at
          )
        `)
        .eq('vestido_id', dressId)
        .neq('contratos.estado', 'cancelado');

      if (contrError) throw contrError;

      // 2. Fetch Bitácora Local
      let logs: any[] = [];
      const { data: logsData, error: logsError } = await supabase
        .from('bitacora_vestidos')
        .select('*')
        .eq('vestido_id', dressId)
        .order('created_at', { ascending: false });

      if (logsError) {
         console.warn("Bitácora no disponible o error de consulta:", logsError.message);
      } else {
         logs = logsData || [];
      }

      // 3. Procesar Periodos de Bloqueo (Calendario)
      const calculatedPeriods: BusyPeriod[] = (contracts as any[]).map(item => {
        const c = item.contratos;
        const baseDelivery = c.fecha_entrega_envio || c.fecha_evento;
        const start = new Date(baseDelivery);
        start.setDate(start.getDate() - 10);
        const offset = getBlockingDays(c.tipo_evento, c.tipo_entrega);
        const end = new Date(c.fecha_evento);
        end.setDate(end.getDate() + offset);

        return {
          start, end,
          contractNumber: c.numero_contrato,
          clientName: c.cliente_nombre,
          type: c.tipo_evento,
          id: c.id
        };
      });
      setPeriods(calculatedPeriods.sort((a, b) => a.start.getTime() - b.start.getTime()));

      // 4. Procesar Historial Unificado (Timeline)
      const unified: any[] = [];
      
      // Añadir alquileres al historial
      (contracts as any[]).forEach(item => {
        const c = item.contratos;
        unified.push({
          id: `contract-${c.id}`,
          fecha: new Date(c.fecha_evento || c.created_at),
          tipo: 'alquiler',
          titulo: `Alquiler - Contrato #${c.numero_contrato}`,
          subtitulo: `Cliente: ${c.cliente_nombre}`,
          detalle: `Evento tipo ${c.tipo_evento}`
        });
      });

      // Añadir logs de bitácora
      (logs || []).forEach(log => {
        unified.push({
          id: `log-${log.id}`,
          fecha: new Date(log.created_at),
          tipo: 'novedad',
          titulo: `Novedad: ${log.motivo}`,
          subtitulo: `Por: ${log.usuario_email}`,
          detalle: log.detalle
        });
      });

      setHistory(unified.sort((a, b) => b.fecha.getTime() - a.fecha.getTime()));

    } catch (err) {
      console.error("Error unificando historial", err);
    }
  };

  const handleDeactivate = async () => {
    if (!dress || !userProfile) return;
    setSubmittingBaja(true);
    try {
      // 1. Update Vestido
      const { error: updateError } = await supabase
        .from('vestidos')
        .update({ estado: 'De Baja' })
        .eq('id', dress.id);

      if (updateError) throw updateError;

      // 2. Insert Log
      const { error: logError } = await supabase
        .from('bitacora_vestidos')
        .insert([{
          vestido_id: dress.id,
          usuario_email: userProfile.email,
          motivo: deactivateForm.motivo,
          detalle: deactivateForm.detalle
        }]);

      if (logError) throw logError;

      toast.success('Vestido dado de baja correctamente.');
      setIsDeactivateModalOpen(false);
      // Recargar info
      handleSearch(undefined, dress.id);
    } catch (err: any) {
      toast.error('Error al dar de baja: ' + err.message);
    } finally {
      setSubmittingBaja(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('es-CO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric'
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster position="top-center" richColors />
      {/* Header Fijo */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
        <div className="max-w-4xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              href="/dashboard"
              className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500 hover:text-rose-600"
            >
              <ChevronLeft className="w-6 h-6" />
            </Link>
            <div>
              <h1 className="text-xl font-black text-gray-900 tracking-tight uppercase">Agenda de Vestido</h1>
              <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Consulta de Disponibilidad 360°</p>
            </div>
          </div>
          <div className="bg-rose-50 px-3 py-1 rounded-full border border-rose-100">
             <span className="text-[10px] font-black text-rose-600 uppercase">Tiempo Real ERP</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-8">
        {/* Buscador Premium */}
        <section className="bg-white rounded-[2.5rem] shadow-xl shadow-rose-100/50 p-8 border border-white relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-10 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
             <CalendarDays className="w-40 h-40 text-rose-600" />
          </div>
          
          <form onSubmit={handleSearch} className="relative z-10">
            <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-3 ml-2">Referencia de Prenda</label>
            <div className="flex gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Ej: 5051, 5022..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-14 pr-6 py-5 bg-gray-50 border-2 border-transparent rounded-[2rem] focus:border-rose-500 focus:bg-white focus:ring-4 focus:ring-rose-50 transition-all font-black text-xl text-gray-900 placeholder:text-gray-300 placeholder:uppercase"
                  autoFocus
                />
              </div>
              <button 
                type="submit"
                disabled={loading}
                className="px-8 bg-gray-900 hover:bg-black text-white rounded-[2rem] font-black transition-all shadow-lg active:scale-95 disabled:opacity-50 flex items-center gap-3 uppercase tracking-widest text-sm"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Consultar'}
              </button>
            </div>
          </form>
        </section>

        {/* Resultados */}
        <div className="space-y-6">
          {error && (
            <div className="bg-rose-50 border border-rose-100 p-6 rounded-3xl flex items-center gap-4 text-rose-700 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <p className="font-bold">{error}</p>
            </div>
          )}

          {possibleDresses.length > 0 && (
            <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-xl space-y-6 animate-in zoom-in-95">
               <div>
                 <h3 className="text-xl font-black text-gray-900 uppercase">Múltiples vestidos encontrados</h3>
                 <p className="text-gray-400 font-bold text-xs uppercase tracking-widest mt-1">Selecciona la sede correspondiente para ver su agenda</p>
               </div>
               <div className="grid gap-4">
                 {possibleDresses.map(d => (
                   <button
                    key={d.id}
                    onClick={() => handleSearch(undefined, d.id)}
                    className="flex items-center justify-between p-6 bg-gray-50 border border-gray-100 rounded-3xl hover:bg-rose-50 hover:border-rose-100 transition-all group"
                   >
                     <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-gray-900 border border-gray-100 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                          {d.codigo.substring(0,2)}
                        </div>
                        <div className="text-left">
                          <p className="font-black text-gray-900 uppercase">{d.codigo}</p>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{d.sedes?.nombre || 'Sede Desconocida'}</p>
                        </div>
                     </div>
                     <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-white px-4 py-2 rounded-xl shadow-sm">Ver Calendario →</span>
                   </button>
                 ))}
               </div>
            </div>
          )}

          {dress && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* Card de Vestido Info */}
              <div className="bg-white rounded-3xl p-6 border border-gray-100 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center text-white font-black text-xl rotate-3 shadow-lg group-hover:rotate-0 transition-transform">
                     {dress.codigo.substring(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-gray-900">{dress.codigo}</h2>
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Sede: {dress.sedes?.nombre || 'BOGOTÁ'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                    dress.estado === 'Disponible' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                  }`}>
                    Estado: {dress.estado}
                  </span>
                  <p className="text-[10px] font-bold text-gray-300">Talla: {dress.talla} | {dress.color}</p>
                </div>

                {/* BOTÓN DAR DE BAJA (ADMIN ONLY) */}
                {userProfile?.rol === 'admin' && dress.estado !== 'De Baja' && (
                  <button 
                    onClick={() => setIsDeactivateModalOpen(true)}
                    className="ml-4 p-3 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-2xl transition-all flex items-center gap-2 group border border-rose-100"
                    title="Dar de Baja"
                  >
                    <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-widest hidden sm:inline">Dar de Baja</span>
                  </button>
                )}
              </div>

              {/* Lista de Bloqueos */}
              <div className="space-y-4">
                <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-2">Periodos de Bloqueo</h3>
                
                {periods.length === 0 ? (
                  <div className="bg-emerald-50 border border-emerald-100 p-10 rounded-[2.5rem] text-center space-y-3">
                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto shadow-sm border border-emerald-100">
                       <span className="text-4xl">✨</span>
                    </div>
                    <div>
                      <h4 className="text-emerald-700 font-black text-lg">Totalmente Disponible</h4>
                      <p className="text-emerald-600/70 font-bold text-sm">Este vestido no tiene contratos activos registrados.</p>
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {periods.map((p, idx) => (
                      <div key={p.id + idx} className="bg-white rounded-[2rem] p-8 border border-gray-100 shadow-sm hover:shadow-gray-200 transition-all hover:translate-x-1 group">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                          <div className="space-y-4">
                            <div className="flex items-center gap-2">
                               <div className="bg-rose-100 text-rose-600 p-1.5 rounded-lg">
                                  <Clock className="w-4 h-4" />
                               </div>
                               <span className="text-xs font-black text-rose-500 uppercase tracking-widest">Periodo Ocupado</span>
                            </div>
                            <div className="grid gap-1">
                               <span className="text-2xl font-black text-gray-900 flex items-center gap-3">
                                  {formatDate(p.start)}
                                  <span className="text-gray-200 font-light translate-y-[-2px]">→</span>
                                  {formatDate(p.end)}
                               </span>
                               <p className="text-xs font-bold text-gray-400 italic">Incluye 10 días de preparación y días de logística post-evento.</p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col gap-2 min-w-[200px] md:items-end">
                            <div className="flex items-center gap-2 text-gray-900 group-hover:text-rose-600 transition-colors">
                              <FileText className="w-4 h-4" />
                              <span className="font-black text-sm uppercase">CONTRATO #{p.contractNumber}</span>
                            </div>
                            <div className="flex items-center gap-2 text-gray-500">
                              <User className="w-4 h-4" />
                              <span className="font-bold text-xs">{p.clientName}</span>
                            </div>
                            <span className="inline-block mt-2 px-3 py-1 bg-gray-50 rounded-lg text-[9px] font-black text-gray-400 uppercase">
                               Tipo: {p.type === 'PreXV' ? '👗 Sesión Pre-XV' : '🎂 Evento / Quinceañera'}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECCIÓN HOJA DE VIDA (TIMELINE 360) */}
              <div className="space-y-6 pt-10 border-t border-gray-100">
                <div className="flex items-center gap-3 ml-2">
                   <div className="p-2 bg-gray-900 text-white rounded-xl">
                      <History className="w-5 h-5" />
                   </div>
                   <div>
                     <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">Historial de Vida (360°)</h3>
                     <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">Línea de tiempo unificada: Alquileres y Novedades</p>
                   </div>
                </div>

                {history.length === 0 ? (
                  <div className="text-center py-10 bg-gray-50 rounded-[2rem] border-2 border-dashed border-gray-200">
                    <History className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">No hay eventos registrados en la hoja de vida.</p>
                  </div>
                ) : (
                  <div className="relative ml-6 pl-10 border-l-2 border-gray-100 space-y-12 pb-10">
                    {history.map((item, idx) => (
                      <div key={item.id} className="relative">
                        {/* Indicador de Fecha en el eje */}
                        <div className="absolute -left-[4.2rem] top-0 w-[3rem] text-right">
                           <p className="text-[10px] font-black text-gray-400 rotate-[-90deg] translate-y-10 origin-right">
                              {new Date(item.fecha).toLocaleDateString('es-CO', { month: 'short', day: 'numeric' })}
                           </p>
                        </div>
                        
                        {/* Punto de la línea */}
                        <div className={`absolute -left-[3.05rem] top-1 w-4 h-4 rounded-full border-4 border-white shadow-sm z-10 ${
                          item.tipo === 'alquiler' ? 'bg-emerald-500' : 'bg-rose-500'
                        }`} />

                        <div className="bg-white rounded-3xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-shadow group">
                           <div className="flex justify-between items-start mb-3">
                              <span className={`text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-widest ${
                                item.tipo === 'alquiler' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                              }`}>
                                {item.tipo === 'alquiler' ? 'ALQUILER' : 'NOVEDAD'}
                              </span>
                              <span className="text-[10px] font-bold text-gray-300">
                                {new Date(item.fecha).toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' })}
                              </span>
                           </div>
                           <h4 className="text-lg font-black text-gray-900 group-hover:text-rose-600 transition-colors">{item.titulo}</h4>
                           <p className="text-xs font-bold text-gray-500 mt-1 uppercase tracking-tight">{item.subtitulo}</p>
                           {item.detalle && (
                             <div className="mt-4 p-4 bg-gray-50 rounded-2xl border border-gray-100 text-xs font-medium text-gray-600 leading-relaxed italic">
                                "{item.detalle}"
                             </div>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* MODAL DE BAJA */}
      {isDeactivateModalOpen && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-6 animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 bg-rose-600 text-white relative">
                 <button 
                  onClick={() => setIsDeactivateModalOpen(false)}
                  className="absolute right-6 top-6 p-2 hover:bg-white/20 rounded-full transition-colors"
                 >
                    <X className="w-6 h-6" />
                 </button>
                 <div className="flex items-center gap-4 mb-4">
                    <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center">
                       <ShieldAlert className="w-8 h-8 text-white" />
                    </div>
                    <div>
                       <h2 className="text-2xl font-black uppercase tracking-tight">Dar de Baja Prenda</h2>
                       <p className="text-rose-100 text-sm font-bold uppercase tracking-widest">Procedimiento administrativo</p>
                    </div>
                 </div>
              </div>
              
              <div className="p-8 space-y-6">
                 <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex gap-3 text-rose-700">
                    <Info className="w-5 h-5 shrink-0" />
                    <p className="text-xs font-bold leading-relaxed">
                       Atención: Al dar de baja el vestido {dress?.codigo}, dejará de estar disponible para futuros contratos. Esta acción queda registrada en tu perfil.
                    </p>
                 </div>

                 <div className="space-y-4">
                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Motivo Principal</label>
                       <select 
                        value={deactivateForm.motivo}
                        onChange={(e) => setDeactivateForm({...deactivateForm, motivo: e.target.value})}
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-5 py-4 focus:border-rose-500 transition-all font-bold text-gray-900"
                       >
                          <option value="Dañado">Dañado (No reparable)</option>
                          <option value="Quemado">Quemado</option>
                          <option value="Perdido">Perdido / Extraviado</option>
                          <option value="Vendido">Vendido / Salida de Inventario</option>
                          <option value="Otro">Otro Motivo</option>
                       </select>
                    </div>

                    <div className="space-y-1">
                       <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Detalles Técnicos</label>
                       <textarea 
                        placeholder="Explica qué sucedió con el vestido..."
                        rows={4}
                        value={deactivateForm.detalle}
                        onChange={(e) => setDeactivateForm({...deactivateForm, detalle: e.target.value})}
                        className="w-full bg-gray-50 border-2 border-gray-100 rounded-2xl px-5 py-4 focus:border-rose-500 transition-all font-bold text-gray-900 resize-none placeholder:text-gray-300"
                       />
                    </div>
                 </div>

                 <div className="flex gap-4 pt-4">
                    <button 
                      onClick={() => setIsDeactivateModalOpen(false)}
                      className="flex-1 py-4 border-2 border-gray-100 rounded-2xl font-black text-gray-400 hover:bg-gray-50 transition-all uppercase tracking-widest text-xs"
                    >
                       Cancelar
                    </button>
                    <button 
                      onClick={handleDeactivate}
                      disabled={submittingBaja || !deactivateForm.detalle.trim()}
                      className="flex-[2] py-4 bg-gray-900 hover:bg-black text-white rounded-2xl font-black transition-all shadow-lg shadow-gray-200 disabled:opacity-50 uppercase tracking-widest text-xs flex items-center justify-center gap-2"
                    >
                       {submittingBaja ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                       {submittingBaja ? 'Procesando...' : 'Confirmar Baja Definitiva'}
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}

      <footer className="mt-auto p-10 text-center">
         <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.3em]">Gestión de Inventario Ambar Couture v2.0</p>
      </footer>
    </div>
  );
}
