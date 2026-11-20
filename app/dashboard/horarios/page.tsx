'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Clock, Save, User, CalendarDays, AlertTriangle, ArrowLeft, BarChart3, Building2 } from 'lucide-react';
import { toast } from 'sonner';

type Asesora = {
  asesora_id: string;
  nombre: string;
  sede_id: string | null;
  sede_nombre: string | null;
};

type HorarioDia = {
  entrada_asignada: string;
  salida_asignada: string;
  entrada_real: string;
  salida_real: string;
  con_almuerzo: boolean;
  minutos_trabajados: number;
};

type AsesoraHorario = Record<string, HorarioDia>;
type EstadoSemanas = Record<string, AsesoraHorario>;

type ReporteAsesora = {
  asesora_id: string;
  nombre: string;
  sede_nombre: string;
  minutos_totales: number;
};

type ReporteSede = {
  sede_id: string;
  sede_nombre: string;
  minutos_totales: number;
};

type ReporteMensual = {
  porAsesora: ReporteAsesora[];
  porSede: ReporteSede[];
};

function getStartOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
  return new Date(date.setDate(diff));
}

function addDays(date: Date, days: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateISO(date: Date) {
  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  return [year, month, day].join('-');
}

function formatDateHeader(d: Date) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
}

function formatDateHeaderLong(d: Date) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDayName(d: Date) {
  return d.toLocaleDateString('es-ES', { weekday: 'long' });
}

function formatDayNumber(d: Date) {
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

export default function HorariosPage() {
  const [asesoras, setAsesoras] = useState<Asesora[]>([]);
  const [horarios, setHorarios] = useState<EstadoSemanas>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reporteMensual, setReporteMensual] = useState<ReporteMensual>({ porAsesora: [], porSede: [] });
  const [showReporte, setShowReporte] = useState(false);
  const [sedeFiltro, setSedeFiltro] = useState<string>('todas');
  const [semanas, setSemanas] = useState(4);
  const [inicio, setInicio] = useState(() => { const t = new Date(); t.setHours(0, 0, 0, 0); return formatDateISO(getStartOfWeek(t)); });
  const [cambios, setCambios] = useState<Set<string>>(new Set());

  // Rango visible: desde el lunes elegido, N semanas (hasta ~1 mes)
  const startOfRange = useMemo(() => new Date(inicio + 'T00:00:00'), [inicio]);
  const today = startOfRange;
  const diasRango = useMemo(() => Array.from({ length: semanas * 7 }).map((_, i) => addDays(startOfRange, i)), [startOfRange, semanas]);
  const semanasRango = useMemo(() => Array.from({ length: semanas }).map((_, w) => diasRango.slice(w * 7, w * 7 + 7)), [diasRango, semanas]);
  const diasSemana = diasRango;

  const fetchDatos = async () => {
    setLoading(true);
    try {
      // 1. Fetch asesoras activas desde la tabla maestra
      const { data: dataAsesoras, error: errAsesoras } = await supabase
        .from('asesoras')
        .select(`
          id, 
          nombre_completo, 
          sede_id, 
          sedes(nombre)
        `)
        .eq('activo', true);

      if (errAsesoras) throw errAsesoras;

      const mapaAsesoras = new Map<string, Asesora>();
      dataAsesoras?.forEach((a: any) => {
        mapaAsesoras.set(a.id, {
          asesora_id: a.id,
          nombre: a.nombre_completo || 'Sin Nombre',
          sede_id: a.sede_id,
          sede_nombre: a.sedes?.nombre || 'Global'
        });
      });
      const listaAsesoras = Array.from(mapaAsesoras.values()).sort((a, b) => a.nombre.localeCompare(b.nombre));
      setAsesoras(listaAsesoras);

      // 2. Fetch horarios de la semana actual
      const { data: registros, error: errHorarios } = await supabase
        .from('control_horarios')
        .select('*')
        .gte('fecha', formatDateISO(diasRango[0]))
        .lte('fecha', formatDateISO(diasRango[diasRango.length - 1]));

      if (errHorarios) throw errHorarios;

      const estadoInicial: EstadoSemanas = {};
      listaAsesoras.forEach(a => {
        estadoInicial[a.asesora_id] = {};
        diasSemana.forEach(d => {
          estadoInicial[a.asesora_id][formatDateISO(d)] = {
            entrada_asignada: '',
            salida_asignada: '',
            entrada_real: '',
            salida_real: '',
            con_almuerzo: true,
            minutos_trabajados: 0
          };
        });
      });

      registros?.forEach(r => {
        if (estadoInicial[r.asesora_id] && estadoInicial[r.asesora_id][r.fecha]) {
          estadoInicial[r.asesora_id][r.fecha] = {
            entrada_asignada: r.hora_entrada_asignada ? r.hora_entrada_asignada.substring(0, 5) : '',
            salida_asignada: r.hora_salida_asignada ? r.hora_salida_asignada.substring(0, 5) : '',
            entrada_real: r.hora_entrada_real ? r.hora_entrada_real.substring(0, 5) : '',
            salida_real: r.hora_salida_real ? r.hora_salida_real.substring(0, 5) : '',
            con_almuerzo: r.con_almuerzo,
            minutos_trabajados: r.minutos_trabajados || 0
          };
        }
      });

      setHorarios(estadoInicial);
      setCambios(new Set());

      // 3. Fetch data para reporte mensual
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      
      const { data: regMensuales, error: errMensuales } = await supabase
        .from('control_horarios')
        .select('asesora_id, sede_id, minutos_trabajados')
        .gte('fecha', formatDateISO(startOfMonth))
        .lte('fecha', formatDateISO(endOfMonth));

      if (errMensuales) throw errMensuales;

      const minsAsesora = new Map<string, number>();
      const minsSede = new Map<string, number>();

      regMensuales?.forEach(r => {
        if (!r.minutos_trabajados) return;
        minsAsesora.set(r.asesora_id, (minsAsesora.get(r.asesora_id) || 0) + r.minutos_trabajados);
        if (r.sede_id) {
          minsSede.set(r.sede_id, (minsSede.get(r.sede_id) || 0) + r.minutos_trabajados);
        }
      });

      const porAsesora: ReporteAsesora[] = [];
      minsAsesora.forEach((mins, aId) => {
        const asesora = mapaAsesoras.get(aId);
        if (asesora) {
          porAsesora.push({
            asesora_id: aId,
            nombre: asesora.nombre,
            sede_nombre: asesora.sede_nombre || 'Global',
            minutos_totales: mins
          });
        }
      });

      const porSede: ReporteSede[] = [];
      const mapaSedes = new Map<string, string>();
      mapaAsesoras.forEach(a => {
        if (a.sede_id && a.sede_nombre) {
          mapaSedes.set(a.sede_id, a.sede_nombre);
        }
      });
      minsSede.forEach((mins, sId) => {
        porSede.push({
          sede_id: sId,
          sede_nombre: mapaSedes.get(sId) || 'Desconocida',
          minutos_totales: mins
        });
      });

      console.log('Reporte Mensual Agrupado:', { 
        porAsesora: porAsesora.sort((a, b) => b.minutos_totales - a.minutos_totales), 
        porSede: porSede.sort((a, b) => b.minutos_totales - a.minutos_totales) 
      });

      setReporteMensual({
        porAsesora: porAsesora.sort((a, b) => b.minutos_totales - a.minutos_totales),
        porSede: porSede.sort((a, b) => b.minutos_totales - a.minutos_totales)
      });
    } catch (err: any) {
      console.error(err);
      toast.error('Error cargando datos: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDatos();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio, semanas]);

  useEffect(() => {
    void supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      const { data: perfil } = await supabase.from('profiles').select('rol, sede_id').eq('id', data.user.id).maybeSingle();
      if (perfil?.sede_id && String(perfil.rol).toLowerCase() !== 'admin') setSedeFiltro(perfil.sede_id);
    });
  }, []);

  const puedeSalir = () => !cambios.size || window.confirm('Tienes cambios sin guardar. ¿Descartarlos?');
  const moverSemanas = (n: number) => {
    if (puedeSalir()) setInicio(formatDateISO(addDays(startOfRange, n * 7)));
  };

  const sedesDisponibles = useMemo(() => {
    const m = new Map<string, string>();
    asesoras.forEach(a => { if (a.sede_id) m.set(a.sede_id, a.sede_nombre || 'Sede'); });
    return Array.from(m, ([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre));
  }, [asesoras]);
  const asesorasVisibles = asesoras.filter(a => sedeFiltro === 'todas' || a.sede_id === sedeFiltro);

  // Copia el horario planificado de la primera semana en las demás (para cuadrar el mes rápido)
  const repetirPrimeraSemana = () => {
    if (semanas < 2) return;
    setHorarios(prev => {
      const nuevo = { ...prev };
      const marcados = new Set(cambios);
      asesorasVisibles.forEach(a => {
        const dias = { ...nuevo[a.asesora_id] };
        for (let w = 1; w < semanas; w++) for (let i = 0; i < 7; i++) {
          const origen = dias[formatDateISO(diasRango[i])];
          const fecha = formatDateISO(diasRango[w * 7 + i]);
          if (!origen || !dias[fecha]) continue;
          dias[fecha] = { ...dias[fecha], entrada_asignada: origen.entrada_asignada, salida_asignada: origen.salida_asignada };
          marcados.add(`${a.asesora_id}|${fecha}`);
        }
        nuevo[a.asesora_id] = dias;
      });
      setCambios(marcados);
      return nuevo;
    });
    toast.success('Horario planificado copiado. Recuerda guardar.');
  };

  const calcularMinutos = (entrada: string, salida: string, conAlmuerzo: boolean) => {
    if (!entrada || !salida) return 0;
    try {
      const [eH, eM] = entrada.split(':').map(Number);
      const [sH, sM] = salida.split(':').map(Number);
      
      let diffMins = (sH * 60 + sM) - (eH * 60 + eM);
      if (diffMins < 0) diffMins += 24 * 60; // cruce de medianoche
      if (conAlmuerzo) diffMins -= 60;
      return Math.max(0, diffMins);
    } catch {
      return 0;
    }
  };

  const handleChange = (asesoraId: string, fecha: string, campo: keyof HorarioDia, valor: any) => {
    setCambios(prev => new Set(prev).add(`${asesoraId}|${fecha}`));
    setHorarios(prev => {
      const nuevo = { ...prev };
      const diaActualizado = { ...nuevo[asesoraId][fecha], [campo]: valor };
      
      // Recalcular minutos automáticamente usando las horas reales
      diaActualizado.minutos_trabajados = calcularMinutos(
        diaActualizado.entrada_real,
        diaActualizado.salida_real,
        diaActualizado.con_almuerzo
      );

      nuevo[asesoraId] = {
        ...nuevo[asesoraId],
        [fecha]: diaActualizado
      };
      return nuevo;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload: any[] = [];
      if (!cambios.size) { toast('No hay cambios por guardar'); setSaving(false); return; }
      cambios.forEach(key => {
        const [asesoraId, fecha] = key.split('|');
        const asesora = asesoras.find(a => a.asesora_id === asesoraId);
        const dia = horarios[asesoraId]?.[fecha];
        if (!asesora || !dia) return;
        {
          payload.push({
            asesora_id: asesoraId,
            sede_id: asesora.sede_id,
            fecha: fecha,
            hora_entrada_asignada: dia.entrada_asignada || null,
            hora_salida_asignada: dia.salida_asignada || null,
            hora_entrada_real: dia.entrada_real || null,
            hora_salida_real: dia.salida_real || null,
            con_almuerzo: dia.con_almuerzo,
            minutos_trabajados: dia.minutos_trabajados,
            estado_asistencia: dia.minutos_trabajados > 0 ? 'Presente' : 'Ausente'
          });
        }
      });

      const { error } = await supabase
        .from('control_horarios')
        .upsert(payload, { onConflict: 'asesora_id, fecha' });

      if (error) throw error;
      setCambios(new Set());
      toast.success(`Horarios guardados (${payload.length} día${payload.length === 1 ? '' : 's'})`);
    } catch (err: any) {
      console.error(err);
      toast.error('Error al guardar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const formatHours = (mins: number) => {
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}h ${m}m`;
  };

  if (loading) {
    return (
      <div className="p-8 flex justify-center items-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-rose-500"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-[1600px] mx-auto pb-24">
      {/* Header */}
      <Link href="/dashboard" className="text-slate-600 hover:text-slate-900 flex items-center gap-2 text-sm font-medium mb-4 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" />
        Volver al Dashboard
      </Link>
      {/* Entry and exit of the staff are now recorded in Nexora; this page keeps the history. */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-rose-50 border border-rose-200 p-5 rounded-3xl">
        <div>
          <p className="font-black text-rose-900">La entrada y salida del personal ahora se registra en Nexora</p>
          <p className="text-sm text-rose-800">Cada persona marca su ingreso y su salida desde Nexora. Aquí queda el historial anterior.</p>
        </div>
        <a href="https://nexora-tau-liard.vercel.app/ingresar" target="_blank" rel="noopener noreferrer" className="px-5 py-3 rounded-2xl bg-rose-600 text-white text-sm font-black whitespace-nowrap">Ingresar a Nexora ↗</a>
      </div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
            <Clock className="w-8 h-8 text-rose-500" />
            Control de Asistencia
          </h1>
          <p className="text-gray-500 font-medium text-sm mt-1 flex items-center gap-2">
            <CalendarDays className="w-4 h-4" />
            Del {formatDateHeader(diasRango[0])} al {formatDateHeaderLong(diasRango[diasRango.length - 1])} · {semanas} semana{semanas === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => moverSemanas(-semanas)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">← Anterior</button>
          <input type="date" value={inicio} onChange={e => { if (e.target.value && puedeSalir()) setInicio(formatDateISO(getStartOfWeek(new Date(e.target.value + 'T00:00:00')))); }} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700" title="Semana de inicio (se ajusta al lunes)" />
          <select value={semanas} onChange={e => { if (puedeSalir()) setSemanas(Number(e.target.value)); }} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-700">
            {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} semana{n === 1 ? '' : 's'}{n === 4 ? ' (≈ 1 mes)' : ''}</option>)}
          </select>
          <button onClick={() => moverSemanas(semanas)} className="px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50">Siguiente →</button>
          {semanas > 1 && <button onClick={repetirPrimeraSemana} className="px-3 py-2 rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-700 hover:bg-indigo-100" title="Copia las horas planificadas de la primera semana a las demás">Repetir semana 1</button>}
          <button
            onClick={handleSave}
            disabled={saving || !cambios.size}
            className="bg-gray-900 text-white px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-gray-800 transition-all shadow-lg disabled:opacity-50"
          >
            {saving ? <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> : <Save className="w-4 h-4" />}
            Guardar Cambios{cambios.size ? ` (${cambios.size})` : ''}
          </button>
        </div>
      </div>

      {/* Pestañas por sede */}
      <div className="flex flex-wrap gap-2">
        {[{ id: 'todas', nombre: 'Todas las sedes' }, ...sedesDisponibles].map(sd => (
          <button key={sd.id} onClick={() => setSedeFiltro(sd.id)} className={`px-4 py-2 rounded-xl text-sm font-bold border transition-all flex items-center gap-2 ${sedeFiltro === sd.id ? 'bg-rose-500 text-white border-rose-500 shadow' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            <Building2 className="w-4 h-4" /> {sd.nombre}
            <span className={`text-[10px] px-1.5 rounded ${sedeFiltro === sd.id ? 'bg-white/20' : 'bg-gray-100'}`}>{sd.id === 'todas' ? asesoras.length : asesoras.filter(a => a.sede_id === sd.id).length}</span>
          </button>
        ))}
      </div>

      {/* Grid de Horarios por Sede y Asesora */}
      <div className="space-y-8">
        {(sedeFiltro === 'todas' ? [...sedesDisponibles, ...(asesoras.some(a => !a.sede_id) ? [{ id: '', nombre: 'Sin sede' }] : [])] : sedesDisponibles.filter(sd => sd.id === sedeFiltro)).map(sd => {
          const lista = asesoras.filter(a => (a.sede_id || '') === sd.id);
          if (!lista.length) return null;
          return (
          <section key={sd.id || 'sin-sede'} className="space-y-6">
            <h2 className="text-lg font-black text-gray-900 flex items-center gap-2 px-2"><Building2 className="w-5 h-5 text-rose-500" /> Sede {sd.nombre}</h2>
        {lista.map(asesora => {
          const minutosMes = diasRango.reduce((acc, d) => acc + (horarios[asesora.asesora_id]?.[formatDateISO(d)]?.minutos_trabajados || 0), 0);
          return (
            <div key={asesora.asesora_id} className="bg-white rounded-[2rem] p-6 shadow-sm border border-gray-100">
              {/* Asesora Header */}
              <div className="flex items-center gap-4 mb-6 border-b border-gray-50 pb-4">
                <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-500 flex items-center justify-center font-black text-xl">
                  {asesora.nombre.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1">
                  <h3 className="font-black text-gray-900 text-lg flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />
                    {asesora.nombre}
                  </h3>
                  <span className="text-xs font-bold text-gray-400 uppercase tracking-widest bg-gray-100 px-2 py-0.5 rounded-lg mt-1 inline-block">
                    Sede: {asesora.sede_nombre}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total del periodo</p>
                  <p className="font-black text-gray-900 text-lg">{formatHours(minutosMes)}</p>
                </div>
              </div>

              {semanasRango.map((semana, w) => {
                const dias = semana.map(d => formatDateISO(d));
                let totalMinutosLunesSabado = 0;
                for (let i = 0; i < 6; i++) totalMinutosLunesSabado += horarios[asesora.asesora_id]?.[dias[i]]?.minutos_trabajados || 0;
                const horasExtrasMins = Math.max(0, totalMinutosLunesSabado - 2520); // 42 horas = 2520 mins
                const minutosDomingo = horarios[asesora.asesora_id]?.[dias[6]]?.minutos_trabajados || 0;
                return (
                <div key={dias[0]} className={w > 0 ? 'mt-6 pt-6 border-t border-dashed border-gray-200' : ''}>
                  <p className="text-xs font-black text-gray-500 uppercase tracking-widest mb-3">Semana del {formatDateHeader(semana[0])} al {formatDateHeaderLong(semana[6])}</p>
              {/* Grid 7 Días */}
              <div className="w-full overflow-x-auto pb-4 scrollbar-thin scrollbar-thumb-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-7 gap-4 md:min-w-[1200px]">
                {semana.map((dia, idx) => {
                  const fechaStr = formatDateISO(dia);
                  const datosDia = horarios[asesora.asesora_id]?.[fechaStr] || { entrada_asignada: '', salida_asignada: '', entrada_real: '', salida_real: '', con_almuerzo: true, minutos_trabajados: 0 };
                  const esDomingo = idx === 6;

                  return (
                    <div key={fechaStr} className={`p-4 rounded-2xl border ${esDomingo ? 'bg-orange-50/30 border-orange-100' : 'bg-gray-50 border-gray-100'} flex flex-col gap-3`}>
                      <div className="text-center">
                        <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                          {formatDayName(dia)}
                        </p>
                        <p className="text-[10px] text-gray-400 font-bold">{formatDayNumber(dia)}</p>
                      </div>

                      {/* Fila Asignada (Planificación) */}
                      <div className="bg-slate-100 p-2 rounded-xl border border-slate-200">
                        <p className="text-[9px] font-black uppercase text-slate-500 mb-2 text-center">Planificado</p>
                        <div className="flex flex-col gap-2 w-full">
                          <input
                            type="time"
                            value={datosDia?.entrada_asignada || ""}
                            onChange={(e) => handleChange(asesora.asesora_id, fechaStr, 'entrada_asignada', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-md px-1 py-1 text-xs font-bold text-slate-600 outline-none focus:border-slate-400 transition-all text-center"
                          />
                          <input
                            type="time"
                            value={datosDia?.salida_asignada || ""}
                            onChange={(e) => handleChange(asesora.asesora_id, fechaStr, 'salida_asignada', e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-md px-1 py-1 text-xs font-bold text-slate-600 outline-none focus:border-slate-400 transition-all text-center"
                          />
                        </div>
                      </div>

                      {/* Fila Real (Marcación) */}
                      <div className="bg-white p-2 rounded-xl border border-gray-200 shadow-sm">
                        <p className="text-[9px] font-black uppercase text-gray-400 mb-2 text-center">Real</p>
                        <div className="flex flex-col gap-2 w-full">
                          <input
                            type="time"
                            value={datosDia?.entrada_real || ""}
                            onChange={(e) => handleChange(asesora.asesora_id, fechaStr, 'entrada_real', e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-md px-1 py-1 text-xs font-bold text-gray-900 outline-none focus:border-rose-300 transition-all text-center"
                          />
                          <input
                            type="time"
                            value={datosDia?.salida_real || ""}
                            onChange={(e) => handleChange(asesora.asesora_id, fechaStr, 'salida_real', e.target.value)}
                            className="w-full bg-gray-50 border border-gray-200 rounded-md px-1 py-1 text-xs font-bold text-gray-900 outline-none focus:border-rose-300 transition-all text-center"
                          />
                        </div>
                        
                        <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-center">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={datosDia.con_almuerzo}
                              onChange={(e) => handleChange(asesora.asesora_id, fechaStr, 'con_almuerzo', e.target.checked)}
                              className="rounded text-rose-500 focus:ring-rose-500 border-gray-300 w-3 h-3"
                            />
                            <span className="text-[9px] font-bold text-gray-500 uppercase">-1h Almuerzo</span>
                          </label>
                        </div>
                        <div className="mt-2 text-center">
                          <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 inline-block w-full">
                            {formatHours(datosDia.minutos_trabajados)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

              {/* Resumen Semanal */}
              <div className="mt-2 flex flex-col md:flex-row gap-4 justify-end">
                <div className="bg-gray-50 px-4 py-3 rounded-xl border border-gray-200 flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Total Lun-Sáb:</span>
                  <span className="font-black text-gray-900 text-lg">{formatHours(totalMinutosLunesSabado)}</span>
                </div>
                {horasExtrasMins > 0 && (
                  <div className="bg-red-50 px-4 py-3 rounded-xl border border-red-200 flex items-center gap-3 animate-in zoom-in">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    <span className="text-xs font-bold text-red-600 uppercase tracking-widest">Horas Extras (más de 42 h):</span>
                    <span className="font-black text-red-600 text-lg">{formatHours(horasExtrasMins)}</span>
                  </div>
                )}
                <div className="bg-orange-50 px-4 py-3 rounded-xl border border-orange-200 flex items-center gap-3">
                  <span className="text-xs font-bold text-orange-600 uppercase tracking-widest">Total Domingo:</span>
                  <span className="font-black text-orange-600 text-lg">{formatHours(minutosDomingo)}</span>
                </div>
              </div>
                </div>
                );
              })}
            </div>
          );
        })}
          </section>
          );
        })}

        {asesorasVisibles.length === 0 && (
          <div className="bg-white p-12 text-center rounded-[2rem] border border-gray-100">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-gray-500 font-bold text-lg">No hay personal activo en esta sede</h3>
            <p className="text-gray-400 text-sm mt-1">Revisa que las asesoras estén activas y tengan sede asignada.</p>
          </div>
        )}
      </div>

      {/* Reporte Consolidado */}
      <div className="mt-12 bg-white rounded-[2rem] p-6 md:p-8 shadow-sm border border-gray-100">
        <div className="flex justify-between items-center mb-6 cursor-pointer" onClick={() => setShowReporte(!showReporte)}>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-indigo-500" />
            📊 Reporte Consolidado de Horas (Mes Actual)
          </h2>
          <button className="text-gray-400 hover:text-gray-600 transition-colors font-bold text-sm">
            {showReporte ? 'Ocultar Reporte' : 'Ver Reporte'}
          </button>
        </div>

        {showReporte && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in slide-in-from-top-4 fade-in duration-300">
            {/* Por Asesora */}
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <User className="w-4 h-4" />
                Vista por Asesora
              </h3>
              <div className="bg-gray-50 rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-100/50 text-gray-500 font-bold uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Asesora</th>
                      <th className="px-4 py-3">Sede</th>
                      <th className="px-4 py-3 text-right">Total Mes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {reporteMensual.porAsesora.map(a => (
                      <tr key={a.asesora_id} className="bg-white hover:bg-gray-50/50 transition-colors">
                        <td className="px-4 py-3 font-bold text-gray-900">{a.nombre}</td>
                        <td className="px-4 py-3 text-gray-500">{a.sede_nombre}</td>
                        <td className="px-4 py-3 font-black text-emerald-600 text-right">{formatHours(a.minutos_totales)}</td>
                      </tr>
                    ))}
                    {reporteMensual.porAsesora.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-4 py-6 text-center text-gray-400 font-medium">No hay registros este mes</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Por Sede */}
            <div>
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4" />
                Vista por Sede
              </h3>
              <div className="space-y-4">
                {reporteMensual.porSede.map(s => {
                  const maxMins = Math.max(...reporteMensual.porSede.map(x => x.minutos_totales), 1);
                  const width = `${(s.minutos_totales / maxMins) * 100}%`;
                  return (
                    <div key={s.sede_id} className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm relative overflow-hidden">
                      <div className="absolute top-0 left-0 h-full bg-indigo-50/50 -z-10 transition-all duration-1000" style={{ width }} />
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-gray-900">{s.sede_nombre}</span>
                        <span className="font-black text-indigo-600">{formatHours(s.minutos_totales)}</span>
                      </div>
                    </div>
                  );
                })}
                {reporteMensual.porSede.length === 0 && (
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 text-center text-gray-400 font-medium">
                    No hay registros este mes
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
