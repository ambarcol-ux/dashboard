'use client';
import {useEffect,useState} from 'react';
import {CheckCircle,Loader2} from 'lucide-react';
import {ALLY_EVENT_LABEL,categoryRange,type AllyCategory} from '@/lib/ally-clients';

type Key={token?:string;codigo?:string};
const call=async(body:Record<string,unknown>)=>{const r=await fetch('/api/aliados/clientas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d;};
const EMPTY={tipo_evento:'',categoria:'',rep_nombre:'',rep_cedula:'',rep_parentesco:'',rep_celular:'',rep_correo:'',clienta_nombre:'',clienta_documento:'',clienta_celular:'',clienta_correo:'',fecha_evento:'',uso_imagen:''};

/** Public form where a representative or client registers with an ally (ally's private link or ally's code). */
export default function AllyClientPage(){
 const [key,setKey]=useState<Key|null>(null),[codigo,setCodigo]=useState(''),[aliado,setAliado]=useState<{nombre:string;codigo:string}|null>(null),[categorias,setCategorias]=useState<AllyCategory[]>([]);
 const [f,setF]=useState(EMPTY),[menor,setMenor]=useState(false),[datos,setDatos]=useState(false),[publicidad,setPublicidad]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState<{id?:string;duplicado?:boolean}|null>(null),[loading,setLoading]=useState(true);
 const open=async(k:Key)=>{setError('');setBusy(true);try{const d=await call({accion:'ver',...k});setKey(k);setAliado(d.aliado);setCategorias(d.categorias||[]);}catch(e){setError(e instanceof Error?e.message:'');}finally{setBusy(false);setLoading(false);}};
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  history.replaceState(null,'',window.location.pathname);
  if(t)void open({token:t});else setLoading(false);
 },[]);
 const set=(k:keyof typeof EMPTY)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 const xv=f.tipo_evento==='XV',rep=xv||menor;
 const send=async()=>{
  setError('');
  if(!datos)return setError('Debes autorizar el tratamiento de datos.');
  if(!f.uso_imagen)return setError('Responde Sí o No al uso de imagen en redes.');
  setBusy(true);
  try{const d=await call({accion:'registrar',...key,datos:{...f,clienta_menor:rep,autoriza_datos:datos,publicidad}});setDone(d);window.scrollTo({top:0,behavior:'smooth'});}
  catch(e){setError(e instanceof Error?e.message:'No se pudo registrar.');}finally{setBusy(false);}
 };
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400';
 const label='text-xs font-bold text-gray-600',card='bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-3';
 const field=(k:keyof typeof EMPTY,l:string,type='text')=><label key={k} className={label}>{l}<input className={input} type={type} inputMode={type==='numeric'?'numeric':undefined} value={f[k]} onChange={set(k)}/></label>;
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-2xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · ALIADOS</p><h1 className="text-2xl font-black text-gray-900 mt-2">Registro de clientas</h1>{aliado&&<p className="text-sm text-gray-500 mt-1">Aliado: <b>{aliado.nombre}</b> · {aliado.codigo}</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {loading&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {done&&<div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex gap-3 items-start"><CheckCircle className="w-6 h-6 text-emerald-600 shrink-0"/><div><p className="font-black text-emerald-800">{done.duplicado?'Ya estabas registrada':'¡Registro confirmado!'}</p><p className="text-sm text-emerald-700">{done.duplicado?'Este documento ya estaba registrado con Ámbar Couture. Te contactaremos.':`Tu ID es ${done.id}. Te enviamos la confirmación y el enlace para agendar tu cita al correo.`}</p></div></div>}
   {!loading&&!aliado&&!done&&<section className={card}><h2 className="font-black text-gray-900">Código del aliado</h2><p className="text-xs text-gray-500">Escribe el código que te dio tu aliado (ej.: ORG-0001).</p>
    <input className={input} value={codigo} onChange={e=>setCodigo(e.target.value.toUpperCase())} placeholder="ORG-0001"/>
    <button disabled={busy||!codigo.trim()} onClick={()=>void open({codigo})} className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">Continuar</button></section>}
   {aliado&&!done&&<>
    <section className={card}><h2 className="font-black text-gray-900">1. Evento</h2>
     <div className="grid sm:grid-cols-2 gap-3">
      <label className={label}>Tipo de evento<select className={input} value={f.tipo_evento} onChange={e=>setF({...f,tipo_evento:e.target.value,categoria:''})}><option value="">Selecciona…</option>{(Object.keys(ALLY_EVENT_LABEL) as (keyof typeof ALLY_EVENT_LABEL)[]).filter(t=>categorias.some(c=>c.tipo===t)).map(t=><option key={t} value={t}>{ALLY_EVENT_LABEL[t]}</option>)}</select></label>
      <label className={label}>Categoría<select className={input} value={f.categoria} disabled={!f.tipo_evento} onChange={set('categoria')}><option value="">Selecciona…</option>{categorias.filter(c=>c.tipo===f.tipo_evento).map(c=><option key={c.nombre} value={c.nombre}>{c.nombre} · {categoryRange(c)}</option>)}</select></label>
      {field('fecha_evento','Fecha del evento','date')}
      {(f.tipo_evento==='GALA'||f.tipo_evento==='NOVIA')&&<label className={label}>¿La clienta es menor de edad?<select className={input} value={menor?'si':'no'} onChange={e=>setMenor(e.target.value==='si')}><option value="no">No, es mayor de edad</option><option value="si">Sí, la registra su representante</option></select></label>}
     </div></section>
    {f.tipo_evento&&<>
     {rep&&<section className={card}><h2 className="font-black text-gray-900">2. Representante</h2><div className="grid sm:grid-cols-2 gap-3">
      {field('rep_nombre','Nombre completo')}{field('rep_cedula','Cédula','numeric')}{field('rep_parentesco','Parentesco')}{field('rep_celular','Celular','tel')}{field('rep_correo','Correo','email')}</div></section>}
     <section className={card}><h2 className="font-black text-gray-900">{rep?'3':'2'}. {xv?'Quinceañera':'Clienta'}</h2><div className="grid sm:grid-cols-2 gap-3">
      {field('clienta_nombre','Nombre completo')}{field('clienta_documento',rep?'Tarjeta de identidad':'Cédula','numeric')}
      {!rep&&<>{field('clienta_celular','Celular','tel')}{field('clienta_correo','Correo','email')}</>}</div></section>
     <section className={card}><h2 className="font-black text-gray-900">Autorizaciones</h2>
      <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={datos} onChange={e=>setDatos(e.target.checked)}/>Autorizo a Ámbar Couture el tratamiento de los datos personales registrados según la Ley 1581 de 2012 (obligatorio).</label>
      <div className="text-sm text-gray-700"><p className="mb-1">¿Autorizas el uso de imagen en redes sociales? (obligatorio)</p>
       {(['si','no'] as const).map(v=><label key={v} className="mr-4"><input type="radio" name="imagen" checked={f.uso_imagen===v} onChange={()=>setF({...f,uso_imagen:v})}/> {v==='si'?'Sí':'No'}</label>)}</div>
      <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={publicidad} onChange={e=>setPublicidad(e.target.checked)}/>Acepto recibir publicidad de Ámbar Couture (opcional).</label>
      <button disabled={busy} onClick={()=>void send()} className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Enviando…':'Registrar'}</button>
     </section>
    </>}
   </>}
  </div>
 </main>;
}
