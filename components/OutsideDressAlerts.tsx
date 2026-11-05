'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {collectPages} from '@/lib/collect-pages';
type OutsideDress={id:string;vestido_codigo:string;cliente_nombre:string;numero_contrato:string;numero_factura:string|null;sede:string;salida_at:string;dias_fuera:number;semaforo:string};
/** Dresses out of the store in alert; with `sede` (site name) only that site's. */
export default function OutsideDressAlerts({sede=null}:{sede?:string|null}={}){
 const [rows,setRows]=useState<OutsideDress[]>([]),[error,setError]=useState(false),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
 useEffect(()=>{
  let disposed=false,busy=false,last=0;
  async function load(){
   if(busy)return;busy=true;
   try{const data=await collectPages<OutsideDress>((from,to)=>supabase.rpc('vestidos_fuera_activos').eq('semaforo','ALERTA').range(from,to));if(!disposed){setRows(data);setError(false);last=Date.now();}}
   catch{if(!disposed)setError(true);}finally{busy=false;if(!disposed)setLoading(false);}
  }
  const refresh=()=>{if(document.visibilityState==='visible'&&Date.now()-last>=60000)void load();};
  void load();const timer=window.setInterval(refresh,60000);window.addEventListener('focus',refresh);
  return()=>{disposed=true;window.clearInterval(timer);window.removeEventListener('focus',refresh);};
 },[retry]);
 if(loading)return <p role="status" className="m-4 text-sm text-gray-500">Consultando vestidos fuera de tienda…</p>;
 if(error)return <div role="alert" className="m-4 rounded-xl border border-amber-300 bg-amber-50 p-4">No se pudieron actualizar las alertas de vestidos fuera de tienda. <button type="button" className="underline font-bold" onClick={()=>{setLoading(true);setRetry(n=>n+1);}}>Reintentar</button></div>;
 const lista=sede?rows.filter(r=>r.sede===sede):rows;
 if(!lista.length)return null;
 return <section aria-label="Vestidos fuera de tienda" className="mx-4 mb-5 rounded-2xl border border-red-200 bg-red-50 p-5"><h2 className="font-black text-red-800">⚠️ Vestidos fuera de tienda · {lista.length}</h2><p className="text-sm text-red-800">Desde 5 días sin regreso registrado.</p><div className="mt-3 grid gap-3">{lista.map(v=><article key={v.id} className="rounded-xl bg-white p-4 text-sm shadow-sm"><strong className="text-red-700">Vestido fuera de tienda por {v.dias_fuera} días</strong><p>Vestido: {v.vestido_codigo} · Cliente: {v.cliente_nombre} · Contrato: {v.numero_contrato}</p><p>Factura: {v.numero_factura||'Sin factura'} · Sede: {v.sede} · Salida: {new Date(v.salida_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</p><p className="font-bold">Estado: ALERTA · Requiere seguimiento</p></article>)}</div></section>;
}
