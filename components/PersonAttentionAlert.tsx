'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';

type Chat={id:string;nombre:string|null;telefono:string;sede:string|null;motivo:string|null;desde:string};
const KEY='avisos-atender-pospuestos';
const SNOOZE_MS=30*60000;
const read=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}') as Record<string,number>;}catch{return {};}};

/** Pop-up for advisers: WhatsApp chats where the AI asked for a person (complaints, contract changes, special cases), oldest first.
 *  «Más tarde» hides one for 30 minutes; it comes back while nobody has answered. It disappears when a person answers from the ERP or the phone. */
export default function PersonAttentionAlert(){
 const [chats,setChats]=useState<Chat[]>([]),[pospuestos,setPospuestos]=useState<Record<string,number>>({}),[now,setNow]=useState(()=>Date.now());
 useEffect(()=>{
  let live=true;
  const load=()=>void supabase.rpc('chats_atender_persona').then(({data})=>{if(live){setPospuestos(read());setChats((data||[]) as Chat[]);setNow(Date.now());}});
  load();const t=setInterval(load,90000);return()=>{live=false;clearInterval(t);};
 },[]);
 const lista=chats.filter(c=>!(pospuestos[c.id]>now));
 if(!lista.length)return null;
 const posponer=(id:string)=>{const v={...read(),[id]:now+SNOOZE_MS};for(const [k,t] of Object.entries(v))if(t<now)delete v[k];try{localStorage.setItem(KEY,JSON.stringify(v));}catch{}setPospuestos(v);};
 const espera=(c:Chat)=>{const m=Math.max(0,Math.round((now-Date.parse(c.desde))/60000));return m<60?`${m} min`:m<1440?`${Math.round(m/60)} h`:`${Math.round(m/1440)} d`;};
 const tel=(t:string)=>t.replace(/\D/g,'').slice(-10);
 return <div className="fixed bottom-4 left-4 z-[90] w-[min(22rem,calc(100vw-2rem))] space-y-2">
  <div className="rounded-2xl bg-red-600 text-white px-4 py-2 shadow-xl flex items-center justify-between gap-2">
   <p className="text-xs font-black uppercase tracking-widest">🙋 Atención de una persona · {lista.length}</p>
   <Link href="/dashboard/whatsapp?filtro=atender" className="text-[11px] font-black underline">Ver todas</Link>
  </div>
  {lista.slice(0,3).map(c=>{const larga=now-Date.parse(c.desde)>30*60000;
   return <div key={c.id} className={`rounded-2xl border bg-white p-4 shadow-xl ${larga?'border-red-400 ring-2 ring-red-300':'border-amber-300'}`}>
    <div className="flex items-start justify-between gap-2">
     <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{c.sede||'Sin sede'} · esperando {espera(c)}</p>
     <button type="button" onClick={()=>posponer(c.id)} className="text-[11px] font-bold text-gray-400 hover:text-gray-700">Más tarde</button>
    </div>
    <p className="font-black text-gray-900 mt-1">{c.nombre||'Clienta'}</p>
    {c.motivo&&<p className="text-sm font-bold text-red-700">{c.motivo}</p>}
    <Link href={`/dashboard/whatsapp?tel=${tel(c.telefono)}`} className="inline-block mt-2 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black">Responder ahora</Link>
   </div>;})}
 </div>;
}
