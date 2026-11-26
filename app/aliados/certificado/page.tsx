'use client';
import {useEffect,useState} from 'react';
import {CheckCircle,Loader2} from 'lucide-react';

const send=async(form:FormData)=>{const r=await fetch('/api/aliados/certificacion',{method:'POST',body:form});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d as {nombre?:string;ok?:boolean};};

/** Public page where an ally uploads the bank certification that is missing to approve them (private link from the email). */
export default function AllyCertificatePage(){
 const [token,setToken]=useState(''),[nombre,setNombre]=useState(''),[file,setFile]=useState<File|null>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[done,setDone]=useState(false);
 useEffect(()=>{const t=window.location.hash.replace(/^#/,'');setToken(t);const f=new FormData();f.append('token',t);f.append('accion','ver');
  void send(f).then(d=>setNombre(d.nombre||'')).catch(e=>setError(e instanceof Error?e.message:'')).finally(()=>setLoading(false));},[]);
 const subir=async()=>{if(!file)return setError('Elige el archivo de la certificación.');setBusy(true);setError('');
  try{const f=new FormData();f.append('token',token);f.append('certificacion',file);await send(f);setDone(true);}catch(e){setError(e instanceof Error?e.message:'No se pudo subir.');}finally{setBusy(false);}};
 return <main className="min-h-screen bg-[#faf8f5] flex items-center justify-center p-4">
  <div className="w-full max-w-md bg-white rounded-3xl shadow-sm border border-gray-100 p-6 space-y-4">
   <p className="text-[11px] font-black uppercase tracking-widest text-rose-700">Ámbar Couture · Aliados</p>
   <h1 className="text-xl font-black text-gray-900">Certificación bancaria</h1>
   {loading?<p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin"/>Cargando…</p>
   :done?<div className="text-center space-y-2"><CheckCircle className="w-10 h-10 text-emerald-600 mx-auto"/><p className="font-bold">¡Recibimos tu certificación{nombre?`, ${nombre.split(' ')[0]}`:''}!</p><p className="text-sm text-gray-600">Ámbar Couture la revisa y te avisa por correo cuando tu vinculación quede aprobada.</p></div>
   :nombre?<>
    <p className="text-sm text-gray-600">Hola, <b>{nombre}</b>. Sube la certificación bancaria de la cuenta donde recibes los pagos (PDF o foto, máximo 10 MB).</p>
    <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)} className="block w-full text-sm"/>
    <button type="button" disabled={busy||!file} onClick={()=>void subir()} className="w-full rounded-xl bg-rose-700 text-white font-black py-3 disabled:opacity-50">{busy?'Subiendo…':'Enviar certificación'}</button>
   </>:null}
   {error&&<p role="alert" className="text-sm font-bold text-red-700">{error}</p>}
  </div>
 </main>;
}
