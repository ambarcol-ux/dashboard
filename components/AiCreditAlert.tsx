'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Administration: red banner while the WhatsApp AI is stopped because the Anthropic account ran out of credit. */
export default function AiCreditAlert(){
 const [d,setD]=useState<{desde:string;chats:number}|null>(null);
 useEffect(()=>{let live=true;
  const load=()=>void supabase.rpc('ia_sin_saldo').then(({data})=>{if(live)setD((data as {desde:string;chats:number}|null)||null);});
  load();const t=setInterval(load,300000);return()=>{live=false;clearInterval(t);};},[]);
 if(!d)return null;
 return <div role="alert" className="fixed top-2 left-1/2 -translate-x-1/2 z-[95] w-[min(40rem,calc(100vw-1rem))] rounded-2xl bg-red-600 text-white shadow-xl px-4 py-3 text-sm">
  <p className="font-black">⚠️ La IA de WhatsApp está sin crédito desde {new Date(d.desde).toLocaleString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'})}</p>
  <p className="text-xs mt-0.5">{d.chats} chat{d.chats===1?'':'s'} sin respuesta automática. Recarga en <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noopener noreferrer" className="underline font-bold">console.anthropic.com › Plans &amp; Billing</a>; el aviso se quita solo cuando la IA vuelve a responder.</p>
 </div>;
}
