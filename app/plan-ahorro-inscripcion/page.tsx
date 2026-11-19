'use client';
import {useEffect,useState} from 'react';
import {Loader2,PiggyBank} from 'lucide-react';

type Sede={id:string;nombre:string};
const call=async(body:Record<string,unknown>)=>{const r=await fetch('/api/plan-ahorro/inscribir',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo continuar.');return d;};
const minEvento=()=>{const d=new Date();d.setMonth(d.getMonth()+6);return d.toISOString().slice(0,10);};

/** The family enrolls itself in the Plan Ahorro XV from the link the WhatsApp AI sent, then signs its contract right away. */
export default function PlanAhorroInscripcionPage(){
 const [token,setToken]=useState(''),[sedes,setSedes]=useState<Sede[]|null>(null),[tel,setTel]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const [f,setF]=useState({titular_nombre:'',titular_documento:'',email:'',quinceanera_nombre:'',fecha_evento:'',sede_id:'',cuota_mensual:'150000',dia_pago:'5'});
 useEffect(()=>{
  const t=decodeURIComponent(window.location.hash.slice(1));
  history.replaceState(null,'',window.location.pathname);
  const id=setTimeout(()=>{
   if(!t){setError('Abre el enlace completo que te enviamos por WhatsApp.');return;}
   setToken(t);
   call({token:t,accion:'ver'}).then((d:{sedes:Sede[];sede:string|null;telefono:string})=>{setSedes(d.sedes);setTel(d.telefono);if(d.sede)setF(v=>({...v,sede_id:d.sede!}));}).catch(e=>setError(e.message));
  },0);
  return()=>clearTimeout(id);
 },[]);
 const set=(k:keyof typeof f)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 const enviar=async()=>{
  setError('');
  if(f.titular_nombre.trim().length<3)return setError('Escribe tu nombre completo.');
  if(!/^\d{5,12}$/.test(f.titular_documento.replace(/\D/g,'')))return setError('Escribe tu número de cédula.');
  if(f.quinceanera_nombre.trim().length<3)return setError('Escribe el nombre de la quinceañera.');
  if(!f.fecha_evento)return setError('Elige la fecha del evento.');
  if(!f.sede_id)return setError('Elige la sede.');
  if(Number(f.cuota_mensual)<150000)return setError('La cuota mínima es de $150.000 al mes.');
  setBusy(true);
  try{const d=await call({token,accion:'inscribir',datos:f});window.location.href=d.firma;}
  catch(e){setError(e instanceof Error?e.message:'No se pudo inscribir.');setBusy(false);}
 };
 const input='w-full mt-1 rounded-xl border border-gray-200 px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-400';
 return <main className="min-h-screen bg-[#faf8f5] py-8 px-4">
  <div className="max-w-xl mx-auto space-y-6">
   <header className="text-center"><p className="text-[11px] font-black tracking-[.2em] text-amber-700">ÁMBAR COUTURE · PLAN AHORRO XV</p><h1 className="text-2xl font-black text-gray-900 mt-2">Inscríbete en el Plan Ahorro XV</h1>
    <p className="text-sm text-gray-500 mt-2">Ahorra mes a mes para el vestido de sus XV desde $150.000 al mes. Al usarlo recibes un extra sobre lo ahorrado.</p></header>
   {error&&<p role="alert" className="bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl p-4 text-sm font-bold">{error}</p>}
   {!sedes&&!error&&<p className="flex items-center justify-center gap-2 text-gray-500"><Loader2 className="w-5 h-5 animate-spin"/> Cargando…</p>}
   {sedes&&<section className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm space-y-3">
    <p className="text-xs text-gray-500">Celular del plan: <b>{tel}</b> (el WhatsApp desde el que nos escribiste).</p>
    <label className="block text-xs font-bold text-gray-600">Tu nombre completo<input className={input} value={f.titular_nombre} onChange={set('titular_nombre')} autoComplete="name"/></label>
    <label className="block text-xs font-bold text-gray-600">Tu número de cédula<input className={input} inputMode="numeric" value={f.titular_documento} onChange={set('titular_documento')}/></label>
    <label className="block text-xs font-bold text-gray-600">Tu correo (opcional)<input className={input} inputMode="email" value={f.email} onChange={set('email')} autoComplete="email"/></label>
    <label className="block text-xs font-bold text-gray-600">Nombre de la quinceañera<input className={input} value={f.quinceanera_nombre} onChange={set('quinceanera_nombre')}/></label>
    <label className="block text-xs font-bold text-gray-600">Fecha del evento (al menos 6 meses desde hoy)<input type="date" min={minEvento()} className={input} value={f.fecha_evento} onChange={set('fecha_evento')}/></label>
    <label className="block text-xs font-bold text-gray-600">Sede<select className={input} value={f.sede_id} onChange={set('sede_id')}><option value="">Elige la sede</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-3">
     <label className="block text-xs font-bold text-gray-600">Cuota mensual (desde $150.000)<input className={input} inputMode="numeric" value={f.cuota_mensual} onChange={e=>setF({...f,cuota_mensual:e.target.value.replace(/\D/g,'')})}/>
      <span className="font-normal text-gray-500">{Number(f.cuota_mensual)>0?`$${Number(f.cuota_mensual).toLocaleString('es-CO')} al mes`:''}</span></label>
     <label className="block text-xs font-bold text-gray-600">Día de pago de cada mes<select className={input} value={f.dia_pago} onChange={set('dia_pago')}>{Array.from({length:28},(_,i)=>i+1).map(d=><option key={d} value={d}>{d}</option>)}</select></label>
    </div>
    <button type="button" disabled={busy} onClick={()=>void enviar()} className="w-full rounded-2xl bg-rose-600 text-white py-3 font-black disabled:opacity-50 flex items-center justify-center gap-2"><PiggyBank className="w-5 h-5"/>{busy?'Inscribiendo…':'Inscribirme y firmar el contrato'}</button>
    <p className="text-[11px] text-gray-500">Después de inscribirte verás tu contrato para leerlo y firmarlo desde el celular. También te lo enviamos por WhatsApp.</p>
   </section>}
  </div>
 </main>;
}
