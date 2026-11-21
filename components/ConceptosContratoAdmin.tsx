'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {toast} from 'sonner';

type Fila={id:string;nombre:string;tipo:string;precio_sugerido:number|null;siigo_productos:Record<string,string>;activo:boolean;orden:number};
const TIPOS:[string,string][]=[['prexv','Pre XV'],['servicio','Servicio'],['accesorio','Accesorio'],['lavanderia','Lavandería'],['vestido_cambio','Vestido de cambio'],['otro','Otro']];

/** Configuración › Facturación por sede › Conceptos del contrato: what can be added to a contract besides the dress, with the Siigo
 * product of each store (empty: the first invoice creates it in that store's Siigo as ERP### and links it). */
export default function ConceptosContratoAdmin({sedes}:{sedes:{id:string;nombre:string}[]}){
 const [filas,setFilas]=useState<Fila[]>([]),[nuevo,setNuevo]=useState(''),[tipo,setTipo]=useState('servicio'),[busy,setBusy]=useState(false),[opts,setOpts]=useState<Record<string,{code:string;name:string}[]>>({});
 const load=useCallback(async()=>{const {data,error}=await supabase.from('conceptos_contrato').select('id,nombre,tipo,precio_sugerido,siigo_productos,activo,orden').order('orden').order('nombre');
  if(error)toast.error(error.message);else setFilas((data||[]) as Fila[]);},[]);
 useEffect(()=>{void Promise.resolve().then(load);},[load]);
 const guardar=async(f:Fila,p:Partial<Fila>)=>{const {error}=await supabase.from('conceptos_contrato').update({...p,updated_at:new Date().toISOString()}).eq('id',f.id);
  if(error)toast.error(error.message);else{setFilas(v=>v.map(x=>x.id===f.id?{...x,...p}:x));toast.success('Concepto guardado.');}};
 const crear=async()=>{if(nuevo.trim().length<2)return;setBusy(true);
  const {error}=await supabase.from('conceptos_contrato').insert({nombre:nuevo.trim(),tipo,orden:500});setBusy(false);
  if(error)toast.error(error.message.includes('duplicate')?'Ya existe un concepto con ese nombre.':error.message);else{setNuevo('');toast.success('Concepto creado. Elige su producto de Siigo en cada sede o deja que se cree solo.');void load();}};
 const buscar=async(sede:string,q:string)=>{if(q.trim().length<2)return;const {data}=await supabase.rpc('siigo_buscar',{p_sede:sede,p_tipo:'producto',p_q:q});
  setOpts(v=>({...v,[sede]:((data||[]) as {code:string;name:string}[]).slice(0,30)}));};
 return <section className="bg-white rounded-3xl border p-5 space-y-4">
  <div><h2 className="text-xl font-black">Conceptos del contrato</h2>
   <p className="text-sm text-gray-500">Lo que se puede agregar al contrato además del vestido. Cada concepto sale como una línea de la factura con el producto de Siigo de la sede. Si una sede no tiene producto, la primera factura lo crea en su Siigo y lo deja enlazado.</p></div>
  <div className="flex flex-wrap gap-2">
   <input className="border rounded-xl p-2 flex-1 min-w-[180px]" placeholder="Nuevo concepto (ej. Velo, Corona)" value={nuevo} maxLength={80} onChange={e=>setNuevo(e.target.value)}/>
   <select className="border rounded-xl p-2" value={tipo} onChange={e=>setTipo(e.target.value)}>{TIPOS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
   <button disabled={busy} onClick={()=>void crear()} className="px-4 py-2 bg-rose-500 text-white rounded-xl font-black disabled:opacity-50">Crear</button>
  </div>
  <div className="space-y-3">{filas.map(f=><div key={f.id} className={`border rounded-2xl p-3 space-y-2 ${f.activo?'':'opacity-60'}`}>
   <div className="flex flex-wrap gap-2 items-center">
    <input className="border rounded-lg p-2 font-bold flex-1 min-w-[160px]" defaultValue={f.nombre} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==f.nombre)void guardar(f,{nombre:v});}}/>
    <select className="border rounded-lg p-2 text-sm" value={f.tipo} onChange={e=>void guardar(f,{tipo:e.target.value})}>{TIPOS.map(([k,l])=><option key={k} value={k}>{l}</option>)}</select>
    <input className="border rounded-lg p-2 text-sm w-36" inputMode="numeric" placeholder="Precio sugerido" defaultValue={f.precio_sugerido??''} onBlur={e=>{const n=Number(e.target.value.replace(/\D/g,''))||null;if(n!==f.precio_sugerido)void guardar(f,{precio_sugerido:n});}}/>
    <label className="text-sm flex items-center gap-1"><input type="checkbox" checked={f.activo} onChange={e=>void guardar(f,{activo:e.target.checked})}/>Activo</label>
   </div>
   <div className="grid sm:grid-cols-2 gap-2">{sedes.map(s=><label key={s.id} className="text-xs text-gray-500">{s.nombre} · producto Siigo
    <input list={`p-${f.id}-${s.id}`} className="mt-1 w-full border rounded-lg p-2 text-sm text-gray-900" placeholder="Se crea solo al facturar" defaultValue={f.siigo_productos?.[s.id]||''}
     onChange={e=>void buscar(s.id,e.target.value)} onBlur={e=>{const v=e.target.value.split(' · ')[0].trim();if(v!==(f.siigo_productos?.[s.id]||'')){const m={...f.siigo_productos};if(v)m[s.id]=v;else delete m[s.id];void guardar(f,{siigo_productos:m});}}}/>
    <datalist id={`p-${f.id}-${s.id}`}>{(opts[s.id]||[]).map(o=><option key={o.code} value={`${o.code} · ${o.name}`}/>)}</datalist>
   </label>)}</div>
  </div>)}</div>
 </section>;
}
