'use client';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import {Loader2,Mail,Plug} from 'lucide-react';
import {toast,Toaster} from 'sonner';
import {EMAIL_PROVIDERS,type EmailProviderId} from '@/lib/email-provider-list';
import WhatsappIntegration from '@/components/WhatsappIntegration';

type Row={proveedor:EmailProviderId;config:Record<string,string>;secreto_id:string|null;webhook_token:string;estado:string;ultimo_error:string|null;probado_at:string|null;sincronizado_at:string|null;sincronizados:number|null};
type Event={id:number;proveedor:string;evento:string;email:string|null;revoco:boolean;created_at:string};
const ESTADO:Record<string,string>={sin_probar:'Sin probar',conectada:'Conectada',error:'Con error'};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'—';

/** Configuración › Integraciones: interchangeable email connection (key in Vault, test, sync of authorized contacts, provider events). */
export default function IntegrationsPage(){
 const readAccess=useVerifiedAccess();
 const [user,setUser]=useState<Record<string,unknown>|null>(null),[row,setRow]=useState<Row|null>(null),[events,setEvents]=useState<Event[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState('');
 const [proveedor,setProveedor]=useState<EmailProviderId>('brevo'),[config,setConfig]=useState<Record<string,string>>({}),[secreto,setSecreto]=useState('');
 const load=async()=>{
  const access=await readAccess().catch(()=>null);
  if(!access){location.href='/login';return;}
  setUser({...access.user,...access.profile});
  if(String(access.profile?.rol||'').toLowerCase()!=='admin'){location.href='/dashboard';return;}
  const [{data:r},{data:e}]=await Promise.all([supabase.from('integraciones').select('proveedor,config,secreto_id,webhook_token,estado,ultimo_error,probado_at,sincronizado_at,sincronizados').eq('id','correo').maybeSingle(),
   supabase.from('correo_eventos').select('id,proveedor,evento,email,revoco,created_at').order('created_at',{ascending:false}).limit(20)]);
  setRow(r as Row|null);setEvents((e||[]) as Event[]);
  if(r){setProveedor(r.proveedor);setConfig(r.config||{});}
  setLoading(false);
 };
 useEffect(()=>{void load();},[]);// eslint-disable-line react-hooks/exhaustive-deps
 const p=EMAIL_PROVIDERS[proveedor],saved=row?.proveedor===proveedor&&!!row?.secreto_id;
 const save=async()=>{
  setBusy('guardar');
  const {error}=await supabase.rpc('guardar_integracion_correo',{p_proveedor:proveedor,p_config:Object.fromEntries(Object.entries(config).map(([k,v])=>[k,String(v).trim()])),p_secreto:secreto||null});
  setBusy('');
  if(error){toast.error(error.message);return;}
  setSecreto('');toast.success('Conexión guardada. Ahora pulsa «Probar conexión».');void load();
 };
 const call=async(accion:'probar'|'sincronizar')=>{
  setBusy(accion);
  try{const {data}=await supabase.auth.getSession();const r=await fetch('/api/integraciones/correo',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({accion})});
   const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');
   toast.success(accion==='probar'?`Conexión correcta: ${d.detalle}`:`${d.enviados} contactos autorizados sincronizados.`);
  }catch(e){toast.error(e instanceof Error?e.message:'No se pudo completar.');}
  setBusy('');void load();
 };
 const webhook=row&&typeof window!=='undefined'?`${window.location.origin}/api/integraciones/correo/eventos?t=${row.webhook_token}`:'';
 const logout=async()=>{await supabase.auth.signOut();location.href='/login';};
 const input='w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm';
 return <div className="min-h-screen bg-slate-50 flex"><Toaster richColors position="top-right"/><Sidebar user={user} handleLogout={logout} activePage="integraciones"/>
 <main className="flex-1 p-4 md:p-8"><div className="max-w-4xl mx-auto space-y-6">
  <div><h1 className="text-3xl font-black text-gray-900 flex items-center gap-3"><Plug className="text-rose-500"/> Integraciones</h1>
   <p className="text-gray-500 mt-2">Conexiones con servicios externos. Las claves se guardan cifradas en Vault y nunca se muestran de nuevo.</p></div>
  {loading?<div className="py-20 flex justify-center"><Loader2 className="animate-spin"/></div>:
  <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
   <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black flex items-center gap-2"><Mail className="text-rose-500"/> Correo</h2>
    {row&&<span className={`text-xs font-black px-3 py-1 rounded-full ${row.estado==='conectada'?'bg-emerald-100 text-emerald-700':row.estado==='error'?'bg-rose-100 text-rose-700':'bg-gray-100 text-gray-600'}`}>{EMAIL_PROVIDERS[row.proveedor].nombre} · {ESTADO[row.estado]||row.estado}</span>}</div>
   <p className="text-sm text-gray-500">Un proveedor activo a la vez. Cambiarlo no afecta las automatizaciones ni los envíos: solo cambia por dónde salen. Los correos actuales de citas y aliados no cambian.</p>
   <div className="grid md:grid-cols-2 gap-4">
    <label className="text-sm font-bold text-gray-700">Proveedor<select className={input} value={proveedor} onChange={e=>{setProveedor(e.target.value as EmailProviderId);setSecreto('');}}>{(Object.keys(EMAIL_PROVIDERS) as EmailProviderId[]).map(k=><option key={k} value={k}>{EMAIL_PROVIDERS[k].nombre}</option>)}</select></label>
    <label className="text-sm font-bold text-gray-700">{p.secreto}<input className={input} type="password" autoComplete="new-password" value={secreto} onChange={e=>setSecreto(e.target.value)} placeholder={saved?'Guardada en Vault · escribe solo para cambiarla':'Pégala aquí'}/></label>
    <label className="text-sm font-bold text-gray-700">Nombre del remitente<input className={input} value={config.remitente_nombre||''} onChange={e=>setConfig({...config,remitente_nombre:e.target.value})} placeholder="Ámbar Couture"/></label>
    <label className="text-sm font-bold text-gray-700">Correo del remitente<input className={input} type="email" value={config.remitente_email||''} onChange={e=>setConfig({...config,remitente_email:e.target.value})} placeholder="hola@tudominio.com"/></label>
    {p.campos.map(f=><label key={f.key} className="text-sm font-bold text-gray-700">{f.label}<input className={input} value={config[f.key]||''} onChange={e=>setConfig({...config,[f.key]:e.target.value})} placeholder={f.placeholder}/></label>)}
   </div>
   <p className="text-xs text-gray-500">{p.ayuda}</p>
   <div className="flex flex-wrap gap-2">
    <button type="button" disabled={!!busy||(!saved&&!secreto)} onClick={()=>void save()} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-40">{busy==='guardar'?'Guardando…':'Guardar'}</button>
    <button type="button" disabled={!!busy||!row?.secreto_id||row.proveedor!==proveedor} onClick={()=>void call('probar')} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy==='probar'?'Probando…':'Probar conexión'}</button>
    {p.sincroniza&&<button type="button" disabled={!!busy||row?.estado!=='conectada'||row.proveedor!==proveedor} onClick={()=>void call('sincronizar')} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40">{busy==='sincronizar'?'Sincronizando…':'Sincronizar autorizadas'}</button>}
   </div>
   {row&&<dl className="grid sm:grid-cols-3 gap-3 text-sm">
    <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Última prueba</dt><dd className="font-bold">{when(row.probado_at)}</dd>{row.ultimo_error&&<dd className="text-rose-600 text-xs mt-1">{row.ultimo_error}</dd>}</div>
    <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Última sincronización</dt><dd className="font-bold">{when(row.sincronizado_at)}{row.sincronizados!=null?` · ${row.sincronizados} contactos`:''}</dd></div>
    <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Solo se sincronizan</dt><dd className="font-bold">Personas con autorización comercial vigente</dd></div>
   </dl>}
   {row&&EMAIL_PROVIDERS[row.proveedor].eventos&&<div className="space-y-2"><h3 className="font-black">Eventos del proveedor (bajas y spam)</h3>
    <p className="text-sm text-gray-500">Pega esta URL como webhook en {EMAIL_PROVIDERS[row.proveedor].nombre} (eventos: baja y spam). Cuando alguien se da de baja, el ERP retira su autorización comercial.</p>
    <div className="flex gap-2"><input readOnly className={input+' font-mono text-xs'} value={webhook}/><button type="button" onClick={()=>void navigator.clipboard.writeText(webhook).then(()=>toast.success('URL copiada.')).catch(()=>toast.message(webhook))} className="px-3 rounded-xl bg-gray-100 text-sm font-bold">Copiar</button></div>
    {events.length?<ul className="text-sm divide-y">{events.map(e=><li key={e.id} className="py-2 flex flex-wrap gap-2 justify-between"><span>{e.evento} · {e.email||'—'}</span><span className="text-gray-500">{e.revoco?'Autorización retirada · ':''}{when(e.created_at)}</span></li>)}</ul>:<p className="text-sm text-gray-400">Aún no llegan eventos.</p>}
   </div>}
  </section>}
  {!loading&&<WhatsappIntegration/>}
 </div></main></div>;
}
