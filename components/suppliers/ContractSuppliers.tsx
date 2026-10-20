'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Truck} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {bogotaDay} from '@/lib/contract-calendar';
import {bogotaDateTime,bogotaInstant,errorText,serviceActions,sumMoney,type CatalogItem,type ContractService} from '@/lib/suppliers';
import SupplierConditions from './SupplierConditions';

const ACTION_LABEL={Confirmado:'Confirmar',Realizado:'Marcar realizado',Cancelado:'Cancelar'} as const;
const STATE_STYLE:Record<string,string>={Asignado:'bg-sky-50 text-sky-700',Confirmado:'bg-indigo-50 text-indigo-700',Realizado:'bg-emerald-50 text-emerald-700',Cancelado:'bg-gray-100 text-gray-500 line-through'};

/** "Proveedores del contrato": the advisor picks service → tariff → date and assigns; values are copied from the tariff. */
export default function ContractSuppliers({contract}:{contract:{id:string;sede_id:string|null;fecha_evento?:string|null}}){
 const [services,setServices]=useState<ContractService[]>([]),[catalog,setCatalog]=useState<CatalogItem[]>([]);
 const [servicio,setServicio]=useState(''),[tarifa,setTarifa]=useState(''),[fecha,setFecha]=useState(contract.fecha_evento?.slice(0,10)||bogotaDay(new Date().toISOString())!),[hora,setHora]=useState('10:00'),[notas,setNotas]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[conditions,setConditions]=useState<{id:string;nombre:string}|null>(null),[open,setOpen]=useState(false);

 const load=useCallback(async()=>{
  try{
  const [s,c]=await Promise.all([supabase.rpc('servicios_contrato',{p_contrato:contract.id}),contract.sede_id?supabase.rpc('catalogo_proveedores',{p_sede:contract.sede_id}):Promise.resolve({data:[],error:null})]);
  if(s.error)throw s.error;
  if(c.error)throw c.error;
  setServices(s.data as ContractService[]);setCatalog(c.data as CatalogItem[]);setError('');
  }catch(e){setError(errorText(e,'No se pudieron cargar los proveedores del contrato.'));}
 },[contract.id,contract.sede_id]);
 useEffect(()=>{void load();},[load]);

 const types=useMemo(()=>[...new Set(catalog.map(c=>c.servicio))],[catalog]);
 const options=catalog.filter(c=>c.servicio===servicio);
 const picked=catalog.find(c=>c.tarifa_id===tarifa);

 const assign=async(force=false)=>{
  const when=bogotaInstant(fecha,hora);
  if(!picked||!when)return setError('Elige servicio, tarifa, fecha y hora.');
  setBusy(true);setError('');
  const {error}=await supabase.rpc('asignar_servicio_contrato',{p_contrato:contract.id,p_tarifa:picked.tarifa_id,p_fecha:when,p_notas:notas,p_forzar:force});
  setBusy(false);
  if(error){
   if(error.message.startsWith('CHOQUE_HORARIO')&&!force){
    if(confirm(error.message.replace('CHOQUE_HORARIO: ','')+'\n\n¿Asignarlo de todos modos?'))return assign(true);
    return;
   }
   return setError(error.message);
  }
  setTarifa('');setNotas('');setOpen(false);void load();
 };
 const change=async(s:ContractService,estado:'Confirmado'|'Realizado'|'Cancelado')=>{
  let motivo:string|null=null;
  if(estado==='Cancelado'){motivo=prompt(`Motivo para cancelar ${s.servicio} con ${s.proveedor}:`);if(motivo===null)return;}
  const {error}=await supabase.rpc('cambiar_estado_servicio',{p_id:s.id,p_estado:estado,p_motivo:motivo});
  if(error)setError(error.message);else void load();
 };

 const active=services.filter(s=>s.estado!=='Cancelado');
 return <section>
  <div className="flex items-center justify-between gap-3 mb-4">
   <div className="flex items-center gap-3"><div className="p-2 bg-violet-100 rounded-lg text-violet-600"><Truck className="w-5 h-5"/></div>
    <h3 className="font-black text-gray-900 text-sm uppercase tracking-wider">Proveedores del contrato</h3></div>
   <button onClick={()=>setOpen(o=>!o)} className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-[11px] font-black uppercase">{open?'Cerrar':'Asignar'}</button>
  </div>
  {error&&<p role="alert" className="mb-3 text-xs font-bold text-rose-700 bg-rose-50 rounded-xl p-3">{error}</p>}
  {open&&<div className="bg-violet-50/60 border border-violet-100 rounded-2xl p-4 space-y-3 mb-4 text-sm">
   {!contract.sede_id?<p className="text-xs font-bold text-gray-500">El contrato no tiene sede asignada.</p>:!catalog.length?<p className="text-xs font-bold text-gray-500">No hay tarifas activas de proveedores en la sede de este contrato.</p>:<>
    <label className="block"><span className="text-[10px] font-black uppercase text-gray-500">Servicio</span>
     <select className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 bg-white font-bold" value={servicio} onChange={e=>{setServicio(e.target.value);setTarifa('');}}><option value="">Selecciona…</option>{types.map(t=><option key={t}>{t}</option>)}</select></label>
    {servicio&&<label className="block"><span className="text-[10px] font-black uppercase text-gray-500">Proveedor y tarifa</span>
     <select className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 bg-white font-bold" value={tarifa} onChange={e=>setTarifa(e.target.value)}><option value="">Selecciona…</option>
      {options.map(o=><option key={o.tarifa_id} value={o.tarifa_id}>{o.proveedor}{o.recurso?` · ${o.recurso}`:''} — {money(o.valor_cliente)}</option>)}</select></label>}
    {picked&&<div className="bg-white rounded-xl border border-gray-100 p-3 text-xs space-y-1">
     <p className="text-[10px] font-black uppercase text-violet-700">Condiciones del proveedor</p>
     <p className="font-bold text-gray-800 whitespace-pre-line">{picked.descripcion||'Sin descripción'}</p>
     <p className="text-gray-500">Precio al cliente: <b>{money(picked.valor_cliente)}</b>{picked.adicional_opcional?` · Opcional: ${picked.adicional_opcional}`:''}</p>
     {picked.celular&&<p className="text-gray-500">Celular: {picked.celular}</p>}
     {picked.tiene_condiciones&&<button className="text-violet-700 font-black underline" onClick={()=>setConditions({id:picked.proveedor_id,nombre:picked.proveedor})}>Ver condiciones del proveedor</button>}
    </div>}
    <div className="grid grid-cols-2 gap-2">
     <label><span className="text-[10px] font-black uppercase text-gray-500">Fecha</span><input type="date" className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 bg-white font-bold" value={fecha} onChange={e=>setFecha(e.target.value)}/></label>
     <label><span className="text-[10px] font-black uppercase text-gray-500">Hora</span><input type="time" className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 bg-white font-bold" value={hora} onChange={e=>setHora(e.target.value)}/></label>
    </div>
    <label className="block"><span className="text-[10px] font-black uppercase text-gray-500">Lugar y notas para el proveedor</span><input className="w-full mt-1 p-2.5 rounded-xl border border-gray-200 bg-white" value={notas} maxLength={1000} onChange={e=>setNotas(e.target.value)} placeholder="Dirección o punto de encuentro"/></label>
    <button disabled={busy||!picked} onClick={()=>void assign()} className="w-full py-3 rounded-xl bg-violet-600 disabled:opacity-50 text-white text-xs font-black uppercase">{busy?'Asignando…':'Asignar proveedor'}</button>
   </>}
  </div>}
  <div className="space-y-2">
   {services.map(s=><div key={s.id} className="bg-gray-50 rounded-2xl p-4 border border-gray-100 text-sm">
    <div className="flex justify-between gap-2"><div><p className="font-black text-gray-900">{s.servicio} · {s.proveedor}</p>
     <p className="text-xs text-gray-500">{bogotaDateTime(s.fecha_servicio)}{s.recurso?` · ${s.recurso}`:''}{s.notas?` · ${s.notas}`:''}</p>
     <p className="text-xs text-gray-500">Cliente paga {money(s.valor_cliente)}{s.valor_empresa!==undefined?` · Costo ${money(s.valor_empresa)}`:''} · Pago al proveedor: {s.estado_pago}</p>
     {s.motivo_cancelacion&&<p className="text-xs text-gray-400">Cancelado: {s.motivo_cancelacion}</p>}</div>
     <span className={`h-fit px-2 py-0.5 rounded-full text-[10px] font-black ${STATE_STYLE[s.estado]||''}`}>{s.estado}</span></div>
    {serviceActions(s.estado,s.estado_pago).length>0&&<div className="flex flex-wrap gap-2 mt-2">{serviceActions(s.estado,s.estado_pago).map(a=>
     <button key={a} onClick={()=>void change(s,a)} className={`px-2.5 py-1 rounded-lg text-[11px] font-black border ${a==='Cancelado'?'border-rose-200 text-rose-600':'border-gray-200 text-gray-700 bg-white'}`}>{ACTION_LABEL[a]}</button>)}</div>}
   </div>)}
   {!services.length&&<p className="text-xs font-bold text-gray-400">Sin proveedores asignados.</p>}
   {active.length>0&&<p className="text-xs font-bold text-gray-500">Total proveedores al cliente: {money(sumMoney(active.map(s=>s.valor_cliente)))}</p>}
  </div>
  {conditions&&<SupplierConditions supplier={conditions} onClose={()=>setConditions(null)}/>}
 </section>;
}
