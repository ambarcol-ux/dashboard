'use client';
import {useEffect,useState} from 'react';
import {Loader2} from 'lucide-react';

type Vestido={codigo:string;nombre:string|null;color:string|null;talla:string|null;precio:number|null;foto:string|null;disponible:boolean|null};
type Data={nombre:string;sede:string;sede_id:string;fecha:string|null;vestidos:Vestido[]};
const cop=(n:number)=>'$'+Math.round(n).toLocaleString('es-CO');

/** Public page for whoever decides (mom, dad, fiancé): the favorite dresses she tried at Ámbar, with availability for her date. */
export default function Favoritos(){
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState('');
 useEffect(()=>{const token=window.location.hash.slice(1);
  fetch('/api/primeras-citas/favoritos',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})})
   .then(async r=>{const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo abrir.');setData(d as Data);}).catch(e=>setError(e instanceof Error?e.message:'No se pudo abrir.'));},[]);
 const fecha=data?.fecha?new Date(data.fecha+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'}):'';
 return <main translate="no" className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-md mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE{data?.sede?` · ${data.sede.toUpperCase()}`:''}</p>
    <h1 className="text-2xl font-black text-gray-900 mt-2">{data?.nombre?`Los favoritos de ${data.nombre}`:'Sus vestidos favoritos'}</h1>
    {fecha&&<p className="text-sm text-gray-500 mt-1">Para su evento del {fecha}</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!data&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {data&&!data.vestidos.length&&<p className="text-center text-gray-500">Estos vestidos ya no están disponibles. Escríbenos y te mostramos opciones parecidas.</p>}
   {data?.vestidos.map(v=><article key={v.codigo} className="bg-white rounded-3xl border border-gray-100 overflow-hidden shadow-sm">
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {v.foto&&<img src={v.foto} alt={`Vestido ${v.codigo}`} className="w-full aspect-[3/4] object-cover"/>}
    <div className="p-5 space-y-1">
     <p className="font-black text-gray-900">Vestido {v.codigo}{v.nombre?` · ${v.nombre}`:''}</p>
     <p className="text-sm text-gray-500">{[v.color,v.talla?`Talla ${v.talla}`:''].filter(Boolean).join(' · ')}</p>
     {v.precio?<p className="text-sm font-bold text-gray-800">Alquiler {cop(v.precio)}</p>:null}
     {v.disponible!==null&&<p className={`text-sm font-black ${v.disponible?'text-emerald-700':'text-rose-700'}`}>{v.disponible?'✓ Disponible para su fecha':'Ya está reservado para su fecha'}</p>}
    </div>
   </article>)}
   {data&&<a href={`/agendar-primera-cita?sede=${data.sede_id}&o=favoritos`} className="block text-center w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black">Agendar una cita para verlos juntas</a>}
   <p className="text-xs text-center text-gray-400">La disponibilidad puede cambiar: aparta el vestido para asegurarlo.</p>
  </div>
 </main>;
}
