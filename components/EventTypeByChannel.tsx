'use client';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { canalDe, TIPOS_EVENTO, TIPO_LABEL, type CitaOrigen } from '@/lib/event-channel';

type Fila = { canal: string; n: Record<string, number>; total: number };

/** Contracts by type (Evento / Pre XV / Ambos, as recorded in the contract) and by the channel the customer came from. */
export default function EventTypeByChannel({ sede, startDate, endDate }: { sede: string; startDate: string; endDate: string }) {
  const [filas, setFilas] = useState<Fila[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let vivo = true;
    (async () => {
      const contratos: { tipo_evento: string | null; primera_cita_id: string | null }[] = [];
      for (let from = 0; ; from += 1000) {
        let q = supabase.from('contratos').select('tipo_evento,primera_cita_id,estado').gte('created_at', startDate).lte('created_at', endDate).range(from, from + 999);
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
      const porCanal = new Map<string, Fila>();
      for (const c of contratos) {
        const canal = canalDe(c.primera_cita_id ? citas.get(c.primera_cita_id) : null), tipo = TIPOS_EVENTO.includes(c.tipo_evento as never) ? String(c.tipo_evento) : 'Evento';
        const f = porCanal.get(canal) || { canal, n: {}, total: 0 };
        f.n[tipo] = (f.n[tipo] || 0) + 1; f.total++; porCanal.set(canal, f);
      }
      if (vivo) { setFilas([...porCanal.values()].sort((a, b) => b.total - a.total)); setError(''); }
    })().catch(e => { if (vivo) setError(String(e?.message || e)); });
    return () => { vivo = false; };
  }, [sede, startDate, endDate]);

  const total: Fila = { canal: 'Total', n: {}, total: 0 };
  for (const f of filas || []) { total.total += f.total; for (const t of TIPOS_EVENTO) total.n[t] = (total.n[t] || 0) + (f.n[t] || 0); }
  const pct = (a: number, b: number) => b ? `${Math.round(a * 100 / b)}%` : '—';
  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100">
      <h2 className="text-2xl font-black text-gray-900 tracking-tight">Pre XV vs. evento por red de origen</h2>
      <p className="text-sm text-gray-500 mt-1 mb-6">Contratos del periodo según el tipo marcado en el contrato y la red por la que llegó la clienta a su primera cita.</p>
      {error ? <p className="text-red-600 font-bold">No se pudo cargar: {error}</p> : !filas ? <p className="text-gray-400 font-bold">Cargando…</p> : !filas.length ? <p className="text-gray-400 font-bold">No hay contratos en este periodo.</p> :
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400">
              <th className="py-2 pr-4">Red de origen</th>{TIPOS_EVENTO.map(t => <th key={t} className="py-2 px-3 text-right">{TIPO_LABEL[t]}</th>)}<th className="py-2 px-3 text-right">Total</th><th className="py-2 pl-3 text-right">% Pre XV + Ambos</th>
            </tr></thead>
            <tbody>{[...filas, total].map(f => (
              <tr key={f.canal} className={`border-t border-gray-100 ${f.canal === 'Total' ? 'font-black' : 'font-bold text-gray-700'}`}>
                <td className="py-3 pr-4">{f.canal}</td>
                {TIPOS_EVENTO.map(t => <td key={t} className="py-3 px-3 text-right">{f.n[t] || 0}</td>)}
                <td className="py-3 px-3 text-right">{f.total}</td>
                <td className="py-3 pl-3 text-right text-rose-600">{pct((f.n.PreXV || 0) + (f.n.Ambos || 0), f.total)}</td>
              </tr>))}
            </tbody>
          </table>
          <p className="text-xs text-gray-400 mt-4">«Sin cita registrada»: contratos hechos sin primera cita en el ERP. «Sin dato de red»: la cita no tiene marca de red. Los chats de Instagram y Messenger se marcan solos desde ahora.</p>
        </div>}
    </div>
  );
}
