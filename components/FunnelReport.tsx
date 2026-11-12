'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Sede={sede:string;citas:number;asistieron:number;no_asistieron:number;sin_registrar:number;alquilaron_cita:number;vitrinas:number;alquilaron_vitrina:number;sin_motivo:number};
type Accion={responsable:string;quien:string;accion:string;por_que:string;prioridad:string};
type Reporte={id:number;created_at:string;desde:string;hasta:string;resumen:string;acciones:Accion[];aplicados:{seccion:string;despues:string}[]|null;metricas:{total:Record<string,number>;por_sede:Sede[]}};
const pct=(a:number,b:number)=>b?Math.round(a*100/b):0;
const GRUPOS:[string,string][]=[['sistema','🤖 Lo ajusta el sistema solo'],['administracion','🧭 Administración'],['sede','🏬 Sedes'],['asesora','👩‍💼 Asesoras']];
const PRIO:Record<string,string>={alta:'bg-red-100 text-red-700',media:'bg-amber-100 text-amber-700',baja:'bg-gray-100 text-gray-600'};

/** Weekly funnel report (booked → attended → rented) written by the AI, with the actions for the system and for people. */
export default function FunnelReport(){
 const [lista,setLista]=useState<Reporte[]>([]),[sel,setSel]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{const {data,error:e}=await supabase.from('embudo_reportes').select('id,created_at,desde,hasta,resumen,acciones,aplicados,metricas').order('id',{ascending:false}).limit(12);if(e)setError(e.message);else{setLista((data||[]) as Reporte[]);setSel(0);}},[]);
 useEffect(()=>{void load();},[load]);
 async function generar(){setBusy(true);setError('');try{const {data}=await supabase.auth.getSession();const r=await fetch('/api/reportes/embudo',{method:'POST',headers:{Authorization:`Bearer ${data.session?.access_token||''}`}});const d=await r.json();if(!r.ok)throw Error(d.error);await load();}catch(e){setError(e instanceof Error?e.message:'No se pudo generar.');}finally{setBusy(false);}}
 const r=lista[sel],t=r?.metricas.total;
 return <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-gray-100 space-y-6">
  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
   <div><h2 className="text-2xl font-black text-gray-900 tracking-tight">Embudo de citas · análisis semanal</h2>
    <p className="text-sm text-gray-500 mt-1">Agendó → asistió → alquiló. Cada lunes la IA analiza la semana cerrada contra las 4 anteriores y dice qué hacer.</p></div>
   <div className="flex gap-2 items-center">
    {lista.length>1&&<select value={sel} onChange={e=>setSel(Number(e.target.value))} className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold">{lista.map((x,i)=><option key={x.id} value={i}>Citas del {x.desde} al {x.hasta}</option>)}</select>}
    <button type="button" disabled={busy} onClick={()=>void generar()} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">{busy?'Analizando…':'Generar ahora'}</button>
   </div>
  </div>
  {error&&<p className="text-red-600 font-bold">{error}</p>}
  {!r?<p className="text-gray-400 font-bold">Aún no hay reportes. Pulsa «Generar ahora» o espera al lunes.</p>:<>
   <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {[['Citas agendadas',String(t.citas),`del ${r.desde} al ${r.hasta}`],['Asistieron',`${pct(t.asistieron,t.citas)}%`,`${t.asistieron} · no asistieron ${t.no_asistieron} · sin registrar ${t.sin_registrar}`],
      ['Alquilaron (de las que asistieron)',`${pct(t.alquilaron_cita,t.asistieron)}%`,`${t.alquilaron_cita} de ${t.asistieron}`],['Vitrinas que alquilaron',`${pct(t.alquilaron_vitrina,t.vitrinas)}%`,`${t.alquilaron_vitrina} de ${t.vitrinas}`]]
     .map(([a,b,c])=><div key={a} className="rounded-2xl border border-gray-100 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{a}</p><p className="text-3xl font-black text-gray-900 mt-2">{b}</p><p className="text-xs font-bold text-gray-500">{c}</p></div>)}
   </div>
   <div className="overflow-x-auto rounded-2xl border border-gray-100"><table className="w-full text-sm">
    <thead className="bg-gray-50"><tr className="text-left text-[10px] uppercase tracking-widest text-gray-500"><th className="py-3 px-4">Sede</th><th className="py-3 px-3 text-right">Citas</th><th className="py-3 px-3 text-right">Asistencia</th><th className="py-3 px-3 text-right">Sin registrar</th><th className="py-3 px-3 text-right">Alquiler (citas)</th><th className="py-3 px-3 text-right">Alquiler (vitrinas)</th><th className="py-3 px-3 text-right">Sin motivo de no alquiler</th></tr></thead>
    <tbody>{r.metricas.por_sede.map(s=><tr key={s.sede} className="border-t border-gray-100 font-bold text-gray-700"><td className="py-3 px-4">{s.sede}</td><td className="py-3 px-3 text-right">{s.citas}</td><td className="py-3 px-3 text-right">{pct(s.asistieron,s.citas)}%</td><td className={`py-3 px-3 text-right ${s.sin_registrar?'text-amber-600':''}`}>{s.sin_registrar}</td><td className="py-3 px-3 text-right">{pct(s.alquilaron_cita,s.asistieron)}%</td><td className="py-3 px-3 text-right">{pct(s.alquilaron_vitrina,s.vitrinas)}%</td><td className={`py-3 px-3 text-right ${s.sin_motivo?'text-red-600':''}`}>{s.sin_motivo}</td></tr>)}</tbody>
   </table></div>
   <div className="rounded-2xl bg-rose-50/60 border border-rose-100 p-5"><p className="text-[10px] font-black uppercase tracking-widest text-rose-500 mb-2">Qué está pasando</p><p className="text-sm text-gray-800 whitespace-pre-line leading-relaxed">{r.resumen}</p></div>
   <div className="grid md:grid-cols-2 gap-4">{GRUPOS.map(([k,titulo])=>{const items=(r.acciones||[]).filter(a=>a.responsable===k);if(!items.length)return null;
    return <div key={k} className="rounded-2xl border border-gray-100 p-5 space-y-3"><h3 className="font-black text-gray-900">{titulo}</h3>{items.map((a,i)=><div key={i} className="text-sm"><p className="font-bold text-gray-800"><span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-full mr-2 ${PRIO[a.prioridad]||PRIO.baja}`}>{a.prioridad}</span>{a.quien}: {a.accion}</p><p className="text-xs text-gray-500 mt-1">{a.por_que}</p></div>)}</div>;})}</div>
   {!!r.aplicados?.length&&<div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5 text-sm"><p className="font-black text-emerald-800 mb-2">✅ Ya ajusté la IA de WhatsApp ({r.aplicados.length} cambio{r.aplicados.length===1?'':'s'}; puedes volver atrás en su historial)</p>{r.aplicados.map((c,i)=><p key={i} className="text-emerald-900 whitespace-pre-line">• {c.despues}</p>)}</div>}
  </>}
 </div>;
}
