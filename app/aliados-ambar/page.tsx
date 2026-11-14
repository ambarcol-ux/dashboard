'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';

type Aliado={nombre:string;tipo:string|null;sede:string|null;descripcion:string|null;instagram:string|null;tiktok:string|null;facebook:string|null;whatsapp:string|null;logo:string|null;destacado:boolean};

/** Public page «Aliados Ámbar»: photographers, make-up artists, planners, decorators and venues that work with Ámbar Couture dresses. */
export default function AliadosAmbarPage(){
 const [aliados,setAliados]=useState<Aliado[]|null>(null),[error,setError]=useState(''),[sede,setSede]=useState(''),[tipo,setTipo]=useState('');
 useEffect(()=>{void fetch('/api/aliados/directorio').then(r=>r.json()).then(d=>{if(d.error)setError(d.error);else setAliados(d.aliados||[]);}).catch(()=>setError('El directorio no está disponible.'));},[]);
 useEffect(()=>{const p=new URLSearchParams(window.location.search);setTimeout(()=>{setSede(p.get('sede')||'');setTipo(p.get('tipo')||'');},0);},[]);
 const sedes=useMemo(()=>[...new Set((aliados||[]).map(a=>a.sede).filter(Boolean))] as string[],[aliados]);
 const tipos=useMemo(()=>[...new Set((aliados||[]).map(a=>a.tipo).filter(Boolean))] as string[],[aliados]);
 const lista=(aliados||[]).filter(a=>(!sede||a.sede===sede)&&(!tipo||a.tipo===tipo));
 const sel='border border-[#e7dccb] rounded-xl px-3 py-2 text-sm bg-white';
 return <main className="min-h-screen bg-[#faf8f5] text-[#18181b]">
  <header className="px-4 pt-10 pb-6 text-center max-w-3xl mx-auto">
   <p className="text-[11px] font-black uppercase tracking-[.3em] text-[#b08d57]">Ámbar Couture</p>
   <h1 className="text-3xl font-black mt-2">Aliados Ámbar</h1>
   <p className="text-sm text-gray-600 mt-2">Fotógrafos, maquillaje y peinado, organizadores, decoradores y salones de eventos que trabajan con vestidos Ámbar Couture. Escríbeles directamente.</p>
  </header>
  <section className="max-w-5xl mx-auto px-4 pb-16">
   <div className="flex flex-wrap gap-2 justify-center mb-6">
    <select aria-label="Ciudad" value={sede} onChange={e=>setSede(e.target.value)} className={sel}><option value="">Todas las ciudades</option>{sedes.map(s=><option key={s}>{s}</option>)}</select>
    <select aria-label="Servicio" value={tipo} onChange={e=>setTipo(e.target.value)} className={sel}><option value="">Todos los servicios</option>{tipos.map(t=><option key={t}>{t}</option>)}</select>
   </div>
   {error&&<p className="text-center text-red-600 font-bold">{error}</p>}
   {!aliados&&!error&&<p className="text-center text-gray-400">Cargando aliados…</p>}
   {aliados&&!lista.length&&<p className="text-center text-gray-500">Pronto encontrarás aquí a nuestros aliados.</p>}
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{lista.map((a,i)=><article key={i} className={`rounded-3xl bg-white border p-5 shadow-sm ${a.destacado?'border-[#b08d57]':'border-[#efe7da]'}`}>
    <div className="flex items-center gap-3">
     {a.logo?<img src={a.logo} alt={`Logo de ${a.nombre}`} className="w-14 h-14 rounded-2xl object-cover border border-[#efe7da]"/>:<div className="w-14 h-14 rounded-2xl bg-[#f3ece1] flex items-center justify-center text-xl font-black text-[#b08d57]">{a.nombre.slice(0,1)}</div>}
     <div><p className="font-black leading-tight">{a.nombre}</p><p className="text-xs text-gray-500">{[a.tipo,a.sede].filter(Boolean).join(' · ')}</p></div>
    </div>
    {a.destacado&&<p className="mt-3 inline-block text-[10px] font-black uppercase tracking-widest text-[#8a6a3a] bg-[#f6eedf] rounded-full px-3 py-1">★ Aliado destacado</p>}
    {a.descripcion&&<p className="text-sm text-gray-700 mt-3">{a.descripcion}</p>}
    <div className="flex flex-wrap gap-2 mt-4 text-xs font-black">
     {a.instagram&&<a href={`https://instagram.com/${a.instagram}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-full bg-[#fdf2f8] text-[#be185d]">Instagram</a>}
     {a.tiktok&&<a href={`https://www.tiktok.com/@${a.tiktok}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-full bg-gray-100 text-gray-800">TikTok</a>}
     {a.facebook&&<a href={/^https?:\/\//.test(a.facebook)?a.facebook:`https://facebook.com/${a.facebook}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-full bg-blue-50 text-blue-700">Facebook</a>}
     {a.whatsapp&&<a href={`https://wa.me/${a.whatsapp}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700">WhatsApp</a>}
    </div>
   </article>)}</div>
   <p className="text-center text-sm text-gray-600 mt-10">¿Trabajas en eventos y quieres ser aliado? <Link href="/aliados/vincular?o=directorio" className="font-black text-[#b08d57] underline">Vincúlate aquí</Link></p>
  </section>
 </main>;
}
