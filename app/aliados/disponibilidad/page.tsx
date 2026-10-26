'use client';
import {useEffect,useState} from 'react';
import {Loader2} from 'lucide-react';

const call=async(body:Record<string,unknown>)=>{const r=await fetch('/api/aliados/disponibilidad',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo consultar.');return d;};

/** Read-only availability check for an Active ally (token link). It cannot reserve. */
export default function AllyAvailabilityPage(){
 const [token,setToken]=useState(''),[info,setInfo]=useState<{aliado:string;categorias:{id:number;nombre:string}[]}|null>(null);
 const [modo,setModo]=useState<'vestido'|'categoria'>('vestido'),[vestido,setVestido]=useState(''),[categoria,setCategoria]=useState(''),[fecha,setFecha]=useState('');
 const [result,setResult]=useState<boolean|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  history.replaceState(null,'',window.location.pathname);
  if(!t){setError('Abre el enlace completo que te envió Ámbar Couture.');return;}
  setToken(t);call({token:t}).then(setInfo).catch(e=>setError(e.message));
 },[]);
 const check=async()=>{setError('');setResult(null);setBusy(true);
  try{const d=await call({token,accion:'consultar',fecha,...(modo==='vestido'?{vestido}:{categoria})});setResult(d.disponible);}catch(e){setError(e instanceof Error?e.message:'');}finally{setBusy(false);}};
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white';
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-md mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · ALIADOS</p><h1 className="text-2xl font-black text-gray-900 mt-2">Disponibilidad de vestidos</h1>{info&&<p className="text-sm text-gray-500">{info.aliado}</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!info&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {info&&<section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-3">
    <div className="flex gap-2">{(['vestido','categoria'] as const).map(m=><button key={m} onClick={()=>{setModo(m);setResult(null);}} className={`flex-1 py-2 rounded-xl border text-sm font-bold ${modo===m?'bg-gray-900 text-white':'bg-white text-gray-600'}`}>{m==='vestido'?'Por vestido':'Por categoría'}</button>)}</div>
    {modo==='vestido'?<label className="text-xs font-bold text-gray-600">Referencia del vestido<input className={input} value={vestido} onChange={e=>setVestido(e.target.value.toUpperCase())}/></label>
     :<label className="text-xs font-bold text-gray-600">Categoría<select className={input} value={categoria} onChange={e=>setCategoria(e.target.value)}><option value="">Selecciona…</option>{info.categorias.map(c=><option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>}
    <label className="text-xs font-bold text-gray-600">Fecha del evento<input type="date" className={input} value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
    <button disabled={busy||!fecha} onClick={()=>void check()} className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Consultando…':'Consultar'}</button>
    {result!==null&&<p className={`text-center text-lg font-black rounded-2xl p-4 ${result?'bg-emerald-50 text-emerald-700':'bg-rose-50 text-rose-700'}`}>{result?'Disponible':'No disponible'}</p>}
    <p className="text-xs text-gray-400">Solo consulta. Para reservar, comunícate con Ámbar Couture.</p>
   </section>}
  </div>
 </main>;
}
