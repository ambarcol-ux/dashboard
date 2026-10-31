'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {Loader2} from 'lucide-react';
import {cop} from '@/lib/rental-price';

type Dress={codigo:string;nombre:string|null;talla:string|null;color:string|null;precio:number|null;tipo:string|null;categoria:string|null;foto:string|null};

/** Public catalog shared by link: photos and rental prices of the saved filter, always up to date with the inventory. */
export default function PublicCatalogPage(){
 const token=String(useParams<{token:string}>().token||'');
 const [data,setData]=useState<{titulo:string;vestidos:Dress[]}|null>(null),[error,setError]=useState('');
 useEffect(()=>{void fetch(`/api/catalogo?t=${encodeURIComponent(token)}`).then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo cargar el catálogo.');setData(d);}).catch(e=>setError(e.message));},[token]);
 return <main translate="no" className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-5xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE</p><h1 className="text-2xl font-black text-gray-900 mt-2">{data?.titulo||'Catálogo'}</h1>
    {data&&<p className="text-sm text-gray-500 mt-1">{data.vestidos.length} vestidos · precios de alquiler</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold text-center">{error}</p>}
   {!data&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {data&&<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
    {data.vestidos.map(v=><article key={v.codigo} className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
     <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center text-xs text-gray-400">{v.foto?<img src={v.foto} alt={v.nombre||v.codigo} loading="lazy" className="w-full h-full object-cover"/>:'Foto próximamente'}</div>
     <div className="p-3 text-xs space-y-0.5"><p className="font-black text-gray-900 text-sm">{v.codigo}</p>
      <p className="font-bold text-rose-700">{v.tipo}{v.categoria?` · ${v.categoria}`:''}</p>
      <p className="text-gray-600">{v.nombre}</p><p className="text-gray-500">Talla {v.talla||'—'} · {v.color||'—'}</p>
      <p className="font-black text-gray-900 pt-1">{v.precio?`Alquiler ${cop(v.precio)}`:'Precio a consultar'}</p></div>
    </article>)}
   </div>}
   {data&&!data.vestidos.length&&<p className="text-center text-gray-500">No hay vestidos en este catálogo por ahora.</p>}
   <p className="text-center text-xs text-gray-400">Para reservar o probarte un vestido, comunícate con Ámbar Couture.</p>
  </div>
 </main>;
}
