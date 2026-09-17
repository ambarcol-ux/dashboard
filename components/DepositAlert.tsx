'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
export default function DepositAlert(){
 const [count,setCount]=useState<number|null>(null);
 useEffect(()=>{
  let active=true;
  async function refresh(){
   if(document.visibilityState!=='visible')return;
   const {count,error}=await supabase.from('solicitudes_depositos').select('id',{count:'exact',head:true}).in('estado',['pendiente','en_proceso','pagado']);
   if(active)setCount(error?null:count);
  }
  void refresh();const timer=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('depositos-actualizados',refresh);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',refresh);window.removeEventListener('depositos-actualizados',refresh);};
 },[]);
 return <Link href="/dashboard/devoluciones-depositos#pendientes" className="block rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700" aria-live="polite">{count===null?'Consultar depósitos pendientes':count>0?`🔴 ${count} depósitos pendientes de devolución`:'Depósitos: sin solicitudes pendientes'}</Link>;
}
