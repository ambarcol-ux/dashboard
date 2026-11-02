'use client';
import {useCallback,useEffect,useState} from 'react';
import {MessageCircle} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type Row={config:Record<string,unknown>;secreto_id:string|null;estado:string;ultimo_error:string|null;probado_at:string|null};
const ESTADO:Record<string,string>={sin_probar:'Sin probar',conectada:'Conectada',error:'Con error'};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'—';

/** Configuración › Integraciones › WhatsApp: number, account, token (Vault) and template languages. Until tested, the ERP keeps using the Vercel variables. */
export default function WhatsappIntegration(){
 const [row,setRow]=useState<Row|null>(null),[f,setF]=useState({numero_visible:'',phone_number_id:'',waba_id:'',idioma_plantillas:'es_CO',idioma_confirmacion:'es'}),[token,setToken]=useState(''),[busy,setBusy]=useState('');
 const load=useCallback(async()=>{const {data}=await supabase.from('integraciones').select('config,secreto_id,estado,ultimo_error,probado_at').eq('id','whatsapp').maybeSingle();
  setRow(data as Row|null);if(data){const c=data.config as Record<string,string>;setF({numero_visible:c.numero_visible||'',phone_number_id:c.phone_number_id||'',waba_id:c.waba_id||'',idioma_plantillas:c.idioma_plantillas||'es_CO',idioma_confirmacion:c.idioma_confirmacion||'es'});}},[]);
 useEffect(()=>{void load();},[load]);
 const save=async()=>{setBusy('guardar');const {error}=await supabase.rpc('guardar_integracion_whatsapp',{p_config:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v.trim()])),p_secreto:token||null});setBusy('');
  if(error){toast.error(error.message);return;}setToken('');toast.success('Guardado. Pulsa «Probar conexión»: hasta entonces el ERP sigue usando la configuración anterior.');void load();};
 const test=async()=>{setBusy('probar');try{const {data}=await supabase.auth.getSession();const r=await fetch('/api/integraciones/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:'{}'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo probar.');toast.success(`Conectada: ${d.detalle}. Desde ahora el ERP envía por este número.`);}catch(e){toast.error(e instanceof Error?e.message:'No se pudo probar.');}setBusy('');void load();};
 const input='w-full mt-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5 text-sm';
 const field=(k:keyof typeof f,label:string,ph?:string)=><label className="text-sm font-bold text-gray-700">{label}<input className={input} value={f[k]} placeholder={ph} onChange={e=>setF({...f,[k]:e.target.value})}/></label>;
 const anteriores=Array.isArray(row?.config?.anteriores)?(row!.config.anteriores as string[]):[];
 return <section className="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6 space-y-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-black flex items-center gap-2"><MessageCircle className="text-emerald-600"/> WhatsApp</h2>
   <span className={`text-xs font-black px-3 py-1 rounded-full ${row?.estado==='conectada'?'bg-emerald-100 text-emerald-700':row?.estado==='error'?'bg-rose-100 text-rose-700':'bg-gray-100 text-gray-600'}`}>{row?ESTADO[row.estado]||row.estado:'Usando la configuración de Vercel'}</span></div>
  <p className="text-sm text-gray-500">Número que envía confirmaciones, recordatorios y post-cita. Mientras no esté «Conectada», el ERP sigue enviando con la configuración actual. Al cambiar de número, el anterior se sigue escuchando para no perder respuestas.</p>
  <div className="grid md:grid-cols-2 gap-4">
   {field('numero_visible','Número visible','Ej: +57 301 730 7411')}
   {field('phone_number_id','ID del número (phone_number_id)','Solo números')}
   {field('waba_id','ID de la cuenta de WhatsApp Business (WABA)','Solo números')}
   <label className="text-sm font-bold text-gray-700">Token de acceso<input className={input} type="password" autoComplete="new-password" value={token} onChange={e=>setToken(e.target.value)} placeholder={row?.secreto_id?'Guardado en Vault · escribe solo para cambiarlo':'Pégalo aquí'}/></label>
   {field('idioma_plantillas','Idioma de plantillas','es_CO')}
   {field('idioma_confirmacion','Idioma de la confirmación detallada','es')}
  </div>
  <p className="text-xs text-gray-500">Los IDs están en Meta › WhatsApp Manager › Configuración de la API (o en Business Settings › Cuentas de WhatsApp). Usa un token permanente de usuario del sistema con permisos de WhatsApp.</p>
  <div className="flex flex-wrap gap-2">
   <button type="button" disabled={!!busy||(!row?.secreto_id&&!token)} onClick={()=>void save()} className="px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-40">{busy==='guardar'?'Guardando…':'Guardar'}</button>
   <button type="button" disabled={!!busy||!row?.secreto_id} onClick={()=>void test()} className="px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40">{busy==='probar'?'Probando…':'Probar conexión'}</button>
  </div>
  {row&&<dl className="grid sm:grid-cols-2 gap-3 text-sm">
   <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Última prueba</dt><dd className="font-bold">{when(row.probado_at)}</dd>{row.ultimo_error&&<dd className={`text-xs mt-1 ${row.estado==='error'?'text-rose-600':'text-amber-700'}`}>{row.ultimo_error}</dd>}</div>
   <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Números anteriores que se siguen escuchando</dt><dd className="font-bold">{anteriores.length?anteriores.join(', '):'—'}</dd></div>
  </dl>}
 </section>;
}
