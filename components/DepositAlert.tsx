'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';

// One poller per Sidebar, shared by its desktop and mobile presentations.
// Deposits supplies its existing result, so this page needs no count request.
export function useDepositCount(provided: number | null | undefined, userId?: string){
 const [count,setCount]=useState<number|null>(null);
 useEffect(()=>{
  if(provided!==undefined)return;
  let active=true,inFlight=false,lastLoaded=0;
  setCount(null);
  async function refresh(force=false){
   if(document.visibilityState!=='visible'||inFlight||(!force&&Date.now()-lastLoaded<30000))return;
   inFlight=true;
   try{
    const {count,error}=await supabase.from('solicitudes_depositos').select('id',{count:'exact',head:true}).in('estado',['pendiente','en_proceso','pagado']);
    if(active){setCount(error?null:count);lastLoaded=Date.now();}
   }catch{if(active)setCount(null);}finally{inFlight=false;}
  }
  const refreshIfStale=()=>{void refresh();};
  const refreshAfterChange=()=>{void refresh(true);};
  refreshIfStale();const timer=setInterval(refreshIfStale,30000);
  window.addEventListener('focus',refreshIfStale);window.addEventListener('depositos-actualizados',refreshAfterChange);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refreshIfStale);window.removeEventListener('depositos-actualizados',refreshAfterChange);};
 },[provided,userId]);
 return provided===undefined?count:provided;
}

export default function DepositAlert({count:provided}:{count?:number|null}){
 const count=useDepositCount(provided);
 return <Link href="/dashboard/devoluciones-depositos#pendientes" className="block rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" aria-live="polite">{count===null?'Consultar depósitos pendientes':count>0?`🔴 ${count} depósitos pendientes de devolución`:'Depósitos: sin solicitudes pendientes'}</Link>;
}
