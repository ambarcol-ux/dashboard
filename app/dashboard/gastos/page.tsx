'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Receipt} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {CASH_METHODS,accountsFor,accountLabel,needsAccount,type CashAccount} from '@/lib/cash';

type Sede={id:string;nombre:string};
type Gasto={id:string;sede_id:string|null;sede:string;clase:'gasto'|'retiro_utilidades';categoria:string;fecha:string;valor:number;medio:string;cuenta:string|null;
 beneficiario:string|null;descripcion:string;comprobante_path:string;anulado:boolean;motivo_anulacion:string|null;registrado_por:string|null};
type Mov={id:string;fecha:string;tipo:'traslado'|'prestamo'|'devolucion';origen:string;destino:string;cuenta_origen:string;cuenta_destino:string;valor:number;
 descripcion:string|null;comprobante_path:string;anulado:boolean;motivo_anulacion:string|null};
type Deuda={deudor:string;acreedor:string;saldo:number};
const CATEGORIAS=['Nómina y prestaciones','Arriendo','Servicios públicos','Internet y telefonía','Publicidad y redes','Transporte y envíos','Compras e insumos',
 'Mantenimiento y arreglos','Honorarios (contador, abogado)','Software y suscripciones','Impuestos','Gastos bancarios','Seguros','Papelería y aseo','Otro gasto'];
const TIPOS:Record<Mov['tipo'],string>={traslado:'Traslado',prestamo:'Préstamo',devolucion:'Devolución de préstamo'};
const input='border border-gray-200 rounded-xl px-3 py-2 text-sm w-full bg-white';
const cop=(n:number)=>`$${Math.round(n).toLocaleString('es-CO')}`;
const hoyBogota=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const fecha=(d:string)=>new Date(d+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'});
const finMes=(m:string)=>{const [y,mm]=m.split('-').map(Number);return new Date(Date.UTC(y,mm,0)).toISOString().slice(0,10);};

async function api(body:Record<string,unknown>){
 const {data:s}=await supabase.auth.getSession();
 const r=await fetch('/api/finanzas/gastos/comprobante',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.session?.access_token||''}`},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo continuar.');return d;
}
async function subir(archivo:File,datos:Record<string,unknown>){
 const d=await api({...datos,tipo:archivo.type});
 const {error}=await supabase.storage.from('comprobantes_caja').uploadToSignedUrl(d.ruta,d.token,archivo,{contentType:archivo.type});
 if(error)throw error;return String(d.ruta);
}
const verComprobante=async(path:string)=>{try{const d=await api({accion:'ver',path});window.open(d.url,'_blank','noopener');}catch(e){alert(e instanceof Error?e.message:'No se pudo abrir.');}};

/** Finanzas › Gastos: expenses of each store and of the administration (with receipt; when paid from a store's cash or account they
 *  also go to its Cierres de caja), profit withdrawals, and transfers or loans between stores with what each store owes. */
export default function GastosPage(){
 return <SupplierShell activePage="gastos" crumb="Finanzas / Gastos" title="Gastos y movimientos entre sedes" icon={<Receipt/>}
  description="Registra los gastos de cada sede y de la administración con su comprobante, los retiros de utilidades y los traslados o préstamos entre sedes. Lo que sale de la caja o la cuenta de una sede queda también en sus Cierres de caja.">
  {()=><Gastos/>}
 </SupplierShell>;
}

function Gastos(){
 const [tab,setTab]=useState<'gastos'|'sedes'>(()=>typeof window!=='undefined'&&new URLSearchParams(window.location.search).get('v')==='sedes'?'sedes':'gastos'),[mes,setMes]=useState(()=>hoyBogota().slice(0,7)),[filtro,setFiltro]=useState('todas');
 const [gastos,setGastos]=useState<Gasto[]|null>(null),[movs,setMovs]=useState<Mov[]>([]),[deudas,setDeudas]=useState<Deuda[]>([]),[finanzas,setFinanzas]=useState(false);
 const [sedes,setSedes]=useState<Sede[]>([]),[cuentas,setCuentas]=useState<CashAccount[]>([]),[error,setError]=useState('');
 const [nuevo,setNuevo]=useState(false),[nuevoMov,setNuevoMov]=useState(false);
 const load=useCallback(async()=>{
  const desde=`${mes}-01`,hasta=finMes(mes);
  const [{data:g,error:e},{data:s},{data:k},{data:m,error:em}]=await Promise.all([supabase.rpc('gastos_listar',{p_desde:desde,p_hasta:hasta}),supabase.rpc('gastos_sedes'),
   supabase.rpc('cuentas_dinero_lista'),supabase.rpc('entre_sedes_listar',{p_desde:desde,p_hasta:hasta})]);
  if(e)setError(e.message);else{setError('');setGastos((g||[]) as Gasto[]);}
  setSedes((s||[]) as Sede[]);setCuentas((Array.isArray(k)?k:[]) as CashAccount[]);
  setFinanzas(!em);if(!em&&m){const x=m as {movimientos:Mov[];deudas:Deuda[]};setMovs(x.movimientos||[]);setDeudas(x.deudas||[]);}
 },[mes]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const visibles=useMemo(()=>(gastos||[]).filter(g=>filtro==='todas'||(filtro==='admin'?!g.sede_id:g.sede_id===filtro)),[gastos,filtro]);
 const activos=visibles.filter(g=>!g.anulado),soloGastos=activos.filter(g=>g.clase==='gasto'),retiros=activos.filter(g=>g.clase==='retiro_utilidades');
 const porCategoria=Object.entries(soloGastos.reduce<Record<string,number>>((a,g)=>({...a,[g.categoria]:(a[g.categoria]||0)+Number(g.valor)}),{})).sort((a,b)=>b[1]-a[1]);
 const porSede=Object.entries(soloGastos.reduce<Record<string,number>>((a,g)=>({...a,[g.sede]:(a[g.sede]||0)+Number(g.valor)}),{})).sort((a,b)=>b[1]-a[1]);
 const anular=async(fn:'gastos_anular'|'entre_sedes_anular',id:string)=>{
  const motivo=prompt('Motivo de la anulación (también se anula en Cierres de caja):');if(!motivo)return;
  const {error:e}=await supabase.rpc(fn,{p_id:id,p_motivo:motivo});if(e)alert(e.message);else void load();
 };
 const tabBtn=(k:typeof tab,l:string)=><button key={k} type="button" onClick={()=>setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-black ${tab===k?'bg-rose-600 text-white':'border bg-white text-gray-600'}`}>{l}</button>;
 return <div className="space-y-4">
  <div className="flex flex-wrap gap-2 items-center">{tabBtn('gastos','Gastos')}{finanzas&&tabBtn('sedes','Entre sedes')}
   <input type="month" className={`${input} w-auto`} value={mes} onChange={e=>e.target.value&&setMes(e.target.value)}/>
   {tab==='gastos'&&<select className={`${input} w-auto`} value={filtro} onChange={e=>setFiltro(e.target.value)}><option value="todas">Todas</option>{finanzas&&<option value="admin">Administración</option>}{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>}
   <button type="button" onClick={()=>tab==='gastos'?setNuevo(true):setNuevoMov(true)} className="ml-auto px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">{tab==='gastos'?'+ Registrar gasto':'+ Registrar movimiento'}</button></div>
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}
  {tab==='gastos'&&<>
   <div className="grid sm:grid-cols-3 gap-3">
    <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Gastos del mes</p><p className="text-2xl font-black text-gray-900">{cop(soloGastos.reduce((a,g)=>a+Number(g.valor),0))}</p><p className="text-xs text-gray-400">{soloGastos.length} registros</p></div>
    <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Por sede</p>{porSede.length?porSede.map(([k,v])=><p key={k} className="text-sm flex justify-between"><span>{k}</span><b>{cop(v)}</b></p>):<p className="text-sm text-gray-400">—</p>}</div>
    <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Retiros de utilidades</p><p className="text-2xl font-black text-violet-700">{cop(retiros.reduce((a,g)=>a+Number(g.valor),0))}</p><p className="text-xs text-gray-400">Aparte de los gastos</p></div>
   </div>
   {porCategoria.length>0&&<div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500 mb-2">Por categoría</p><div className="grid sm:grid-cols-2 gap-x-6">{porCategoria.map(([k,v])=><p key={k} className="text-sm flex justify-between border-b py-1"><span>{k}</span><b>{cop(v)}</b></p>)}</div></div>}
   <div className="bg-white rounded-2xl border p-4">
    {!gastos?<p className="text-sm text-gray-400">Cargando…</p>:!visibles.length?<p className="text-sm text-gray-400">No hay gastos en este mes.</p>:visibles.map(g=><div key={g.id} className={`flex flex-wrap justify-between gap-2 py-2 border-b last:border-0 ${g.anulado?'opacity-50 line-through':''}`}>
     <div className="min-w-0"><p className="font-black text-sm text-gray-900">{g.clase==='retiro_utilidades'?'💜 ':''}{g.categoria} · {cop(g.valor)} <span className="text-xs font-bold text-gray-400">· {g.sede} · {fecha(g.fecha)}</span></p>
      <p className="text-xs text-gray-500">{g.descripcion}{g.beneficiario?` · ${g.beneficiario}`:''} · {g.medio}{g.cuenta?` · ${g.cuenta}`:''}{g.registrado_por?` · por ${g.registrado_por}`:''}{g.anulado&&g.motivo_anulacion?` · anulado: ${g.motivo_anulacion}`:''}</p></div>
     <div className="flex gap-2"><button type="button" onClick={()=>void verComprobante(g.comprobante_path)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-gray-600">Comprobante</button>
      {!g.anulado&&<button type="button" onClick={()=>void anular('gastos_anular',g.id)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-red-600">Anular</button>}</div></div>)}
   </div></>}
  {tab==='sedes'&&finanzas&&<>
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500 mb-2">Préstamos pendientes entre sedes</p>
    {deudas.length?deudas.map(d=><p key={d.deudor+d.acreedor} className="text-sm"><b>{d.deudor}</b> le debe a <b>{d.acreedor}</b>: <b className="text-red-600">{cop(d.saldo)}</b></p>):<p className="text-sm text-gray-400">Ninguna sede le debe a otra.</p>}</div>
   <div className="bg-white rounded-2xl border p-4">{!movs.length?<p className="text-sm text-gray-400">No hay movimientos entre sedes en este mes.</p>:movs.map(m=><div key={m.id} className={`flex flex-wrap justify-between gap-2 py-2 border-b last:border-0 ${m.anulado?'opacity-50 line-through':''}`}>
    <div><p className="font-black text-sm text-gray-900">{TIPOS[m.tipo]} · {cop(m.valor)} <span className="text-xs font-bold text-gray-400">· {fecha(m.fecha)}</span></p>
     <p className="text-xs text-gray-500">{m.origen} ({m.cuenta_origen}) → {m.destino} ({m.cuenta_destino}){m.descripcion?` · ${m.descripcion}`:''}{m.anulado&&m.motivo_anulacion?` · anulado: ${m.motivo_anulacion}`:''}</p></div>
    <div className="flex gap-2"><button type="button" onClick={()=>void verComprobante(m.comprobante_path)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-gray-600">Comprobante</button>
     {!m.anulado&&<button type="button" onClick={()=>void anular('entre_sedes_anular',m.id)} className="px-3 py-1.5 rounded-xl border text-xs font-black text-red-600">Anular</button>}</div></div>)}</div></>}
  {nuevo&&<FormGasto sedes={sedes} cuentas={cuentas} finanzas={finanzas} onClose={()=>setNuevo(false)} onDone={()=>{setNuevo(false);void load();}}/>}
  {nuevoMov&&<FormMovimiento cuentas={cuentas} onClose={()=>setNuevoMov(false)} onDone={()=>{setNuevoMov(false);void load();}}/>}
 </div>;
}

function Modal({titulo,children,onClose}:{titulo:string;children:React.ReactNode;onClose:()=>void}){
 return <div className="fixed inset-0 z-[120] bg-black/40 flex items-end sm:items-center justify-center p-3" onClick={onClose}>
  <div className="bg-white rounded-2xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-3" onClick={e=>e.stopPropagation()}>
   <p className="font-black text-lg text-gray-900">{titulo}</p>{children}
  </div>
 </div>;
}

function FormGasto({sedes,cuentas,finanzas,onClose,onDone}:{sedes:Sede[];cuentas:CashAccount[];finanzas:boolean;onClose:()=>void;onDone:()=>void}){
 const [f,setF]=useState({clase:'gasto',sede_id:sedes.length===1&&!finanzas?sedes[0].id:'',categoria:CATEGORIAS[0],fecha:hoyBogota(),valor:'',medio:'Transferencia',cuenta_id:'',beneficiario:'',descripcion:''});
 const [archivo,setArchivo]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 // Administration expenses can be paid from any bank account; a store's from its own or the shared ones.
 const opciones=f.sede_id?accountsFor(f.medio,cuentas,f.sede_id):cuentas.filter(c=>c.activo&&c.tipo!=='efectivo');
 const pideCuenta=needsAccount(f.medio,opciones),sinSede=!f.sede_id&&f.medio==='Efectivo';
 const guardar=async()=>{
  if(!archivo)return;setBusy(true);setError('');
  try{
   const cuenta=f.medio==='Efectivo'?null:f.cuenta_id||null;
   const ruta=await subir(archivo,{sede_id:f.sede_id||null,cuenta_id:cuenta,medio:f.medio});
   const {error:e}=await supabase.rpc('gastos_registrar',{p:{...f,sede_id:f.sede_id||null,cuenta_id:cuenta,valor:Number(f.valor),comprobante_path:ruta}});
   if(e)throw e;onDone();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo registrar el gasto.');}
  setBusy(false);
 };
 return <Modal titulo="Registrar gasto" onClose={onClose}>
  <p className="text-xs text-gray-500">Si sale de la caja o de una cuenta de una sede, queda también como egreso en sus Cierres de caja: la fecha debe ser de los últimos 31 días y ese día de caja debe estar abierto.</p>
  <div className="grid sm:grid-cols-2 gap-3">
   {finanzas&&<label className="text-xs font-bold text-gray-600">Tipo<select className={input} value={f.clase} onChange={e=>setF({...f,clase:e.target.value})}><option value="gasto">Gasto</option><option value="retiro_utilidades">Retiro de utilidades (socios)</option></select></label>}
   <label className="text-xs font-bold text-gray-600">¿De quién es el gasto?<select className={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value,cuenta_id:''})}>{finanzas?<option value="">Administración general</option>:<option value="">Elige la sede</option>}{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   {f.clase==='gasto'&&<label className="text-xs font-bold text-gray-600">Categoría<select className={input} value={f.categoria} onChange={e=>setF({...f,categoria:e.target.value})}>{CATEGORIAS.map(c=><option key={c}>{c}</option>)}</select></label>}
   <label className="text-xs font-bold text-gray-600">Fecha<input type="date" className={input} value={f.fecha} max={hoyBogota()} onChange={e=>setF({...f,fecha:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600">Valor<input className={input} inputMode="numeric" value={f.valor} onChange={e=>setF({...f,valor:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-xs font-bold text-gray-600">Medio<select className={input} value={f.medio} onChange={e=>setF({...f,medio:e.target.value,cuenta_id:''})}>{CASH_METHODS.map(m=><option key={m}>{m}</option>)}</select></label>
   {f.medio!=='Efectivo'&&opciones.length>0&&<label className="text-xs font-bold text-gray-600">¿De qué cuenta salió?<select className={input} value={f.cuenta_id} onChange={e=>setF({...f,cuenta_id:e.target.value})}><option value="">{pideCuenta?'Elige la cuenta':'Sin cuenta'}</option>{opciones.map(o=><option key={o.id} value={o.id}>{accountLabel(o)}{o.sede&&!f.sede_id?` (${o.sede})`:''}</option>)}</select></label>}
   <label className="text-xs font-bold text-gray-600">A quién se pagó<input className={input} maxLength={120} value={f.beneficiario} onChange={e=>setF({...f,beneficiario:e.target.value})} placeholder="Proveedor, persona o entidad"/></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Descripción<input className={input} maxLength={500} value={f.descripcion} onChange={e=>setF({...f,descripcion:e.target.value})} placeholder="Ej.: pago honorarios contador noviembre"/></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Comprobante (foto o PDF, obligatorio)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block mt-1 text-sm" onChange={e=>setArchivo(e.target.files?.[0]||null)}/></label>
  </div>
  {sinSede&&<p className="text-amber-700 text-xs font-bold">Un gasto en efectivo sale de la caja menor de una sede: elige la sede.</p>}
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!archivo||!Number(f.valor)||f.descripcion.trim().length<3||(pideCuenta&&!f.cuenta_id)||sinSede||(!finanzas&&!f.sede_id)} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy?'Registrando…':'Registrar gasto'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}

function FormMovimiento({cuentas,onClose,onDone}:{cuentas:CashAccount[];onClose:()=>void;onDone:()=>void}){
 const [f,setF]=useState({tipo:'prestamo',fecha:hoyBogota(),valor:'',cuenta_origen:'',cuenta_destino:'',descripcion:''});
 const [archivo,setArchivo]=useState<File|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const deSede=cuentas.filter(c=>c.activo&&c.sede_id);
 const origen=deSede.find(c=>c.id===f.cuenta_origen),destinos=deSede.filter(c=>!origen||c.sede_id!==origen.sede_id);
 const etiqueta=(c:CashAccount)=>`${c.sede} · ${c.tipo==='efectivo'?'Caja menor (efectivo)':accountLabel(c)}`;
 const guardar=async()=>{
  if(!archivo)return;setBusy(true);setError('');
  try{
   const ruta=await subir(archivo,{entre_sedes:true,cuenta_id:f.cuenta_origen});
   const {error:e}=await supabase.rpc('entre_sedes_registrar',{p:{...f,valor:Number(f.valor),comprobante_path:ruta}});
   if(e)throw e;onDone();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo registrar.');}
  setBusy(false);
 };
 return <Modal titulo="Movimiento entre sedes" onClose={onClose}>
  <p className="text-xs text-gray-500">Sale de la caja o cuenta de origen y entra a la de destino (queda en los Cierres de caja de ambas sedes). No cuenta como venta ni como gasto. Los préstamos quedan como deuda hasta que registres su devolución.</p>
  <div className="grid sm:grid-cols-2 gap-3">
   <label className="text-xs font-bold text-gray-600">Tipo<select className={input} value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value})}>{Object.entries(TIPOS).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">Fecha<input type="date" className={input} value={f.fecha} max={hoyBogota()} onChange={e=>setF({...f,fecha:e.target.value})}/></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Sale de<select className={input} value={f.cuenta_origen} onChange={e=>setF({...f,cuenta_origen:e.target.value,cuenta_destino:''})}><option value="">Elige la caja o cuenta</option>{deSede.map(c=><option key={c.id} value={c.id}>{etiqueta(c)}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Entra a<select className={input} value={f.cuenta_destino} onChange={e=>setF({...f,cuenta_destino:e.target.value})}><option value="">Elige la caja o cuenta</option>{destinos.map(c=><option key={c.id} value={c.id}>{etiqueta(c)}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">Valor<input className={input} inputMode="numeric" value={f.valor} onChange={e=>setF({...f,valor:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-xs font-bold text-gray-600">Nota<input className={input} maxLength={500} value={f.descripcion} onChange={e=>setF({...f,descripcion:e.target.value})} placeholder="Para qué es"/></label>
   <label className="text-xs font-bold text-gray-600 sm:col-span-2">Comprobante (foto o PDF, obligatorio)<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="block mt-1 text-sm" onChange={e=>setArchivo(e.target.files?.[0]||null)}/></label>
  </div>
  {error&&<p className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="flex gap-2"><button type="button" disabled={busy||!archivo||!Number(f.valor)||!f.cuenta_origen||!f.cuenta_destino} onClick={()=>void guardar()} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy?'Registrando…':'Registrar'}</button>
   <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border text-sm font-black text-gray-600">Cancelar</button></div>
 </Modal>;
}
