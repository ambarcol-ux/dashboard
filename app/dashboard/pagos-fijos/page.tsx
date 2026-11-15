'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CalendarClock} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {CASH_METHODS,accountsFor,accountLabel,needsAccount,type CashAccount} from '@/lib/cash';

type Sede={id:string;nombre:string};
type Cuota={id:string;concepto_id:string;concepto:string;categoria:string;proveedor:string|null;referencia:string|null;sede_id:string;sede:string;vence:string;valor:number;estado:'pendiente'|'pagada';
 ajustada:boolean;pagada_fecha:string|null;valor_pagado:number|null;nota:string|null;alerta_apagada:boolean;medio:string;cuenta_id:string|null;dias_aviso:number};
type Concepto={id?:string;sede_id:string;nombre:string;categoria:string;proveedor:string;referencia:string;frecuencia:string;primer_vencimiento:string;valor:string;valor_fijo:boolean;medio:string;cuenta_id:string;dias_aviso:number;notas:string;activo?:boolean};
const CATEGORIAS=['Arriendo','Servicios públicos','Internet y telefonía','Administración','Impuestos','Seguros','Mantenimiento','Otro gasto fijo'];
const FRECUENCIAS:Record<string,string>={mensual:'Mensual',bimestral:'Bimestral',trimestral:'Trimestral',semestral:'Semestral',anual:'Anual',unica:'Una sola vez'};
const DIAS=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
const input='border border-gray-200 rounded-xl px-3 py-2 text-sm w-full bg-white';
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;
const hoyBogota=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const fecha=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('es-CO',{weekday:'short',day:'numeric',month:'short'});
const addDays=(d:string,n:number)=>{const x=new Date(d+'T12:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10);};
const NUEVO:Concepto={sede_id:'',nombre:'',categoria:'Servicios públicos',proveedor:'',referencia:'',frecuencia:'mensual',primer_vencimiento:'',valor:'',valor_fijo:false,medio:'Transferencia',cuenta_id:'',dias_aviso:5,notas:''};

/** Finanzas › Pagos fijos de sede: rent, utilities and other recurring payments per store, a payment calendar and paying an installment
 *  (recorded as an expense in Cierres de caja). Administration, accounting and franchisees (only their stores). */
export default function PagosFijosPage(){
 return <SupplierShell activePage="pagos_fijos" crumb="Finanzas / Pagos fijos de sede" title="Pagos fijos de sede" icon={<CalendarClock/>}
  description="Arriendos, servicios públicos y demás pagos fijos de cada sede. El ERP crea cada cuota, avisa antes del vencimiento y, al pagarla, registra el egreso en Cierres de caja con su comprobante.">
  {()=><PagosFijos/>}
 </SupplierShell>;
}

function PagosFijos(){
 const [tab,setTab]=useState<'calendario'|'conceptos'>('calendario'),[sedes,setSedes]=useState<Sede[]>([]),[sede,setSede]=useState(''),[mes,setMes]=useState(()=>hoyBogota().slice(0,7));
 const [cuotas,setCuotas]=useState<Cuota[]|null>(null),[conceptos,setConceptos]=useState<(Concepto&{id:string;activo:boolean})[]>([]),[cuentas,setCuentas]=useState<CashAccount[]>([]),[admin,setAdmin]=useState(false);
 const [error,setError]=useState(''),[pagar,setPagar]=useState<Cuota|null>(null),[ajustar,setAjustar]=useState<Cuota|null>(null),[editar,setEditar]=useState<Concepto|null>(null);
 const hoy=hoyBogota();
 const load=useCallback(async()=>{
  const desde=addDays(`${mes}-01`,-40),hasta=addDays(`${mes}-01`,70);
  const [{data:q,error:e},{data:c},{data:s},{data:k},{data:a}]=await Promise.all([
   supabase.rpc('pagos_fijos_listar',{p_desde:desde<addDays(hoy,-90)?desde:addDays(hoy,-90),p_hasta:hasta,p_sede:sede||null}),
   supabase.from('pagos_fijos_conceptos').select('id,sede_id,nombre,categoria,proveedor,referencia,frecuencia,primer_vencimiento,valor,valor_fijo,medio,cuenta_id,dias_aviso,notas,activo').order('nombre'),
   supabase.rpc('pagos_fijos_sedes'),supabase.rpc('cuentas_dinero_lista'),supabase.rpc('es_admin'),
  ]);
  if(e)setError(e.message);else{setError('');setCuotas((q||[]) as Cuota[]);}
  setConceptos(((c||[]) as Record<string,unknown>[]).map(x=>({...x,proveedor:String(x.proveedor||''),referencia:String(x.referencia||''),notas:String(x.notas||''),cuenta_id:String(x.cuenta_id||''),valor:String(x.valor)})) as (Concepto&{id:string;activo:boolean})[]);
  setSedes((s||[]) as Sede[]);setCuentas((Array.isArray(k)?k:[]) as CashAccount[]);setAdmin(a===true);
 },[mes,sede,hoy]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const nombreSede=(id:string)=>sedes.find(s=>s.id===id)?.nombre||'—';
 const pendientes=(cuotas||[]).filter(c=>c.estado==='pendiente');
 const grupos:[string,Cuota[],string][]=[
  ['Vencidas',pendientes.filter(c=>c.vence<hoy),'border-red-300 bg-red-50/40'],
  ['Vencen en los próximos 7 días',pendientes.filter(c=>c.vence>=hoy&&c.vence<=addDays(hoy,7)),'border-amber-300 bg-amber-50/40'],
  ['Próximas',pendientes.filter(c=>c.vence>addDays(hoy,7)&&c.vence.slice(0,7)<=mes),'border-gray-100 bg-white'],
  ['Pagadas este mes',(cuotas||[]).filter(c=>c.estado==='pagada'&&c.vence.slice(0,7)===mes),'border-emerald-200 bg-emerald-50/30'],
 ];
 const apagar=async(c:Cuota)=>{const {error:e}=await supabase.rpc('pagos_fijos_alerta_apagar',{p_id:c.id});if(e)setError(e.message);else void load();};
 const fila=(c:Cuota)=><div key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b last:border-0">
  <div className="min-w-0"><p className="font-black text-gray-900 text-sm">{c.concepto} <span className="text-xs font-bold text-gray-400">· {c.sede}</span></p>
   <p className="text-xs text-gray-500">{c.estado==='pagada'?`Pagada el ${fecha(c.pagada_fecha!)} · ${cop(c.valor_pagado||c.valor)}`:`Vence ${fecha(c.vence)} · ${cop(c.valor)}`}{c.proveedor?` · ${c.proveedor}`:''}{c.referencia?` · ref. ${c.referencia}`:''}{c.ajustada?' · ajustada':''}{c.nota?` · ${c.nota}`:''}</p></div>
  <div className="flex gap-2 flex-wrap">
   {c.estado==='pendiente'&&<><button type="button" onClick={()=>setPagar(c)} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black">Registrar pago</button>
    <button type="button" onClick={()=>setAjustar(c)} className="px-3 py-1.5 rounded-lg border text-xs font-black">Ajustar fecha o valor</button></>}
   {admin&&!c.alerta_apagada&&(c.estado==='pagada'||c.vence<=addDays(hoy,c.dias_aviso))&&<button type="button" onClick={()=>void apagar(c)} className="px-3 py-1.5 rounded-lg bg-gray-900 text-white text-xs font-black">Apagar alerta</button>}
  </div>
 </div>;
 return <div className="space-y-4">
  <div className="flex flex-wrap gap-2 items-center">
   {([['calendario','Calendario de pagos'],['conceptos',`Conceptos · ${conceptos.filter(c=>c.activo).length}`]] as const).map(([k,l])=><button key={k} type="button" onClick={()=>setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-black ${tab===k?'bg-rose-600 text-white':'bg-white border'}`}>{l}</button>)}
   <select className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas mis sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>
  </div>
  {error&&<p className="text-red-600 font-bold text-sm">{error}</p>}
  {tab==='calendario'&&(!cuotas?<p className="text-gray-400 font-bold">Cargando…</p>:<>
   <Mes mes={mes} setMes={setMes} cuotas={cuotas} hoy={hoy}/>
   {grupos.map(([t,l,cls])=>l.length>0&&<section key={t} className={`rounded-2xl border p-4 ${cls}`}><p className="font-black text-gray-900 mb-1">{t} · {l.length}</p>{l.map(fila)}</section>)}
   {!cuotas.length&&<p className="text-sm text-gray-500">Aún no hay pagos. Crea los conceptos de cada sede en la pestaña «Conceptos».</p>}
  </>)}
  {tab==='conceptos'&&<div className="space-y-3">
   <button type="button" onClick={()=>setEditar({...NUEVO,sede_id:sede||sedes[0]?.id||''})} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">Nuevo concepto</button>
   {!conceptos.length?<p className="text-sm text-gray-500">No hay conceptos. Agrega el arriendo, los servicios públicos y los demás pagos fijos de cada sede.</p>:
   <div className="grid gap-3 md:grid-cols-2">{conceptos.filter(c=>!sede||c.sede_id===sede).map(c=><article key={c.id} className={`bg-white rounded-2xl border p-4 space-y-1 ${c.activo?'border-gray-100':'border-dashed opacity-60'}`}>
    <div className="flex justify-between gap-2"><p className="font-black text-gray-900">{c.nombre}</p><span className="text-[11px] font-black text-gray-400">{c.activo?nombreSede(c.sede_id):'Pausado'}</span></div>
    <p className="text-xs text-gray-600">{c.categoria} · {FRECUENCIAS[c.frecuencia]} · día {Number(c.primer_vencimiento.slice(8,10))} · {c.valor_fijo?'':'aprox. '}{cop(Number(c.valor))} · aviso {c.dias_aviso} días antes</p>
    {(c.proveedor||c.referencia)&&<p className="text-xs text-gray-500">{[c.proveedor,c.referencia&&`ref. ${c.referencia}`].filter(Boolean).join(' · ')}</p>}
    <div className="flex gap-2 pt-1"><button type="button" onClick={()=>setEditar(c)} className="px-3 py-1.5 rounded-lg border text-xs font-black">Editar</button>
     <button type="button" onClick={()=>{if(c.activo&&!window.confirm('¿Pausar este concepto? Se anulan sus cuotas pendientes futuras; lo pagado queda igual.'))return;void supabase.rpc('pagos_fijos_concepto_activo',{p_id:c.id,p_activo:!c.activo}).then(({error:e})=>e?setError(e.message):load());}} className="px-3 py-1.5 rounded-lg border text-xs font-black">{c.activo?'Pausar':'Activar'}</button></div>
   </article>)}</div>}
  </div>}
  {editar&&<FormConcepto c={editar} sedes={sedes} cuentas={cuentas} onClose={()=>setEditar(null)} onDone={()=>{setEditar(null);void load();}}/>}
  {pagar&&<FormPago c={pagar} cuentas={cuentas} onClose={()=>setPagar(null)} onDone={()=>{setPagar(null);void load();}}/>}
  {ajustar&&<FormAjuste c={ajustar} onClose={()=>setAjustar(null)} onDone={()=>{setAjustar(null);void load();}}/>}
 </div>;
}

function Mes({mes,setMes,cuotas,hoy}:{mes:string;setMes:(m:string)=>void;cuotas:Cuota[];hoy:string}){
 const dias=useMemo(()=>{const first=new Date(`${mes}-01T12:00:00Z`),offset=(first.getUTCDay()+6)%7,n=new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
  return [...Array(offset).fill(null),...Array.from({length:n},(_,i)=>`${mes}-${String(i+1).padStart(2,'0')}`)] as (string|null)[];},[mes]);
 const mover=(n:number)=>{const d=new Date(`${mes}-15T12:00:00Z`);d.setUTCMonth(d.getUTCMonth()+n);setMes(d.toISOString().slice(0,7));};
 const titulo=new Date(`${mes}-15T12:00:00Z`).toLocaleDateString('es-CO',{month:'long',year:'numeric',timeZone:'UTC'});
 return <section className="bg-white rounded-2xl border border-gray-100 p-4">
  <div className="flex items-center justify-between mb-3"><button type="button" onClick={()=>mover(-1)} className="px-3 py-1 rounded-lg border text-sm font-black">‹</button><p className="font-black capitalize">{titulo}</p><button type="button" onClick={()=>mover(1)} className="px-3 py-1 rounded-lg border text-sm font-black">›</button></div>
  <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-black text-gray-400 mb-1">{DIAS.map(d=><span key={d}>{d}</span>)}</div>
  <div className="grid grid-cols-7 gap-1">{dias.map((d,i)=>{const del=d?cuotas.filter(c=>c.vence===d):[];
   return <div key={i} className={`min-h-16 rounded-lg p-1 text-left ${d?'border border-gray-100':''} ${d===hoy?'ring-2 ring-rose-300':''}`}>
    {d&&<p className="text-[10px] font-bold text-gray-400">{Number(d.slice(8))}</p>}
    {del.map(c=><p key={c.id} title={`${c.concepto} · ${c.sede} · ${cop(c.valor)}`} className={`text-[10px] leading-tight font-bold rounded px-1 mb-0.5 truncate ${c.estado==='pagada'?'bg-emerald-100 text-emerald-800':c.vence<hoy?'bg-red-100 text-red-700':'bg-amber-100 text-amber-800'}`}>{c.concepto}</p>)}
   </div>;})}</div>
 </section>;
}

function Modal({titulo,children,onClose}:{titulo:string;children:React.ReactNode;onClose:()=>void}){
 return <div className="fixed inset-0 z-[120] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
  <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={e=>e.stopPropagation()}>
   <p className="font-black text-lg text-gray-900">{titulo}</p>{children}
  </div>
 </div>;
}

function FormConcepto({c,sedes,cuentas,onClose,onDone}:{c:Concepto;sedes:Sede[];cuentas:CashAccount[];onClose:()=>void;onDone:()=>void}){
 const [f,setF]=useState(c),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const opciones=accountsFor(f.medio,cuentas,f.sede_id);
 const guardar=async()=>{setBusy(true);setError('');
  const {error:e}=await supabase.rpc('pagos_fijos_concepto_guardar',{p:{...f,valor:Number(String(f.valor).replace(/\D/g,'')),cuenta_id:f.medio==='Efectivo'?'':f.cuenta_id}});
  setBusy(false);if(e)setError(e.message);else onDone();};
 return <Modal titulo={c.id?'Editar concepto':'Nuevo concepto'} onClose={onClose}>
  <div className="grid sm:grid-cols-2 gap-3">
   <label className="text-xs font-bold text-gray-600">Sede<select className={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value,cuenta_id:''})}>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">Categoría<select className={input} value={f.categoria} onChange={e=>setF({...f,categoria:e.target.value})}>{CATEGORIAS.map(x=><option key={x}>{x}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Nombre<input className={input} value={f.nombre} placeholder="Ej: Energía (Enel), Arriendo local, Agua" onChange={e=>setF({...f,nombre:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Proveedor (opcional)<input className={input} value={f.proveedor} onChange={e=>setF({...f,proveedor:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Referencia de pago o n.º de cuenta (opcional)<input className={input} value={f.referencia} onChange={e=>setF({...f,referencia:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Frecuencia<select className={input} value={f.frecuencia} onChange={e=>setF({...f,frecuencia:e.target.value})}>{Object.entries(FRECUENCIAS).map(([k,l])=><option key={k} value={k}>{l}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">{f.frecuencia==='unica'?'Fecha de vencimiento':'Primer vencimiento (el día se repite)'}<input type="date" className={input} value={f.primer_vencimiento} onChange={e=>setF({...f,primer_vencimiento:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Valor<input className={input} inputMode="numeric" value={f.valor} onChange={e=>setF({...f,valor:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-xs font-bold text-gray-600">Avisar con (días de anticipación)<input type="number" min={0} max={60} className={input} value={f.dias_aviso} onChange={e=>setF({...f,dias_aviso:Number(e.target.value)})}/></label>
   <label className="flex gap-2 items-center text-sm font-bold text-gray-700 sm:col-span-2"><input type="checkbox" checked={f.valor_fijo} onChange={e=>setF({...f,valor_fijo:e.target.checked})}/>El valor es fijo (si no, es aproximado y se ajusta al llegar la factura)</label>
   <label className="text-xs font-bold text-gray-600">Medio de pago habitual<select className={input} value={f.medio} onChange={e=>setF({...f,medio:e.target.value,cuenta_id:''})}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
   {f.medio!=='Efectivo'&&opciones.length>0&&<label className="text-xs font-bold text-gray-600">Cuenta habitual<select className={input} value={f.cuenta_id} onChange={e=>setF({...f,cuenta_id:e.target.value})}><option value="">Sin cuenta</option>{opciones.map(o=><option key={o.id} value={o.id}>{accountLabel(o)}</option>)}</select></label>}
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Notas (opcional)<input className={input} value={f.notas} onChange={e=>setF({...f,notas:e.target.value})}/></label>
  </div>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!f.nombre.trim()||!f.primer_vencimiento||!f.valor||!f.sede_id} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy?'Guardando…':'Guardar'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}

function FormAjuste({c,onClose,onDone}:{c:Cuota;onClose:()=>void;onDone:()=>void}){
 const [vence,setVence]=useState(c.vence),[valor,setValor]=useState(String(Math.round(c.valor))),[nota,setNota]=useState(c.nota||''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const guardar=async()=>{setBusy(true);const {error:e}=await supabase.rpc('pagos_fijos_cuota_ajustar',{p_id:c.id,p_vence:vence,p_valor:Number(valor),p_nota:nota});setBusy(false);if(e)setError(e.message);else onDone();};
 return <Modal titulo={`Ajustar · ${c.concepto} (${c.sede})`} onClose={onClose}>
  <p className="text-xs text-gray-500">Solo cambia esta cuota; el concepto y las demás cuotas siguen igual.</p>
  <label className="block text-xs font-bold text-gray-600">Nueva fecha de vencimiento<input type="date" className={input} value={vence} onChange={e=>setVence(e.target.value)}/></label>
  <label className="block text-xs font-bold text-gray-600">Valor (por ejemplo, el de la factura)<input className={input} inputMode="numeric" value={valor} onChange={e=>setValor(e.target.value.replace(/\D/g,''))}/></label>
  <label className="block text-xs font-bold text-gray-600">Nota (opcional)<input className={input} value={nota} onChange={e=>setNota(e.target.value)}/></label>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!vence||!Number(valor)} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy?'Guardando…':'Guardar'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}

function FormPago({c,cuentas,onClose,onDone}:{c:Cuota;cuentas:CashAccount[];onClose:()=>void;onDone:()=>void}){
 const [f,setF]=useState({fecha:hoyBogota(),valor:String(Math.round(c.valor)),medio:c.medio,cuenta_id:c.cuenta_id||''}),[archivo,setArchivo]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const opciones=accountsFor(f.medio,cuentas,c.sede_id),pideCuenta=needsAccount(f.medio,opciones);
 const pagarCuota=async()=>{
  if(!archivo)return;setBusy(true);setError('');
  try{
   const {data:s}=await supabase.auth.getSession();
   const r=await fetch('/api/finanzas/pagos-fijos/comprobante',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.session?.access_token||''}`},body:JSON.stringify({cuota_id:c.id,tipo:archivo.type})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo subir el comprobante.');
   const {error:up}=await supabase.storage.from('comprobantes_caja').uploadToSignedUrl(d.ruta,d.token,archivo,{contentType:archivo.type});if(up)throw up;
   const {error:e}=await supabase.rpc('pagos_fijos_pagar',{p_id:c.id,p:{fecha:f.fecha,valor:Number(f.valor),medio:f.medio,cuenta_id:f.medio==='Efectivo'?null:f.cuenta_id||null,comprobante_path:d.ruta}});
   if(e)throw e;onDone();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo registrar el pago.');}
  setBusy(false);
 };
 return <Modal titulo={`Registrar pago · ${c.concepto} (${c.sede})`} onClose={onClose}>
  <p className="text-xs text-gray-500">Queda como egreso en Cierres de caja de la sede (categoría «{c.categoria}»), con el comprobante. La fecha debe ser de hoy o de los últimos 31 días y ese día de caja debe estar abierto.</p>
  <div className="grid sm:grid-cols-2 gap-3">
   <label className="text-xs font-bold text-gray-600">Fecha del pago<input type="date" className={input} value={f.fecha} max={hoyBogota()} onChange={e=>setF({...f,fecha:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Valor pagado<input className={input} inputMode="numeric" value={f.valor} onChange={e=>setF({...f,valor:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-xs font-bold text-gray-600">Medio<select className={input} value={f.medio} onChange={e=>setF({...f,medio:e.target.value,cuenta_id:''})}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
   {f.medio!=='Efectivo'&&opciones.length>0&&<label className="text-xs font-bold text-gray-600">¿De qué cuenta salió?<select className={input} value={f.cuenta_id} onChange={e=>setF({...f,cuenta_id:e.target.value})}><option value="">{pideCuenta?'Elige la cuenta':'Sin cuenta'}</option>{opciones.map(o=><option key={o.id} value={o.id}>{accountLabel(o)}</option>)}</select></label>}
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Comprobante (foto o PDF, obligatorio)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block mt-1 text-sm" onChange={e=>setArchivo(e.target.files?.[0]||null)}/></label>
  </div>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!archivo||!Number(f.valor)||(pideCuenta&&!f.cuenta_id)} onClick={()=>void pagarCuota()} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40">{busy?'Registrando…':'Registrar pago'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}
