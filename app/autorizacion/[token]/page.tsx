'use client';
import {useEffect,useState} from 'react';
import {useParams} from 'next/navigation';

type Info={nombre:string;estado:string;comercial:boolean;textos:{tratamiento:{texto:string}|null;comercial:{texto:string}|null}};

/** Public page: the person accepts (or revokes) her data authorization with her own link. */
export default function AuthorizationPage(){
 const token=String(useParams<{token:string}>().token||'');
 const [info,setInfo]=useState<Info|null>(null),[error,setError]=useState(''),[trat,setTrat]=useState(false),[com,setCom]=useState<boolean|null>(null),[busy,setBusy]=useState(false),[done,setDone]=useState('');
 useEffect(()=>{void fetch(`/api/autorizacion?token=${encodeURIComponent(token)}`).then(r=>r.json()).then(d=>{if(d.error)setError(d.error);else{setInfo(d);setTrat(d.estado==='autorizada');setCom(d.comercial?true:null);}}).catch(()=>setError('No pudimos cargar la autorización.'));},[token]);
 const send=async(accion:'aceptar'|'revocar')=>{
  setError('');if(accion==='aceptar'&&!trat)return setError('Para continuar marca la autorización de tratamiento de datos.');
  if(accion==='revocar'&&!window.confirm('¿Retirar tu autorización? Ámbar Couture dejará de usar tus datos salvo lo que exija la ley.'))return;
  setBusy(true);
  try{const r=await fetch('/api/autorizacion',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,accion,tratamiento:trat,comercial:com})});const d=await r.json();
   if(!r.ok)throw Error(d.error||'No se pudo guardar.');setInfo(i=>i&&{...i,estado:d.estado,comercial:d.comercial});setDone(accion==='aceptar'?'¡Gracias! Tu autorización quedó registrada.':'Tu autorización fue retirada.');}
  catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}
 };
 return <main className="min-h-screen bg-rose-50/40 flex justify-center p-4"><section className="w-full max-w-lg bg-white rounded-3xl p-6 shadow-sm space-y-4 h-fit">
  <p className="text-xs font-black tracking-[0.3em] text-rose-500">ÁMBAR COUTURE</p>
  <h1 className="text-2xl font-black text-gray-900">Autorización de datos personales</h1>
  {info&&<p className="text-sm text-gray-600">{info.nombre?`Hola ${info.nombre}. `:''}{info.estado==='autorizada'?'Ya autorizaste el tratamiento de tus datos. Aquí puedes cambiar la autorización comercial o retirarla.':info.estado==='revocada'?'Retiraste tu autorización. Puedes volver a otorgarla aquí.':'Para atenderte necesitamos tu autorización.'}</p>}
  {done&&<p role="status" className="bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl p-3 text-sm font-bold">{done}</p>}
  {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-3 text-sm">{error}</p>}
  {info&&<>
   {info.textos.tratamiento&&<p className="text-xs text-gray-600 leading-relaxed">{info.textos.tratamiento.texto}</p>}
   <label className="flex gap-2 items-start text-sm text-gray-800"><input type="checkbox" className="mt-1" checked={trat} disabled={info.estado==='autorizada'} onChange={e=>setTrat(e.target.checked)}/>Autorizo el tratamiento de mis datos personales (obligatorio)</label>
   {info.textos.comercial&&<p className="text-xs text-gray-600 leading-relaxed">{info.textos.comercial.texto}</p>}
   <div role="radiogroup" aria-label="Información comercial" className="text-sm text-gray-800 space-y-1"><p className="font-bold">¿Quieres recibir novedades, vestidos nuevos y promociones? (elige una)</p>
    <label className="flex gap-2 items-start"><input type="radio" name="comercial" className="mt-1" checked={com===true} onChange={()=>setCom(true)}/>Sí autorizo recibir información comercial</label>
    <label className="flex gap-2 items-start"><input type="radio" name="comercial" className="mt-1" checked={com===false} onChange={()=>setCom(false)}/>No autorizo</label></div>
   <button type="button" disabled={busy||com===null} onClick={()=>void send('aceptar')} className="w-full py-3 rounded-2xl bg-rose-500 text-white font-black text-sm">{busy?'Guardando…':'Guardar mi autorización'}</button>
   {info.estado==='autorizada'&&<button type="button" disabled={busy} onClick={()=>void send('revocar')} className="w-full py-2 text-xs font-bold text-gray-500 underline">Retirar mi autorización</button>}
  </>}
 </section></main>;
}
