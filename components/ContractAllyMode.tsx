'use client';
import {useEffect,useState} from 'react';
import {Handshake} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {ALLY_EVENT_LABEL,categoryRange,clientId,type AllyCategory,type AllyClient} from '@/lib/ally-clients';

export {ALLY_DISCOUNT,EMPTY_ALLY_MODE,allyModeError,allyModePayload,type ContractAlly,type ContractAllyModeValue} from '@/lib/ally-clients';
import {EMPTY_ALLY_MODE,type ContractAlly,type ContractAllyModeValue} from '@/lib/ally-clients';
const money=(v:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v);

/** Classification at the start of the lease contract: Cliente directo (unchanged) or Aliado (ally is the client; the ally's client data are loaded). */
export default function ContractAllyMode({value,onChange,onAlly,onClienta,descuento,total,numero,disabled}:{value:ContractAllyModeValue;onChange:(v:ContractAllyModeValue)=>void;onAlly:(a:ContractAlly)=>void;onClienta:(c:AllyClient)=>void;descuento:number;total:number;numero:string;disabled?:boolean}){
 const [cats,setCats]=useState<AllyCategory[]>([]);
 useEffect(()=>{void supabase.rpc('categorias_aliado').then(({data})=>setCats((data||[]) as AllyCategory[]));},[]);
 const [qa,setQa]=useState(''),[qc,setQc]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const find=async(fn:string,args:Record<string,unknown>,notFound:string)=>{setBusy(true);setError('');const {data,error:e}=await supabase.rpc(fn,args);setBusy(false);if(e||!data){setError(e?.message||notFound);return null;}return data;};
 const loadAlly=async()=>{const a=await find('buscar_aliado_contrato',{p_q:qa},'No hay un aliado activo con ese ID, código o cédula.') as ContractAlly|null;if(a){onChange({...value,aliado:a,clienta:null,categoria:''});onAlly(a);}};
 const loadClient=async()=>{const c=await find('buscar_clienta_aliado',{p_aliado:value.aliado!.id,p_q:qc},'No hay una clienta de este aliado con ese ID o documento.') as AllyClient|null;if(c){onChange({...value,clienta:c,categoria:c.categoria});onClienta(c);}};
 const box='w-full bg-white border border-gray-200 text-gray-900 rounded-xl px-4 py-3';
 const c=value.clienta;
 return <section className="bg-violet-50/40 p-6 rounded-2xl border border-violet-100 shadow-sm space-y-4">
  <div className="flex items-center gap-2 text-gray-800 border-b border-violet-100 pb-2"><Handshake className="w-5 h-5 text-violet-600"/><h3 className="font-bold">Clasificación del contrato</h3></div>
  <div className="flex gap-2">{([[false,'Cliente directo'],[true,'Aliado']] as [boolean,string][]).map(([v,l])=><button key={l} type="button" disabled={disabled} onClick={()=>onChange(v?{...value,tiene:true}:EMPTY_ALLY_MODE)} className={`px-5 py-2 rounded-xl border text-sm font-bold ${value.tiene===v?'bg-violet-600 border-violet-600 text-white':'bg-white border-gray-200 text-gray-600'}`}>{l}</button>)}</div>
  {error&&<p className="text-sm font-bold text-rose-600">{error}</p>}
  {value.tiene&&<>
   <div className="text-sm font-semibold text-gray-700">Aliado (cliente del contrato)
    {value.aliado?<div className="mt-1 flex items-center justify-between gap-2 bg-white border border-violet-200 rounded-xl px-4 py-3"><span>{value.aliado.nombre} · {value.aliado.codigo} · C.C. {value.aliado.cedula} · {value.aliado.tipo}</span>{!disabled&&<button type="button" className="text-xs font-bold text-violet-700 underline" onClick={()=>onChange({...value,aliado:null,clienta:null})}>Cambiar</button>}</div>
    :<div className="mt-1 flex gap-2"><input className={box} disabled={disabled} placeholder="ID, código (ORG-0001) o cédula del aliado" value={qa} onChange={e=>setQa(e.target.value)}/><button type="button" disabled={busy||!qa.trim()} onClick={()=>void loadAlly()} className="px-4 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50">Cargar</button></div>}</div>
   {value.aliado&&<div className="text-sm font-semibold text-gray-700">Datos de la clienta del aliado
    {c?<div className="mt-1 bg-white border border-violet-200 rounded-xl p-4 space-y-1 font-normal">
      <p><b>{clientId(c.numero)}</b> · {c.clienta_nombre} · {c.clienta_menor?'T.I.':'C.C.'} {c.clienta_documento}{!disabled&&<button type="button" className="ml-3 text-xs font-bold text-violet-700 underline" onClick={()=>onChange({...value,clienta:null})}>Cambiar</button>}</p>
      {c.rep_nombre&&<p>Representante: {c.rep_nombre} ({c.rep_parentesco}) · C.C. {c.rep_cedula} · {c.rep_celular} · {c.rep_correo}</p>}
      <p>{ALLY_EVENT_LABEL[c.tipo_evento]||c.tipo_evento} · evento {c.fecha_evento.split('-').reverse().join('/')} · Autorizaciones: datos {new Date(c.autoriza_datos_at).toLocaleDateString('es-CO')} · imagen {c.uso_imagen?'Sí':'No'} · publicidad {c.publicidad?'Sí':'No'}</p>
      <label className="block pt-2 font-semibold">Categoría<select className={box+' mt-1'} disabled={disabled} value={value.categoria} onChange={e=>onChange({...value,categoria:e.target.value})}>{!cats.some(x=>x.tipo===c.tipo_evento&&x.nombre===value.categoria)&&value.categoria&&<option value={value.categoria}>{value.categoria}</option>}{cats.filter(x=>x.tipo===c.tipo_evento).map(x=><option key={x.nombre} value={x.nombre}>{x.nombre} · {categoryRange(x)}</option>)}</select></label>
      {value.categoria!==c.categoria&&<p className="text-xs text-amber-700">Cambio de categoría ({c.categoria} → {value.categoria}): ajusta el valor del alquiler; el cambio queda en el historial.</p>}
     </div>
    :<div className="mt-1 flex gap-2"><input className={box} disabled={disabled} placeholder="ID de clienta (CLI-00001), tarjeta de identidad o cédula del representante" value={qc} onChange={e=>setQc(e.target.value)}/><button type="button" disabled={busy||!qc.trim()} onClick={()=>void loadClient()} className="px-4 rounded-xl bg-violet-600 text-white text-sm font-bold disabled:opacity-50">Cargar</button></div>}</div>}
   <p className="text-xs text-gray-600">Descuento aliado 5% sobre el vestido: <b>{money(descuento)}</b> · Pago mínimo 50%: <b>{money(Math.round(total*0.5))}</b> · Referencia de pago: <b>{numero||'el número del contrato (se asigna al crear)'}</b> · No se despacha con saldo pendiente.</p>
  </>}
 </section>;
}
