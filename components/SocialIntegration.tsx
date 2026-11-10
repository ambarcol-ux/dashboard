'use client';
import {useCallback,useEffect,useState} from 'react';
import {Instagram} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type Row={config:Record<string,string>;secreto_id:string|null;estado:string;ultimo_error:string|null;probado_at:string|null;webhook_token:string};
const ESTADO:Record<string,string>={sin_probar:'Sin probar',conectada:'Conectada',error:'Con error'};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'—';

/** Configuración › Integraciones › Instagram y Messenger: page, Instagram account and page token (Vault). Nothing is fixed in code, so another company can connect its own. */
export default function SocialIntegration(){
 const [row,setRow]=useState<Row|null>(null),[f,setF]=useState({page_id:'',instagram_id:''}),[token,setToken]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.from('integraciones').select('config,secreto_id,estado,ultimo_error,probado_at,webhook_token').eq('id','redes').maybeSingle();
  setRow(data as Row|null);if(data){const c=(data.config||{}) as Record<string,string>;setF({page_id:c.page_id||'',instagram_id:c.instagram_id||''});}},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const save=async()=>{setBusy('guardar');const {error}=await supabase.rpc('guardar_integracion_redes',{p_config:{page_id:f.page_id.trim(),instagram_id:f.instagram_id.trim()},p_secreto:token||null});setBusy('');
  if(error){toast.error(error.message);return;}setToken('');toast.success('Conexión guardada. Ahora pulsa «Probar conexión».');void load();};
 const test=async()=>{setBusy('probar');try{const {data}=await supabase.auth.getSession();const r=await fetch('/api/integraciones/redes',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:'{}'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo probar.');toast.success(`Conexión correcta: ${d.detalle}`);}catch(e){toast.error(e instanceof Error?e.message:'No se pudo probar.');}setBusy('');void load();};
 const origin=typeof window!=='undefined'?window.location.origin:'';
 const copy=(v:string)=>void navigator.clipboard.writeText(v).then(()=>toast.success('Copiado.')).catch(()=>toast.message(v));
 const input='w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm';
 return <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black flex items-center gap-2"><Instagram className="text-rose-500"/> Instagram y Messenger</h2>
   {row&&<span className={`text-xs font-black px-3 py-1 rounded-full ${row.estado==='conectada'?'bg-emerald-100 text-emerald-700':row.estado==='error'?'bg-rose-100 text-rose-700':'bg-gray-100 text-gray-600'}`}>{ESTADO[row.estado]||row.estado}{row.config?.nombre_pagina?` · ${row.config.nombre_pagina}`:''}{row.config?.instagram_usuario?` · @${row.config.instagram_usuario}`:''}</span>}</div>
  <p className="text-sm text-gray-500">Los mensajes de la página de Facebook y de la cuenta de Instagram unida a ella llegan a WhatsApp 304 › Chats, en la misma bandeja, y la IA los atiende igual.</p>
  <div className="grid md:grid-cols-3 gap-4">
   <label className="text-sm font-bold text-gray-700">ID de la página de Facebook<input className={input} inputMode="numeric" value={f.page_id} onChange={e=>setF({...f,page_id:e.target.value.replace(/\D/g,'')})}/></label>
   <label className="text-sm font-bold text-gray-700">ID de la cuenta de Instagram (opcional)<input className={input} inputMode="numeric" value={f.instagram_id} onChange={e=>setF({...f,instagram_id:e.target.value.replace(/\D/g,'')})} placeholder="Se completa al probar"/></label>
   <label className="text-sm font-bold text-gray-700">Token de la página<input className={input} type="password" autoComplete="new-password" value={token} onChange={e=>setToken(e.target.value)} placeholder={row?.secreto_id?'Guardado en Vault · escribe solo para cambiarlo':'Pégalo aquí'}/></label>
  </div>
  <div className="flex flex-wrap gap-2">
   <button type="button" disabled={!!busy||!f.page_id||(!row?.secreto_id&&!token)} onClick={()=>void save()} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-40">{busy==='guardar'?'Guardando…':'Guardar'}</button>
   <button type="button" disabled={!!busy||!row?.secreto_id} onClick={()=>void test()} className="px-4 py-2.5 rounded-xl bg-rose-600 text-white text-sm font-black disabled:opacity-40">{busy==='probar'?'Probando…':'Probar conexión'}</button>
  </div>
  {row&&<div className="bg-gray-50 rounded-xl p-3 text-sm"><b>Última prueba:</b> {when(row.probado_at)}{row.ultimo_error&&<span className="text-rose-600 block text-xs mt-1">{row.ultimo_error}</span>}</div>}
  {row&&<div className="space-y-2"><h3 className="font-black">Webhook en la app de Meta</h3>
   <p className="text-sm text-gray-500">En developers.facebook.com › tu app › Webhooks: para <b>Page</b> y para <b>Instagram</b>, pega esta URL y este token de verificación, y suscribe el campo <b>messages</b>.</p>
   {[['URL de devolución de llamada',`${origin}/api/meta/redes`],['Token de verificación',row.webhook_token]].map(([l,v])=><div key={l} className="flex gap-2 items-end"><label className="flex-1 text-xs font-bold text-gray-500">{l}<input readOnly className={input+' font-mono text-xs'} value={v}/></label><button type="button" onClick={()=>copy(v)} className="px-3 py-2.5 rounded-xl bg-gray-100 text-sm font-bold">Copiar</button></div>)}
  </div>}
 </section>;
}
