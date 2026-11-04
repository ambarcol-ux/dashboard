import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {CONFIRMATION_TEMPLATES} from '@/lib/first-visit-messaging';
export const dynamic='force-dynamic';

/** Templates the ERP sends; the first three are required, the detailed confirmations fall back to the short one. */
const REQUIRED=['ambar_confirmacion_cita','ambar_recordatorio_cita','ambar_post_cita_asistencia'];
const OPTIONAL=[CONFIRMATION_TEMPLATES.presencial,CONFIRMATION_TEMPLATES.virtual];

/** Configuración › Integraciones › WhatsApp: «Probar conexión» checks token, number, account and approved templates. Admin only. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  const {data:admin}=auth.user?await userDb.rpc('es_admin'):{data:false};
  if(admin!==true)return publicReply({error:'Solo administración puede usar las integraciones.'},403);
  const db=publicServerClient(),version=process.env.META_GRAPH_VERSION||'v21.0';
  const body=await request.json().catch(()=>({})) as Record<string,unknown>;
  // Coexistence (WhatsApp Business app number): Meta's Embedded Signup returns a code; exchange it, subscribe the app and save the number.
  if(body.accion==='registro'){
   const code=String(body.code||''),appId=String(body.app_id||''),secret=process.env.META_APP_SECRET||'';
   const waba=String(body.waba_id||'');let phoneId=String(body.phone_number_id||'');
   if(!code||!/^\d{5,30}$/.test(appId))return publicReply({error:'Falta el código de Meta o el ID de la app.'},400);
   if(!secret)return publicReply({error:'Falta META_APP_SECRET en Vercel.'},503);
   const ex=await fetch(`https://graph.facebook.com/${version}/oauth/access_token?${new URLSearchParams({client_id:appId,client_secret:secret,code})}`,{signal:AbortSignal.timeout(15000)});
   const exd=await ex.json().catch(()=>({})) as {access_token?:string;error?:{message?:string}};
   if(!ex.ok||!exd.access_token)return publicReply({error:`Meta no aceptó el código: ${String(exd.error?.message||'').slice(0,160)}. Revisa que el ID de la app corresponda a META_APP_SECRET.`},400);
   const tk=exd.access_token,call=async(path:string,init?:RequestInit)=>{const r=await fetch(`https://graph.facebook.com/${version}/${path}`,{...init,headers:{Authorization:`Bearer ${tk}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});return {ok:r.ok,d:await r.json().catch(()=>({})) as Record<string,unknown>};};
   if(!/^\d+$/.test(waba))return publicReply({error:'Meta no devolvió la cuenta de WhatsApp Business. Repite la conexión.'},400);
   if(!/^\d+$/.test(phoneId)){
    const list=await call(`${waba}/phone_numbers?fields=id,display_phone_number`);
    const nums=(list.d.data as {id:string;display_phone_number:string}[])||[];
    const pick=nums.find(n=>n.display_phone_number.replace(/\D/g,'').endsWith(String(body.numero||'').replace(/\D/g,'').slice(-10)))||(nums.length===1?nums[0]:null);
    if(!pick)return publicReply({error:'No se pudo identificar el número en la cuenta. Escribe el ID del número a mano.'},400);
    phoneId=pick.id;
   }
   const sub=await call(`${waba}/subscribed_apps`,{method:'POST'});
   if(!sub.ok)return publicReply({error:'No se pudo suscribir la app a la cuenta de WhatsApp Business.'},400);
   // Brings the phone's contacts and recent chats into the platform (only allowed right after onboarding).
   for(const sync_type of ['smb_app_state_sync','history'])await call(`${phoneId}/smb_app_data`,{method:'POST',body:JSON.stringify({messaging_product:'whatsapp',sync_type})}).catch(()=>null);
   const {data:prev}=await db.rpc('integracion_whatsapp_servidor');
   const pc=(prev?.config||{}) as Record<string,string>;
   const {error:se}=await userDb.rpc('guardar_integracion_whatsapp',{p_config:{numero_visible:String(body.numero||pc.numero_visible||''),phone_number_id:phoneId,waba_id:waba,idioma_plantillas:pc.idioma_plantillas||process.env.META_WA_TEMPLATE_LANG||'es_CO',idioma_confirmacion:pc.idioma_confirmacion||process.env.META_WA_CONFIRMATION_LANG||'es',coexistencia:'si'},p_secreto:tk});
   if(se)return publicReply({error:se.message},400);
   return publicReply({ok:true,phone_number_id:phoneId,waba_id:waba});
  }
  const {data:row}=await db.rpc('integracion_whatsapp_servidor');
  // Number change to another WhatsApp Business account: copies the ERP templates (same name, language, category and content) from one account to the other.
  if(body.accion==='copiar_plantillas'){
   const origen=String(body.origen||''),destino=String(body.destino||''),tk=String(row?.secreto||process.env.META_WA_TOKEN||'');
   if(!/^\d{5,30}$/.test(origen)||!/^\d{5,30}$/.test(destino)||origen===destino)return publicReply({error:'Escribe el ID de la cuenta de origen y el de la cuenta de destino (solo números, distintos).'},400);
   if(!tk)return publicReply({error:'No hay token de WhatsApp configurado.'},503);
   const call=async(path:string,init?:RequestInit)=>{const r=await fetch(`https://graph.facebook.com/${version}/${path}`,{...init,headers:{Authorization:`Bearer ${tk}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(15000)});return {ok:r.ok,d:await r.json().catch(()=>({})) as Record<string,unknown>};};
   const msg=(d:Record<string,unknown>)=>String((d.error as {error_user_msg?:string;message?:string})?.error_user_msg||(d.error as {message?:string})?.message||'').slice(0,200);
   const src=await call(`${origen}/message_templates?fields=name,language,category,components,status&limit=200`);
   if(!src.ok)return publicReply({error:`No se pudieron leer las plantillas de la cuenta de origen: ${msg(src.d)}`},400);
   const dst=await call(`${destino}/message_templates?fields=name,language,status&limit=200`);
   if(!dst.ok){
    // Diagnosis: which WhatsApp Business accounts the token was granted (Meta's debug_token, app credentials; the token itself is never returned).
    let cuentas='';
    const secret=process.env.META_APP_SECRET||'',appId=/^\d{5,30}$/.test(String(body.app_id||''))?String(body.app_id):'1368813161329466';
    if(secret){const dbg=await fetch(`https://graph.facebook.com/${version}/debug_token?${new URLSearchParams({input_token:tk,access_token:`${appId}|${secret}`})}`,{signal:AbortSignal.timeout(15000)}).then(r=>r.json()).catch(()=>null) as {data?:{app_id?:string;granular_scopes?:{scope:string;target_ids?:string[]}[]}}|null;
     const ids=[...new Set((dbg?.data?.granular_scopes||[]).filter(s=>s.scope.startsWith('whatsapp_business')).flatMap(s=>s.target_ids||[]))];
     if(dbg?.data)cuentas=` El token es de la app ${dbg.data.app_id||'—'} y tiene acceso a: ${ids.length?ids.join(', '):'ninguna cuenta específica'}.`;}
    return publicReply({error:`El token no tiene acceso a la cuenta de destino.${cuentas} Detalle de Meta: ${msg(dst.d)}`},400);
   }
   const have=new Set(((dst.d.data as {name:string;language:string}[])||[]).map(t=>`${t.name}|${t.language}`));
   const wanted=new Set([...REQUIRED,...OPTIONAL]);
   type Tpl={name:string;language:string;category:string;status:string;components:Record<string,unknown>[]};
   const list=((src.d.data as Tpl[])||[]).filter(t=>wanted.has(t.name)&&t.status==='APPROVED');
   const resultado:{plantilla:string;estado:string}[]=[];
   for(const t of list){
    const key=`${t.name} (${t.language})`;
    if(have.has(`${t.name}|${t.language}`)){resultado.push({plantilla:key,estado:'Ya existía'});continue;}
    const r=await call(`${destino}/message_templates`,{method:'POST',body:JSON.stringify({name:t.name,language:t.language,category:t.category,allow_category_change:true,components:t.components})});
    resultado.push({plantilla:key,estado:r.ok?`Enviada a revisión (${String(r.d.status||'PENDING')})`:`Error: ${msg(r.d)}`});
   }
   const faltan=[...wanted].filter(n=>!list.some(t=>t.name===n));
   return publicReply({ok:true,resultado,sin_origen:faltan});
  }
  const cfg=(row?.config||{}) as Record<string,string>,token=String(row?.secreto||'');
  if(!token||!cfg.phone_number_id||!cfg.waba_id)return publicReply({error:'Primero guarda el número, la cuenta y el token.'},400);
  const get=async(path:string)=>{const r=await fetch(`https://graph.facebook.com/${version}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));return {ok:r.ok,d:d as Record<string,unknown>};};
  const fail=async(error:string)=>{await db.from('integraciones').update({estado:'error',ultimo_error:error,probado_at:new Date().toISOString()}).eq('id','whatsapp');return publicReply({error},400);};
  const phone=await get(`${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`);
  if(!phone.ok)return fail(`Meta no reconoce el número o el token: ${String((phone.d.error as {message?:string})?.message||'').slice(0,160)}`);
  const numbers=await get(`${cfg.waba_id}/phone_numbers?fields=id`);
  if(!numbers.ok)return fail('El token no tiene acceso a esa cuenta de WhatsApp Business.');
  if(!((numbers.d.data as {id:string}[])||[]).some(n=>n.id===cfg.phone_number_id))return fail('Ese número no pertenece a esa cuenta de WhatsApp Business.');
  // Delivery statuses and button replies reach the ERP only if the account is subscribed to the token's app (idempotent).
  const sub=await fetch(`https://graph.facebook.com/${version}/${cfg.waba_id}/subscribed_apps`,{method:'POST',headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)}).then(r=>r.ok).catch(()=>false);
  if(!sub)return fail('No se pudo suscribir la app a esa cuenta de WhatsApp Business (las respuestas no llegarían al ERP).');
  const templates=await get(`${cfg.waba_id}/message_templates?fields=name,status,language&limit=200`);
  if(!templates.ok)return fail('No se pudieron leer las plantillas de la cuenta.');
  const approved=new Set(((templates.d.data as {name:string;status:string}[])||[]).filter(t=>t.status==='APPROVED').map(t=>t.name));
  const missing=REQUIRED.filter(t=>!approved.has(t)),optional=OPTIONAL.filter(t=>!approved.has(t));
  if(missing.length)return fail(`Faltan plantillas aprobadas en esa cuenta: ${missing.join(', ')}.`);
  await db.from('integraciones').update({estado:'conectada',ultimo_error:optional.length?`Aviso: sin aprobar ${optional.join(', ')} (se usa la confirmación corta).`:null,probado_at:new Date().toISOString()}).eq('id','whatsapp');
  return publicReply({ok:true,detalle:`${String(phone.d.verified_name||'')} · ${String(phone.d.display_phone_number||'')} · calidad ${String(phone.d.quality_rating||'—')}`,avisos:optional});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
