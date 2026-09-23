'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Search, 
  ChevronLeft, 
  Clock, 
  FileText, 
  AlertTriangle,
  Loader2,
  CalendarDays,
  Trash2,
  Info,
  CheckCircle2,
  XCircle
} from 'lucide-react';
import Link from 'next/link';
import { toast, Toaster } from 'sonner';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { es } from 'date-fns/locale';
import { isWithinInterval, startOfDay, endOfDay, format, subDays, parseISO } from 'date-fns';
import { generateBlockedRanges, isCurrentlyOccupied, ContractBlock } from '@/lib/availability';

export default function AvailabilityPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dress, setDress] = useState<any>(null);
  const [blocks, setBlocks] = useState<ContractBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [possibleDresses, setPossibleDresses] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  
  // Deactivate Modal state
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [deactivateForm, setDeactivateForm] = useState({ motivo: 'Dañado', detalle: '' });
  const [submittingBaja, setSubmittingBaja] = useState(false);

  // Tooltip state for calendar
  const [selectedBlock, setSelectedBlock] = useState<ContractBlock | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

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

  const handleSearch = async (e?: React.FormEvent, manualDressId?: string) => {
    if (e) e.preventDefault();
    if (!searchQuery.trim() && !manualDressId) return;

    setLoading(true);
    setError(null);
    if (!manualDressId) {
      setDress(null);
      setPossibleDresses([]);
    }
    setBlocks([]);
    setSelectedBlock(null);
    setSelectedDate(undefined);

    try {
      if (manualDressId) {
        const { data: d, error: de } = await supabase
          .from('vestidos')
          .select('id, codigo, nombre, categoria, talla, color, estado, sede_actual_id, sedes(nombre)')
          .eq('id', manualDressId)
          .single();
        if (de) throw de;
        setDress(d);
        await fetchUnifiedHistory(d.id);
        setPossibleDresses([]);
      } else {
        const { data: results, error: dressError } = await supabase
          .from('vestidos')
          .select('id, codigo, nombre, categoria, talla, color, estado, sede_actual_id, sedes(nombre)')
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
            fecha_pre_xv,
            fecha_disponibilidad_real,
            created_at
          )
        `)
        .eq('vestido_id', dressId);

      if (contrError) throw contrError;

      const { data: specialLocks, error: specialLocksError } = await supabase
        .from('contratos')
        .select('id, numero_contrato, cliente_nombre, estado, bloqueo_especial_referencia, bloqueo_especial_fecha, created_at')
        .eq('bloqueo_especial_vestido_id', dressId)
        .not('estado', 'in', '("cancelado","anulado","rechazado","CANCELADO","ANULADO","RECHAZADO")')
        .not('bloqueo_especial_fecha', 'is', null);

      if (specialLocksError) throw specialLocksError;

      // Generar los bloques reales de disponibilidad + bloqueos especiales de un día
      const newBlocks = generateBlockedRanges(contracts || []);
      const specialCalendarBlocks: ContractBlock[] = (specialLocks || []).flatMap((lock: any) => {
        if (!lock.bloqueo_especial_fecha) return [];
        const date = parseISO(lock.bloqueo_especial_fecha);
        return [{
          id: `special-${lock.id}`,
          contractNumber: lock.numero_contrato,
          clientName: lock.cliente_nombre,
          type: 'Fecha especial',
          warningStart: startOfDay(date),
          start: startOfDay(date),
          end: endOfDay(date),
          eventDate: startOfDay(date)
        }];
      });
      setBlocks([...newBlocks, ...specialCalendarBlocks].sort((a, b) => a.start.getTime() - b.start.getTime()));

      // 2. Fetch Bitácora Local
      let logs: any[] = [];
      const { data: logsData, error: logsError } = await supabase
        .from('bitacora_vestidos')
        .select('*')
        .eq('vestido_id', dressId)
        .order('created_at', { ascending: false });

      if (!logsError) {
         logs = logsData || [];
      }

      // 3. Procesar Historial Unificado (Timeline)
      const unified: any[] = [];
      
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

      (specialLocks || []).forEach((lock: any) => {
        unified.push({
          id: `special-${lock.id}`,
          fecha: new Date(`${lock.bloqueo_especial_fecha}T12:00:00`),
          tipo: 'bloqueo_especial',
          titulo: `Bloqueo fecha especial - Contrato #${lock.numero_contrato}`,
          subtitulo: `Cliente: ${lock.cliente_nombre}`,
          detalle: `Referencia ${lock.bloqueo_especial_referencia || '—'} reservada exclusivamente para esta fecha.`
        });
      });

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
      const { error: updateError } = await supabase
        .from('vestidos')
        .update({ estado: 'De Baja' })
        .eq('id', dress.id);

      if (updateError) throw updateError;

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
      handleSearch(undefined, dress.id);
    } catch (err: any) {
      toast.error('Error al dar de baja: ' + err.message);
    } finally {
      setSubmittingBaja(false);
    }
  };

  const currentOccupation = isCurrentlyOccupied(blocks);
  
  // Modifiers para el DayPicker
  const occupiedDates = blocks.map(b => ({ from: b.start, to: b.end }));
  const warningDates = blocks.map(b => ({ from: b.warningStart, to: subDays(b.start, 1) }));
  const eventDates = blocks.map(b => b.eventDate);

  const modifiers = {
    occupied: occupiedDates,
    warning: warningDates,
    eventDay: eventDates
  };

  const modifiersStyles = {
    occupied: { 
      backgroundColor: '#ffe4e6', // rose-100
      color: '#e11d48', // rose-600
      fontWeight: 'bold',
      borderRadius: '8px'
    },
    warning: {
      backgroundColor: '#fef08a', // yellow-200
      color: '#854d0e', // yellow-800
      fontWeight: 'bold',
      borderRadius: '8px'
    },
    eventDay: {
      backgroundColor: '#e11d48', // rose-600
      color: 'white',
      fontWeight: 'bold',
      borderRadius: '8px'
    }
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    const dayStart = startOfDay(day);
    const block = blocks.find(b => isWithinInterval(dayStart, { start: b.warningStart, end: b.end }));
    setSelectedBlock(block || null);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Toaster position="top-center" richColors />
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
             <span className="text-[10px] font-black text-rose-600 uppercase">Calendario Interactivo</span>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto p-6 space-y-8 pb-32">
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
              {/* Dynamic Status Card */}
              <div className={`rounded-[2rem] p-8 border shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 transition-colors ${
                currentOccupation 
                  ? 'bg-rose-600 border-rose-700 text-white' 
                  : 'bg-emerald-500 border-emerald-600 text-white'
              }`}>
                <div className="flex items-center gap-6">
                  <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center font-black text-3xl shadow-inner ${
                    currentOccupation ? 'bg-rose-700 text-rose-100' : 'bg-emerald-600 text-emerald-50'
                  }`}>
                     {dress.codigo.substring(0, 2)}
                  </div>
                  <div>
                    <h2 className="text-4xl font-black tracking-tight">{dress.codigo}</h2>
                    <p className="text-sm font-bold uppercase tracking-widest opacity-80 mt-1">
                      {dress.sedes?.nombre || 'BOGOTÁ'} • {dress.talla}
                    </p>
                  </div>
                </div>
                
                <div className="flex flex-col items-center md:items-end text-center md:text-right">
                  {currentOccupation ? (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-8 h-8 opacity-90" />
                        <span className="text-2xl font-black uppercase tracking-wider">Ocupado</span>
                      </div>
                      <p className="text-sm font-bold opacity-90">Contrato #{currentOccupation.contractNumber}</p>
                      <p className="text-xs opacity-75 mt-1">Se libera el {format(currentOccupation.end, "d 'de' MMMM", { locale: es })}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle2 className="w-8 h-8 opacity-90" />
                        <span className="text-2xl font-black uppercase tracking-wider">Disponible</span>
                      </div>
                      <p className="text-sm font-bold opacity-90">Listo para entregar hoy</p>
                    </>
                  )}
                </div>
              </div>

              {/* Calendario Interactivo */}
              <div className="bg-white rounded-[2.5rem] p-8 border border-gray-100 shadow-xl flex flex-col md:flex-row gap-12 items-start justify-center">
                <div className="flex-1 max-w-[400px] mx-auto overflow-x-auto">
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-6 text-center">Calendario de Ocupación</h3>
                  
                  <style>{`
                    .rdp {
                      --rdp-cell-size: 45px;
                      --rdp-accent-color: #e11d48;
                      --rdp-background-color: #ffe4e6;
                      margin: 0;
                    }
                    .rdp-day { border-radius: 12px; font-weight: 600; }
                    .rdp-day_today { color: #e11d48; font-weight: 900; }
                    .rdp-button:hover:not([disabled]):not(.rdp-day_selected) { background-color: #f3f4f6; }
                  `}</style>
                  
                  <DayPicker
                    mode="single"
                    locale={es}
                    selected={selectedDate}
                    onSelect={(d) => d && handleDayClick(d)}
                    modifiers={modifiers}
                    modifiersStyles={modifiersStyles}
                    showOutsideDays
                  />

                  <div className="flex justify-center gap-6 mt-8 flex-wrap">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-600"></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Día del Evento</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-100"></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Bloqueo Estricto (5 días)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-200"></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Logística Preventiva (5 días)</span>
                    </div>
                  </div>
                </div>

                {/* Info Panel */}
                <div className="flex-1 w-full bg-gray-50 rounded-[2rem] p-6 border border-gray-100 min-h-[350px]">
                  {selectedBlock ? (
                    <div className="space-y-6 animate-in fade-in">
                      <div className="flex items-center gap-3">
                        <div className="bg-rose-500 text-white p-2 rounded-xl">
                          <Info className="w-5 h-5" />
                        </div>
                        <h4 className="text-lg font-black text-gray-900 uppercase">Detalle del Bloqueo</h4>
                      </div>
                      
                      <div className="space-y-4">
                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                          <p className="text-xs font-black text-gray-400 uppercase mb-1">Contrato</p>
                          <p className="text-lg font-bold text-rose-600">#{selectedBlock.contractNumber}</p>
                          <p className="text-sm text-gray-600 mt-1">{selectedBlock.clientName}</p>
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-black text-gray-400 uppercase mb-1">Día del Evento</p>
                            <p className="font-bold text-gray-900">{format(selectedBlock.eventDate, "d MMM yyyy", { locale: es })}</p>
                          </div>
                          <div>
                            <p className="text-xs font-black text-gray-400 uppercase mb-1">Tipo</p>
                            <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-bold uppercase">{selectedBlock.type}</span>
                          </div>
                        </div>

                        <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100 text-rose-800">
                          <div className="flex items-center gap-2 mb-2">
                            <Clock className="w-4 h-4 text-rose-500" />
                            <p className="text-xs font-black uppercase">Periodo Ocupado Completo</p>
                          </div>
                          <p className="text-sm font-bold">Desde: {format(selectedBlock.start, "d MMM yyyy", { locale: es })}</p>
                          <p className="text-sm font-bold">Hasta: {format(selectedBlock.end, "d MMM yyyy", { locale: es })}</p>
                        </div>
                        
                        <Link 
                          href={`/dashboard?contratoId=${selectedBlock.id.replace('evt-', '').replace('pxv-', '')}`}
                          className="w-full bg-gray-900 hover:bg-black text-white py-3 rounded-xl flex items-center justify-center gap-2 transition-all font-black uppercase tracking-widest text-xs shadow-md mt-4 active:scale-95 group"
                        >
                          <FileText className="w-4 h-4 group-hover:scale-110 transition-transform" />
                          Ir al Contrato Completo
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50 space-y-4 py-12">
                      <CalendarDays className="w-12 h-12 text-gray-400" />
                      <div>
                        <p className="font-black text-gray-900 uppercase">Sin selección</p>
                        <p className="text-sm font-bold text-gray-500 mt-1 max-w-[200px]">Haz clic en un día rojo del calendario para ver por qué está bloqueado.</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Botón Dar de baja (Admin) */}
              {userProfile?.rol === 'admin' && dress.estado !== 'De Baja' && (
                <div className="flex justify-end">
                  <button 
                    onClick={() => setIsDeactivateModalOpen(true)}
                    className="px-6 py-3 bg-white hover:bg-rose-50 text-rose-600 rounded-2xl transition-all flex items-center gap-2 group border border-rose-100 shadow-sm font-black uppercase text-xs"
                  >
                    <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
                    Dar de Baja Definitiva
                  </button>
                </div>
              )}

              {/* Historial Unificado */}
              {history.length > 0 && (
                <div className="mt-8">
                  <h3 className="text-sm font-black text-gray-400 uppercase tracking-[0.2em] ml-2 mb-4">Historial de Movimientos</h3>
                  <div className="bg-white rounded-[2rem] p-6 border border-gray-100 shadow-sm space-y-4">
                    {history.map((h, i) => (
                      <div key={h.id + i} className="flex gap-4 p-4 hover:bg-gray-50 rounded-2xl transition-colors border-l-4 border-transparent hover:border-gray-300">
                        <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center shrink-0">
                          {h.tipo === 'alquiler' ? <FileText className="w-5 h-5 text-indigo-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">{h.titulo}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{h.subtitulo}</p>
                          {h.detalle && <p className="text-xs font-medium text-gray-400 mt-2 bg-white px-3 py-1.5 rounded-lg border border-gray-100 inline-block">{h.detalle}</p>}
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest bg-gray-100 px-3 py-1 rounded-full">{h.fecha.toLocaleDateString()}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
      
      {/* Modal Deactivate */}
      {isDeactivateModalOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/60 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="bg-rose-50 px-6 py-4 flex justify-between items-center text-rose-900 border-b border-rose-100">
              <h3 className="font-black text-lg flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-rose-600"/> Confirmar Baja
              </h3>
              <button disabled={submittingBaja} onClick={() => setIsDeactivateModalOpen(false)} className="text-rose-400 hover:text-rose-600 transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4 bg-white">
              <p className="text-sm text-gray-600 font-medium">Vas a dar de baja el vestido <strong className="text-gray-900">{dress?.codigo}</strong>. Esto lo sacará de circulación definitivamente.</p>
              
              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Motivo</label>
                <select 
                  value={deactivateForm.motivo}
                  onChange={(e) => setDeactivateForm({...deactivateForm, motivo: e.target.value})}
                  className="w-full bg-gray-50 border-2 border-transparent focus:border-rose-200 focus:bg-white rounded-xl px-4 py-3 outline-none transition-all font-bold text-gray-700"
                >
                  <option>Dañado en Lavandería</option>
                  <option>Dañado por Cliente</option>
                  <option>Perdido / Extraviado</option>
                  <option>Vendido</option>
                  <option>Otro</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black text-gray-400 uppercase tracking-widest mb-2">Detalles (Opcional)</label>
                <textarea 
                  value={deactivateForm.detalle}
                  onChange={(e) => setDeactivateForm({...deactivateForm, detalle: e.target.value})}
                  placeholder="Explica qué pasó..."
                  className="w-full h-24 bg-gray-50 border-2 border-transparent focus:border-rose-200 focus:bg-white rounded-xl p-4 outline-none resize-none transition-all text-sm font-medium text-gray-700"
                />
              </div>

              <div className="pt-2 flex gap-3">
                <button 
                  type="button"
                  disabled={submittingBaja}
                  onClick={() => setIsDeactivateModalOpen(false)}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 rounded-xl transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeactivate}
                  disabled={submittingBaja}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-3 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submittingBaja ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                  Confirmar Baja
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
