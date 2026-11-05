'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {COBRO_EXCLUIDOS,COBRO_FIELDS,hoyBogota,porCobrar,plazoCobro,urgente,type Cobro} from '@/lib/cobros';

/** Menu reminder: contracts of the user's sites delivered within 7 days (or overdue) that still owe money. Refreshes every 5 minutes. */
export function useCobrosUrgentes(enabled=true,sedeId:string|null=null){
 const [n,setN]=useState<{total:number;tres:number}|null>(null);
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   if(document.visibilityState!=='visible')return;
   const hoy=hoyBogota(),limite=new Date(Date.parse(hoy)+7*86400000).toISOString().slice(0,10);
   const {data,error}=await supabase.from('contratos').select(COBRO_FIELDS).not('estado','in',`(${COBRO_EXCLUIDOS.join(',')})`)
    .or(`fecha_entrega_envio.lte.${limite},and(fecha_entrega_envio.is.null,fecha_evento.lte.${limite})`).limit(1000);
   if(!live||error)return;
   const rows=((data||[]) as Cobro[]).filter(c=>(!sedeId||c.sede_id===sedeId)&&urgente(c,hoy)&&porCobrar(c)>0);
   setN({total:rows.length,tres:rows.filter(c=>plazoCobro(c,hoy)!=='siete').length});
  };
  if(!enabled)return;
  void load();const t=setInterval(()=>void load(),300000);
  return()=>{live=false;clearInterval(t);};
 },[enabled,sedeId]);
 return n;
}

export default function CobrosAlert(){
 const n=useCobrosUrgentes();
 if(!n||!n.total)return null;
 return <Link href="/dashboard/cuentas-por-cobrar" className="block rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800" aria-live="polite">
  💰 {n.total} contrato{n.total===1?'':'s'} por entregar con saldo (7 días){n.tres?` · ${n.tres} urgente${n.tres===1?'':'s'} (3 días o vencidos)`:''}
 </Link>;
}
