'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {useConfig} from '@/lib/config';

type Row={nombre:string;debidos:number;hechos:number;cumplimiento:number};
type Summary={en_seguimiento:number;hoy:number;vencidos:number;recuperadas_pct:number;
 alertas:{cita_id:string;cliente:string;telefono:string;fecha:string;sede:string|null;asignada:string;estado:string}[];por_asesora:Row[];por_sede:Row[]};

/** Follow-ups of first visits by role: advisor = her own; leader / franchisee = their sedes; admin = all (seguimientos_resumen). */
export default function FollowupSummary({mode}:{mode:'panel'|'full'}){
 const maxAlertas=useConfig().param('pv_alertas_visibles',8);
 const [data,setData]=useState<Summary|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('seguimientos_resumen').then(({data})=>{if(live&&data)setData(data as Summary);});return()=>{live=false;};},[]);
 if(!data)return null;
 const fecha=(d:string)=>d.split('-').reverse().join('/');
 if(mode==='panel'){
  if(!data.alertas.length)return null;
  return <section className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
   <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-black text-amber-900">Seguimientos de primeras visitas: {data.hoy} para hoy · {data.vencidos} vencidos</p>
    <Link href="/dashboard/primeras-citas" className="text-xs font-black uppercase text-amber-800 underline">Ver seguimientos</Link></div>
   <ul className="mt-2 space-y-1 text-sm text-amber-900">{data.alertas.slice(0,maxAlertas).map(a=><li key={a.cita_id+a.fecha}><b>{a.estado}</b> · {a.cliente} · {fecha(a.fecha)} · {a.sede||'—'} · {a.asignada}</li>)}</ul>
   {data.alertas.length>maxAlertas&&<p className="text-xs text-amber-800 mt-1">Y {data.alertas.length-maxAlertas} más.</p>}
  </section>;
 }
 const tile=(l:string,v:string|number)=><div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 min-w-[9rem]"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{l}</p><p className="text-2xl font-black text-gray-900">{v}</p></div>;
 const table=(t:string,rows:Row[])=>rows.length>0&&<div className="bg-white border border-gray-100 rounded-2xl p-4 overflow-x-auto"><p className="font-black text-gray-800 mb-2">{t}</p>
  <table className="w-full text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th>Nombre</th><th>Para hoy o antes</th><th>Hechos</th><th>Cumplimiento</th></tr></thead>
   <tbody>{rows.map(r=><tr key={r.nombre} className="border-t border-gray-50"><td>{r.nombre}</td><td>{r.debidos}</td><td>{r.hechos}</td><td className={r.cumplimiento<70?'text-rose-600 font-black':'text-emerald-700 font-black'}>{r.cumplimiento}%</td></tr>)}</tbody></table></div>;
 return <section className="space-y-3 mb-6">
  <div className="flex flex-wrap gap-3">{tile('En seguimiento',data.en_seguimiento)}{tile('Hoy',data.hoy)}{tile('Vencidos',data.vencidos)}{tile('Recuperadas',`${data.recuperadas_pct}%`)}</div>
  <div className="grid gap-3 md:grid-cols-2">{table('Cumplimiento por asesora',data.por_asesora)}{table('Cumplimiento por sede',data.por_sede)}</div>
 </section>;
}

type Analysis={dim:'tipo'|'sede'|'asesora';nombre:string;en_seguimiento:number;hoy:number;vencidas:number;recuperacion:number;contactos_promedio:number;cumplimiento:number|null;motivos:Record<string,number>};
const TYPE_LABEL:Record<string,string>={asistida:'Cita asistida (no alquiló)',vitrina:'Vitrina (no alquiló)',no_asistida:'Cita no asistida'};
/** Commercial analysis of follow-ups by type, sede and advisor (seguimientos_analisis). */
export function FollowupAnalysis(){
 const [rows,setRows]=useState<Analysis[]|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('seguimientos_analisis').then(({data})=>{if(live)setRows((data||[]) as Analysis[]);});return()=>{live=false;};},[]);
 if(!rows)return null;
 return <section className="space-y-4 mt-6"><h2 className="text-xl font-black text-gray-900">Seguimientos</h2>
  {(['tipo','sede','asesora'] as const).map(d=>{const list=rows.filter(r=>r.dim===d);return list.length>0&&<div key={d} className="bg-white border border-gray-100 rounded-2xl p-4 overflow-x-auto">
   <p className="font-black text-gray-800 mb-2">Por {d==='tipo'?'tipo':d==='sede'?'sede':'asesora'}</p>
   <table className="w-full text-sm"><thead><tr className="text-left text-[10px] uppercase tracking-widest text-gray-400"><th>Nombre</th><th>En seguimiento</th><th>Hoy</th><th>Vencidas</th><th>% recuperación</th><th>Contactos promedio</th><th>% cumplimiento</th><th>Motivos de desistimiento</th></tr></thead>
    <tbody>{list.map(r=><tr key={r.nombre} className="border-t border-gray-50"><td>{d==='tipo'?TYPE_LABEL[r.nombre]||r.nombre:r.nombre}</td><td>{r.en_seguimiento}</td><td>{r.hoy}</td><td>{r.vencidas}</td><td>{r.recuperacion}%</td><td>{r.contactos_promedio}</td>
     <td>{r.cumplimiento==null?'—':`${r.cumplimiento}%`}</td><td>{Object.entries(r.motivos).map(([m,n])=>`${m} (${n})`).join(' · ')||'—'}</td></tr>)}</tbody></table></div>;})}
 </section>;
}
