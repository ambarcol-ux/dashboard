'use client';
import {useState} from 'react';
import {supabase} from '@/lib/supabase';

type Estado={tipo:string;estado:string;numero:string|null;error:string|null}|undefined;
const TIPOS=[['gasto','El proveedor entregó factura electrónica'],['soporte_gasto','Cuenta de cobro o recibo (documento soporte)'],['soporte_producto','Compra de vestidos para inventario (documento soporte)']] as const;

/** Gastos › one expense (or Proveedores › Pagos › one supplier payment, with «sedes»): sends it to Siigo by the document the supplier gave. */
export default function SiigoGasto({gastoId,beneficiario,estado,onDone,sedes}:{gastoId:string;beneficiario?:string|null;estado:Estado;onDone:()=>void;sedes?:{id:string;nombre:string}[]}){
 const [sede,setSede]=useState('');
 const [open,setOpen]=useState(false),[tipo,setTipo]=useState<string>('gasto'),[nit,setNit]=useState(''),[nombre,setNombre]=useState(beneficiario||''),[factura,setFactura]=useState(''),[vestidos,setVestidos]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 if(estado)return <span title={estado.error||''} className={`px-3 py-1.5 rounded-xl text-xs font-black ${estado.estado==='enviado'?'bg-emerald-50 text-emerald-700':estado.estado==='error'?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-700'}`}>Siigo: {estado.estado}{estado.numero?` ${estado.numero}`:''}</span>;
 const enviar=async()=>{setBusy(true);setError('');
  const {error:e}=sedes?await supabase.rpc('siigo_registrar_pago_proveedor',{p_pago:gastoId,p_sede:sede||null,p_tipo:tipo,p_factura_numero:factura})
   :await supabase.rpc('siigo_registrar_gasto',{p_gasto:gastoId,p_tipo:tipo,p_proveedor_documento:nit,p_proveedor_nombre:nombre,p_factura_numero:factura,p_vestidos:tipo==='soporte_producto'?vestidos.split(/[\s,;]+/).filter(Boolean):null});
  setBusy(false);if(e)setError(e.message);else{setOpen(false);onDone();}};
 const input='w-full mt-1 border rounded-lg p-2 text-sm';
 return <>
  <button type="button" onClick={()=>setOpen(true)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-indigo-700">Enviar a Siigo</button>
  {open&&<div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={()=>setOpen(false)}><div className="bg-white rounded-2xl p-5 w-full max-w-md space-y-3" onClick={e=>e.stopPropagation()}>
   <h3 className="font-black">Enviar gasto a Siigo</h3>
   {sedes&&<label className="block text-xs font-bold text-gray-600">Sede que asume el pago<select className={input} value={sede} onChange={e=>setSede(e.target.value)}><option value="">Elige la sede</option>{sedes.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select></label>}
   <label className="block text-xs font-bold text-gray-600">¿Qué entregó el proveedor?<select className={input} value={tipo} onChange={e=>setTipo(e.target.value)}>{TIPOS.filter(([v])=>!sedes||v!=='soporte_producto').map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
   {!sedes&&<><label className="block text-xs font-bold text-gray-600">NIT o cédula del proveedor<input className={input} inputMode="numeric" value={nit} onChange={e=>setNit(e.target.value)}/></label>
   <label className="block text-xs font-bold text-gray-600">Nombre del proveedor<input className={input} value={nombre} onChange={e=>setNombre(e.target.value)}/></label></>}
   {tipo==='gasto'&&<label className="block text-xs font-bold text-gray-600">Número de la factura electrónica<input className={input} value={factura} onChange={e=>setFactura(e.target.value)} placeholder="Ej.: FE-1234"/></label>}
   {tipo==='soporte_producto'&&<label className="block text-xs font-bold text-gray-600">Códigos de los vestidos comprados (ya creados en Inventario)<input className={input} value={vestidos} onChange={e=>setVestidos(e.target.value)} placeholder="Ej.: 1046-S, 1046-M"/></label>}
   {error&&<p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
   <div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void enviar()} className="flex-1 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50">{busy?'Guardando…':'Enviar'}</button>
    <button type="button" onClick={()=>setOpen(false)} className="px-4 py-2 rounded-xl border text-sm font-black">Cancelar</button></div>
  </div></div>}
 </>;
}
