'use client';
import {useCallback,useEffect,useState} from 'react';
import {Music2} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type Row={config:{client_key?:string;cuenta?:string;auditada?:boolean;conectado_at?:string};secreto_id:string|null;estado:string;ultimo_error:string|null;probado_at:string|null};
const ESTADO:Record<string,string>={sin_probar:'Sin conectar',conectada:'Conectada',error:'Con error'};

/** Configuración › Integraciones › TikTok: app keys (secret in Vault), login with the brand's account, test and «app audited» switch. */
export default function TiktokIntegration(){
 const [row,setRow]=useState<Row|null>(null),[key,setKey]=useState(''),[secret,setSecret]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.from('integraciones').select('config,secreto_id,estado,ultimo_error,probado_at').eq('id','tiktok').maybeSingle();
  setRow(data as Row|null);if(data?.config?.client_key)setKey(String(data.config.client_key));},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);
  // Back from TikTok's login: ?tiktok=ok or the error.
  const q=new URLSearchParams(window.location.search).get('tiktok');
  if(q){if(q==='ok')toast.success('TikTok conectado. Pulsa «Probar conexión».');else toast.error(q);window.history.replaceState(null,'',window.location.pathname);}
  return()=>clearTimeout(t);},[load]);
 const api=async(body:Record<string,unknown>)=>{const {data}=await supabase.auth.getSession();
  const r=await fetch('/api/integraciones/tiktok',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d;};
 const act=async(k:string,fn:()=>Promise<void>)=>{setBusy(k);try{await fn();}catch(e){toast.error(e instanceof Error?e.message:'Error');}setBusy('');void load();};
 const save=()=>act('guardar',async()=>{const {error}=await supabase.rpc('guardar_integracion_tiktok',{p_client_key:key.trim(),p_client_secret:secret||null});if(error)throw error;setSecret('');toast.success('Claves guardadas. Ahora pulsa «Conectar TikTok».');});
 const conectar=()=>act('conectar',async()=>{const d=await api({accion:'conectar'});window.location.href=d.url;});
 const probar=()=>act('probar',async()=>{const d=await api({accion:'probar'});toast.success(d.detalle);});
 const auditada=(v:boolean)=>act('auditada',async()=>{await api({accion:'auditada',auditada:v});toast.success(v?'Se publicará en público.':'Se publicará en privado.');});
 const origin=typeof window!=='undefined'?window.location.origin:'';
 const input='w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm';
 return <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black flex items-center gap-2"><Music2/> TikTok</h2>
   <span className={`text-xs font-black px-3 py-1 rounded-full ${row?.estado==='conectada'?'bg-emerald-100 text-emerald-700':row?.estado==='error'?'bg-rose-100 text-rose-700':'bg-gray-100 text-gray-600'}`}>{row?ESTADO[row.estado]||row.estado:'Sin configurar'}{row?.config?.cuenta?` · ${row.config.cuenta}`:''}</span></div>
  <p className="text-sm text-gray-500">El Estudio de contenido publica en TikTok videos y fotos. Crea una app en developers.tiktok.com con el producto «Content Posting API» (Direct Post), pega aquí sus claves y conecta la cuenta de Ámbar.</p>
  <div className="grid md:grid-cols-2 gap-4">
   <label className="text-sm font-bold text-gray-700">Client key<input className={input} value={key} onChange={e=>setKey(e.target.value.trim())}/></label>
   <label className="text-sm font-bold text-gray-700">Client secret<input className={input} type="password" autoComplete="new-password" value={secret} onChange={e=>setSecret(e.target.value)} placeholder={row?.secreto_id?'Guardado en Vault · escribe solo para cambiarlo':'Pégalo aquí'}/></label>
  </div>
  <div className="text-xs text-gray-500 space-y-1">
   <p>En la app de TikTok, «Redirect URI»: <b className="break-all">{origin}/api/integraciones/tiktok/callback</b></p>
   <p>Para las fotos, verifica en TikTok (URL properties) el prefijo: <b className="break-all">{origin}/api/marketing/media</b></p>
  </div>
  <div className="flex flex-wrap gap-2">
   <button type="button" disabled={!!busy||!key||(!row?.secreto_id&&!secret)} onClick={()=>void save()} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-40">{busy==='guardar'?'Guardando…':'Guardar'}</button>
   <button type="button" disabled={!!busy||!row?.secreto_id} onClick={()=>void conectar()} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy==='conectar'?'Abriendo TikTok…':row?.config?.conectado_at?'Reconectar TikTok':'Conectar TikTok'}</button>
   <button type="button" disabled={!!busy||!row?.config?.conectado_at} onClick={()=>void probar()} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40">{busy==='probar'?'Probando…':'Probar conexión'}</button>
  </div>
  {row?.config?.conectado_at&&<label className="flex gap-2 items-start text-sm text-gray-700"><input type="checkbox" className="mt-1" checked={!!row.config.auditada} disabled={!!busy} onChange={e=>void auditada(e.target.checked)}/>
   TikTok ya auditó la app (publicar en público). Mientras no esté marcada, el ERP sube las publicaciones en privado y tú las haces públicas en la app.</label>}
  {row?.ultimo_error&&<p className="text-xs text-rose-600">{row.ultimo_error}</p>}
 </section>;
}
