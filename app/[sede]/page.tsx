'use client';
import DressThumb from '@/components/DressThumb';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {Loader2} from 'lucide-react';

type Tipo={nombre:string;slug:string;cantidad:number;portada:string|null};

/** Public page /[sede]: the customer first chooses the dress type, then opens its catalog. The link origin (?o=) travels on. */
export default function SedeCatalogPage(){
 const sede=String(useParams<{sede:string}>().sede||'').toLowerCase();
 const [data,setData]=useState<{sede:{id:string;nombre:string};tipos:Tipo[]}|null>(null),[error,setError]=useState(''),[origen,setOrigen]=useState('');
 useEffect(()=>{
  const o=(new URLSearchParams(window.location.search).get('o')||'').replace(/[^A-Za-z0-9._-]/g,'').slice(0,60);
  const t=setTimeout(()=>setOrigen(o),0);
  void fetch(`/api/catalogo/sede?s=${encodeURIComponent(sede)}`).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo cargar el catálogo.');setData(d);}).catch(e=>setError(e.message));
  return()=>clearTimeout(t);
 },[sede]);
 const q=origen?`?o=${encodeURIComponent(origen)}`:'';
 const agendar=data?`/agendar-primera-cita?${new URLSearchParams({sede:data.sede.id,...(origen?{o:origen}:{})})}`:'/agendar-primera-cita';
 return <main translate="no" className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-4xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE</p>
    <h1 className="text-2xl font-black text-gray-900 mt-2">{data?`Catálogo ${data.sede.nombre}`:'Catálogo'}</h1>
    {data&&<p className="text-sm text-gray-500 mt-1">¿Qué vestido buscas? Elige el tipo para ver los modelos con fotos y precios de alquiler.</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold text-center">{error}</p>}
   {!data&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {data&&<div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
    {data.tipos.map(t=><Link key={t.slug} href={`/${sede}/${t.slug}${q}`} className="block bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition">
     <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center text-xs text-gray-400">{t.portada?<DressThumb src={t.portada} alt={t.nombre} className="w-full h-full object-cover"/>:t.nombre}</div>
     <div className="p-3 text-center"><p className="font-black text-gray-900">{t.nombre}</p><p className="text-xs text-gray-500">{t.cantidad} vestido{t.cantidad===1?'':'s'}</p></div>
    </Link>)}
   </div>}
   {data&&!data.tipos.length&&<p className="text-center text-gray-500">Pronto tendremos vestidos en este catálogo. Agenda tu cita y te mostramos las opciones.</p>}
   {data&&<p className="text-center"><a href={agendar} className="inline-block px-5 py-3 rounded-2xl bg-gray-900 text-white text-sm font-black">Agendar cita</a></p>}
  </div>
 </main>;
}
