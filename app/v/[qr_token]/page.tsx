'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';
import {Loader2} from 'lucide-react';

const call=async(token:string,fecha?:string)=>{const r=await fetch(`/api/v?t=${encodeURIComponent(token)}${fecha?`&fecha=${fecha}`:''}`);const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo consultar.');return d;};

/** Public page opened from a dress QR: same read-only availability check the ally sees. */
export default function DressQrPage(){
 const token=String(useParams<{qr_token:string}>().qr_token||'');
 const [info,setInfo]=useState<{codigo?:string;nombre?:string|null;noDisponible?:boolean}|null>(null),[fecha,setFecha]=useState('');
 const [result,setResult]=useState<boolean|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{call(token).then(setInfo).catch(e=>setError(e.message));},[token]);
 const check=async()=>{setError('');setResult(null);setBusy(true);
  try{const d=await call(token,fecha);setResult(d.disponible);}catch(e){setError(e instanceof Error?e.message:'');}finally{setBusy(false);}};
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white';
 return <main translate="no" className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-md mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE</p><h1 className="text-2xl font-black text-gray-900 mt-2">Disponibilidad de vestidos</h1>{info?.codigo&&<p className="text-sm text-gray-500">Referencia {info.codigo}{info.nombre?` · ${info.nombre}`:''}</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!info&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {info?.noDisponible&&<p className="text-center text-lg font-black rounded-2xl p-4 bg-rose-50 text-rose-700">Este vestido no está disponible</p>}
   {info?.codigo&&<section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-3">
    <label className="text-xs font-bold text-gray-600">Fecha del evento<input type="date" className={input} value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
    <button disabled={busy||!fecha} onClick={()=>void check()} className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Consultando…':'Consultar'}</button>
    {result!==null&&<p className={`text-center text-lg font-black rounded-2xl p-4 ${result?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>{result?'Disponible':'No disponible'}</p>}
    <p className="text-xs text-gray-400">Solo consulta. Para reservar, comunícate con Ámbar Couture.</p>
   </section>}
  </div>
 </main>;
}
