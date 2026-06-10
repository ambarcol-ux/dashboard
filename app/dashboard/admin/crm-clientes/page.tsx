'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { MapPin, User, Plus, Phone, Calendar as CalendarIcon, Clock, MessageSquare, ChevronDown, X, ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

const ESTADOS_CRM = [
  { id: 'pendiente_validacion', title: 'PENDIENTE VALIDACIÓN', color: 'amber' },
  { id: 'cita_confirmada', title: 'CITA CONFIRMADA', color: 'blue' },
  { id: 'asistio', title: 'ASISTIÓ', color: 'indigo' },
  { id: 'no_asistio', title: 'NO ASISTIÓ', color: 'red' },
  { id: 'en_prueba_vestido', title: 'EN PRUEBA DE VESTIDO', color: 'purple' },
  { id: 'en_seguimiento', title: 'EN SEGUIMIENTO', color: 'orange' },
  { id: 'cerrado_ganado', title: 'CERRADO GANADO', color: 'emerald' },
  { id: 'cerrado_perdido', title: 'CERRADO PERDIDO', color: 'gray' }
];

export default function CrmClientes() {
  const [sedes, setSedes] = useState<any[]>([]);
  const [asesoras, setAsesoras] = useState<any[]>([]);
  const [selectedSede, setSelectedSede] = useState<string>('all');
  const [citas, setCitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Estado del Modal Ultra Premium
  const [citaSeleccionada, setCitaSeleccionada] = useState<any | null>(null);
  
  // Estado para la Bitácora
  const [bitacoraNotas, setBitacoraNotas] = useState<any[]>([]);
  const [newNota, setNewNota] = useState('');
  const [savingNota, setSavingNota] = useState(false);
  
  // Estado para Reprogramación
  const [editFecha, setEditFecha] = useState('');
  const [editHora, setEditHora] = useState('');
  const [savingReprogramacion, setSavingReprogramacion] = useState(false);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCitaSeleccionada(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Formulario manual
  const [formData, setFormData] = useState({
    cliente_nombre: '',
    cliente_telefono: '',
    fecha: '',
    hora: '',
    sede_destino_id: '',
    asesora_id: '',
    notas_ia: ''
  });

  useEffect(() => {
    fetchSedes();
    fetchAsesoras();
  }, []);

  useEffect(() => {
    fetchCitas();
  }, [selectedSede]);

  const fetchSedes = async () => {
    try {
      const { data, error } = await supabase.from('sedes').select('id, nombre, direccion');
      if (error) {
        console.error('Error cargando sedes:', error);
        return;
      }
      if (data && data.length > 0) {
        setSedes(data);
        setFormData(prev => ({ ...prev, sede_destino_id: data[0].id }));
      }
    } catch (err) {
      console.error('Error cargando sedes:', err);
    }
  };

  const fetchAsesoras = async () => {
    try {
      // Usamos la tabla asesoras oficial
      const { data, error } = await supabase.from('asesoras').select('id, nombre_completo, activo').eq('activo', true).order('nombre_completo');
      if (error) {
        console.error('Error cargando asesoras:', error);
        return;
      }
      if (data) {
        setAsesoras(data);
      }
    } catch (err) {
      console.error('Error cargando asesoras:', err);
    }
  };

  const fetchCitas = async () => {
    setLoading(true);
    let query = supabase
      .from('citas')
      .select('*, asesoras(nombre_completo), sedes!citas_sede_id_fkey(nombre)')
      .order('fecha', { ascending: true });

    if (selectedSede && selectedSede !== 'all') {
      query = query.eq('sede_id', selectedSede);
    }

    const { data, error } = await query;
    console.log("Citas recuperadas de Supabase:", data);
    if (error) {
      console.error("❌ MENSAJE CRÍTICO DE SUPABASE:", error.message);
      console.error("❌ DETALLES:", error.details);
    } else {
      setCitas(data || []);
    }
    setLoading(false);
  };

  const fetchBitacora = async (citaId: string) => {
    try {
      const { data, error } = await supabase
        .from('bitacora_citas')
        .select('*')
        .eq('cita_id', citaId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setBitacoraNotas(data || []);
    } catch (err) {
      console.error('Error cargando bitácora:', err);
    }
  };

  useEffect(() => {
    if (citaSeleccionada) {
      setEditFecha(citaSeleccionada.fecha || '');
      setEditHora(citaSeleccionada.hora ? citaSeleccionada.hora.substring(0, 5) : '');
      fetchBitacora(citaSeleccionada.id);
    } else {
      setBitacoraNotas([]);
      setNewNota('');
      setEditFecha('');
      setEditHora('');
    }
  }, [citaSeleccionada]);

  const handleAddNota = async () => {
    if (!newNota.trim() || !citaSeleccionada) return;
    setSavingNota(true);
    try {
      const { error } = await supabase
        .from('bitacora_citas')
        .insert([{
          cita_id: citaSeleccionada.id,
          nota: newNota.trim()
        }]);
      
      if (error) throw error;
      
      setNewNota('');
      fetchBitacora(citaSeleccionada.id);
    } catch (err) {
      console.error('Error guardando nota:', err);
    } finally {
      setSavingNota(false);
    }
  };

  const handleReprogramar = async () => {
    if (!citaSeleccionada || !editFecha || !editHora) return;
    setSavingReprogramacion(true);
    try {
      const { error } = await supabase
        .from('citas')
        .update({ fecha: editFecha, hora: editHora })
        .eq('id', citaSeleccionada.id);
      
      if (error) throw error;
      
      toast.success('Cita reprogramada con éxito');
      fetchCitas();
      setCitaSeleccionada((prev: any) => ({...prev, fecha: editFecha, hora: editHora}));
    } catch (err) {
      console.error('Error reprogramando:', err);
      toast.error('Error al reprogramar la cita');
    } finally {
      setSavingReprogramacion(false);
    }
  };

  const handleChangeEstado = async (citaId: string, nuevoEstado: string) => {
    setActiveDropdown(null);
    const toastId = toast.loading('Actualizando estado...');
    const { error } = await supabase
      .from('citas')
      .update({ estado: nuevoEstado })
      .eq('id', citaId);

    if (error) {
      toast.error('Error al actualizar', { id: toastId });
    } else {
      setCitas(prev => prev.map(c => c.id === citaId ? { ...c, estado: nuevoEstado } : c));
      toast.success('Estado actualizado', { id: toastId });
    }
  };

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    
    const { source, destination, draggableId } = result;
    
    // Si no cambió de columna ni de posición (aunque no manejamos orden todavía), no hacer nada
    if (source.droppableId === destination.droppableId) return;

    const citaId = draggableId;
    const nuevoEstado = destination.droppableId;

    // Actualización optimista
    setCitas(prev => prev.map(c => c.id === citaId ? { ...c, estado: nuevoEstado } : c));
    
    const toastId = toast.loading('Moviendo tarjeta...');
    const { error } = await supabase
      .from('citas')
      .update({ estado: nuevoEstado })
      .eq('id', citaId);

    if (error) {
      toast.error('Error al actualizar estado', { id: toastId });
    } else {
      toast.success('Estado actualizado exitosamente', { id: toastId });
    }
  };

  const handleCrearCita = async (e: React.FormEvent) => {
    e.preventDefault();
    const toastId = toast.loading('Agendando cita manual...');
    
    // Obtener nombres para el historial
    const asesoraObj = asesoras.find(a => a.id === formData.asesora_id);
    const sedeObj = sedes.find(s => s.id === formData.sede_destino_id);
    const asesora_nombre = asesoraObj ? asesoraObj.nombre_completo : 'Desconocida';
    const sede_nombre = sedeObj ? sedeObj.nombre : 'Desconocida';

    try {
      const response = await fetch('/api/citas/agendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          sede_id: formData.sede_destino_id,
          creado_por_ia: false,
          asesora_nombre,
          sede_nombre
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Error al agendar');
      }

      // Añadir la cita al estado local si pertenece a la sede actual
      if (formData.sede_destino_id === selectedSede) {
        setCitas(prev => [...prev, result.data]);
      }
      
      toast.success('Cita agendada manualmente', { id: toastId });
      setShowModal(false);
      setFormData({ 
        cliente_nombre: '', 
        cliente_telefono: '', 
        fecha: '', 
        hora: '', 
        sede_destino_id: sedes[0]?.id || '', 
        asesora_id: '', 
        notas_ia: '' 
      });
    } catch (error: any) {
      toast.error(error.message, { id: toastId });
    }
  };

  console.log('--- AUDITORÍA DE SEDES CARGADAS ---', sedes);

  return (
    <div className="p-8 h-screen flex flex-col mx-auto space-y-6 animate-in fade-in duration-500 bg-gray-50/30">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm shadow-gray-50 flex-shrink-0">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-rose-500 transition-colors mb-2 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Volver al Dashboard
          </Link>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">CRM Clientes</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Pipeline de ventas y agendamientos IA
          </p>
        </div>
        
        <div className="flex items-center gap-4 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MapPin className="h-4 w-4 text-rose-400" />
            </div>
            <select
              value={selectedSede}
              onChange={(e) => setSelectedSede(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-rose-50/50 border border-rose-100 rounded-xl text-sm font-black text-rose-900 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 appearance-none transition-all cursor-pointer"
            >
              <option value="all">Todas las Sedes</option>
              {(sedes || []).map(sede => (
                <option key={sede.id} value={sede.id}>{sede.nombre}</option>
              ))}
            </select>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-6 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-black text-sm transition-all shadow-lg shadow-rose-200"
          >
            <Plus className="w-4 h-4" /> Nueva Cita
          </button>
        </div>
      </div>

      {/* KANBAN BOARD */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto custom-scrollbar flex gap-6 pb-6 relative">
          {loading && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-sm z-10 flex items-center justify-center rounded-2xl">
              <span className="text-sm font-black text-gray-400 tracking-widest uppercase">Cargando Pipeline...</span>
            </div>
          )}
          
          {(ESTADOS_CRM || []).map(columna => {
            const citasColumna = (citas || []).filter(cita => cita.estado === columna.id);
            
            return (
              <div key={columna.id} className="w-[320px] flex-shrink-0 flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className={`p-4 border-b border-${columna.color}-100 bg-${columna.color}-50/30 flex items-center justify-between`}>
                  <h3 className={`text-xs font-black uppercase tracking-widest text-${columna.color}-600`}>
                    {columna.title}
                  </h3>
                  <span className={`text-[10px] font-black bg-${columna.color}-100 text-${columna.color}-700 px-2 py-0.5 rounded-full`}>
                    {citasColumna.length}
                  </span>
                </div>

                <Droppable droppableId={columna.id}>
                  {(provided) => (
                    <div 
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className="flex-1 p-3 overflow-y-auto custom-scrollbar space-y-3 bg-gray-50/30 min-h-[200px]"
                    >
                      {(citasColumna || []).map((cita, index) => (
                        <Draggable key={cita.id} draggableId={cita.id} index={index}>
                          {(provided, snapshot) => (
                            <div 
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                              onClick={() => setCitaSeleccionada(cita)}
                              className={`bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:shadow-md hover:border-gray-200 transition-all group cursor-pointer hover:scale-[1.02] ${snapshot.isDragging ? 'shadow-lg border-rose-200 rotate-2' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-3 relative">
                                <div className="flex items-center gap-2">
                                  <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-500 flex-shrink-0">
                                    <User className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-black text-slate-900 leading-tight">{cita.cliente_nombre}</p>
                                    <p className="text-[10px] font-bold text-slate-500 flex items-center gap-1 mt-0.5">
                                      <Phone className="w-3 h-3" /> {cita.cliente_telefono}
                                    </p>
                                  </div>
                                </div>
                                
                                {/* Dropdown Menu */}
                                <button 
                                  onClick={(e) => { e.stopPropagation(); setActiveDropdown(activeDropdown === cita.id ? null : cita.id); }}
                                  className="p-1 hover:bg-gray-100 rounded-lg text-gray-400 transition-colors"
                                >
                                  <ChevronDown className="w-4 h-4" />
                                </button>

                                {activeDropdown === cita.id && (
                                  <div className="absolute top-8 right-0 w-48 bg-white border border-gray-100 shadow-xl rounded-xl p-1 z-20 animate-in fade-in slide-in-from-top-2">
                                    <p className="px-3 py-2 text-[9px] font-black uppercase tracking-widest text-gray-400">Mover a...</p>
                                    {(ESTADOS_CRM || []).map(e => (
                                      <button
                                        key={e.id}
                                        onClick={() => handleChangeEstado(cita.id, e.id)}
                                        className={`w-full text-left px-3 py-2 text-xs font-bold rounded-lg transition-colors ${
                                          e.id === cita.estado ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'hover:bg-rose-50 text-slate-700 hover:text-rose-600'
                                        }`}
                                        disabled={e.id === cita.estado}
                                      >
                                        {e.title}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-3 text-[11px] font-bold text-slate-600 bg-gray-50 p-2 rounded-lg mb-3">
                                <div className="flex items-center gap-1">
                                  <CalendarIcon className="w-3 h-3 text-rose-400" />
                                  {cita.fecha}
                                </div>
                                <div className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-rose-400" />
                                  {cita.hora}
                                </div>
                              </div>

                              {cita.notas_ia && (
                                <div className="text-[11px] text-slate-600 font-medium leading-snug flex gap-1.5 items-start bg-amber-50/50 p-2.5 rounded-lg border border-amber-100/50">
                                  <MessageSquare className="w-3 h-3 text-amber-400 mt-0.5 flex-shrink-0" />
                                  <span className="line-clamp-3">{cita.notas_ia}</span>
                                </div>
                              )}
                              
                              {cita.creado_por_ia && (
                                <div className="mt-3 pt-3 border-t border-gray-50 flex justify-end">
                                  <span className="text-[8px] font-black uppercase tracking-widest text-rose-500 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">
                                    ⚡ Creado por IA
                                  </span>
                                </div>
                              )}
                              
                              <div className="mt-2 pt-2 border-t border-gray-50 flex justify-start">
                                 <span className="text-[10px] font-bold text-slate-700 bg-slate-100 px-2 py-1 rounded-lg flex items-center gap-1.5">
                                   👤 Asesora: {cita.asesoras?.nombre_completo || 'Sin Asignar'}
                                 </span>
                              </div>
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            );
          })}
        </div>
      </DragDropContext>

      {/* MODAL NUEVA CITA */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-300">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-xl font-black text-gray-900">Agendar Cita Manual</h3>
                <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-1">Creación Directa</p>
              </div>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-50 rounded-full text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <form onSubmit={handleCrearCita} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Nombre de Clienta</label>
                <input required type="text" value={formData.cliente_nombre} onChange={e => setFormData({...formData, cliente_nombre: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 placeholder:text-gray-400 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none" placeholder="Ej. Salomé Valencia" />
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Teléfono (WhatsApp)</label>
                <input required type="tel" value={formData.cliente_telefono} onChange={e => setFormData({...formData, cliente_telefono: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 placeholder:text-gray-400 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none" placeholder="+57 300 000 0000" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Sede Destino</label>
                  <select required value={formData.sede_destino_id} onChange={e => setFormData({...formData, sede_destino_id: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none">
                    {sedes.length === 0 ? (
                      <option value="">Cargando sedes disponibles...</option>
                    ) : (
                      <>
                        <option value="">Seleccione una sede...</option>
                        {(sedes || []).map((sede) => (
                          <option key={sede.id} value={sede.id}>{sede.nombre}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Asesora Responsable</label>
                  <select required value={formData.asesora_id} onChange={e => setFormData({...formData, asesora_id: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none">
                    {asesoras.length === 0 ? (
                      <option value="">Cargando asesoras...</option>
                    ) : (
                      <>
                        <option value="">Seleccione una asesora...</option>
                        {(asesoras || []).filter(a => !formData.sede_destino_id || a.sede_id === formData.sede_destino_id || a.sede_id === null || a.sede_id === undefined).map(a => (
                          <option key={a.id} value={a.id}>{a.nombre_completo}</option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Fecha</label>
                  <input required type="date" value={formData.fecha} onChange={e => setFormData({...formData, fecha: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Hora</label>
                  <select required value={formData.hora} onChange={e => setFormData({...formData, hora: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none">
                    <option value="">Seleccionar</option>
                    {["09:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00"].map(h => (
                      <option key={h} value={h}>{h}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-1.5">Notas / Preferencias</label>
                <textarea rows={3} value={formData.notas_ia} onChange={e => setFormData({...formData, notas_ia: e.target.value})} className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-slate-900 placeholder:text-gray-400 text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-400 transition-all outline-none resize-none" placeholder="Estilo princesa, color rojo vivo..." />
              </div>
              <button type="submit" className="w-full py-3.5 bg-gray-900 hover:bg-black text-white rounded-xl font-black text-sm uppercase tracking-widest transition-all mt-6 shadow-xl shadow-gray-900/20">
                Guardar y Agendar
              </button>
            </form>
          </div>
        </div>
      )}
      {/* POPUP MODAL ULTRA PREMIUM */}
      {citaSeleccionada && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm transition-all"
          onClick={() => setCitaSeleccionada(null)}
        >
          <div 
            className="bg-white rounded-2xl shadow-2xl border border-gray-100 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={e => e.stopPropagation()}
          >
            <div className="p-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
              {/* Header */}
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                    {citaSeleccionada.cliente_nombre}
                  </h2>
                  <span className={`inline-block mt-2 text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded border ${
                    citaSeleccionada.estado === 'pendiente_validacion' ? 'text-amber-600 bg-amber-50 border-amber-100' :
                    citaSeleccionada.estado === 'cita_confirmada' ? 'text-blue-600 bg-blue-50 border-blue-100' :
                    citaSeleccionada.estado === 'asistio_en_sesion' ? 'text-purple-600 bg-purple-50 border-purple-100' :
                    citaSeleccionada.estado === 'cerrado_ganado' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' :
                    'text-gray-500 bg-gray-50 border-gray-200'
                  }`}>
                    {citaSeleccionada.estado.replace(/_/g, ' ')}
                  </span>
                </div>
                <button 
                  onClick={() => setCitaSeleccionada(null)}
                  className="p-2 bg-gray-50 hover:bg-rose-50 text-gray-400 hover:text-rose-500 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Data Grid */}
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">📱 Teléfono</p>
                  <p className="text-sm font-black text-slate-800">{citaSeleccionada.cliente_telefono || 'No registrado'}</p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100 col-span-2 sm:col-span-1">
                  <p className="text-xs font-semibold text-gray-500 mb-2">⏰ Reprogramar Fecha/Hora</p>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <input 
                        type="date" 
                        value={editFecha}
                        onChange={(e) => setEditFecha(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 outline-none"
                      />
                      <input 
                        type="time" 
                        value={editHora}
                        onChange={(e) => setEditHora(e.target.value)}
                        className="w-full px-2 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 outline-none"
                      />
                    </div>
                    {(editFecha !== citaSeleccionada.fecha || editHora !== (citaSeleccionada.hora ? citaSeleccionada.hora.substring(0, 5) : '')) && (
                      <button
                        onClick={handleReprogramar}
                        disabled={savingReprogramacion || !editFecha || !editHora}
                        className="w-full mt-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        {savingReprogramacion ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                        Guardar Reprogramación
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">📍 Sede Asignada</p>
                  <p className="text-sm font-black text-slate-800">
                    {citaSeleccionada.sedes?.nombre || citaSeleccionada.sede_nombre || 'Sin Sede'}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">👤 Asesora</p>
                  <p className="text-sm font-black text-slate-800">
                    {citaSeleccionada.asesoras?.nombre_completo || citaSeleccionada.asesora_nombre || 'Sin Asignar'}
                  </p>
                </div>
              </div>

              {/* Notas IA / Estilo */}
              {citaSeleccionada.notas && (
                <div className="mb-6 p-4 rounded-xl text-amber-700 bg-amber-50 border border-amber-100/50">
                  <p className="text-xs font-black uppercase tracking-widest mb-1.5 flex items-center gap-1 opacity-80">
                    🪄 Notas / Estilos / IA
                  </p>
                  <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                    {citaSeleccionada.notas}
                  </p>
                </div>
              )}

              {/* Timeline (Historial Atención) */}
              {citaSeleccionada.historial_atencion && Array.isArray(citaSeleccionada.historial_atencion) && citaSeleccionada.historial_atencion.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" /> Historial de Atención Automático
                  </h3>
                  <div className="space-y-4 pl-2">
                    {citaSeleccionada.historial_atencion.map((evento: any, i: number) => (
                      <div key={i} className="relative pl-6 border-l-2 border-rose-100 last:border-transparent pb-4 last:pb-0">
                        <div className="absolute w-3 h-3 bg-white border-2 border-rose-400 rounded-full -left-[7px] top-1"></div>
                        <p className="text-sm font-bold text-slate-700">{evento.accion}</p>
                        <p className="text-xs font-medium text-gray-400 mt-0.5">
                          {new Date(evento.timestamp).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Bitácora / Notas Manuales */}
              <div className="mt-8 border-t border-gray-100 pt-6">
                <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-gray-400" /> Bitácora de Observaciones
                </h3>
                
                {/* Input de nueva nota */}
                <div className="mb-6 flex flex-col gap-2">
                  <textarea
                    value={newNota}
                    onChange={(e) => setNewNota(e.target.value)}
                    placeholder="Escribe una nueva nota u observación..."
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-slate-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-300 resize-none h-24 transition-all"
                  />
                  <button
                    onClick={handleAddNota}
                    disabled={!newNota.trim() || savingNota}
                    className="self-end px-5 py-2 bg-slate-900 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {savingNota ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Agregar Nota
                  </button>
                </div>

                {/* Feed de la Bitácora */}
                {bitacoraNotas && bitacoraNotas.length > 0 ? (
                  <div className="space-y-4 pl-2">
                    {(bitacoraNotas || []).map((nota: any) => (
                      <div key={nota.id} className="relative pl-6 border-l-2 border-slate-200 last:border-transparent pb-4 last:pb-0">
                        <div className="absolute w-3 h-3 bg-white border-2 border-slate-400 rounded-full -left-[7px] top-1"></div>
                        <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap">{nota.nota}</p>
                        <p className="text-xs font-medium text-gray-400 mt-1 flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3" />
                          {new Date(nota.created_at).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 italic text-center py-4">No hay observaciones registradas en la bitácora.</p>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
