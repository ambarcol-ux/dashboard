'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { canalDe, TIPOS_EVENTO, TIPO_LABEL, type CitaOrigen } from '@/lib/event-channel';

type Fila = { nombre: string; n: Record<string, number>; total: number };
const COLOR: Record<string, string> = { Evento: 'bg-rose-400', PreXV: 'bg-violet-500', Ambos: 'bg-amber-400' };
const pct = (a: number, b: number) => b ? Math.round(a * 100 / b) : 0;
const conPre = (f: Fila) => (f.n.PreXV || 0) + (f.n.Ambos || 0);

function agrupar(lista: { clave: string; tipo: string }[]) {
  const m = new Map<string, Fila>();
  for (const { clave, tipo } of lista) { const f = m.get(clave) || { nombre: clave, n: {}, total: 0 }; f.n[tipo] = (f.n[tipo] || 0) + 1; f.total++; m.set(clave, f); }
  return [...m.values()].sort((a, b) => b.total - a.total);
}
function sumar(filas: Fila[]) {
  const t: Fila = { nombre: 'Total', n: {}, total: 0 };
  for (const f of filas) { t.total += f.total; for (const k of TIPOS_EVENTO) t.n[k] = (t.n[k] || 0) + (f.n[k] || 0); }
  return t;
}

function Tabla({ titulo, columna, filas }: { titulo: string; columna: string; filas: Fila[] }) {
  const total = sumar(filas), maxPre = Math.max(...filas.map(f => pct(conPre(f), f.total)));
  return (
    <div>
      <h3 className="text-lg font-black text-gray-900 mb-3">{titulo}</h3>
      <div className="overflow-x-auto rounded-2xl border border-gray-100">
        <table className="w-full text-sm">
          <thead className="bg-gray-50"><tr className="text-left text-[10px] uppercase tracking-widest text-gray-500">
            <th className="py-3 px-4">{columna}</th>
            {TIPOS_EVENTO.map(t => <th key={t} className="py-3 px-3 text-right"><span className={`inline-block w-2 h-2 rounded-full mr-1 ${COLOR[t]}`} />{TIPO_LABEL[t]}</th>)}
            <th className="py-3 px-3 text-right">Total</th>
            <th className="py-3 px-4 min-w-[10rem]">Distribución</th>
            <th className="py-3 px-4 text-right">Con Pre XV</th>
          </tr></thead>
          <tbody>{[...filas, total].map(f => {
            const esTotal = f === total, p = pct(conPre(f), f.total);
            return (
              <tr key={f.nombre} className={`border-t border-gray-100 ${esTotal ? 'bg-rose-50/60 font-black text-gray-900' : 'font-bold text-gray-700'}`}>
                <td className="py-3 px-4">{f.nombre}</td>
                {TIPOS_EVENTO.map(t => <td key={t} className="py-3 px-3 text-right whitespace-nowrap">{f.n[t] || 0} <span className="text-[11px] text-gray-400 font-bold">({pct(f.n[t] || 0, f.total)}%)</span></td>)}
                <td className="py-3 px-3 text-right">{f.total}</td>
                <td className="py-3 px-4"><div className="flex h-3 rounded-full overflow-hidden bg-gray-100">{TIPOS_EVENTO.map(t => f.n[t] ? <div key={t} className={COLOR[t]} style={{ width: `${pct(f.n[t], f.total)}%` }} title={`${TIPO_LABEL[t]}: ${f.n[t]}`} /> : null)}</div></td>
                <td className={`py-3 px-4 text-right ${!esTotal && p === maxPre && p > 0 ? 'text-violet-700' : 'text-gray-700'}`}>{p}%{!esTotal && p === maxPre && p > 0 ? ' ★' : ''}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

/** Contracts by type (Evento / Pre XV / Ambos, as recorded in the contract), by branch and by the channel the customer came from. */
export default function EventTypeByChannel({ sede, startDate, endDate }: { sede: string; startDate: string; endDate: string }) {
  const [historial, setHistorial] = useState(false);
  const [datos, setDatos] = useState<{ sedes: Fila[]; canales: Fila[] } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      const contratos: { tipo_evento: string | null; primera_cita_id: string | null; sede_id: string | null }[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase.from('contratos').select('tipo_evento,primera_cita_id,sede_id,estado').order('id').range(from, from + 999);
        if (!historial) q = q.gte('created_at', startDate).lte('created_at', endDate);
        if (sede !== 'global') q = q.eq('sede_id', sede);
        const { data, error: e } = await q;
        if (e) throw e;
        contratos.push(...(data || []).filter(c => !['cancelado', 'rechazado', 'borrador'].includes(String(c.estado || '').toLowerCase())));
        if (!data || data.length < 1000) break;
      }
      const ids = [...new Set(contratos.map(c => c.primera_cita_id).filter(Boolean))] as string[];
      const citas = new Map<string, CitaOrigen>();
      for (let i = 0; i < ids.length; i += 200) {
        const { data, error: e } = await supabase.from('primeras_citas').select('id,origen,origen_enlace,como_se_entero,anuncio_id').in('id', ids.slice(i, i + 200));
        if (e) throw e;
        for (const c of data || []) citas.set(String(c.id), c);
      }
      const { data: sedes } = await supabase.from('sedes').select('id,nombre');
      const sedeNombre = new Map((sedes || []).map(s => [String(s.id), String(s.nombre)]));
      const tipo = (t: string | null) => TIPOS_EVENTO.includes(t as never) ? String(t) : 'Evento';
      if (vivo) {
        setDatos({
          sedes: agrupar(contratos.map(c => ({ clave: sedeNombre.get(String(c.sede_id)) || 'Sin sede', tipo: tipo(c.tipo_evento) }))),
          canales: agrupar(contratos.map(c => ({ clave: canalDe(c.primera_cita_id ? citas.get(c.primera_cita_id) : null), tipo: tipo(c.tipo_evento) }))),
        });
        setError('');
      }
    })().catch(e => { if (vivo) setError(String(e?.message || e)); });
    return () => { vivo = false; };
  }, [sede, startDate, endDate, historial]);

  const total = datos ? sumar(datos.sedes) : null;
  const lider = datos?.sedes.filter(f => f.total >= 5).sort((a, b) => conPre(b) / b.total - conPre(a) / a.total)[0];
  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-900 tracking-tight">Evento vs. Pre XV</h2>
          <p className="text-sm text-gray-500 mt-1">Según el tipo marcado en cada contrato (sin cancelados, rechazados ni borradores).</p>
        </div>
        <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-black uppercase tracking-widest">
          <button type="button" onClick={() => setHistorial(false)} className={`px-3 py-2 rounded-lg ${!historial ? 'bg-white shadow text-rose-600' : 'text-gray-500'}`}>Periodo elegido</button>
          <button type="button" onClick={() => setHistorial(true)} className={`px-3 py-2 rounded-lg ${historial ? 'bg-white shadow text-rose-600' : 'text-gray-500'}`}>Todo el historial</button>
        </div>
      </div>
      {error ? <p className="text-red-600 font-bold">No se pudo cargar: {error}</p> : !datos || !total ? <p className="text-gray-400 font-bold">Cargando…</p> : !total.total ? <p className="text-gray-400 font-bold">No hay contratos en este periodo. Prueba «Todo el historial».</p> : <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {TIPOS_EVENTO.map(t => (
            <div key={t} className="rounded-2xl border border-gray-100 p-5">
              <p className="text-[10px] font-black uppercase tracking-widest text-gray-400"><span className={`inline-block w-2 h-2 rounded-full mr-1 ${COLOR[t]}`} />{TIPO_LABEL[t]}</p>
              <p className="text-3xl font-black text-gray-900 mt-2">{pct(total.n[t] || 0, total.total)}%</p>
              <p className="text-xs font-bold text-gray-500">{total.n[t] || 0} de {total.total} contratos</p>
            </div>))}
          <div className="rounded-2xl border border-violet-100 bg-violet-50 p-5">
            <p className="text-[10px] font-black uppercase tracking-widest text-violet-500">Sede con más Pre XV</p>
            <p className="text-2xl font-black text-violet-900 mt-2">{lider ? lider.nombre : '—'}</p>
            <p className="text-xs font-bold text-violet-700">{lider ? `${pct(conPre(lider), lider.total)}% de sus contratos incluyen Pre XV` : 'Sin datos suficientes'}</p>
          </div>
        </div>
        <Tabla titulo="Por sede" columna="Sede" filas={datos.sedes} />
        <Tabla titulo="Por red de origen" columna="Red de origen" filas={datos.canales} />
        <p className="text-xs text-gray-400">«Con Pre XV» suma Pre XV + Ambos. ★ marca el valor más alto. Red de origen: sale de la primera cita del contrato; «Sin cita registrada» son contratos sin primera cita en el ERP y «Sin dato de red», citas sin marca. Los chats de Instagram y Messenger se marcan solos desde ahora.</p>
      </>}
    </div>
  );
}
