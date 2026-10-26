'use client';
import {useEffect,useState} from 'react';
import {CheckCircle,Loader2} from 'lucide-react';
import {measureAlerts,measureErrors,type MeasureField} from '@/lib/ally-measures';

type Info={clienta:string;categoria:string;fecha_evento:string|null;contrato:string;estado:string;nota:string|null;valores:Record<string,string>;campos:MeasureField[]};
const call=async(body:Record<string,unknown>)=>{const r=await fetch('/api/aliados/medidas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d;};

/** Ally fills the virtual measures of one client (token link). Alerts only warn; confirmation is required. */
export default function AllyMeasuresPage(){
 const [token,setToken]=useState(''),[info,setInfo]=useState<Info|null>(null),[valores,setValores]=useState<Record<string,string>>({}),[confirma,setConfirma]=useState(false);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false);
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  history.replaceState(null,'',window.location.pathname);
  if(!t){setError('Abre el enlace completo que te envió Ámbar Couture.');return;}
  setToken(t);
  call({accion:'ver',token:t}).then((d:Info)=>{setInfo(d);setValores(d.valores||{});}).catch(e=>setError(e.message));
 },[]);
 const editable=!!info&&['Pendiente','Corrección solicitada'].includes(info.estado);
 const alerts=info?measureAlerts(info.campos,valores):[];
 const send=async()=>{
  if(!info)return;setError('');
  const errs=measureErrors(info.campos,valores);
  if(errs.length)return setError(errs[0]);
  if(!confirma)return setError('Marca la casilla de confirmación.');
  setBusy(true);
  try{await call({accion:'enviar',token,valores,confirma});setDone(true);window.scrollTo({top:0,behavior:'smooth'});}catch(e){setError(e instanceof Error?e.message:'');}finally{setBusy(false);}
 };
 const card='bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-4';
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-2xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · ALIADOS</p><h1 className="text-2xl font-black text-gray-900 mt-2">Medidas de la clienta</h1>
    {info&&<p className="text-sm text-gray-500 mt-1"><b>{info.clienta}</b> · {info.categoria} · evento {info.fecha_evento?.split('-').reverse().join('/')} · contrato {info.contrato}</p>}</header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!info&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {(done||(info&&!editable))&&<div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex gap-3"><CheckCircle className="w-6 h-6 text-emerald-600 shrink-0"/><p className="text-sm text-emerald-800">{done?'Medidas enviadas. Ámbar Couture las revisará.':`Estado de las medidas: ${info?.estado}.`}</p></div>}
   {info&&editable&&!done&&<>
    {info.estado==='Corrección solicitada'&&info.nota&&<p className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm">Corrección solicitada: {info.nota}</p>}
    {!info.campos.length&&<p className="text-sm text-gray-500">Ámbar Couture aún no configuró la ficha de medidas.</p>}
    <section className={card}>
     {info.campos.map(f=><div key={f.id} className="border-b border-gray-100 pb-4">
      <label className="text-sm font-bold text-gray-800">{f.nombre} (cm)<input inputMode="decimal" className="w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm" value={valores[f.nombre]||''} onChange={e=>setValores({...valores,[f.nombre]:e.target.value})}/></label>
      {f.instruccion&&<p className="text-xs text-gray-500 mt-1">{f.instruccion}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {f.imagen_url&&<img src={f.imagen_url} alt={`Cómo medir ${f.nombre}`} className="mt-2 max-h-48 rounded-xl border"/>}
     </div>)}
    </section>
    {alerts.length>0&&<ul className="bg-amber-50 border border-amber-200 text-amber-800 rounded-2xl p-4 text-sm list-disc pl-8">{alerts.map(a=><li key={a}>{a}</li>)}</ul>}
    <section className={card}>
     <label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={confirma} onChange={e=>setConfirma(e.target.checked)}/>Confirmo que tomé estas medidas siguiendo las instrucciones y asumo los ajustes por errores en ellas.</label>
     <button disabled={busy||!info.campos.length} onClick={()=>void send()} className="w-full px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-50">{busy?'Enviando…':'Enviar medidas'}</button>
    </section>
   </>}
  </div>
 </main>;
}
