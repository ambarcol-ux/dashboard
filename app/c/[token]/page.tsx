'use client';
import DressThumb from '@/components/DressThumb';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {Loader2,ChevronLeft,ChevronRight,X} from 'lucide-react';
import {cop} from '@/lib/rental-price';

type Dress={codigo:string;nombre:string|null;talla:string|null;color:string|null;precio:number|null;venta?:number|null;tipo:string|null;categoria:string|null;foto:string|null;fotos?:(string|null)[]};

type Promo={nombre:string;beneficio:string;hasta:string;codigo:string|null;condiciones:string;categorias:string[]|null};

/** Public catalog shared by link (/c/[token] or fixed /[sede]/[tipo]): photos and rental prices of the saved filter, always up to date with the inventory. */
export default function PublicCatalogPage(){
 const params=useParams<{token?:string;sede?:string;tipo?:string}>(),token=String(params.token||'');
 const query=token?`t=${encodeURIComponent(token)}`:`s=${encodeURIComponent(String(params.sede||'').toLowerCase())}&k=${encodeURIComponent(String(params.tipo||'').toLowerCase())}`;
 const [data,setData]=useState<{titulo:string;sede_id:string|null;vestidos:Dress[];promociones?:Promo[]}|null>(null),[error,setError]=useState(''),[open,setOpen]=useState<Dress|null>(null),[zoom,setZoom]=useState<number|null>(null),[touchX,setTouchX]=useState<number|null>(null);
 // Photos actually uploaded (front, back, detail), with their labels: only these are shown and zoomed.
 const fotos=open?(['Frente','Espalda','Detalle'] as const).map((label,i)=>({label,url:(open.fotos||[open.foto])[i]||null})).filter((f):f is {label:'Frente'|'Espalda'|'Detalle';url:string}=>!!f.url):[];
 const mover=(d:number)=>setZoom(z=>z==null||!fotos.length?z:(z+d+fotos.length)%fotos.length);
 // o= (origin of the link) travels to the booking form and is saved on the booked visit.
 useEffect(()=>{void fetch(`/api/catalogo?${query}`).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo cargar el catálogo.');setData(d);}).catch(e=>setError(e.message));},[query]);
 const book=()=>{const origin=(new URLSearchParams(window.location.search).get('o')||'').replace(/[^A-Za-z0-9._-]/g,'').slice(0,60);
  window.location.href=`/agendar-primera-cita?${new URLSearchParams({...(data?.sede_id?{sede:data.sede_id}:{}),...(origin?{o:origin}:{})})}`;};
 return <main translate="no" className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-5xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE</p><h1 className="text-2xl font-black text-gray-900 mt-2">{data?.titulo||'Catálogo'}</h1>
    {data&&<p className="text-sm text-gray-500 mt-1">{data.vestidos.length} vestidos · precios de alquiler y de venta</p>}</header>
   {!!data?.promociones?.length&&<section className="space-y-2">{data.promociones.map(p=><article key={p.nombre} className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm">
    <p className="font-black text-amber-900">{p.nombre} · {p.beneficio}</p>
    <p className="text-amber-800 text-xs">Hasta el {p.hasta.split('-').reverse().join('/')}{p.categorias?.length?` · ${p.categorias.join(', ')}`:''}{p.codigo?` · Código ${p.codigo}`:''}</p>
    {p.condiciones&&<p className="text-amber-800 text-xs mt-1">{p.condiciones}</p>}</article>)}</section>}
   {data&&<p className="text-center"><button type="button" onClick={book} className="inline-block px-5 py-3 rounded-2xl bg-gray-900 text-white text-sm font-black">Agendar cita</button></p>}
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold text-center">{error}</p>}
   {!data&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {data&&<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
    {data.vestidos.map(v=><article key={v.codigo} onClick={()=>setOpen(v)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm cursor-pointer">
     <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center text-xs text-gray-400">{v.foto?<DressThumb src={v.foto} alt={v.nombre||v.codigo} className="w-full h-full object-cover"/>:'Foto próximamente'}</div>
     <div className="p-3 text-xs space-y-0.5"><p className="font-black text-gray-900 text-sm">{v.codigo}</p>
      <p className="font-bold text-rose-700">{v.tipo}{v.categoria?` · ${v.categoria}`:''}</p>
      <p className="text-gray-500">Talla {v.talla||'—'} · {v.color||'—'}</p>
      <p className="font-black text-gray-900 pt-1">{v.precio?`Alquiler ${cop(v.precio)}`:'Precio a consultar'}</p>{v.venta&&<p className="text-xs font-bold text-gray-600">Venta {cop(v.venta)}</p>}</div>
    </article>)}
   </div>}
   {data&&!data.vestidos.length&&<p className="text-center text-gray-500">No hay vestidos en este catálogo por ahora.</p>}
   {open&&<div onClick={()=>{setOpen(null);setZoom(null);}} className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
    <div onClick={e=>e.stopPropagation()} className="bg-white rounded-3xl p-4 w-full max-w-3xl max-h-[92vh] overflow-y-auto space-y-3">
     <div className="flex justify-between gap-2"><div className="text-sm"><p className="font-black text-lg">{open.codigo}</p><p className="font-bold text-rose-700">{open.tipo}{open.categoria?` · ${open.categoria}`:''}</p><p className="text-gray-600">Talla {open.talla||'—'} · {open.color||'—'}</p><p className="font-black">{open.precio?`Alquiler ${cop(open.precio)}`:'Precio a consultar'}</p>{open.venta&&<p className="font-bold text-gray-600">Venta {cop(open.venta)}</p>}</div>
      <button type="button" onClick={()=>{setOpen(null);setZoom(null);}} className="self-start px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-black">Cerrar</button></div>
     {fotos.length?<div className={`grid grid-cols-1 gap-3 ${fotos.length===1?'max-w-sm mx-auto':fotos.length===2?'sm:grid-cols-2':'sm:grid-cols-3'}`}>{fotos.map((f,i)=><figure key={f.label}>
      <button type="button" onClick={()=>setZoom(i)} className="block w-full aspect-[3/4] bg-gray-100 rounded-2xl overflow-hidden cursor-zoom-in" aria-label={`Ampliar foto ${f.label}`}><img src={f.url} alt={`${open.codigo} ${f.label}`} className="w-full h-full object-cover"/></button>
      <figcaption className="text-center text-xs font-bold mt-1">{f.label} · toca para ampliar</figcaption></figure>)}</div>
     :<p className="text-center text-sm text-gray-500 py-10">Foto próximamente</p>}
    </div></div>}
   {open&&zoom!=null&&fotos[zoom]&&<div role="dialog" aria-label="Foto ampliada" className="fixed inset-0 z-[60] bg-black/95 flex items-center justify-center" onClick={()=>setZoom(null)}
    onTouchStart={e=>setTouchX(e.touches[0].clientX)} onTouchEnd={e=>{if(touchX!=null){const dx=e.changedTouches[0].clientX-touchX;if(Math.abs(dx)>50)mover(dx<0?1:-1);}setTouchX(null);}}>
    <img src={fotos[zoom].url} alt={`${open.codigo} ${fotos[zoom].label}`} onClick={e=>e.stopPropagation()} className="max-w-full max-h-full object-contain select-none"/>
    <button type="button" onClick={e=>{e.stopPropagation();setZoom(null);}} aria-label="Cerrar foto" className="absolute top-4 right-4 p-2 rounded-full bg-white/90 text-gray-900"><X className="w-5 h-5"/></button>
    {fotos.length>1&&<>
     <button type="button" onClick={e=>{e.stopPropagation();mover(-1);}} aria-label="Foto anterior" className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 text-gray-900"><ChevronLeft className="w-6 h-6"/></button>
     <button type="button" onClick={e=>{e.stopPropagation();mover(1);}} aria-label="Foto siguiente" className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/90 text-gray-900"><ChevronRight className="w-6 h-6"/></button></>}
    <p className="absolute bottom-4 left-0 right-0 text-center text-white text-sm font-bold">{open.codigo} · {fotos[zoom].label}{fotos.length>1?` · ${zoom+1} de ${fotos.length}`:''}</p>
   </div>}
   <p className="text-center text-xs text-gray-400">Para reservar o probarte un vestido, comunícate con Ámbar Couture.</p>
  </div>
 </main>;
}
