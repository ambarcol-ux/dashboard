'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {MessageCircle} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';

type FBLogin={authResponse?:{code?:string}|null};
type FBSdk={init:(o:Record<string,unknown>)=>void;login:(cb:(r:FBLogin)=>void,o:Record<string,unknown>)=>void};
declare global{interface Window{FB?:FBSdk;fbAsyncInit?:()=>void}}
/** Loads Meta's JavaScript SDK once (needed for Embedded Signup). */
const loadSdk=(appId:string)=>new Promise<FBSdk>((resolve,reject)=>{
 const init=()=>{window.FB!.init({appId,autoLogAppEvents:true,xfbml:false,version:'v21.0'});resolve(window.FB!);};
 if(window.FB){init();return;}
 window.fbAsyncInit=init;
 const tag=document.createElement('script');tag.src='https://connect.facebook.net/es_LA/sdk.js';tag.async=true;tag.crossOrigin='anonymous';tag.onerror=()=>reject(Error('No se pudo cargar Facebook. Revisa bloqueadores del navegador.'));document.body.appendChild(tag);
});
type Row={config:Record<string,unknown>;secreto_id:string|null;estado:string;ultimo_error:string|null;probado_at:string|null};
const ESTADO:Record<string,string>={sin_probar:'Sin probar',conectada:'Conectada',error:'Con error'};
const when=(v:string|null)=>v?new Date(v).toLocaleString('es-CO',{timeZone:'America/Bogota'}):'—';

/** Configuración › Integraciones › WhatsApp: number, account, token (Vault) and template languages. Until tested, the ERP keeps using the Vercel variables. */
export default function WhatsappIntegration(){
 const [row,setRow]=useState<Row|null>(null),[f,setF]=useState({numero_visible:'',phone_number_id:'',waba_id:'',idioma_plantillas:'es_CO',idioma_confirmacion:'es'}),[token,setToken]=useState(''),[busy,setBusy]=useState('');
 const [coex,setCoex]=useState({app_id:'1368813161329466',config_id:'',numero:'+57 301 730 7411'}),signup=useRef<{waba?:string;phone?:string}>({});
 useEffect(()=>{const on=(e:MessageEvent)=>{try{if(!new URL(e.origin).hostname.endsWith('facebook.com'))return;const d=typeof e.data==='string'?JSON.parse(e.data):e.data;
  if(d?.type==='WA_EMBEDDED_SIGNUP'){signup.current={waba:d.data?.waba_id||signup.current.waba,phone:d.data?.phone_number_id||signup.current.phone};if(String(d.event||'').startsWith('CANCEL'))toast.message('Conexión cancelada en Meta.');}}catch{/* other messages */}};
  window.addEventListener('message',on);return()=>window.removeEventListener('message',on);},[]);
 const load=useCallback(async()=>{const {data}=await supabase.from('integraciones').select('config,secreto_id,estado,ultimo_error,probado_at').eq('id','whatsapp').maybeSingle();
  setRow(data as Row|null);if(data){const c=data.config as Record<string,string>;setF({numero_visible:c.numero_visible||'',phone_number_id:c.phone_number_id||'',waba_id:c.waba_id||'',idioma_plantillas:c.idioma_plantillas||'es_CO',idioma_confirmacion:c.idioma_confirmacion||'es'});}},[]);
 useEffect(()=>{void load();},[load]);
 const save=async()=>{setBusy('guardar');const {error}=await supabase.rpc('guardar_integracion_whatsapp',{p_config:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,v.trim()])),p_secreto:token||null});setBusy('');
  if(error){toast.error(error.message);return;}setToken('');toast.success('Guardado. Pulsa «Probar conexión»: hasta entonces el ERP sigue usando la configuración anterior.');void load();};
 const test=async()=>{setBusy('probar');try{const {data}=await supabase.auth.getSession();const r=await fetch('/api/integraciones/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:'{}'});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo probar.');toast.success(`Conectada: ${d.detalle}. Desde ahora el ERP envía por este número.`);}catch(e){toast.error(e instanceof Error?e.message:'No se pudo probar.');}setBusy('');void load();};
const connect=async()=>{
  if(!/^\d{5,30}$/.test(coex.app_id)||!/^\d{5,30}$/.test(coex.config_id)){toast.error('Escribe el ID de la app y el ID de configuración (solo números).');return;}
  setBusy('conectar');signup.current={};
  try{
   const fb=await loadSdk(coex.app_id);
   fb.login(resp=>{const code=resp.authResponse?.code;if(!code){setBusy('');toast.message('No se completó la conexión en Meta.');return;}
    void (async()=>{try{
     await new Promise(r=>setTimeout(r,1200));
     const {data}=await supabase.auth.getSession();
     const r=await fetch('/api/integraciones/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({accion:'registro',code,app_id:coex.app_id,waba_id:signup.current.waba,phone_number_id:signup.current.phone,numero:coex.numero})});
     const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo guardar la conexión.');
     toast.success('Número conectado y guardado. Ahora pulsa «Probar conexión».');void load();
    }catch(e){toast.error(e instanceof Error?e.message:'No se pudo guardar la conexión.');}finally{setBusy('');}})();
   },{config_id:coex.config_id,response_type:'code',override_default_response_type:true,extras:{setup:{},featureType:'whatsapp_business_app_onboarding',sessionInfoVersion:'3'}});
  }catch(e){setBusy('');toast.error(e instanceof Error?e.message:'No se pudo abrir Meta.');}
 };
 // Copy the ERP templates to another WhatsApp Business account (number change).
 const [copia,setCopia]=useState({origen:'1276534877505186',destino:''}),[copiaRes,setCopiaRes]=useState<{plantilla:string;estado:string}[]|null>(null);
 const copyTemplates=async()=>{setBusy('copiar');setCopiaRes(null);try{const {data}=await supabase.auth.getSession();
  const r=await fetch('/api/integraciones/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({accion:'copiar_plantillas',origen:copia.origen.trim(),destino:copia.destino.trim()})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudieron copiar.');setCopiaRes(d.resultado||[]);
  toast.success(d.sin_origen?.length?`Listo. No estaban aprobadas en el origen: ${d.sin_origen.join(', ')}.`:'Plantillas enviadas a la cuenta de destino.');}catch(e){toast.error(e instanceof Error?e.message:'No se pudieron copiar.');}setBusy('');};
 // Submit the follow-up and allies templates to Meta (no need to type them in WhatsApp Manager).
 const [nuevasRes,setNuevasRes]=useState<{plantilla:string;estado:string}[]|null>(null);
 const createTemplates=async()=>{setBusy('crear');setNuevasRes(null);try{const {data}=await supabase.auth.getSession();
  const r=await fetch('/api/integraciones/whatsapp',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({accion:'crear_plantillas'})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudieron crear.');setNuevasRes(d.resultado||[]);toast.success('Listo. Meta revisa las plantillas (de minutos a 24 horas).');}catch(e){toast.error(e instanceof Error?e.message:'No se pudieron crear.');}setBusy('');};
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
  <details className="border border-emerald-100 bg-emerald-50/50 rounded-2xl p-4"><summary className="cursor-pointer font-black text-sm">Conectar un número de WhatsApp Business (coexistencia)</summary>
   <p className="text-sm text-gray-600 mt-2">El número sigue funcionando en el celular y además envía desde el ERP. En Meta elige la cuenta de WhatsApp Business donde están las plantillas, la opción «Conectar tu app de WhatsApp Business» y escanea el código QR con el celular del número.</p>
   <div className="grid md:grid-cols-3 gap-3 mt-3">
    <label className="text-sm font-bold text-gray-700">ID de la app de Meta<input className={input} value={coex.app_id} onChange={e=>setCoex({...coex,app_id:e.target.value.trim()})}/></label>
    <label className="text-sm font-bold text-gray-700">ID de configuración (registro)<input className={input} value={coex.config_id} placeholder="Inicio de sesión para empresas" onChange={e=>setCoex({...coex,config_id:e.target.value.trim()})}/></label>
    <label className="text-sm font-bold text-gray-700">Número a conectar<input className={input} value={coex.numero} onChange={e=>setCoex({...coex,numero:e.target.value})}/></label>
   </div>
   <button type="button" disabled={!!busy} onClick={()=>void connect()} className="mt-3 px-4 py-2.5 rounded-xl bg-[#1877f2] text-white text-sm font-black disabled:opacity-40">{busy==='conectar'?'Conectando…':'Conectar con Meta'}</button>
  </details>
  <div className="border border-emerald-200 bg-emerald-50/50 rounded-2xl p-4">
   <p className="font-black text-sm">Plantillas de seguimiento y aliados</p>
   <p className="text-sm text-gray-600 mt-1">Envía a Meta para aprobación: ambar_seguimiento_promo, ambar_seguimiento_v2, ambar_aliado_recordatorio y ambar_aliado_bienvenida_v2. Las que ya existan no se tocan.</p>
   <button type="button" disabled={!!busy} onClick={()=>void createTemplates()} className="mt-3 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-black disabled:opacity-40">{busy==='crear'?'Enviando…':'Crear plantillas en Meta'}</button>
   {nuevasRes&&<ul className="mt-3 text-sm space-y-1">{nuevasRes.map(r=><li key={r.plantilla}><b>{r.plantilla}:</b> {r.estado}</li>)}</ul>}
  </div>
  <details className="border border-gray-200 bg-gray-50/50 rounded-2xl p-4"><summary className="cursor-pointer font-black text-sm">Copiar plantillas a otra cuenta de WhatsApp Business</summary>
   <p className="text-sm text-gray-600 mt-2">Si el nuevo número está en otra cuenta, copia ahí las plantillas que usa el ERP (mismo nombre, idioma y texto). Meta las revisa de nuevo; las que ya existan no se tocan.</p>
   <div className="grid md:grid-cols-2 gap-3 mt-3">
    <label className="text-sm font-bold text-gray-700">ID de la cuenta de origen<input className={input} value={copia.origen} onChange={e=>setCopia({...copia,origen:e.target.value})}/></label>
    <label className="text-sm font-bold text-gray-700">ID de la cuenta de destino<input className={input} value={copia.destino} placeholder="Solo números" onChange={e=>setCopia({...copia,destino:e.target.value})}/></label>
   </div>
   <button type="button" disabled={!!busy||!copia.destino.trim()} onClick={()=>void copyTemplates()} className="mt-3 px-4 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black disabled:opacity-40">{busy==='copiar'?'Copiando…':'Copiar plantillas'}</button>
   {copiaRes&&<ul className="mt-3 text-sm space-y-1">{copiaRes.length?copiaRes.map(r=><li key={r.plantilla}><b>{r.plantilla}:</b> {r.estado}</li>):<li>No había plantillas aprobadas para copiar.</li>}</ul>}
  </details>
  {row&&<dl className="grid sm:grid-cols-2 gap-3 text-sm">
   <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Última prueba</dt><dd className="font-bold">{when(row.probado_at)}</dd>{row.ultimo_error&&<dd className={`text-xs mt-1 ${row.estado==='error'?'text-rose-600':'text-amber-700'}`}>{row.ultimo_error}</dd>}</div>
   <div className="bg-gray-50 rounded-xl p-3"><dt className="text-xs font-bold text-gray-500">Números anteriores que se siguen escuchando</dt><dd className="font-bold">{anteriores.length?anteriores.join(', '):'—'}</dd></div>
  </dl>}
 </section>;
}
