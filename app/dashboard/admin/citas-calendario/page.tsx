'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { MapPin, Calendar as CalendarIcon, Clock, User, ChevronLeft, ChevronRight, X, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';

export default function CitasCalendario() {
  const [sedes, setSedes] = useState<any[]>([]);
  const [selectedSede, setSelectedSede] = useState<string>('');
  const [citas, setCitas] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Navegación semanal
  const [currentDate, setCurrentDate] = useState(new Date());

  // Estado del Modal
  const [citaSeleccionada, setCitaSeleccionada] = useState<any | null>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCitaSeleccionada(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const HORARIO_COMERCIAL = [
    "09:00", "10:00", "11:00", "12:00", 
    "13:00", "14:00", "15:00", "16:00", "17:00"
  ];

  useEffect(() => {
    fetchSedes();
  }, []);

  useEffect(() => {
    if (selectedSede) {
      fetchCitas();
    }
  }, [selectedSede, currentDate]);

  const fetchSedes = async () => {
    try {
      const { data, error } = await supabase.from('sedes').select('id, nombre, direccion');
      if (error) {
        console.error('Error cargando sedes:', error);
        return;
      }
      if (data && data.length > 0) {
        setSedes(data);
        setSelectedSede('all');
      }
    } catch (err) {
      console.error('Error cargando sedes:', err);
    }
  };

  const fetchCitas = async () => {
    setLoading(true);
    const startOfWeek = new Date(currentDate);
    startOfWeek.setDate(currentDate.getDate() - currentDate.getDay() + 1); // Lunes
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 5); // Sábado

    const fechaInicio = startOfWeek.toISOString().split('T')[0];
    const fechaFin = endOfWeek.toISOString().split('T')[0];

    let query = supabase
      .from('citas')
      .select('*, asesoras(nombre_completo), sedes!citas_sede_id_fkey(nombre)');

    if (selectedSede && selectedSede !== 'all') {
      query = query.eq('sede_id', selectedSede);
    }

    const { data, error } = await query;
    console.log("Citas que llegaron al calendario:", data);

    if (!error && data) {
      console.log("Rango del calendario:", fechaInicio, "hasta", fechaFin);
      
      // Filtrar fechas en el Frontend para evitar bloqueos del SDK/PostgREST
      let citasFiltradas = data;
      if (fechaInicio && fechaFin) {
        citasFiltradas = data.filter((cita: any) => 
          cita.fecha >= fechaInicio && 
          cita.fecha <= fechaFin &&
          cita.estado !== 'cerrado_perdido' &&
          cita.estado !== 'no_asistio'
        );
      }

      const formattedData = citasFiltradas.map((cita: any) => {
        const horaCorta = cita.hora ? cita.hora.substring(0, 5) : '';
        return {
          ...cita,
          hora: horaCorta,
          start: `${cita.fecha}T${horaCorta}`,
          title: `${cita.cliente_nombre} - Asesora: ${cita.asesoras?.nombre_completo || 'Sin Asignar'} - Sede: ${cita.sedes?.nombre || 'Sin Sede'}`
        };
      });
      setCitas(formattedData);
    }
    setLoading(false);
  };

  const nextWeek = () => {
    const next = new Date(currentDate);
    next.setDate(currentDate.getDate() + 7);
    setCurrentDate(next);
  };

  const prevWeek = () => {
    const prev = new Date(currentDate);
    prev.setDate(currentDate.getDate() - 7);
    setCurrentDate(prev);
  };

  const getDaysOfWeek = () => {
    const days = [];
    const start = new Date(currentDate);
    start.setDate(currentDate.getDate() - currentDate.getDay() + 1); // Lunes
    for (let i = 0; i < 6; i++) { // Lunes a Sábado
      const day = new Date(start);
      day.setDate(start.getDate() + i);
      days.push(day);
    }
    return days;
  };

  const daysOfWeek = getDaysOfWeek();
  const daysNames = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm shadow-gray-50">
        <div>
          <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-400 hover:text-rose-500 transition-colors mb-2 group">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Volver al Dashboard
          </Link>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight">Calendario de Citas</h1>
          <p className="text-sm text-gray-500 font-medium mt-1">
            Visualiza y administra la disponibilidad por sede
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
              <option value="all">Todas las sedes</option>
              {sedes.map(sede => (
                <option key={sede.id} value={sede.id}>{sede.nombre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* CALENDAR CONTROLS */}
      <div className="flex items-center justify-between bg-white p-4 rounded-2xl border border-gray-100 shadow-sm shadow-gray-50">
        <button onClick={prevWeek} className="p-2 hover:bg-gray-50 rounded-lg text-gray-600 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2 font-black text-gray-800">
          <CalendarIcon className="w-5 h-5 text-rose-500" />
          {daysOfWeek[0].toLocaleDateString('es-ES', { month: 'short', day: 'numeric' })} - 
          {daysOfWeek[5].toLocaleDateString('es-ES', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <button onClick={nextWeek} className="p-2 hover:bg-gray-50 rounded-lg text-gray-600 transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* CALENDAR GRID */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm shadow-gray-50 overflow-hidden relative">
        {loading && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-sm z-10 flex items-center justify-center">
            <span className="text-sm font-black text-gray-400 tracking-widest uppercase">Sincronizando...</span>
          </div>
        )}
        <div className="overflow-x-auto custom-scrollbar">
          <div className="min-w-[800px]">
            <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50/50">
              <div className="p-4 flex items-center justify-center border-r border-gray-100 text-xs font-black text-gray-400 uppercase tracking-widest">
                <Clock className="w-4 h-4 mr-2" /> Hora
              </div>
              {daysOfWeek.map((day, i) => (
                <div key={i} className="p-4 text-center border-r border-gray-100 last:border-0">
                  <div className="text-xs font-black text-gray-400 uppercase tracking-widest">{daysNames[i]}</div>
                  <div className="text-lg font-black text-gray-900 mt-1">{day.getDate()}</div>
                </div>
              ))}
            </div>

            <div className="divide-y divide-gray-100">
              {HORARIO_COMERCIAL.map(hora => (
                <div key={hora} className="grid grid-cols-7 relative group">
                  <div className="p-4 flex items-center justify-center border-r border-gray-100 text-sm font-black text-gray-500 bg-gray-50/30">
                    {hora}
                  </div>
                  {daysOfWeek.map((day, i) => {
                    const dateStr = day.toISOString().split('T')[0];
                    const citasBloque = citas.filter(c => c.fecha === dateStr && c.hora === hora);
                    
                    return (
                      <div key={i} className={`p-2 border-r border-gray-100 last:border-0 transition-colors min-h-[90px] flex flex-col gap-2 ${
                        citasBloque.length > 0 ? 'bg-rose-50/30' : 'hover:bg-gray-50'
                      }`}>
                        {citasBloque.map((cita) => (
                          <div 
                            key={cita.id} 
                            onClick={() => setCitaSeleccionada(cita)}
                            className="w-full bg-white border border-rose-100 rounded-xl p-3 shadow-sm shadow-rose-50/50 flex flex-col gap-1 hover:border-rose-300 transition-all cursor-pointer hover:scale-[1.02]"
                          >
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1.5 text-xs font-black text-rose-700 truncate w-full">
                                <User className="w-3 h-3 flex-shrink-0" />
                                <p className="font-black truncate text-slate-900" title={cita.title || cita.cliente_nombre}>{cita.title || cita.cliente_nombre}</p>
                              </div>
                            </div>
                            <div className="text-[10px] font-bold text-gray-400 truncate">
                              {cita.cliente_telefono}
                            </div>
                            <div className="mt-auto pt-1">
                              <span className={`text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border ${
                                cita.estado === 'pendiente_validacion' ? 'text-amber-600 bg-amber-50 border-amber-100' :
                                cita.estado === 'cita_confirmada' ? 'text-blue-600 bg-blue-50 border-blue-100' :
                                cita.estado === 'asistio_en_sesion' ? 'text-purple-600 bg-purple-50 border-purple-100' :
                                cita.estado === 'cerrado_ganado' ? 'text-emerald-600 bg-emerald-50 border-emerald-100' :
                                'text-gray-500 bg-gray-50 border-gray-200'
                              }`}>
                                {cita.estado.replace(/_/g, ' ')}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

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
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">⏰ Hora del Evento</p>
                  <p className="text-sm font-black text-slate-800">
                    {citaSeleccionada.fecha} - {citaSeleccionada.hora}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">📍 Sede Asignada</p>
                  <p className="text-sm font-black text-slate-800">
                    {citaSeleccionada.sedes?.nombre || 'Sin Sede'}
                  </p>
                </div>
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 mb-1">👤 Asesora</p>
                  <p className="text-sm font-black text-slate-800">
                    {citaSeleccionada.asesoras?.nombre_completo || 'Sin Asignar'}
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
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" /> Historial de Atención
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

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
