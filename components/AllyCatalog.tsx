'use client';
import DressThumb from '@/components/DressThumb';
import {useEffect,useState} from 'react';
import {Loader2,X} from 'lucide-react';
import {cop} from '@/lib/rental-price';

type Dress={codigo:string;talla:string|null;color:string|null;tipo:string|null;sede:string|null;foto:string|null;fotos:(string|null)[];categoria?:string|null;precio?:number|null;precio_aliado?:number|null;venta?:number|null};
type Data={sedes:{id:string;nombre:string}[];tipos:{id:number;nombre:string}[];vestidos:Dress[];aliado?:string;descuento?:number;enlace_clientas?:string;titulo?:string;whatsapp?:string|null};

/** Catalog for allies: «privado» (the ally, with prices and the link to share) or «clientas» (the ally's clients: no prices, no Ámbar brand). */
export default function AllyCatalog({modo,token}:{modo:'privado'|'clientas';token:string}){
 const privado=modo==='privado';
 const [sede,setSede]=useState(''),[tipo,setTipo]=useState(''),[data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(true),[open,setOpen]=useState<Dress|null>(null),[copiado,setCopiado]=useState(false);
 // The client link can come with the store and type the ally chose (?s= & k=).
 useEffect(()=>{if(privado)return;const p=new URLSearchParams(window.location.search);const t=setTimeout(()=>{setSede(p.get('s')||'');setTipo(p.get('k')||'');},0);return()=>clearTimeout(t);},[privado]);
 useEffect(()=>{
  if(!token)return;let live=true;
  const q=new URLSearchParams({[privado?'t':'c']:token,...(sede?{s:sede}:{}),...(tipo?{k:tipo}:{})});
  void fetch(`/api/aliados/catalogo?${q}`,{cache:'no-store'}).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo cargar el catálogo.');if(live){setData(d);setError('');}})
   .catch(e=>{if(live)setError(e.message);}).finally(()=>{if(live)setBusy(false);});
  return()=>{live=false;};
 },[token,privado,sede,tipo]);
 const enlace=data?.enlace_clientas?`${data.enlace_clientas}${sede||tipo?`?${new URLSearchParams({...(sede?{s:sede}:{}),...(tipo?{k:tipo}:{})})}`:''}`:'';
 const copiar=async()=>{try{await navigator.clipboard.writeText(enlace);setCopiado(true);setTimeout(()=>setCopiado(false),2000);}catch{window.prompt('Copia el enlace:',enlace);}};
 const interes=(d:Dress)=>data?.whatsapp?`https://wa.me/${data.whatsapp}?text=${encodeURIComponent(`Hola, me interesa el vestido ${d.codigo}${d.talla?` (talla ${d.talla})`:''}.`)}`:'';
 const select='rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white';
 return <main translate="no" className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-5xl mx-auto space-y-5">
   <header className="text-center">
    {privado&&<p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · ALIADOS</p>}
    <h1 className="text-2xl font-black text-gray-900 mt-2">{privado?'Catálogo con precios':data?.titulo||'Catálogo de vestidos'}</h1>
    {privado&&data&&<p className="text-sm text-gray-500 mt-1">{data.aliado} · tu precio de aliado tiene {data.descuento} % de descuento sobre el alquiler</p>}
   </header>
   {privado&&enlace&&<section className="bg-white border border-amber-200 rounded-2xl p-4 space-y-2">
    <p className="text-sm font-black text-gray-900">Enlace para tus clientas (sin precios ni marca)</p>
    <p className="text-xs text-gray-500">Elige la sede y el tipo de vestido abajo; el enlace muestra solo esos vestidos, sin precios, y el botón «Me interesa» les abre tu WhatsApp.</p>
    <p className="text-xs break-all bg-gray-50 rounded-xl p-2">{enlace}</p>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void copiar()} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-black">{copiado?'¡Copiado!':'Copiar enlace'}</button>
     <a href={`https://wa.me/?text=${encodeURIComponent(enlace)}`} target="_blank" rel="noopener noreferrer" className="px-4 py-2 rounded-xl border text-xs font-black text-emerald-700">Compartir por WhatsApp</a></div>
   </section>}
   {data&&<div className="flex flex-wrap gap-2 justify-center">
    <select className={select} value={sede} onChange={e=>{setBusy(true);setSede(e.target.value);}} aria-label="Sede"><option value="">Todas las sedes</option>{data.sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
    <select className={select} value={tipo} onChange={e=>{setBusy(true);setTipo(e.target.value);}} aria-label="Tipo de vestido"><option value="">Todos los tipos</option>{data.tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select>
   </div>}
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold text-center">{error}</p>}
   {(busy||!data)&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {data&&!busy&&<p className="text-center text-xs text-gray-500">{data.vestidos.length} vestidos</p>}
   {data&&<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
    {data.vestidos.map(v=><article key={`${v.codigo}-${v.sede}`} onClick={()=>setOpen(v)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm cursor-pointer">
     <div className="aspect-[3/4] bg-gray-100">{v.foto&&<DressThumb src={v.foto} alt={v.codigo} className="w-full h-full object-cover"/>}</div>
     <div className="p-3 text-xs space-y-0.5"><p className="font-black text-gray-900 text-sm">{v.codigo}</p>
      <p className="font-bold text-rose-700">{v.tipo}{privado&&v.categoria?` · ${v.categoria}`:''}</p>
      <p className="text-gray-500">Talla {v.talla||'—'} · {v.color||'—'}{v.sede?` · ${v.sede}`:''}</p>
      {privado&&<><p className="text-gray-600 pt-1">Alquiler {v.precio?cop(v.precio):'a consultar'}</p>{v.precio_aliado&&<p className="font-black text-emerald-700">Tu precio {cop(v.precio_aliado)}</p>}{v.venta&&<p className="text-gray-500">Venta {cop(v.venta)}</p>}</>}
     </div></article>)}
   </div>}
   {open&&<div onClick={()=>setOpen(null)} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div onClick={e=>e.stopPropagation()} className="bg-white rounded-3xl p-4 w-full max-w-3xl max-h-[92vh] overflow-y-auto space-y-3">
     <div className="flex justify-between gap-2"><div className="text-sm"><p className="font-black text-lg">{open.codigo}</p><p className="font-bold text-rose-700">{open.tipo}</p><p className="text-gray-600">Talla {open.talla||'—'} · {open.color||'—'}{open.sede?` · ${open.sede}`:''}</p>
      {privado&&<p className="font-black">Alquiler {open.precio?cop(open.precio):'a consultar'}{open.precio_aliado?` · tu precio ${cop(open.precio_aliado)}`:''}</p>}</div>
      <button type="button" onClick={()=>setOpen(null)} className="self-start p-2 rounded-xl bg-gray-900 text-white" aria-label="Cerrar"><X className="w-4 h-4"/></button></div>
     <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">{open.fotos.filter((f):f is string=>!!f).map(f=><img key={f} src={f} alt={open.codigo} className="w-full aspect-[3/4] object-cover rounded-2xl bg-gray-100"/>)}</div>
     {!privado&&interes(open)&&<a href={interes(open)} target="_blank" rel="noopener noreferrer" className="block text-center px-5 py-3 rounded-2xl bg-emerald-600 text-white text-sm font-black">Me interesa este vestido</a>}
    </div></div>}
  </div>
 </main>;
}
