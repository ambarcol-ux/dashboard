'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Apartado={codigo:string;cliente:string|null;fecha_evento:string;hasta:string};
/** Warning only (does not block): a dress of this contract is set aside for 48 h for another customer near this date (Primeras visitas). */
export default function ApartadoAviso({sede,codigos,fecha}:{sede:string;codigos:string[];fecha:string}){
 const [lista,setLista]=useState<Apartado[]>([]);
 const key=codigos.map(c=>c.trim()).filter(Boolean).join(',');
 useEffect(()=>{let live=true;
  if(!sede||!key)return;
  const t=setTimeout(()=>{void supabase.rpc('apartados_activos',{p_sede:sede,p_codigos:key.split(','),p_fecha:fecha||null}).then(({data})=>{if(live)setLista((data||[]) as Apartado[]);});},400);
  return()=>{live=false;clearTimeout(t);};},[sede,key,fecha]);
 if(!lista.length||!sede||!key)return null;
 const f=(d:string)=>new Date(d).toLocaleString('es-CO',{timeZone:'America/Bogota',weekday:'short',day:'numeric',month:'short',hour:'numeric',minute:'2-digit'});
 return <div role="status" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 font-bold">
  {lista.map(a=><p key={a.codigo+a.hasta}>🔒 El vestido {a.codigo} está apartado para {a.cliente||'otra clienta'} (evento {new Date(a.fecha_evento+'T12:00:00').toLocaleDateString('es-CO')}) hasta el {f(a.hasta)}. Confírmalo con la asesora antes de contratarlo.</p>)}
 </div>;
}
