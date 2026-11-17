'use client';
import {useCallback,useEffect,useState} from 'react';
import {PiggyBank} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {CASH_METHODS,accountsFor,accountLabel,needsAccount,type CashAccount} from '@/lib/cash';

type Sede={id:string;nombre:string};
type Plan={id:string;numero:number;sede_id:string;sede:string;titular_nombre:string;telefono:string;email:string|null;quinceanera_nombre:string|null;fecha_evento:string;cuota_mensual:number;dia_pago:number;
 estado:'activo'|'usado'|'desistido'|'terminado';created_at:string;ahorrado:number;pagos:number;ultimo_pago:string|null;extra:number;disponible:number;nivel:'Rosa'|'Diamante'|'Corona';premios:string;
 siguiente:string|null;falta:number;usar_desde:string;meses_pagados:number;meses_esperados:number;al_dia:boolean;devolucion:number;notas:string|null;cerrado_nota:string|null};
const input='border border-gray-200 rounded-xl px-3 py-2 text-sm w-full bg-white';
const cop=(n:number)=>`$${Math.round(Number(n)).toLocaleString('es-CO')}`;
const hoyBogota=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const fecha=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric'});
const NIVEL:Record<Plan['nivel'],string>={Rosa:'🌸 Rosa',Diamante:'💎 Diamante',Corona:'👑 Corona'};
const ESTADO:Record<Plan['estado'],string>={activo:'Activo',usado:'Usado en contrato',desistido:'Desistió',terminado:'Terminado por mora'};

/** Ventas › Plan Ahorro XV: families save monthly (from $150.000) and, 3 months before the event, use what they saved plus an extra
 *  (10 %, 12 % in Corona) and the prizes of their level. Each cuota goes to Cierres de caja as an income «Plan Ahorro XV». */
export default function PlanAhorroPage(){
 return <SupplierShell activePage="plan_ahorro" crumb="Ventas / Plan Ahorro XV" title="Plan Ahorro XV" icon={<PiggyBank/>}
  description="La familia ahorra cada mes (desde $150.000) y, 3 meses antes del evento, usa lo ahorrado más un extra en vestido y servicios. Cada cuota entra a Cierres de caja.">
  {()=><Planes/>}
 </SupplierShell>;
}

function Planes(){
 const [planes,setPlanes]=useState<Plan[]|null>(null),[sedes,setSedes]=useState<Sede[]>([]),[sede,setSede]=useState(''),[cuentas,setCuentas]=useState<CashAccount[]>([]),[ver,setVer]=useState<'activo'|'cerrados'>('activo');
 const [error,setError]=useState(''),[nuevo,setNuevo]=useState(false),[pagar,setPagar]=useState<Plan|null>(null),[cerrar,setCerrar]=useState<Plan|null>(null);
 const load=useCallback(async()=>{
  const [{data,error:e},{data:s},{data:k}]=await Promise.all([supabase.rpc('planes_ahorro_listar',{p_sede:sede||null}),supabase.rpc('pagos_fijos_sedes'),supabase.rpc('cuentas_dinero_lista')]);
  if(e)setError(e.message);else{setError('');setPlanes(((data||[]) as Plan[]).map(p=>({...p,ahorrado:Number(p.ahorrado),extra:Number(p.extra),disponible:Number(p.disponible),falta:Number(p.falta),cuota_mensual:Number(p.cuota_mensual),devolucion:Number(p.devolucion)})));}
  if(Array.isArray(s)&&s.length)setSedes(s as Sede[]);else{const {data:t}=await supabase.from('sedes').select('id,nombre').order('nombre');setSedes((t||[]) as Sede[]);}
  setCuentas((Array.isArray(k)?k:[]) as CashAccount[]);
 },[sede]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const activos=(planes||[]).filter(p=>p.estado==='activo'),lista=ver==='activo'?activos:(planes||[]).filter(p=>p.estado!=='activo');
 const hoy=hoyBogota();
 return <div className="space-y-4">
  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
   {[['Familias ahorrando',String(activos.length)],['Ahorrado (activos)',cop(activos.reduce((a,p)=>a+p.ahorrado,0))],['Extra comprometido',cop(activos.reduce((a,p)=>a+p.extra,0))],['Atrasadas',String(activos.filter(p=>!p.al_dia).length)]]
    .map(([t,v])=><div key={t} className="bg-white rounded-2xl border border-gray-100 p-3"><p className="text-[11px] font-black text-gray-400 uppercase">{t}</p><p className="text-xl font-black text-gray-900">{v}</p></div>)}
  </div>
  <div className="flex flex-wrap gap-2 items-center">
   <button type="button" onClick={()=>setNuevo(true)} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">Inscribir familia</button>
   {([['activo','Activos'],['cerrados','Cerrados']] as const).map(([k,l])=><button key={k} type="button" onClick={()=>setVer(k)} className={`px-4 py-2 rounded-xl text-sm font-black ${ver===k?'bg-gray-900 text-white':'bg-white border'}`}>{l}</button>)}
   <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas mis sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
  </div>
  <p className="text-xs text-gray-500">Niveles por lo ahorrado: 🌸 Rosa (hasta $1.500.000): +10 % y tiara · 💎 Diamante ($1.500.000 a $3.000.000): +10 %, tiara, cojines y 1 vestido de Gala Clásica · 👑 Corona (más de $3.000.000): +12 %, tiara, cojines, 2 vestidos de gala de cualquier categoría y prioridad. Los premios se prestan sin costo para el evento; el extra solo se usa en Ámbar.</p>
  {error&&<p className="text-red-600 font-bold text-sm">{error}</p>}
  {!planes?<p className="text-gray-400 font-bold">Cargando…</p>:!lista.length?<p className="text-sm text-gray-500">{ver==='activo'?'Aún no hay familias en el plan. Inscríbela con «Inscribir familia» cuando pague su primera cuota.':'No hay planes cerrados.'}</p>:
  <div className="grid gap-3 md:grid-cols-2">{lista.map(p=>{const pct=p.siguiente?Math.min(100,Math.round(100*p.ahorrado/(p.ahorrado+p.falta))):100;
   return <article key={p.id} className={`bg-white rounded-2xl border p-4 space-y-2 ${p.estado==='activo'&&!p.al_dia?'border-red-200':'border-gray-100'}`}>
    <div className="flex justify-between gap-2"><div><p className="font-black text-gray-900">{p.quinceanera_nombre||p.titular_nombre} <span className="text-xs text-gray-400">n.º {p.numero}</span></p>
     <p className="text-xs text-gray-500">{p.titular_nombre} · {p.telefono} · {p.sede}</p></div>
     <span className="text-xs font-black whitespace-nowrap">{p.estado==='activo'?NIVEL[p.nivel]:ESTADO[p.estado]}</span></div>
    <div className="grid grid-cols-3 gap-2 text-center">
     <div className="rounded-xl bg-gray-50 p-2"><p className="text-[10px] font-bold text-gray-500">Ahorrado</p><p className="font-black text-sm">{cop(p.ahorrado)}</p></div>
     <div className="rounded-xl bg-emerald-50 p-2"><p className="text-[10px] font-bold text-emerald-700">Extra</p><p className="font-black text-sm text-emerald-700">+{cop(p.extra)}</p></div>
     <div className="rounded-xl bg-rose-50 p-2"><p className="text-[10px] font-bold text-rose-700">Para usar</p><p className="font-black text-sm text-rose-700">{cop(p.disponible)}</p></div>
    </div>
    {p.estado==='activo'&&p.siguiente&&<div><div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-rose-400" style={{width:`${pct}%`}}/></div>
     <p className="text-[11px] text-gray-500 mt-1">Le faltan {cop(p.falta)} para {NIVEL[p.siguiente as Plan['nivel']]}</p></div>}
    <p className="text-xs text-gray-600">Evento {fecha(p.fecha_evento)} · usa el plan desde {fecha(p.usar_desde)} · cuota {cop(p.cuota_mensual)} el día {p.dia_pago} · {p.pagos} pago{p.pagos===1?'':'s'}{p.ultimo_pago?` (último ${fecha(p.ultimo_pago)})`:''}</p>
    {p.estado==='activo'&&<p className={`text-xs font-bold ${p.al_dia?'text-emerald-700':'text-red-600'}`}>{p.al_dia?'Al día':`Atrasada: lleva ${p.meses_pagados} de ${p.meses_esperados} cuotas`}{p.usar_desde<=hoy?' · ya puede usar su plan: agenda la cita de selección':''}</p>}
    <p className="text-[11px] text-gray-500">Premios: {p.premios}</p>
    {p.estado!=='activo'&&p.cerrado_nota&&<p className="text-[11px] text-gray-500">Nota: {p.cerrado_nota}</p>}
    {p.estado==='activo'&&<div className="flex flex-wrap gap-2 pt-1">
     <button type="button" onClick={()=>setPagar(p)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black">Registrar cuota</button>
     <button type="button" onClick={()=>setCerrar(p)} className="px-3 py-1.5 rounded-lg border text-xs font-black">Cerrar plan</button>
    </div>}
   </article>;})}</div>}
  {nuevo&&<FormNuevo sedes={sedes} sede={sede} onClose={()=>setNuevo(false)} onDone={()=>{setNuevo(false);void load();}}/>}
  {pagar&&<FormCuota p={pagar} cuentas={cuentas} onClose={()=>setPagar(null)} onDone={()=>{setPagar(null);void load();}}/>}
  {cerrar&&<FormCerrar p={cerrar} onClose={()=>setCerrar(null)} onDone={()=>{setCerrar(null);void load();}}/>}
 </div>;
}

function Modal({titulo,children,onClose}:{titulo:string;children:React.ReactNode;onClose:()=>void}){
 return <div className="fixed inset-0 z-[120] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
  <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={e=>e.stopPropagation()}>
   <p className="font-black text-lg text-gray-900">{titulo}</p>{children}
  </div>
 </div>;
}

function FormNuevo({sedes,sede,onClose,onDone}:{sedes:Sede[];sede:string;onClose:()=>void;onDone:()=>void}){
 const [f,setF]=useState({sede_id:sede||sedes[0]?.id||'',titular_nombre:'',titular_documento:'',telefono:'',email:'',quinceanera_nombre:'',fecha_evento:'',cuota_mensual:'150000',dia_pago:'5',notas:''});
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const guardar=async()=>{setBusy(true);setError('');const {error:e}=await supabase.rpc('plan_ahorro_crear',{p:{...f,cuota_mensual:Number(f.cuota_mensual),dia_pago:Number(f.dia_pago)}});setBusy(false);if(e)setError(e.message);else onDone();};
 return <Modal titulo="Inscribir familia en el Plan Ahorro XV" onClose={onClose}>
  <p className="text-xs text-gray-500">Inscríbela cuando firme el plan; después registra su primera cuota. El evento debe ser al menos 6 meses después de hoy (si es antes, va por la venta normal).</p>
  <div className="grid sm:grid-cols-2 gap-3">
   <label className="text-xs font-bold text-gray-600">Sede<select className={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value})}>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">Fecha del evento<input type="date" className={input} value={f.fecha_evento} onChange={e=>setF({...f,fecha_evento:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Quién ahorra (mamá, papá o acudiente)<input className={input} value={f.titular_nombre} onChange={e=>setF({...f,titular_nombre:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Cédula (opcional)<input className={input} value={f.titular_documento} onChange={e=>setF({...f,titular_documento:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Celular (WhatsApp)<input className={input} inputMode="tel" value={f.telefono} onChange={e=>setF({...f,telefono:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Correo (opcional)<input className={input} type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Nombre de la quinceañera (opcional)<input className={input} value={f.quinceanera_nombre} onChange={e=>setF({...f,quinceanera_nombre:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Cuota mensual (mínimo $150.000)<input className={input} inputMode="numeric" value={f.cuota_mensual} onChange={e=>setF({...f,cuota_mensual:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-xs font-bold text-gray-600">Día de pago de cada mes<input type="number" min={1} max={28} className={input} value={f.dia_pago} onChange={e=>setF({...f,dia_pago:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Notas (opcional)<input className={input} value={f.notas} onChange={e=>setF({...f,notas:e.target.value})}/></label>
  </div>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!f.sede_id||!f.titular_nombre.trim()||!f.telefono||!f.fecha_evento||Number(f.cuota_mensual)<150000} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy?'Guardando…':'Inscribir'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}

function FormCuota({p,cuentas,onClose,onDone}:{p:Plan;cuentas:CashAccount[];onClose:()=>void;onDone:()=>void}){
 const [f,setF]=useState({fecha:hoyBogota(),valor:String(Math.round(p.cuota_mensual)),medio:'Transferencia',cuenta_id:'',nota:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const opciones=accountsFor(f.medio,cuentas,p.sede_id),pideCuenta=needsAccount(f.medio,opciones);
 const guardar=async()=>{setBusy(true);setError('');
  const {error:e}=await supabase.rpc('plan_ahorro_pagar',{p_plan:p.id,p:{fecha:f.fecha,valor:Number(f.valor),medio:f.medio,cuenta_id:f.medio==='Efectivo'?null:f.cuenta_id||null,nota:f.nota}});
  setBusy(false);if(e)setError(e.message);else onDone();};
 return <Modal titulo={`Registrar cuota · ${p.quinceanera_nombre||p.titular_nombre}`} onClose={onClose}>
  <p className="text-xs text-gray-500">Entra como ingreso «Plan Ahorro XV» en Cierres de caja de {p.sede}. La fecha debe ser de hoy o de los últimos 31 días y ese día de caja debe estar abierto. Puede abonar más de la cuota.</p>
  <div className="grid sm:grid-cols-2 gap-3">
   <label className="text-xs font-bold text-gray-600">Fecha del pago<input type="date" className={input} value={f.fecha} max={hoyBogota()} onChange={e=>setF({...f,fecha:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Valor<input className={input} inputMode="numeric" value={f.valor} onChange={e=>setF({...f,valor:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-xs font-bold text-gray-600">Medio<select className={input} value={f.medio} onChange={e=>setF({...f,medio:e.target.value,cuenta_id:''})}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
   {f.medio!=='Efectivo'&&opciones.length>0&&<label className="text-xs font-bold text-gray-600">¿A qué cuenta llegó?<select className={input} value={f.cuenta_id} onChange={e=>setF({...f,cuenta_id:e.target.value})}><option value="">{pideCuenta?'Elige la cuenta':'Sin cuenta'}</option>{opciones.map(o=><option key={o.id} value={o.id}>{accountLabel(o)}</option>)}</select></label>}
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Nota (opcional)<input className={input} value={f.nota} onChange={e=>setF({...f,nota:e.target.value})}/></label>
  </div>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!Number(f.valor)||(pideCuenta&&!f.cuenta_id)} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40">{busy?'Registrando…':'Registrar cuota'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}

function FormCerrar({p,onClose,onDone}:{p:Plan;onClose:()=>void;onDone:()=>void}){
 const [estado,setEstado]=useState<'usado'|'desistido'|'terminado'>('usado'),[nota,setNota]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guardar=async()=>{setBusy(true);setError('');const {error:e}=await supabase.rpc('plan_ahorro_estado',{p_id:p.id,p_estado:estado,p_nota:nota,p_contrato:null});setBusy(false);if(e)setError(e.message);else onDone();};
 return <Modal titulo={`Cerrar plan · ${p.quinceanera_nombre||p.titular_nombre}`} onClose={onClose}>
  <label className="block text-xs font-bold text-gray-600">Motivo<select className={input} value={estado} onChange={e=>setEstado(e.target.value as typeof estado)}>
   <option value="usado">Lo usó en su contrato (aplica el extra y los premios)</option><option value="desistido">Desistió (sin extra)</option><option value="terminado">Dejó de pagar 2 cuotas seguidas (sin extra)</option></select></label>
  <p className="text-xs text-gray-600">{estado==='usado'?`Para usar: ${cop(p.disponible)} (${cop(p.ahorrado)} ahorrado + ${cop(p.extra)} extra). Premios: ${p.premios}.`:`Devolución: ${cop(p.devolucion)} (lo pagado menos el 10 % de gastos administrativos), dentro de 15 días hábiles. Regístrala como egreso en Cierres de caja.`}</p>
  <label className="block text-xs font-bold text-gray-600">Nota (obligatoria){estado==='usado'?' · por ejemplo, el número del contrato':''}<input className={input} value={nota} onChange={e=>setNota(e.target.value)}/></label>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||nota.trim().length<5} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-40">{busy?'Guardando…':'Cerrar plan'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}
