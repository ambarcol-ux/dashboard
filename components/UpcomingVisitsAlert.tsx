'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';

type Cita={id:string;nombre:string;fecha:string;hora:string;modalidad:string;sede:string|null;enlace_virtual:string|null;llegada_at:string|null;codigo:string|null};
const KEY='avisos-citas-vistos';
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'[]') as string[];}catch{return [];}};

/** Store alert: appointments of the user's stores in the next 90 minutes (virtual ones highlighted, and a warning if they have no link). */
export default function UpcomingVisitsAlert(){
 const [citas,setCitas]=useState<Cita[]>([]),[vistos,setVistos]=useState<string[]>([]),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  let live=true;
  const load=()=>void supabase.rpc('citas_proximas_sede').then(({data})=>{if(live){setVistos(read());setCitas((data||[]) as Cita[]);setNow(Date.now());}});
  load();const t=setInterval(load,120000);return()=>{live=false;clearInterval(t);};
 },[]);
 const mins=(c:Cita)=>Math.round((Date.parse(`${c.fecha}T${c.hora.slice(0,5)}:00-05:00`)-now)/60000);
 const lista=citas.filter(c=>!c.llegada_at&&!vistos.includes(c.id));
 if(!lista.length)return null;
 const ocultar=(id:string)=>{const v=[...read(),id].slice(-200);try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}setVistos(v);};
 return <div className="fixed bottom-4 right-4 z-[90] w-[min(22rem,calc(100vw-2rem))] space-y-2">
  {lista.slice(0,4).map(c=>{const m=mins(c),virtual=c.modalidad==='virtual',urgente=m<=15;
   return <div key={c.id} className={`rounded-2xl border p-4 shadow-xl bg-white ${virtual?'border-violet-300':'border-rose-200'} ${urgente?'ring-2 ring-amber-400':''}`}>
    <div className="flex items-start justify-between gap-2">
     <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{virtual?'💻 Cita virtual':'📍 Cita presencial'} · {c.sede||''}</p>
     <button type="button" aria-label="Ocultar aviso" onClick={()=>ocultar(c.id)} className="text-gray-400 hover:text-gray-700 font-black leading-none">×</button>
    </div>
    <p className="font-black text-gray-900 mt-1">{c.nombre}</p>
    <p className={`text-sm font-bold ${m<0?'text-red-600':urgente?'text-amber-700':'text-gray-600'}`}>{c.hora.slice(0,5)} · {m<0?`empezó hace ${-m} min y no se ha registrado llegada`:m===0?'es ahora':`en ${m} min`}</p>
    {virtual&&!c.enlace_virtual&&<p className="text-xs font-bold text-red-600 mt-1">Sin enlace de videollamada: créalo y envíalo ya.</p>}
    <div className="flex gap-2 mt-2 text-xs font-black">
     {virtual&&c.enlace_virtual&&<a href={c.enlace_virtual} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-violet-600 text-white">Entrar a la videollamada</a>}
     <Link href="/dashboard/primeras-citas" className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700">Ver cita</Link>
    </div>
   </div>;})}
 </div>;
}
