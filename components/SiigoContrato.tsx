'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Doc={id:string;tipo:string;estado:string;numero:string|null;error:string|null;valor:string|null;fecha:string};
type Info={configurada:boolean;activa:boolean;nota_credito:boolean;tipo_factura:string;tipo_venta:string;documentos:Doc[]}|null;
const TIPO:Record<string,string>={factura:'Factura',recibo_caja:'Recibo de caja',anticipo:'Anticipo (depósito)',devolucion_anticipo:'Devolución de depósito',nota_credito:'Nota crédito'};
const cop=(v:unknown)=>`$${Number(v||0).toLocaleString('es-CO')}`;

/** Contract › payment page: its Siigo documents, invoice it (contracts from before the cut-over) and credit notes (administration/accounting). */
export default function SiigoContrato({contratoId}:{contratoId:string}){
 const [info,setInfo]=useState<Info>(null),[form,setForm]=useState(false),[nc,setNc]=useState<Doc|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [tf,setTf]=useState('electronica'),[tv,setTv]=useState('alquiler'),[ncTipo,setNcTipo]=useState('total'),[ncValor,setNcValor]=useState(''),[ncMotivo,setNcMotivo]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.rpc('siigo_contrato',{p_contrato:contratoId});const d=data as Info;setInfo(d);if(d){setTf(d.tipo_factura);setTv(d.tipo_venta);}},[contratoId]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 if(!info||!info.configurada)return null;
 const factura=info.documentos.find(d=>d.tipo==='factura'&&d.estado!=='anulado');
 const run=async(f:()=>Promise<{error:{message:string}|null}>)=>{setBusy(true);setError('');const {error:e}=await f();setBusy(false);if(e)setError(e.message);else{setForm(false);setNc(null);await load();}};
 const input='w-full mt-1 border rounded-lg p-2 text-sm';
 return <div className="mt-4 border border-indigo-100 bg-indigo-50/40 rounded-2xl p-4 space-y-2">
  <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-black text-indigo-900">Siigo{info.activa?'':' (sede aún sin envío automático)'}</p>
   {!factura&&<button type="button" onClick={()=>setForm(v=>!v)} className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-black">Facturar en Siigo</button>}</div>
  {info.documentos.length===0&&<p className="text-xs text-gray-500">Sin documentos en Siigo.</p>}
  {info.documentos.map(d=><div key={d.id} className="text-xs flex flex-wrap gap-2 items-center">
   <span className={`px-2 py-0.5 rounded-full font-black ${d.estado==='enviado'?'bg-emerald-100 text-emerald-700':d.estado==='error'?'bg-rose-100 text-rose-700':d.estado==='anulado'?'bg-gray-100 text-gray-500':'bg-amber-100 text-amber-700'}`}>{d.estado}</span>
   <b>{TIPO[d.tipo]||d.tipo}</b>{d.numero&&<span>{d.numero}</span>}{d.valor&&<span>{cop(d.valor)}</span>}
   {d.tipo==='factura'&&d.estado==='enviado'&&info.nota_credito&&<button type="button" onClick={()=>setNc(d)} className="underline font-bold text-indigo-700">Nota crédito</button>}
   {d.error&&<span className="w-full text-rose-700">{d.error}</span>}</div>)}
  {form&&<div className="grid sm:grid-cols-2 gap-2 pt-2">
   <label className="text-xs font-bold text-gray-600">Tipo de factura<select className={input} value={tf} onChange={e=>setTf(e.target.value)}><option value="electronica">Factura electrónica</option><option value="ingreso">Factura de ingreso (no va a la DIAN)</option></select></label>
   <label className="text-xs font-bold text-gray-600">Tipo de venta<select className={input} value={tv} onChange={e=>setTv(e.target.value)}><option value="alquiler">Servicio de alquiler</option><option value="venta">Venta</option></select></label>
   <p className="sm:col-span-2 text-[11px] text-gray-500">Se factura a crédito por el valor del contrato; cada abono ya registrado y los siguientes se envían como recibo de caja.</p>
   <button type="button" disabled={busy} onClick={()=>void run(async()=>await supabase.rpc('siigo_facturar_contrato',{p_contrato:contratoId,p_tipo_factura:tf,p_tipo_venta:tv,p_forma_pago:null}))} className="sm:col-span-2 py-2 rounded-lg bg-indigo-600 text-white text-sm font-black disabled:opacity-50">{busy?'Guardando…':'Enviar factura a Siigo'}</button>
  </div>}
  {nc&&<div className="grid sm:grid-cols-2 gap-2 pt-2 border-t">
   <p className="sm:col-span-2 text-xs font-black text-gray-700">Nota crédito a la factura {nc.numero}</p>
   <label className="text-xs font-bold text-gray-600">Tipo<select className={input} value={ncTipo} onChange={e=>setNcTipo(e.target.value)}><option value="total">Total (anula la factura)</option><option value="parcial">Parcial (descuento o devolución)</option><option value="correccion">Corrección (anula y se vuelve a facturar)</option></select></label>
   {ncTipo==='parcial'&&<label className="text-xs font-bold text-gray-600">Valor<input className={input} inputMode="numeric" value={ncValor} onChange={e=>setNcValor(e.target.value.replace(/\D/g,''))}/></label>}
   <label className="sm:col-span-2 text-xs font-bold text-gray-600">Motivo<input className={input} value={ncMotivo} onChange={e=>setNcMotivo(e.target.value)} placeholder="Ej.: la clienta desistió del alquiler"/></label>
   <p className="sm:col-span-2 text-[11px] text-amber-700">La nota crédito no devuelve dinero: si hay devolución, regístrala como egreso en Cierres de caja.</p>
   <button type="button" disabled={busy} onClick={()=>void run(async()=>await supabase.rpc('siigo_nota_credito',{p_factura:nc.id,p_tipo:ncTipo,p_valor:ncTipo==='parcial'?Number(ncValor):null,p_motivo:ncMotivo}))} className="py-2 rounded-lg bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Guardando…':'Hacer nota crédito'}</button>
   <button type="button" onClick={()=>setNc(null)} className="py-2 rounded-lg border text-sm font-black">Cancelar</button>
  </div>}
  {error&&<p role="alert" className="text-xs font-bold text-rose-700">{error}</p>}
 </div>;
}
