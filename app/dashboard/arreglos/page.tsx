'use client';
import {useCallback,useEffect,useState} from 'react';
import {Scissors} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import MoneyInput from '@/components/MoneyInput';
import ArregloFotos,{subirFotosArreglo} from '@/components/arreglos/ArregloFotos';
import VestidoHistorial from '@/components/arreglos/VestidoHistorial';
import {supabase} from '@/lib/supabase';

type Arreglo={id:string;vestido_id:string;codigo:string;vestido:string|null;sede:string|null;tipo:'SASTRERÍA'|'LAVANDERÍA';estado:string|null;trabajo:string|null;descripcion:string|null;
 proveedor_id:string|null;proveedor:string|null;costo:number|null;estado_pago:string|null;fecha_entrada:string;fecha_envio:string|null;fecha_regreso:string|null;
 fotos_antes:string[]|null;fotos_despues:string[]|null;contrato:string|null;proximo_evento:string|null};
type Ajuste={arreglo_id:number;tipo_arreglo:string|null;centimetros:number|null;precio:number|null;contrato_id:string;contrato:string;cliente:string|null;fecha_evento:string;sede:string|null;vestidos:{id:string;codigo:string}[]|null};
type Prov={id:string;nombre:string;tipo_servicio:string|null;celular:string|null};
type Form={id?:string;vestido_id:string;codigo:string;tipo:'SASTRERÍA'|'LAVANDERÍA';proveedor_id:string;trabajo:string;descripcion:string;costo:string;contrato_id?:string;arreglo_id?:number;opciones?:{id:string;codigo:string}[]};
const input='border border-gray-200 rounded-xl px-3 py-2 text-sm w-full bg-white';
const cop=(n:number)=>`$${Math.round(Number(n)||0).toLocaleString('es-CO')}`;
const dia=(d:string|null)=>d?new Date(d.length===10?d+'T12:00:00':d).toLocaleDateString('es-CO',{day:'numeric',month:'short'}):'';
const motivo=(e:unknown)=>e instanceof Error?e.message:e&&typeof e==='object'&&'message' in e?String((e as {message:unknown}).message):'No se pudo guardar.';
const cerrado=(a:Arreglo)=>['finalizado','completado','cancelado'].includes(String(a.estado||'').toLowerCase());
const hoy=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const diasA=(d:string)=>Math.round((new Date(d+'T12:00:00').getTime()-new Date(hoy()+'T12:00:00').getTime())/864e5);

/** Operaciones › Adaptaciones y confección: repairs (sastrería) and laundry of the dresses, sent to a supplier (costurera, sastre,
 *  lavandería) with «antes» and «después» photos. Its cost goes to Pagos a proveedores; each dress keeps its full history. */
export default function ArreglosPage(){
 return <SupplierShell activePage="arreglos" crumb="Operaciones / Adaptaciones" title="Adaptaciones y confección" icon={<Scissors/>}
  description="Arreglos y lavandería de los vestidos: quién los hace, qué se hizo, cuánto le cuesta a Ámbar, cuándo salió y cuándo volvió, con foto del antes y del después. El costo pasa a Pagos a proveedores.">
  {p=><Tablero profile={p}/>}
 </SupplierShell>;
}

function Tablero({profile}:{profile:ShellProfile}){
 const [sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sede,setSede]=useState<string>(profile.sede_id||'');
 const [data,setData]=useState<{arreglos:Arreglo[];del_contrato:Ajuste[];proveedores:Prov[]}|null>(null),[error,setError]=useState('');
 const [form,setForm]=useState<Form|null>(null),[recibir,setRecibir]=useState<Arreglo|null>(null),[historial,setHistorial]=useState<{id:string;codigo:string}|null>(null);
 const load=useCallback(async()=>{
  const {data:d,error:e}=await supabase.rpc('arreglos_tablero',{p_sede:sede||null});
  if(e)setError(e.message);else{setError('');setData(d as typeof data);}
 },[sede]);
 useEffect(()=>{void supabase.from('sedes').select('id,nombre').order('nombre').then(({data:s})=>setSedes(s||[]));},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const accion=async(fn:()=>PromiseLike<{error:unknown}>)=>{const {error:e}=await fn();if(e)alert(motivo(e));else void load();};
 const enviar=(a:Arreglo)=>accion(()=>supabase.rpc('arreglo_enviar',{p_id:a.id}));
 const cancelar=(a:Arreglo)=>{const m=prompt('¿Por qué se cancela este arreglo?');if(m)void accion(()=>supabase.rpc('arreglo_cancelar',{p_id:a.id,p_motivo:m}));};
 const editar=(a:Arreglo)=>setForm({id:a.id,vestido_id:a.vestido_id,codigo:a.codigo,tipo:a.tipo==='LAVANDERÍA'?'LAVANDERÍA':'SASTRERÍA',proveedor_id:a.proveedor_id||'',trabajo:a.trabajo||'',descripcion:a.descripcion||'',costo:a.costo!=null?String(a.costo):''});
 const lista=data?.arreglos||[],provs=data?.proveedores||[];
 const columnas:[string,string,Arreglo[]][]=[
  ['Por enviar','Falta elegir quién lo hace, la foto del antes o entregarlo.',lista.filter(a=>!cerrado(a)&&!a.fecha_envio)],
  ['Donde la costurera','Enviados, esperando que vuelvan.',lista.filter(a=>!cerrado(a)&&!!a.fecha_envio)],
  ['Listos (30 días)','Recibidos con su foto del después.',lista.filter(a=>cerrado(a)&&String(a.estado).toLowerCase()!=='cancelado')]];
 const tarjeta=(a:Arreglo)=>{
  const abierto=!cerrado(a),dias=a.proximo_evento?diasA(a.proximo_evento):null,urgente=abierto&&dias!==null&&dias<=3;
  const prov=provs.find(p=>p.id===a.proveedor_id),wa=prov?.celular?`https://wa.me/57${prov.celular.replace(/\D/g,'').slice(-10)}?text=${encodeURIComponent(`Hola ${prov.nombre}, te enviamos el vestido ${a.codigo} para: ${a.trabajo||a.descripcion||'arreglo'}.`)}`:'';
  return <li key={a.id} className={`bg-white rounded-2xl border p-3 space-y-2 ${urgente?'border-red-300 ring-1 ring-red-200':'border-gray-100'}`}>
   <div className="flex justify-between gap-2"><button type="button" onClick={()=>setHistorial({id:a.vestido_id,codigo:a.codigo})} className="text-left"><b className="text-sm text-gray-900 underline decoration-dotted">{a.tipo==='LAVANDERÍA'?'🧼':'✂️'} {a.codigo}</b> <span className="text-xs text-gray-500">{a.vestido}</span></button>
    <span className="text-[11px] text-gray-400 whitespace-nowrap">{a.sede}</span></div>
   {urgente&&<p className="text-xs font-black text-red-600">⚠️ Evento {dias===0?'hoy':dias===1?'mañana':`en ${dias} días`} ({dia(a.proximo_evento)}) y el vestido no ha vuelto.</p>}
   <p className="text-xs text-gray-700">{a.trabajo||a.descripcion||'Sin descripción'}{a.contrato?<span className="text-gray-400"> · {a.contrato}</span>:null}</p>
   <p className="text-xs text-gray-500">{a.proveedor?<>👤 {a.proveedor}</>:<span className="text-amber-700 font-bold">Falta elegir quién lo hace</span>}{a.costo!=null&&Number(a.costo)>0?<> · {cop(a.costo)}</>:null}
    {a.fecha_envio?<> · salió {dia(a.fecha_envio)}</>:null}{a.fecha_regreso?<> · volvió {dia(a.fecha_regreso)}</>:null}{a.estado_pago?<> · pago: <b>{a.estado_pago}</b></>:null}</p>
   <ArregloFotos antes={a.fotos_antes} despues={a.fotos_despues}/>
   {abierto&&<div className="flex flex-wrap gap-1.5">
    <button type="button" onClick={()=>editar(a)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-gray-700">Editar</button>
    {!a.fecha_envio&&<button type="button" onClick={()=>void enviar(a)} className="px-3 py-1.5 rounded-xl bg-amber-500 text-white text-xs font-black">Enviar</button>}
    <button type="button" onClick={()=>setRecibir(a)} className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-black">Recibir</button>
    {wa&&<a href={wa} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-xl border text-xs font-black text-emerald-700">WhatsApp</a>}
    <button type="button" onClick={()=>cancelar(a)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-red-600">Cancelar</button>
   </div>}
  </li>;
 };
 return <div className="space-y-4">
  <div className="flex flex-wrap gap-2 items-center">
   <select className="border border-gray-200 rounded-xl px-2 py-1.5 text-sm bg-white" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
   <button type="button" onClick={()=>setForm({vestido_id:'',codigo:'',tipo:'SASTRERÍA',proveedor_id:'',trabajo:'',descripcion:'',costo:''})} className="ml-auto px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">+ Nuevo arreglo</button>
  </div>
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}
  {!provs.some(p=>['Costura y arreglos','Lavandería'].includes(p.tipo_servicio||''))&&data&&<p className="rounded-2xl bg-blue-50 border border-blue-100 p-3 text-xs text-blue-900">Para elegir a la costurera, el sastre o la lavandería, regístralos en <b>Finanzas › Gestión de proveedores</b> con el servicio «Costura y arreglos» o «Lavandería».</p>}
  {!!data?.del_contrato.length&&<section className="bg-white rounded-2xl border border-rose-100 p-4 space-y-2">
   <h2 className="text-sm font-black text-rose-700">Ajustes de contratos sin enviar a la costurera</h2>
   <ul className="space-y-1.5">{data.del_contrato.map(c=><li key={c.arreglo_id} className="flex flex-wrap items-center gap-2 text-xs">
    <b>{c.contrato}</b><span className="text-gray-600">{c.cliente} · evento {dia(c.fecha_evento)} · {c.tipo_arreglo}{c.centimetros?` ${c.centimetros} cm`:''}{c.vestidos?.length?` · ${c.vestidos.map(v=>v.codigo).join(', ')}`:''}</span>
    <button type="button" className="ml-auto px-3 py-1 rounded-xl bg-rose-600 text-white font-black" onClick={()=>{const v=c.vestidos?.[0];setForm({vestido_id:v?.id||'',codigo:v?.codigo||'',tipo:'SASTRERÍA',proveedor_id:'',
     trabajo:`${c.tipo_arreglo||'Ajuste'}${c.centimetros?` ${c.centimetros} cm`:''}`,descripcion:'',costo:'',contrato_id:c.contrato_id,arreglo_id:c.arreglo_id,opciones:c.vestidos||[]});}}>Crear arreglo</button></li>)}</ul>
  </section>}
  {!data?<p role="status" className="text-gray-400 text-sm">Cargando…</p>:<div className="grid md:grid-cols-3 gap-3">{columnas.map(([t,d,l])=><section key={t} className="bg-gray-50 rounded-2xl p-3 space-y-2">
   <h2 className="text-sm font-black text-gray-800">{t} <span className="text-gray-400">({l.length})</span></h2><p className="text-[11px] text-gray-500">{d}</p>
   <ul className="space-y-2">{l.map(tarjeta)}</ul></section>)}</div>}
  {form&&<FormArreglo form={form} provs={provs} onClose={()=>setForm(null)} onSaved={()=>{setForm(null);void load();}}/>}
  {recibir&&<Recibir a={recibir} onClose={()=>setRecibir(null)} onSaved={()=>{setRecibir(null);void load();}}/>}
  {historial&&<Modal titulo={`Historial del vestido ${historial.codigo}`} onClose={()=>setHistorial(null)}><VestidoHistorial vestidoId={historial.id}/></Modal>}
 </div>;
}

function Modal({titulo,onClose,children}:{titulo:string;onClose:()=>void;children:React.ReactNode}){
 return <div role="dialog" aria-modal="true" aria-label={titulo} className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
  <div className="bg-gray-50 w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl p-4 space-y-3" onClick={e=>e.stopPropagation()}>
   <div className="flex justify-between items-center"><h2 className="font-black text-gray-900">{titulo}</h2><button type="button" onClick={onClose} className="text-gray-500 font-black px-2" aria-label="Cerrar">✕</button></div>
   {children}</div></div>;
}

function FormArreglo({form,provs,onClose,onSaved}:{form:Form;provs:Prov[];onClose:()=>void;onSaved:()=>void}){
 const [f,setF]=useState(form),[q,setQ]=useState(''),[res,setRes]=useState<{id:string;codigo:string;nombre:string|null}[]>([]),[fotos,setFotos]=useState<FileList|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  if(f.id||q.trim().length<2){const t=setTimeout(()=>setRes([]),0);return()=>clearTimeout(t);}
  let live=true;const t=setTimeout(()=>void supabase.from('vestidos').select('id,codigo,nombre').eq('archivado',false).ilike('codigo',`%${q.trim()}%`).order('codigo').limit(8)
   .then(({data})=>{if(live)setRes(data||[]);}),250);
  return()=>{live=false;clearTimeout(t);};
 },[q,f.id]);
 const guardar=async()=>{
  setBusy(true);setError('');
  try{
   if(!f.vestido_id)throw Error('Elige el vestido.');
   const rutas=fotos?.length?await subirFotosArreglo(f.vestido_id,fotos):[];
   const {error:e}=await supabase.rpc('arreglo_guardar',{p:{id:f.id||null,vestido_id:f.vestido_id,tipo:f.tipo,proveedor_id:f.proveedor_id||null,trabajo:f.trabajo,descripcion:f.descripcion,
    costo:f.costo===''?null:Number(f.costo),contrato_id:f.contrato_id||null,arreglo_id:f.arreglo_id??null,fotos_antes:rutas}});
   if(e)throw e;onSaved();
  }catch(e){setError(motivo(e));}finally{setBusy(false);}
 };
 return <Modal titulo={f.id?`Editar arreglo · ${f.codigo}`:'Nuevo arreglo'} onClose={onClose}>
  {!f.id&&(f.opciones&&f.opciones.length>1?<label className="block text-xs font-bold text-gray-600">Vestido<select className={input} value={f.vestido_id} onChange={e=>{const v=f.opciones!.find(o=>o.id===e.target.value);setF({...f,vestido_id:v?.id||'',codigo:v?.codigo||''});}}>
    {f.opciones.map(o=><option key={o.id} value={o.id}>{o.codigo}</option>)}</select></label>
   :f.vestido_id?<p className="text-sm">Vestido <b>{f.codigo}</b> {!f.contrato_id&&<button type="button" className="text-rose-600 text-xs font-black ml-2" onClick={()=>setF({...f,vestido_id:'',codigo:''})}>Cambiar</button>}</p>
   :<label className="block text-xs font-bold text-gray-600">Vestido (código)<input className={input} value={q} onChange={e=>setQ(e.target.value)} placeholder="Ej. 1465" autoFocus/>
    {!!res.length&&<ul className="mt-1 bg-white border rounded-xl divide-y">{res.map(v=><li key={v.id}><button type="button" className="w-full text-left px-3 py-2 text-sm" onClick={()=>{setF({...f,vestido_id:v.id,codigo:v.codigo});setQ('');}}><b>{v.codigo}</b> {v.nombre}</button></li>)}</ul>}</label>)}
  <div className="grid grid-cols-2 gap-2">
   <label className="text-xs font-bold text-gray-600">Tipo<select className={input} value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value as Form['tipo']})}><option value="SASTRERÍA">Arreglo (sastrería)</option><option value="LAVANDERÍA">Lavandería</option></select></label>
   <label className="text-xs font-bold text-gray-600">Quién lo hace<select className={input} value={f.proveedor_id} onChange={e=>setF({...f,proveedor_id:e.target.value})}><option value="">Elegir…</option>
    {provs.map(p=><option key={p.id} value={p.id}>{p.nombre}{p.tipo_servicio?` · ${p.tipo_servicio}`:''}</option>)}</select></label>
  </div>
  <label className="block text-xs font-bold text-gray-600">Qué se hace<input className={input} value={f.trabajo} onChange={e=>setF({...f,trabajo:e.target.value})} placeholder="Ej. subir ruedo 3 cm, cambiar cremallera"/></label>
  <label className="block text-xs font-bold text-gray-600">Daño o nota (opcional)<textarea className={input} rows={2} value={f.descripcion} onChange={e=>setF({...f,descripcion:e.target.value})}/></label>
  <label className="block text-xs font-bold text-gray-600">Costo para Ámbar<MoneyInput className={input} value={f.costo} onChange={e=>setF({...f,costo:e.target.value})} placeholder="Se puede poner al recibir"/></label>
  <label className="block text-xs font-bold text-gray-600">Foto del antes {f.tipo==='SASTRERÍA'&&<span className="text-red-600">(obligatoria para enviar)</span>}
   <input type="file" accept="image/*" capture="environment" multiple className="block mt-1 text-sm" onChange={e=>setFotos(e.target.files)}/></label>
  {f.id&&<p className="text-[11px] text-gray-500">Si tomas fotos nuevas, reemplazan las del antes.</p>}
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}
  <button type="button" disabled={busy} onClick={()=>void guardar()} className="w-full py-3 rounded-2xl bg-rose-600 text-white font-black disabled:opacity-50">{busy?'Guardando…':'Guardar'}</button>
 </Modal>;
}

function Recibir({a,onClose,onSaved}:{a:Arreglo;onClose:()=>void;onSaved:()=>void}){
 const [fotos,setFotos]=useState<FileList|null>(null),[costo,setCosto]=useState(a.costo!=null?String(a.costo):''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guardar=async()=>{
  setBusy(true);setError('');
  try{
   if(a.tipo==='SASTRERÍA'&&!fotos?.length)throw Error('Toma la foto del después.');
   const rutas=fotos?.length?await subirFotosArreglo(a.vestido_id,fotos):[];
   const {error:e}=await supabase.rpc('arreglo_recibir',{p_id:a.id,p_fotos_despues:rutas,p_costo:costo===''?null:Number(costo)});
   if(e)throw e;onSaved();
  }catch(e){setError(motivo(e));}finally{setBusy(false);}
 };
 return <Modal titulo={`Recibir vestido ${a.codigo}`} onClose={onClose}>
  <p className="text-sm text-gray-700">{a.trabajo||a.descripcion}{a.proveedor?` · ${a.proveedor}`:''}</p>
  <ArregloFotos antes={a.fotos_antes}/>
  <label className="block text-xs font-bold text-gray-600">Foto del después {a.tipo==='SASTRERÍA'&&<span className="text-red-600">(obligatoria)</span>}
   <input type="file" accept="image/*" capture="environment" multiple className="block mt-1 text-sm" onChange={e=>setFotos(e.target.files)}/></label>
  <label className="block text-xs font-bold text-gray-600">Costo para Ámbar<MoneyInput className={input} value={costo} onChange={e=>setCosto(e.target.value)}/></label>
  {a.proveedor&&<p className="text-[11px] text-gray-500">Con costo, queda pendiente de pago a {a.proveedor} en Pagos a proveedores.</p>}
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}
  <button type="button" disabled={busy} onClick={()=>void guardar()} className="w-full py-3 rounded-2xl bg-emerald-600 text-white font-black disabled:opacity-50">{busy?'Guardando…':'Recibir y cerrar'}</button>
 </Modal>;
}
