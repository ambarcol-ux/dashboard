'use client';
import { isRetiredDress } from '@/lib/inventory';
import { blockContractId, rentalPrice } from '@/lib/rental-price';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';

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
import { can, usePermissions } from '@/lib/use-permissions';
import DressThumb from '@/components/DressThumb';

const DRESS_FIELDS='id, codigo, nombre, categoria, talla, color, estado, sede_actual_id, sede_principal_id, clasificacion_id, precio_sugerido, precio_venta, para_alquiler, para_venta, foto_frente, foto_espalda, foto_detalle, imagen_url';
/** Dress photos (front first), for the card and the result list; tap to see them full screen. */
const dressPhotos=(d:{foto_frente?:string|null;foto_espalda?:string|null;foto_detalle?:string|null;imagen_url?:string|null})=>[d.foto_frente||d.imagen_url,d.foto_espalda,d.foto_detalle].filter((u):u is string=>!!u);

/** Adds the store names (where the dress belongs and where it is now) and its classification, so similar references can be told apart. */
async function withDressDetails<T extends {sede_actual_id?:string|null;sede_principal_id?:string|null;clasificacion_id?:string|null}>(rows:T[]){
  const siteIds=[...new Set(rows.flatMap(r=>[r.sede_actual_id,r.sede_principal_id]).filter((id):id is string=>!!id))];
  const classIds=[...new Set(rows.map(r=>r.clasificacion_id).filter((id):id is string=>!!id))];
  const [{data:sites},{data:classes}]=await Promise.all([
    siteIds.length?supabase.from('sedes').select('id, nombre').in('id',siteIds):Promise.resolve({data:[] as {id:string;nombre:string}[]}),
    classIds.length?supabase.from('clasificaciones_vestido').select('id, nombre').in('id',classIds):Promise.resolve({data:[] as {id:string;nombre:string}[]}),
  ]);
  const site=(id?:string|null)=>sites?.find(x=>x.id===id)?.nombre||null;
  return rows.map(r=>({...r,
    sede_nombre:site(r.sede_principal_id)||site(r.sede_actual_id),
    ubicacion_nombre:r.sede_actual_id&&r.sede_actual_id!==r.sede_principal_id?site(r.sede_actual_id):null,
    clasificacion:classes?.find(x=>x.id===r.clasificacion_id)?.nombre||null}));
}

export default function AvailabilityPage() {
  const readAccess = useVerifiedAccess();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [dress, setDress] = useState<any>(null);
  const [blocks, setBlocks] = useState<ContractBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [possibleDresses, setPossibleDresses] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any>(null);
  const perms = usePermissions(userProfile?.id ? String(userProfile.id) : null);
  
  // Deactivate Modal state
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [deactivateForm, setDeactivateForm] = useState({ motivo: 'Dañado', detalle: '' });
  const [submittingBaja, setSubmittingBaja] = useState(false);

  // Tooltip state for calendar
  const [selectedBlock, setSelectedBlock] = useState<ContractBlock | null>(null);
  const [contractPrices, setContractPrices] = useState<Record<string, number | null>>({});
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);

  useEffect(() => {
    const getProfile = async () => {
      const {user, profile} = await readAccess();
      if (user) {
        setUserProfile(profile);
      }
    };
    void getProfile().catch(() => {window.location.href='/login';});
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
    setCalendarMonth(new Date());

    try {
      if (manualDressId) {
        const { data: d, error: de } = await supabase
          .from('vestidos')
          .select(DRESS_FIELDS)
          .eq('id', manualDressId)
          .single();
        if (de) throw de;
        const [detailed] = await withDressDetails([d]);
        setDress(detailed);
        await fetchUnifiedHistory(d.id);
        setPossibleDresses([]);
      } else {
        const { data: results, error: dressError } = await supabase
          .from('vestidos')
          .select(DRESS_FIELDS)
          .or(`codigo.ilike.%${searchQuery.trim()}%,nombre.ilike.%${searchQuery.trim()}%,categoria.ilike.%${searchQuery.trim()}%,color.ilike.%${searchQuery.trim()}%`)
          .eq('archivado', false)
          .order('codigo');

        if (dressError) throw dressError;

        if (!results || results.length === 0) {
          setError('No se encontró ningún vestido con esa referencia.');
          setLoading(false);
          return;
        }

        const detailed = await withDressDetails(results);
        if (detailed.length === 1) {
          setDress(detailed[0]);
          await fetchUnifiedHistory(detailed[0].id);
        } else {
          setPossibleDresses(detailed);
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
          vestido_id,
          contratos!inner (
            id,
            numero_contrato,
            cliente_nombre,
            fecha_evento,
            tipo_evento,
            tipo_entrega,
            estado,
            anticipo,
            fecha_entrega_envio,
            fecha_pre_xv,
            fechas_bloqueo_especial,
            fecha_disponibilidad_real,
            valor_total,
            created_at
          )
        `)
        .eq('vestido_id', dressId);

      if (contrError) throw contrError;

      // Algunos contratos antiguos guardan el vestido directamente en contratos.
      const { data: legacyContracts, error: legacyError } = await supabase
        .from('contratos')
        .select('id, vestido_id, numero_contrato, cliente_nombre, tipo_evento, estado, anticipo, fecha_evento, fecha_pre_xv, fechas_bloqueo_especial, bloqueo_especial_fecha, bloqueo_especial_vestido_id, valor_total, created_at')
        .eq('vestido_id', dressId);
      if (legacyError) throw legacyError;

      const { data: specialLocks, error: specialLocksError } = await supabase
        .from('contratos')
        .select('id, numero_contrato, cliente_nombre, estado, anticipo, bloqueo_especial_referencia, bloqueo_especial_fecha, bloqueo_especial_vestido_id, valor_total, created_at')
        .eq('bloqueo_especial_vestido_id', dressId)
        .not('estado', 'in', '("cancelado","anulado","rechazado","CANCELADO","ANULADO","RECHAZADO")')
        .not('bloqueo_especial_fecha', 'is', null);

      if (specialLocksError) throw specialLocksError;

      // Reservas de vestidos de otras sedes (rol con «Todas las sedes» en Agenda de vestidos): fechas y contrato, sin datos de la clienta.
      const { data: otherSites } = await supabase.rpc('disponibilidad_contratos_vestido', { p_vestido: dressId });
      const idOf = (c: unknown) => (c as { id?: string } | null)?.id;
      const seen = new Set([...(contracts || []).map(i => idOf(i.contratos)), ...(legacyContracts || []).map(idOf), ...(specialLocks || []).map(idOf)]);
      const extra = (Array.isArray(otherSites) ? otherSites as { id: string }[] : []).filter(c => !seen.has(c.id));

      // Todas las reservas, incluido el legado, usan el mismo cálculo.
      const rawBlocks = generateBlockedRanges([
        ...(contracts || []),
        ...(legacyContracts || []),
        ...(specialLocks || []).map((lock: any) => ({ vestido_id: dressId, contratos: lock })),
        ...extra.map(c => ({ vestido_id: dressId, contratos: c }))
      ]);
      setBlocks(Array.from(new Map(rawBlocks.map(block => [block.id, block])).values()));
      // Precio pactado en cada contrato (valor del alquiler), para la tarjeta y el detalle de cada reserva.
      setContractPrices(Object.fromEntries([...(contracts || []).map((item: any) => item.contratos), ...(legacyContracts || []), ...(specialLocks || []), ...extra]
        .filter(Boolean).map((c: any) => [c.id, c.valor_total == null ? null : Number(c.valor_total)])));

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
      
      const historyContracts = Array.from(new Map([
        ...(contracts || []).map((item: any) => item.contratos), ...(legacyContracts || [])
      ].map((c: any) => [c.id,c])).values());
      historyContracts.forEach(c => {
        unified.push({
          id: `contract-${c.id}`,
          fecha: c.fecha_evento ? new Date(`${c.fecha_evento}T12:00:00`) : new Date(c.created_at),
          tipo: 'alquiler',
          titulo: `Alquiler - Contrato #${c.numero_contrato}`,
          subtitulo: `Cliente: ${c.cliente_nombre}`,
          detalle: `Evento tipo ${c.tipo_evento}`
        });
      });

      historyContracts.forEach((lock: any) => {
        if (['cancelado','anulado','rechazado'].includes(String(lock?.estado||'').toLowerCase())) return;
        const dates = Array.isArray(lock?.fechas_bloqueo_especial) ? lock.fechas_bloqueo_especial : [];
        dates.forEach((value: string, index: number) => {
          unified.push({
            id: `special-array-${lock.id}-${index}-${value}`,
            fecha: new Date(`${value}T12:00:00`),
            tipo: 'bloqueo_especial',
            titulo: `Bloqueo fecha especial - Contrato #${lock.numero_contrato}`,
            subtitulo: `Cliente: ${lock.cliente_nombre}`,
            detalle: 'Esta fecha bloquea automáticamente este vestido por estar vinculado al contrato.'
          });
        });
      });

      (specialLocks || []).forEach((lock: any) => {
        unified.push({
          id: `special-legacy-${lock.id}`,
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
      setBlocks([]); setHistory([]);
      throw err;
    }
  };

  const handleDeactivate = async () => {
    if (!dress || !userProfile) return;
    setSubmittingBaja(true);
    try {
      const { error: updateError } = await supabase
        .from('vestidos')
        .update({ estado: 'Dañado/Baja' })
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
  const physicallyUnavailable = Boolean(dress && String(dress.estado || '').toLowerCase() !== 'disponible');
  const unavailableNow = Boolean(currentOccupation || physicallyUnavailable);
  
  // Modifiers para el DayPicker
  const occupiedDates = blocks.map(b => ({ from: b.start, to: b.end }));
  const eventDates = blocks.map(b => b.eventDate);

  const modifiers = {
    occupied: occupiedDates,
    eventDay: eventDates
  };

  const modifiersStyles = {
    occupied: { 
      backgroundColor: '#ffe4e6', // rose-100
      color: '#e11d48', // rose-600
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

  const blockPrice = (block: ContractBlock) => { const id = blockContractId(block.id); return rentalPrice(id ? contractPrices[id] : null, dress?.precio_sugerido, true); };
  const PriceTag = ({ price }: { price: ReturnType<typeof rentalPrice> }) => <p className="text-xs font-bold text-gray-600"><span className="uppercase tracking-widest text-[10px] text-gray-400">{price.label}:</span> <span className={price.value === null ? 'text-gray-400' : 'text-emerald-700'}>{price.text}</span></p>;
  const selectedDayBlocks = selectedDate ? blocks.filter(b => isWithinInterval(startOfDay(selectedDate), {start:b.start,end:b.end})) : [];
  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
    const dayStart = startOfDay(day);
    const block = blocks.find(b => isWithinInterval(dayStart, { start: b.start, end: b.end }));
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
                  placeholder="Ej: 5051, CC6018, verde lila..."
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
                        {dressPhotos(d)[0] ? <DressThumb src={dressPhotos(d)[0]} alt={`Ref. ${d.codigo?.trim()}`} title={`Ref. ${d.codigo?.trim()}`} zoom className="w-12 h-16 rounded-xl object-cover border border-gray-100 shrink-0" /> : <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center font-black text-gray-900 border border-gray-100 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                          {d.codigo?.trim().substring(0,2)}
                        </div>}
                        <div className="text-left min-w-0">
                          <p className="font-black text-gray-900 uppercase">Ref. {d.codigo?.trim()}</p>
                          <p className="text-sm font-bold text-gray-700 uppercase break-words">{d.nombre?.trim() || 'Sin nombre en inventario'}</p>
                          <p className="text-xs font-bold text-emerald-700">Precio lista: {rentalPrice(null, d.precio_sugerido, false).text}</p>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">
                            {d.sede_nombre ? `Sede ${d.sede_nombre}` : 'Sede sin asignar'}
                            {d.ubicacion_nombre && ` · Ahora en ${d.ubicacion_nombre}`}
                            {[d.clasificacion, d.talla?.trim() && `Talla ${d.talla.trim()}`, d.color?.trim()].filter(Boolean).map(x => ` · ${x}`).join('')}
                          </p>
                        </div>
                     </div>
                     <span className="text-[10px] font-black text-rose-500 uppercase tracking-widest bg-white px-4 py-2 rounded-xl shadow-sm">Ver Calendario →</span>
                   </button>
                 ))}
               </div>
            </div>
          )}

          {dress && !loading && !error && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* Dynamic Status Card */}
              <div className={`rounded-[2rem] p-8 border shadow-lg flex flex-col md:flex-row items-center justify-between gap-6 transition-colors ${
                unavailableNow 
                  ? 'bg-rose-600 border-rose-700 text-white' 
                  : 'bg-emerald-500 border-emerald-600 text-white'
              }`}>
                <div className="flex items-center gap-6">
                  {dressPhotos(dress).length ? <div className="flex flex-col items-center gap-2 shrink-0">
                    <DressThumb src={dressPhotos(dress)[0]} alt={`Ref. ${dress.codigo?.trim()}`} title={`Ref. ${dress.codigo?.trim()}`} zoom className="w-28 h-36 rounded-2xl object-cover border-4 border-white/40 shadow-lg bg-white" />
                    {dressPhotos(dress).length > 1 && <div className="flex gap-1">{dressPhotos(dress).slice(1).map((u, i) => <DressThumb key={u} src={u} alt={`Ref. ${dress.codigo?.trim()} foto ${i + 2}`} title={`Ref. ${dress.codigo?.trim()}`} zoom className="w-10 h-12 rounded-lg object-cover border-2 border-white/40 bg-white" />)}</div>}
                  </div> : <div className={`w-20 h-20 rounded-[1.5rem] flex items-center justify-center font-black text-3xl shadow-inner ${
                    unavailableNow ? 'bg-rose-700 text-rose-100' : 'bg-emerald-600 text-emerald-50'
                  }`}>
                     {dress.codigo?.trim().substring(0, 2)}
                  </div>}
                  <div>
                    <h2 className="text-4xl font-black tracking-tight">Ref. {dress.codigo?.trim()}</h2>
                    <p className="text-lg font-black uppercase mt-1">{dress.nombre?.trim() || 'Sin nombre en inventario'}</p>
                    <p className="text-sm font-bold mt-1 opacity-90">{dress.para_alquiler === false ? 'Solo venta: no se alquila' : `Precio lista: ${rentalPrice(null, dress.precio_sugerido, false).text}`}{dress.para_venta && dress.precio_venta ? ` · Venta: $${Number(dress.precio_venta).toLocaleString('es-CO')}` : ''}</p>
                    <p className="text-sm font-bold uppercase tracking-widest opacity-80 mt-1">
                      {dress.sede_nombre ? `Sede ${dress.sede_nombre}` : 'Sede sin asignar'}
                      {dress.ubicacion_nombre && ` · Ahora en ${dress.ubicacion_nombre}`}
                      {[dress.clasificacion, dress.talla?.trim() && `Talla ${dress.talla.trim()}`].filter(Boolean).map(x => ` • ${x}`).join('')}
                    </p>
                    {can(perms, 'traslados.solicitar') && (
                      <Link href={`/dashboard/traslados?vestido=${dress.id}`} className="inline-block mt-3 px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-black uppercase tracking-widest">
                        Pedir traslado / préstamo
                      </Link>
                    )}
                  </div>
                </div>
                
                <div className="flex flex-col items-center md:items-end text-center md:text-right">
                  {unavailableNow ? (
                    <>
                      <div className="flex items-center gap-2 mb-1">
                        <XCircle className="w-8 h-8 opacity-90" />
                        <span className="text-2xl font-black uppercase tracking-wider">Ocupado</span>
                      </div>
                      <p className="text-sm font-bold opacity-90">{currentOccupation ? `Contrato #${currentOccupation.contractNumber}` : `Estado físico: ${dress.estado}`}</p>
                      <p className="text-xs opacity-75 mt-1">{physicallyUnavailable ? 'Pendiente de registrar ingreso y alistamiento' : `Se libera el ${format(currentOccupation!.end, "d 'de' MMMM", { locale: es })}`}</p>
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
                    month={calendarMonth}
                    onMonthChange={setCalendarMonth}
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
                      <span className="text-xs font-bold text-gray-500 uppercase">Fecha de uso</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-100"></div>
                      <span className="text-xs font-bold text-gray-500 uppercase">Periodo reservado</span>
                    </div>
                  </div>
                </div>

                {/* Info Panel */}
                <div className="flex-1 w-full bg-gray-50 rounded-[2rem] p-6 border border-gray-100 min-h-[350px]">
                  {selectedDayBlocks.length > 1 && <div className="mb-4 space-y-2 text-gray-900"><h4 className="font-bold">{selectedDayBlocks.length} bloqueos coinciden en esta fecha</h4>{selectedDayBlocks.map(block => <button type="button" key={block.id} onClick={() => setSelectedBlock(block)} aria-pressed={selectedBlock?.id === block.id} className="block w-full rounded-xl border border-rose-200 bg-white p-3 text-left text-sm"><strong>{block.contractNumber} · {block.type}</strong><p>{block.clientName}</p><p>{format(block.start,'d MMM yyyy',{locale:es})} – {format(block.end,'d MMM yyyy',{locale:es})}</p><PriceTag price={blockPrice(block)} /></button>)}</div>}
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
                          <p className="text-sm text-gray-500 mt-1">{dress?.nombre?.trim()} · Ref. {dress?.codigo?.trim()}</p>
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100">
                          <p className="text-xs font-black text-gray-400 uppercase mb-1">{blockPrice(selectedBlock).label}</p>
                          <p className={`text-2xl font-black ${blockPrice(selectedBlock).value === null ? 'text-gray-400' : 'text-gray-900'}`}>{blockPrice(selectedBlock).text}</p>
                        </div>

                        <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-black text-gray-400 uppercase mb-1">Fecha de uso</p>
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
                          href={`/dashboard?contratoId=${selectedBlock.id.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/)?.[0] || ''}`}
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

              <section className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-900"><h3 className="font-black">Todos los bloqueos del vestido ({blocks.length})</h3><p className="mb-3 text-sm text-gray-500">Incluye fechas anteriores y futuras. Selecciona un bloqueo para verlo en el calendario.</p><div className="grid gap-2">{blocks.map(block => <button type="button" key={block.id} onClick={() => {setCalendarMonth(block.eventDate);setSelectedDate(block.eventDate);setSelectedBlock(block);}} className="rounded-xl border border-rose-100 p-3 text-left text-sm"><strong>{block.contractNumber} · {block.type}</strong><p>{block.clientName}</p><p>{format(block.start,'d MMM yyyy',{locale:es})} – {format(block.end,'d MMM yyyy',{locale:es})}</p><PriceTag price={blockPrice(block)} /></button>)}</div>{!blocks.length && <p>No hay bloqueos registrados para este vestido.</p>}</section>
              {/* Botón Dar de baja (Admin) */}
              {userProfile?.rol === 'admin' && !isRetiredDress(dress.estado) && (
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

