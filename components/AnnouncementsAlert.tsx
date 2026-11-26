'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';

type Doc={id:string;nombre:string;descripcion:string|null;created_at:string;area_id:string};
const KEY='comunicados-vistos';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]') as string[];}catch{return [];}};

/** Announcements for the whole team: every document uploaded to a «Comunicados» folder of Documentos de la marca shows here for 24 hours
 *  (small button at the bottom left, like the other alerts). «Ya lo vi» hides it for this person; the full document stays in Documentos de la marca. */
export default function AnnouncementsAlert(){
 const [docs,setDocs]=useState<Doc[]>([]),[vistos,setVistos]=useState<string[]>([]),[abierto,setAbierto]=useState(false);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   const {data:areas}=await supabase.from('doc_areas').select('id').ilike('nombre','comunicados%').eq('activo',true);
   const ids=(areas||[]).map(a=>a.id as string);
   if(!ids.length){if(live)setDocs([]);return;}
   const {data}=await supabase.from('doc_archivos').select('id,nombre,descripcion,created_at,area_id').in('area_id',ids).eq('archivado',false)
    .gte('created_at',new Date(Date.now()-24*3600000).toISOString()).order('created_at',{ascending:false}).limit(10);
   if(live){setVistos(read());setDocs((data||[]) as Doc[]);}
  };
  void load();const t=setInterval(()=>void load(),300000);return()=>{live=false;clearInterval(t);};
 },[]);
 const lista=docs.filter(d=>!vistos.includes(d.id));
 if(!lista.length)return null;
 const visto=(id:string)=>{const v=[...read().slice(-50),id];try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}setVistos(v);};
 return <div className="fixed bottom-40 left-4 z-[90] w-[min(22rem,calc(100vw-2rem))]">
  {abierto&&<div className="mb-2 max-h-[55vh] overflow-y-auto space-y-2 rounded-2xl">
   {lista.map(d=><div key={d.id} className="rounded-2xl border border-indigo-200 bg-white p-3 shadow-xl">
    <div className="flex items-start justify-between gap-2">
     <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Comunicado · {new Date(d.created_at).toLocaleString('es-CO',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</p>
     <button type="button" onClick={()=>visto(d.id)} className="text-[11px] font-bold text-gray-400 hover:text-gray-700 whitespace-nowrap">Ya lo vi</button>
    </div>
    <p className="font-black text-gray-900 text-sm mt-0.5">{d.nombre}</p>
    {d.descripcion&&<p className="text-xs text-gray-600 line-clamp-3">{d.descripcion}</p>}
    <Link href={`/dashboard/documentos?area=${d.area_id}&doc=${d.id}`} onClick={()=>setAbierto(false)} className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-black">Ver comunicado</Link>
   </div>)}
  </div>}
  <button type="button" onClick={()=>setAbierto(v=>!v)} aria-expanded={abierto}
   className={`rounded-full bg-indigo-600 text-white pl-3 pr-4 py-2 shadow-xl text-xs font-black flex items-center gap-2 ${!abierto?'animate-pulse':''}`}>
   <span>📣</span><span>{lista.length} {lista.length===1?'comunicado nuevo':'comunicados nuevos'}</span><span aria-hidden>{abierto?'▾':'▴'}</span>
  </button>
 </div>;
}
