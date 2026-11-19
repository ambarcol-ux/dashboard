'use client';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import Sidebar from '@/components/Sidebar';
import {KeyRound,Loader2,ShieldCheck} from 'lucide-react';
import {toast,Toaster} from 'sonner';
import SiigoParams from '@/components/SiigoParams';

export default function SiigoConfigPage(){
  const readAccess = useVerifiedAccess();
 const [user,setUser]=useState<any>(null),[sedes,setSedes]=useState<any[]>([]),[configs,setConfigs]=useState<any[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState<string|null>(null);
 const [forms,setForms]=useState<Record<string,any>>({});
 const load=async()=>{
  setLoading(true);
  const access = await readAccess().catch(() => null);
  if(!access){location.href='/login';return;}
  const {user:u,profile:p}=access;
  setUser({...u,...p});
  if(String(p?.rol||'').toLowerCase()!=='admin'){location.href='/dashboard';return;}
  const [{data:s},{data:c,error}]=await Promise.all([supabase.from('sedes').select('id,nombre,activo').eq('activo',true).order('nombre'),supabase.rpc('listar_configuracion_siigo')]);
  if(error)toast.error(error.message);
  setSedes(s||[]);setConfigs(c||[]);
  const next:Record<string,any>={};
  (s||[]).forEach((site:any)=>{const x=(c||[]).find((v:any)=>v.sede_id===site.id);next[site.id]={usuario_api:x?.usuario_api||'',access_key:'',partner_id:x?.partner_id||'',producto_codigo:x?.producto_codigo||'ALQUILER-VESTIDO',producto_nombre:x?.producto_nombre||'Alquiler de Vestido'};});
  setForms(next);setLoading(false);
 };
 useEffect(()=>{void load();},[]);
 const save=async(id:string)=>{
  const f=forms[id]; if(!f?.access_key){toast.error('Escribe el Access Key de esta sede.');return;}
  setSaving(id);
  const {error}=await supabase.rpc('configurar_siigo_sede',{p_sede_id:id,p_usuario_api:f.usuario_api,p_access_key:f.access_key,p_partner_id:f.partner_id,p_producto_codigo:f.producto_codigo,p_producto_nombre:f.producto_nombre});
  if(error)toast.error(error.message);else{toast.success('Credenciales guardadas de forma independiente para esta sede.');await load();}
  setSaving(null);
 };
 const logout=async()=>{await supabase.auth.signOut();location.href='/login';};
 return <div className="min-h-screen bg-slate-50 flex"><Toaster richColors position="top-right"/><Sidebar user={user} handleLogout={logout} activePage="config"/>
 <main className="flex-1 p-4 md:p-8"><div className="max-w-5xl mx-auto space-y-6">
  <div><h1 className="text-3xl font-black text-gray-900 flex items-center gap-3"><KeyRound className="text-rose-500"/> Facturación por sede</h1><p className="text-gray-500 mt-2">Cada sede usa sus propias credenciales de Siigo. El Access Key guardado nunca vuelve a mostrarse.</p></div>
  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-800 text-sm flex gap-3"><ShieldCheck/>Producto contable genérico: <b>Alquiler de Vestido</b>. La referencia real del vestido se enviará como descripción/nota, no como inventario contable.</div>
  {loading?<div className="py-20 flex justify-center"><Loader2 className="animate-spin"/></div>:<div className="grid gap-5">{sedes.map(s=>{const f=forms[s.id]||{};const cfg=configs.find(c=>c.sede_id===s.id);return <section key={s.id} className="bg-white border border-gray-100 rounded-3xl p-6 shadow-sm">
   <div className="flex justify-between gap-3 mb-5"><div><h2 className="text-xl font-black">{s.nombre}</h2><p className="text-xs text-gray-400">{cfg?.access_key_configurada?'● Access Key configurado':'○ Sin credenciales'}</p></div></div>
   <div className="grid md:grid-cols-2 gap-4">
    <label className="text-sm font-bold">Usuario API<input className="mt-2 w-full border rounded-xl p-3" value={f.usuario_api||''} onChange={e=>setForms(v=>({...v,[s.id]:{...f,usuario_api:e.target.value}}))}/></label>
    <label className="text-sm font-bold">Partner-ID<input className="mt-2 w-full border rounded-xl p-3" value={f.partner_id||''} onChange={e=>setForms(v=>({...v,[s.id]:{...f,partner_id:e.target.value}}))}/></label>
    <label className="text-sm font-bold">Access Key<input type="password" autoComplete="new-password" className="mt-2 w-full border rounded-xl p-3" value={f.access_key||''} placeholder={cfg?.access_key_configurada?'Escribe uno nuevo solo para reemplazarlo':'Access Key de Siigo'} onChange={e=>setForms(v=>({...v,[s.id]:{...f,access_key:e.target.value}}))}/></label>
    <label className="text-sm font-bold">Código producto genérico<input className="mt-2 w-full border rounded-xl p-3" value={f.producto_codigo||''} onChange={e=>setForms(v=>({...v,[s.id]:{...f,producto_codigo:e.target.value}}))}/></label>
    <label className="text-sm font-bold md:col-span-2">Nombre producto<input className="mt-2 w-full border rounded-xl p-3" value={f.producto_nombre||''} onChange={e=>setForms(v=>({...v,[s.id]:{...f,producto_nombre:e.target.value}}))}/></label>
   </div><button disabled={saving===s.id} onClick={()=>void save(s.id)} className="mt-5 px-5 py-3 bg-rose-500 text-white rounded-xl font-black">{saving===s.id?'Guardando…':'Guardar credenciales de '+s.nombre}</button>
   <SiigoParams sede={s.id} configurada={!!cfg?.access_key_configurada}/>
  </section>})}</div>}
 </div></main></div>;
}
