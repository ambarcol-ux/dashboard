'use client';
import {useCallback,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {LogOut,Truck} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {openSupplierFile} from '@/components/suppliers/SupplierShell';
import {bogotaDateTime,errorText,normalizePhone,sumMoney} from '@/lib/suppliers';

type Portal={proveedor:{id:string;codigo:string;nombre:string;tipo_servicio:string;celular:string|null;correo:string|null;banco:string|null;tipo_cuenta:string|null;numero_cuenta:string|null};
 servicios:{id:string;servicio:string;descripcion:string;recurso:string|null;fecha_servicio:string;estado:string;estado_pago:string;valor_empresa:number;numero_contrato:string;cliente:string;sede:string|null;lugar:string|null}[];
 tarifas:{codigo:string;servicio:string;descripcion:string;recurso:string|null;valor_empresa:number;sede:string}[];
 pagos:{id:string;fecha_pago:string;valor_total:number;medio_pago:string;referencia:string|null;comprobante_path:string|null;anulado:boolean}[];
 documentos:{id:string;tipo:string;titulo:string;archivo_path:string;vence_el:string|null}[]};
type Tab='servicios'|'pagos'|'documentos'|'datos';
const card='bg-white rounded-2xl border border-gray-100 p-4 shadow-sm';

/** Supplier portal: their own services, payments and shared documents only (filtered by the database for the signed-in supplier). */
export default function SupplierPortal(){
 const router=useRouter();
 const [data,setData]=useState<Portal|null>(null),[tab,setTab]=useState<Tab>('servicios'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [now,setNow]=useState(0);
 const load=useCallback(async()=>{
  try{const {data,error}=await supabase.rpc('portal_proveedor');if(error)throw error;setData(data as Portal);setNow(Date.now());setError('');}
  catch(e){setError(errorText(e,'No se pudo cargar tu portal.'));}
 },[]);
 useEffect(()=>{void load();},[load]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 const confirm=async(id:string)=>{const {error}=await supabase.rpc('confirmar_servicio_proveedor',{p_id:id});if(error)setError(error.message);else{setNotice('Asistencia confirmada.');void load();}};
 const open=(bucket:'documentos_proveedores'|'comprobantes_proveedores',path:string)=>void openSupplierFile(bucket,path).catch(e=>setError(errorText(e,'')));

 const upcoming=data?.servicios.filter(s=>Date.parse(s.fecha_servicio)>=now-6*3600000).reverse()||[];
 const past=data?.servicios.filter(s=>Date.parse(s.fecha_servicio)<now-6*3600000)||[];
 const pending=sumMoney((data?.servicios||[]).filter(s=>s.estado_pago==='Pendiente').map(s=>s.valor_empresa));
 const paid=sumMoney((data?.pagos||[]).filter(p=>!p.anulado).map(p=>p.valor_total));

 return <div className="min-h-screen bg-[#f8fafc]">
  <header className="bg-white border-b border-gray-100 px-4 py-4 flex items-center justify-between sticky top-0 z-10">
   <div className="flex items-center gap-3"><div className="p-2 bg-rose-50 text-rose-500 rounded-xl"><Truck className="w-5 h-5"/></div>
    <div><p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Portal de proveedores · Ámbar</p><h1 className="font-black text-gray-900 leading-tight">{data?.proveedor.nombre||'Cargando…'}</h1></div></div>
   <button onClick={logout} className="p-2 text-gray-400 hover:text-rose-500" aria-label="Cerrar sesión"><LogOut className="w-5 h-5"/></button>
  </header>
  <main className="max-w-2xl mx-auto p-4 space-y-4">
   {error&&<p role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 rounded-xl p-3">{error}</p>}
   {notice&&<p role="status" className="text-sm font-bold text-emerald-700 bg-emerald-50 rounded-xl p-3">{notice}</p>}
   {data&&<>
    <div className="grid grid-cols-2 gap-3">
     <div className={card}><p className="text-[10px] font-black text-gray-400 uppercase">Pendiente por pagar</p><p className="text-xl font-black text-rose-600">{money(pending)}</p></div>
     <div className={card}><p className="text-[10px] font-black text-gray-400 uppercase">Pagado</p><p className="text-xl font-black text-emerald-600">{money(paid)}</p></div>
    </div>
    <nav className="grid grid-cols-4 gap-1 bg-gray-100 p-1 rounded-2xl text-[11px] font-black">
     {(['servicios','pagos','documentos','datos'] as Tab[]).map(t=><button key={t} onClick={()=>{setTab(t);setNotice('');}} className={`py-2.5 rounded-xl capitalize ${tab===t?'bg-white text-rose-600 shadow-sm':'text-gray-500'}`}>{t==='datos'?'Mis datos':t}</button>)}
    </nav>
    {tab==='servicios'&&<div className="space-y-3">
     <h2 className="text-xs font-black text-gray-500 uppercase">Próximos ({upcoming.length})</h2>
     {upcoming.map(s=><ServiceCard key={s.id} s={s} onConfirm={()=>void confirm(s.id)}/>)}
     {!upcoming.length&&<p className="text-sm text-gray-400 font-bold">No tienes servicios próximos.</p>}
     {past.length>0&&<><h2 className="text-xs font-black text-gray-500 uppercase pt-2">Anteriores</h2>{past.map(s=><ServiceCard key={s.id} s={s}/>)}</>}
    </div>}
    {tab==='pagos'&&<div className="space-y-3">
     {data.pagos.map(p=><div key={p.id} className={`${card} ${p.anulado?'opacity-50':''}`}>
      <div className="flex justify-between"><p className="font-black">{money(p.valor_total)}</p><p className="text-xs text-gray-500">{p.fecha_pago}</p></div>
      <p className="text-xs text-gray-500">{p.medio_pago}{p.referencia?` · Ref. ${p.referencia}`:''}{p.anulado?' · Anulado':''}</p>
      {p.comprobante_path&&<button className="mt-2 text-xs font-black text-rose-600 underline" onClick={()=>open('comprobantes_proveedores',p.comprobante_path!)}>Ver comprobante</button>}
     </div>)}
     {!data.pagos.length&&<p className="text-sm text-gray-400 font-bold">Aún no hay pagos registrados.</p>}
    </div>}
    {tab==='documentos'&&<div className="space-y-3">
     {data.documentos.map(d=><div key={d.id} className={`${card} flex items-center justify-between gap-3`}>
      <div><p className="font-black text-sm">{d.titulo}</p><p className="text-xs text-gray-500">{d.tipo}{d.vence_el?` · vence ${d.vence_el}`:''}</p></div>
      <button className="px-3 py-2 rounded-xl bg-rose-500 text-white text-xs font-black" onClick={()=>open('documentos_proveedores',d.archivo_path)}>Abrir</button></div>)}
     {!data.documentos.length&&<p className="text-sm text-gray-400 font-bold">Administración aún no ha compartido documentos contigo.</p>}
    </div>}
    {tab==='datos'&&<MyData data={data} onSaved={()=>{setNotice('Datos actualizados.');void load();}} onError={setError}/>}
   </>}
  </main>
 </div>;
}

function ServiceCard({s,onConfirm}:{s:Portal['servicios'][number];onConfirm?:()=>void}){
 return <div className={card}>
  <div className="flex justify-between gap-2"><p className="font-black text-gray-900">{s.servicio}</p><span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gray-100 h-fit">{s.estado}</span></div>
  <p className="text-sm font-bold text-gray-700">{bogotaDateTime(s.fecha_servicio)}</p>
  <p className="text-xs text-gray-500">{s.cliente} · Contrato {s.numero_contrato}{s.sede?` · ${s.sede}`:''}</p>
  {(s.lugar||s.recurso)&&<p className="text-xs text-gray-500">{[s.recurso,s.lugar].filter(Boolean).join(' · ')}</p>}
  <p className="text-xs text-gray-500">Valor: {money(s.valor_empresa)} · Pago: {s.estado_pago}</p>
  {onConfirm&&s.estado==='Asignado'&&<button onClick={onConfirm} className="mt-3 w-full py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase">Confirmar asistencia</button>}
 </div>;
}

function MyData({data,onSaved,onError}:{data:Portal;onSaved:()=>void;onError:(m:string)=>void}){
 const p=data.proveedor;
 const [f,setF]=useState({celular:p.celular||'',correo:p.correo||'',banco:p.banco||'',tipo_cuenta:p.tipo_cuenta||'',numero_cuenta:p.numero_cuenta||''}),[busy,setBusy]=useState(false);
 const save=async()=>{
  const celular=normalizePhone(f.celular);
  if(celular===undefined)return onError('El celular debe tener 10 dígitos.');
  setBusy(true);
  const {error}=await supabase.rpc('actualizar_datos_proveedor',{p_datos:{...f,celular}});
  setBusy(false);
  if(error)onError(error.message);else onSaved();
 };
 const input='w-full mt-1 p-3 rounded-xl border border-gray-200 bg-white font-bold text-sm';
 return <div className="space-y-4">
  <div className={`${card} space-y-3`}>
   <p className="text-xs text-gray-500">Puedes actualizar tu celular, correo y datos bancarios para recibir los pagos.</p>
   {(['celular','correo','banco','tipo_cuenta','numero_cuenta'] as const).map(k=><label key={k} className="block"><span className="text-[10px] font-black uppercase text-gray-500">{k.replace('_',' ')}</span>
    <input className={input} value={f[k]} inputMode={k==='celular'||k==='numero_cuenta'?'numeric':undefined} onChange={e=>setF({...f,[k]:e.target.value})}/></label>)}
   <button disabled={busy} onClick={save} className="w-full py-3 rounded-xl bg-rose-500 disabled:opacity-50 text-white text-xs font-black uppercase">{busy?'Guardando…':'Guardar'}</button>
  </div>
  {data.tarifas.length>0&&<div className={`${card} space-y-2`}><h2 className="text-xs font-black text-gray-500 uppercase">Mis tarifas</h2>
   {data.tarifas.map(t=><div key={t.codigo} className="text-sm border-t border-gray-100 pt-2"><p className="font-black">{t.servicio} · {t.sede} — {money(t.valor_empresa)}</p><p className="text-xs text-gray-500">{t.descripcion}{t.recurso?` · ${t.recurso}`:''}</p></div>)}</div>}
 </div>;
}
