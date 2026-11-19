'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import {useEffect,useState} from 'react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type Opt={id:number|string;nombre:string;pct?:number};
type Cat={documentos:Opt[];vendedores:Opt[];pagos:Opt[];impuestos:Opt[]};
const MEDIOS=['Efectivo','Transferencia','Tarjeta','Otro'];
export async function siigoApi(body:Record<string,unknown>){
 const {data}=await supabase.auth.getSession();
 const r=await fetch('/api/siigo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify(body)});
 const j=await r.json().catch(()=>({error:'Respuesta no válida.'}));
 if(!r.ok)throw Error(j.error||'Error con Siigo.');
 return j;
}

/** Facturación por sede › billing parameters chosen from the site's own Siigo account (document types, seller, payment methods, tax, city). */
export default function SiigoParams({sede,configurada}:{sede:string;configurada:boolean}){
 const [p,setP]=useState<any>({}),[cat,setCat]=useState<Cat|null>(null),[busy,setBusy]=useState('');
 useEffect(()=>{if(configurada)void supabase.rpc('siigo_parametros',{p_sede_id:sede}).then(({data})=>setP(data||{}));},[sede,configurada]);
 if(!configurada)return null;
 const cargar=async()=>{setBusy('c');try{setCat(await siigoApi({accion:'catalogos',sede}));toast.success('Conexión con Siigo correcta.');}catch(e){toast.error((e as Error).message);}setBusy('');};
 const guardar=async()=>{setBusy('g');const imp=cat?.impuestos.find(t=>String(t.id)===String(p.impuesto));
  const {error}=await supabase.rpc('siigo_parametros',{p_sede_id:sede,p_parametros:{...p,impuesto_pct:p.impuesto?(imp?.pct??p.impuesto_pct??0):0}});
  if(error)toast.error(error.message);else toast.success('Parámetros de facturación guardados.');setBusy('');};
 const num=(v:string)=>v===''?null:Number(v);
 const sel=(label:string,value:any,opts:Opt[]|undefined,on:(v:any)=>void,vacio='— Elegir —')=><label className="text-sm font-bold">{label}
  <select className="mt-2 w-full border rounded-xl p-3" value={value??''} onChange={e=>on(num(e.target.value))} disabled={!opts}>
   <option value="">{opts?vacio:value?`Guardado (${value}) · carga las opciones`:'Carga las opciones de Siigo'}</option>{opts?.map(o=><option key={o.id} value={o.id}>{o.nombre}</option>)}</select></label>;
 return <div className="mt-6 pt-5 border-t border-gray-100">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-black">Parámetros de facturación</h3>
   <button disabled={!!busy} onClick={()=>void cargar()} className="px-4 py-2 border rounded-xl font-bold text-sm">{busy==='c'?'Conectando…':'Probar conexión y cargar opciones'}</button></div>
  <div className="grid md:grid-cols-2 gap-4 mt-4">
   {sel('Comprobante factura electrónica',p.documento_electronica,cat?.documentos,v=>setP({...p,documento_electronica:v}))}
   {sel('Comprobante factura de ingreso (opcional)',p.documento_ingreso,cat?.documentos,v=>setP({...p,documento_ingreso:v}),'— Ninguno —')}
   {sel('Vendedor',p.vendedor,cat?.vendedores,v=>setP({...p,vendedor:v}))}
   {sel('Impuesto (opcional)',p.impuesto,cat?.impuestos,v=>setP({...p,impuesto:v}),'— Sin impuesto —')}
   {MEDIOS.map(m=><div key={m}>{sel(`Forma de pago: ${m}`,p.pagos?.[m],cat?.pagos,v=>setP({...p,pagos:{...(p.pagos||{}),[m]:v}}))}</div>)}
   {sel('Forma de pago para saldo pendiente (crédito)',p.pago_credito,cat?.pagos,v=>setP({...p,pago_credito:v}))}
   <label className="text-sm font-bold">Ciudad para clientes nuevos (código DANE)
    <div className="mt-2 flex gap-2"><input className="w-24 border rounded-xl p-3" placeholder="Depto 08" value={p.ciudad?.state_code||''} onChange={e=>setP({...p,ciudad:{...(p.ciudad||{}),state_code:e.target.value.replace(/\D/g,'').slice(0,2)}})}/>
     <input className="flex-1 border rounded-xl p-3" placeholder="Ciudad 08001" value={p.ciudad?.city_code||''} onChange={e=>setP({...p,ciudad:{...(p.ciudad||{}),city_code:e.target.value.replace(/\D/g,'').slice(0,5)}})}/></div></label>
   {p.impuesto?<label className="text-sm font-bold flex items-center gap-2 mt-7"><input type="checkbox" checked={p.precios_con_iva!==false} onChange={e=>setP({...p,precios_con_iva:e.target.checked})}/>Los precios del ERP ya incluyen el impuesto</label>:null}
  </div>
  <button disabled={!!busy} onClick={()=>void guardar()} className="mt-4 px-5 py-3 bg-gray-900 text-white rounded-xl font-black">{busy==='g'?'Guardando…':'Guardar parámetros'}</button>
 </div>;
}
