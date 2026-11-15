import {Buffer} from 'node:buffer';
import type {SupabaseClient} from '@supabase/supabase-js';

/** Ventas y CRM › WhatsApp 304: stores what customers write, what is answered from the phone (coexistence echoes) and delivery statuses. */
type Value=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Payload={entry?:{changes?:{field?:string;value?:Value}[]}[]};

const LABELS:Record<string,string>={image:'📷 Foto',audio:'🎤 Audio',video:'🎬 Video',document:'📄 Documento',sticker:'Sticker',location:'📍 Ubicación',contacts:'👤 Contacto',reaction:'Reacción'};
/** Readable text of any WhatsApp message (media is shown as a label: it stays on the phone). */
export function messageText(m:Value):string{
 if(m.type==='text')return String(m.text?.body||'');
 if(m.type==='button')return String(m.button?.text||m.button?.payload||'');
 if(m.type==='interactive')return String(m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||'');
 if(m.type==='reaction')return `Reacción ${m.reaction?.emoji||''}`.trim();
 if(m.type==='location')return `📍 Ubicación${m.location?.name?`: ${m.location.name}`:''}`;
 const caption=m[m.type]?.caption||m[m.type]?.filename;
 return `${LABELS[m.type]||'Mensaje'}${caption?`: ${caption}`:''}`;
}
export const digits=(v:unknown)=>String(v||'').replace(/\D/g,'');
const when=(ts:unknown)=>{const n=Number(ts);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():new Date().toISOString();};

/** Finds or creates the chat of a phone; a new chat takes the name and sede from the customer's visits and contracts. */
export async function conversationFor(db:SupabaseClient,phone:string,profileName?:string|null){
 const {data:found}=await db.from('whatsapp_conversaciones').select('id,nombre,sede_id,no_leidos').eq('telefono',phone).maybeSingle();
 if(found)return found as {id:string;nombre:string|null;sede_id:string|null;no_leidos:number};
 const {data:ctx}=await db.rpc('whatsapp_contexto_servidor',{p_tel:phone});
 const c=(ctx||{}) as {nombre?:string|null;sede_id?:string|null};
 const {data,error}=await db.from('whatsapp_conversaciones').upsert({telefono:phone,nombre:c.nombre||profileName||null,sede_id:c.sede_id||null},{onConflict:'telefono',ignoreDuplicates:false}).select('id,nombre,sede_id,no_leidos').single();
 if(error)throw error;
 return data as {id:string;nombre:string|null;sede_id:string|null;no_leidos:number};
}

/** Saves the events of one webhook call. Returns the chats with new customer messages (for the AI suggestion) and the ads they came from. */
export async function storeInboxEvents(db:SupabaseClient,data:Payload,accepted:string[]){
 const touched=new Set<string>(),ads:{conversacion:string;anuncio:string}[]=[],acciones:{conversacion:string;telefono:string;sede_id:string|null;accion:string}[]=[],escritos:{conversacion:string;telefono:string;wa_id:string;texto:string}[]=[];
 for(const entry of data.entry||[])for(const change of entry.changes||[]){
  const v=change.value;if(!v||(accepted.length&&!accepted.includes(String(v.metadata?.phone_number_id||''))))continue;
  const names=new Map<string,string>((v.contacts||[]).map((c:Value)=>[digits(c.wa_id),String(c.profile?.name||'')]));
  // Customer messages.
  for(const m of v.messages||[]){
   const phone=digits(m.from);if(!/^\d{8,15}$/.test(phone)||!m.id)continue;
   const conv=await conversationFor(db,phone,names.get(phone));
   const text=messageText(m).slice(0,4000),at=when(m.timestamp);
   const {error}=await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:String(m.id),direccion:'entrante',origen:'clienta',tipo:String(m.type||'text'),texto:text,created_at:at,
    // Photos keep their WhatsApp id so the AI can look at them when suggesting the reply.
    ...(m.type==='image'&&m.image?.id?{media_id:String(m.image.id),media_tipo:String(m.image.mime_type||'image/jpeg')}:{})});
   if(error){if(error.code==='23505')continue;throw error;}
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:text.slice(0,200),ultimo_at:at,ultimo_entrante_at:at,no_leidos:(conv.no_leidos||0)+1,...(!conv.nombre&&names.get(phone)?{nombre:names.get(phone)}:{})}).eq('id',conv.id);
   conv.no_leidos=(conv.no_leidos||0)+1;
   // Click-to-WhatsApp ad: Meta sends the ad id with the first message; the latest ad is kept (last touch).
   const ref=m.referral;
   if(ref?.source_id&&/^\d+$/.test(String(ref.source_id))&&(!ref.source_type||ref.source_type==='ad')){
    await db.from('whatsapp_conversaciones').update({anuncio_id:String(ref.source_id),anuncio_titulo:String(ref.headline||ref.body||'').slice(0,300)||null,anuncio_url:String(ref.source_url||'').slice(0,500)||null,ctwa_clid:ref.ctwa_clid?String(ref.ctwa_clid).slice(0,300):null,anuncio_at:at}).eq('id',conv.id);
    ads.push({conversacion:conv.id,anuncio:String(ref.source_id)});
   }
   // Buttons of the automatic first-visit messages (Asistí, Sí alquilé, Confirmo, motives…) are handled by the ERP: the AI does not answer them.
   const accion=String(m.button?.payload||m.interactive?.button_reply?.id||m.interactive?.list_reply?.id||'');
   const flowReply=/^(pc|rc|mot|cc|sat|fa|rs|rg|cf|r2|crm|pr|evs|evf)_/.test(accion);
   // CRM and promotion buttons (Agendar cita, Ver vestidos, No me interesa, Quiero mi cita, No recibir más): the ERP answers them.
   if(/^(crm|pr|evs|evf)_/.test(accion))acciones.push({conversacion:conv.id,telefono:phone,sede_id:conv.sede_id||null,accion});
   if(m.type==='text')escritos.push({conversacion:conv.id,telefono:phone,wa_id:String(m.id),texto:text});
   if(m.type!=='reaction'&&!flowReply)touched.add(conv.id);
  }
  // Replies typed in the WhatsApp Business app of the phone (coexistence): field smb_message_echoes.
  for(const m of v.message_echoes||[]){
   const phone=digits(m.to);if(!/^\d{8,15}$/.test(phone)||!m.id)continue;
   const conv=await conversationFor(db,phone);
   const text=messageText(m).slice(0,4000),at=when(m.timestamp);
   const {error}=await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:String(m.id),direccion:'saliente',origen:'celular',tipo:String(m.type||'text'),texto:text,estado:'sent',created_at:at});
   if(error){if(error.code==='23505')continue;throw error;}
   // A person answered from the phone: the AI pauses in this chat and the «needs a person» alert is done.
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:text.slice(0,200),ultimo_at:at,no_leidos:0,ia_pausada:true,ia_pausada_at:at,ia_pausada_por:null,ia_atender:false,ia_motivo:null}).eq('id',conv.id);
  }
  // Delivery statuses of what the ERP sent from this screen.
  for(const s of v.statuses||[]){
   if(!s.id||!['sent','delivered','read','failed'].includes(s.status))continue;
   await db.from('whatsapp_mensajes').update({estado:s.status}).eq('wa_id',String(s.id));
  }
 }
  return {touched:[...touched],ads,acciones,escritos};
}

/** Sends a free text inside Meta's 24-hour window. Returns the WhatsApp message id. */
/** Template to start or resume a chat when the customer has not written in 24 hours (created in WhatsApp Manager, see docs/plantillas-whatsapp.md). */
export const FOLLOWUP_TEMPLATE='ambar_seguimiento';
/** Meta rejects empty template values: a chat without store says «Ámbar Couture Colombia». */
const lugar=(sede:string)=>sede.trim()||'Colombia';
export const followupText=(nombre:string,sede:string)=>`Hola ${nombre} 💛 Te escribimos de Ámbar Couture ${lugar(sede)} para acompañarte con tu vestido. ¿Tienes un momento para conversar?`;
export async function sendWhatsappFollowup(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,sede:string){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name:FOLLOWUP_TEMPLATE,language:{code:settings.templateLang||'es_CO'},components:[{type:'body',parameters:[nombre.trim()||'hola',lugar(sede)].map(text=>({type:'text',text}))}]}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string;code?:number}};
 if(!r.ok||!d.messages?.[0]?.id){
  const code=Number(d.error?.code);
  throw Error(code>=132000&&code<133000?`Falta aprobar en Meta la plantilla ${FOLLOWUP_TEMPLATE} (ver docs/plantillas-whatsapp.md).`:`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 }
 return d.messages[0].id;
}
/** Follow-up greeting with the promotion that applies to the customer (template ambar_seguimiento_promo, see docs/plantillas-whatsapp.md). */
export const FOLLOWUP_PROMO_TEMPLATE='ambar_seguimiento_promo';
export const followupPromoText=(nombre:string,sede:string,promo:string)=>`Hola ${nombre} 💛 Soy de Ámbar Couture ${lugar(sede)}. ¿Ya encontraste tu vestido? Tenemos ${promo}. Responde este mensaje y te mostramos opciones o separamos tu cita.`;
/** Improved plain follow-up (template ambar_seguimiento_v2); while it is not approved, ambar_seguimiento is used. */
export const FOLLOWUP_V2_TEMPLATE='ambar_seguimiento_v2';
export const followupV2Text=(nombre:string,sede:string)=>`Hola ${nombre} 💛 Soy de Ámbar Couture ${lugar(sede)}. ¿Ya encontraste tu vestido? Tenemos modelos nuevos y te ayudamos a elegir el ideal para tu evento. Responde este mensaje y te mostramos opciones o te agendamos una cita.`;
/** Improved follow-up and follow-up with promotion: null while their template is not approved in Meta. */
export const sendWhatsappFollowupV2=(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,sede:string)=>sendOptionalTemplate(settings,to,FOLLOWUP_V2_TEMPLATE,[nombre.trim()||'hola',lugar(sede)]);
export const sendWhatsappFollowupPromo=(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,sede:string,promo:string)=>sendOptionalTemplate(settings,to,FOLLOWUP_PROMO_TEMPLATE,[nombre.trim()||'hola',lugar(sede),promo]);
/** Best approved follow-up greeting: with promotion, then the improved one, then the original. Returns the message id and its text for the inbox. */
export async function sendBestFollowup(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,sede:string,promo:string|null){
 // With buttons first (Quiero mi cita · No recibir más / Agendar cita · Ver vestidos · No me interesa); null until Meta approves them.
 let waId=promo?await sendOptionalTemplate(settings,to,'ambar_seguimiento_promo_botones',[nombre.trim()||'hola',lugar(sede),promo],['pr_cita','pr_baja']):null;
 if(waId&&promo)return {waId,texto:`Hola ${nombre} 💛 Soy de Ámbar Couture ${lugar(sede)}. ¿Ya encontraste tu vestido? Tenemos ${promo}. Toca un botón y te ayudamos.\n[Quiero mi cita · No recibir más]`};
 waId=await sendOptionalTemplate(settings,to,'ambar_seguimiento_botones',[nombre.trim()||'hola',lugar(sede)],['crm_agendar','crm_ver','crm_no']);
 if(waId)return {waId,texto:`Hola ${nombre} 💛 Soy de Ámbar Couture ${lugar(sede)}. ¿Ya encontraste tu vestido? Tenemos modelos nuevos y te ayudamos a elegir el ideal para tu evento.\n[Agendar cita · Ver vestidos · No me interesa]`};
 waId=promo?await sendWhatsappFollowupPromo(settings,to,nombre,sede,promo):null;
 if(waId&&promo)return {waId,texto:followupPromoText(nombre,sede,promo)};
 waId=await sendWhatsappFollowupV2(settings,to,nombre,sede);
 if(waId)return {waId,texto:followupV2Text(nombre,sede)};
 return {waId:await sendWhatsappFollowup(settings,to,nombre,sede),texto:followupText(nombre,sede)};
}
/** Ally program templates (docs/plantillas-whatsapp.md); while Meta has not approved them, nothing is sent. */
export const allyReminderText=(nombre:string)=>`Hola ${nombre} 💛 Te escribimos de Ámbar Couture. ¿Pudiste revisar el programa de aliados? Incluye en tus paquetes nuestros vestidos de XV y gala con descuentos especiales para aliados y más de 600 vestidos en 4 sedes. Responde este mensaje y te ayudamos a completar tu vinculación.`;
export const sendAllyReminder=(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string)=>sendOptionalTemplate(settings,to,'ambar_aliado_recordatorio',[nombre.trim()||'hola']);
export const allyWelcomeText=(nombre:string,codigo:string)=>`Hola ${nombre} 💛 Ya eres aliado de Ámbar Couture. Tu código de aliado es ${codigo}. Te enviamos al correo tus enlaces para registrar a tus clientas y consultar disponibilidad de vestidos. Responde este mensaje y te explicamos cómo registrar tu primera clienta.`;
export const sendAllyWelcome=(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,codigo:string)=>sendOptionalTemplate(settings,to,'ambar_aliado_bienvenida_v2',[nombre.trim()||'aliado',codigo]);
/** Sends a template that may not be approved in Meta yet: null then, so the caller falls back to the approved one. */
async function sendOptionalTemplate(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,name:string,values:string[],botones:string[]=[]){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name,language:{code:settings.templateLang||'es_CO'},components:[{type:'body',parameters:values.map(text=>({type:'text',text}))},
   ...botones.map((payload,i)=>({type:'button',sub_type:'quick_reply',index:String(i),parameters:[{type:'payload',payload}]}))]}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string;code?:number}};
 if(r.ok&&d.messages?.[0]?.id)return d.messages[0].id;
 const code=Number(d.error?.code);
 if(code>=132000&&code<133000)return null;
 throw Error(`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
}
export async function sendWhatsappText(settings:{token:string;phoneNumberId:string},to:string,body:string){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:true,body}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string;code?:number}};
 if(!r.ok||!d.messages?.[0]?.id){
  const code=d.error?.code;
  throw Error(code===131047?'Pasaron más de 24 horas desde el último mensaje de la clienta: Meta solo deja escribirle con una plantilla. Respóndele desde el celular.':`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 }
 return d.messages[0].id;
}
/** Interactive message inside the 24 hours: reply buttons (max 3, titles of 20 characters) or one link button. Returns the message id. */
export async function sendWhatsappButtons(settings:{token:string;phoneNumberId:string},to:string,body:string,botones:{id:string;titulo:string}[]|{url:string;titulo:string}){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const interactive=Array.isArray(botones)?{type:'button',body:{text:body.slice(0,1024)},action:{buttons:botones.slice(0,3).map(b=>({type:'reply',reply:{id:b.id,title:b.titulo.slice(0,20)}}))}}
  :{type:'cta_url',body:{text:body.slice(0,1024)},action:{name:'cta_url',parameters:{display_text:botones.titulo.slice(0,20),url:botones.url}}};
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'interactive',interactive}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string}};
 if(!r.ok||!d.messages?.[0]?.id)throw Error(`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 return d.messages[0].id;
}
/** Interactive list inside the 24 hours (max 10 rows, titles of 24 characters). */
export async function sendWhatsappList(settings:{token:string;phoneNumberId:string},to:string,body:string,boton:string,filas:{id:string;titulo:string}[]){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'interactive',interactive:{type:'list',body:{text:body.slice(0,1024)},action:{button:boton.slice(0,20),sections:[{title:'Opciones',rows:filas.slice(0,10).map(f=>({id:f.id,title:f.titulo.slice(0,24)}))}]}}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string}};
 if(!r.ok||!d.messages?.[0]?.id)throw Error(`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 return d.messages[0].id;
}
/** After returning the dress: satisfaction survey (template ambar_post_evento, buttons carry the contract). null until Meta approves it. */
export const POST_EVENT_TEMPLATE='ambar_post_evento';
export const postEventText=(nombre:string,sede:string)=>`Hola ${nombre} 💛 Esperamos que tu evento haya sido inolvidable. ¿Cómo te sentiste con el servicio de Ámbar Couture ${lugar(sede)}? Tu opinión nos ayuda a mejorar.\n[Excelente · Bien · Puede mejorar]`;
export const sendPostEventSurvey=(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,sede:string,contrato:string)=>
 sendOptionalTemplate(settings,to,POST_EVENT_TEMPLATE,[nombre.trim()||'hola',lugar(sede)],['exc','bien','mej'].map(o=>`evs_${o}_${contrato}`));
/** Google review request by template (outside the 24 hours): «Dejar reseña» with the store's place id and «Ahora no». null until approved. */
export async function sendReviewTemplate(settings:{token:string;phoneNumberId:string;templateLang?:string},to:string,nombre:string,placeId:string){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',to,type:'template',template:{name:'ambar_resena',language:{code:settings.templateLang||'es_CO'},components:[
   {type:'body',parameters:[{type:'text',text:nombre.trim()||'hola'}]},
   {type:'button',sub_type:'url',index:'0',parameters:[{type:'text',text:placeId}]},
   {type:'button',sub_type:'quick_reply',index:'1',parameters:[{type:'payload',payload:'rs_no'}]}]}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string;code?:number}};
 if(r.ok&&d.messages?.[0]?.id)return d.messages[0].id;
 const code=Number(d.error?.code);if(code>=132000&&code<133000)return null;
 throw Error(`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
}
export const CRM_BOTONES=[{id:'crm_agendar',titulo:'📅 Agendar cita'},{id:'crm_ver',titulo:'👗 Ver vestidos'},{id:'crm_no',titulo:'🚫 No me interesa'}];
/** Sends a photo by public link (JPG or PNG) with a short caption; returns the WhatsApp message id. */
export async function sendWhatsappImage(settings:{token:string;phoneNumberId:string},to:string,link:string,caption:string){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'image',image:{link,caption}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string}};
 if(!r.ok||!d.messages?.[0]?.id)throw Error(`WhatsApp no aceptó la foto: ${String(d.error?.message||r.status).slice(0,160)}`);
 return d.messages[0].id;
}
export const WINDOW_MS=24*3600*1000;

/** Downloads a photo sent by a customer (WhatsApp media id) as base64; null when it is not available or too big. */
export async function downloadWhatsappImage(settings:{token:string},mediaId:string){
 const version=process.env.META_GRAPH_VERSION||'v21.0',auth={Authorization:`Bearer ${settings.token}`};
 const meta=await fetch(`https://graph.facebook.com/${version}/${mediaId}`,{headers:auth,signal:AbortSignal.timeout(10000)}).then(r=>r.ok?r.json():null).catch(()=>null) as {url?:string;mime_type?:string;file_size?:number}|null;
 if(!meta?.url||(meta.file_size||0)>4_000_000)return null;
 const r=await fetch(meta.url,{headers:auth,signal:AbortSignal.timeout(15000)}).catch(()=>null);
 if(!r?.ok)return null;
 const buf=Buffer.from(await r.arrayBuffer());
 return buf.length>4_000_000?null:{tipo:meta.mime_type||'image/jpeg',datos:buf.toString('base64')};
}

/** CRM and promotion buttons: «Agendar cita»/«Quiero mi cita» send the booking link, «Ver vestidos» the store's catalog,
 *  «No me interesa» closes the lead (no more follow-ups unless she writes again), «No recibir más» also revokes the commercial
 *  authorization of her phone (Ley 1581). Each answer is kept in the 304 chat. */
export async function handleCrmButtons(db:SupabaseClient,settings:{token:string;phoneNumberId:string},acciones:{conversacion:string;telefono:string;sede_id:string|null;accion:string}[]){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 for(const a of acciones){
  try{
   let texto='',waId='';
   if(a.accion==='crm_agendar'||a.accion==='pr_cita'){
    texto='¡Con gusto! 💛 Elige el día y la hora de tu cita aquí:';
    waId=await sendWhatsappButtons(settings,a.telefono,texto,{titulo:'📅 Agendar mi cita',url:`${origin}/agendar-primera-cita?o=${a.accion==='pr_cita'?'wa_promo':'wa_crm'}`});
   }else if(a.accion==='crm_ver'){
    const {data:cat}=await db.from('catalogos_publicos').select('token,titulo').eq('activo',true).match(a.sede_id?{sede_id:a.sede_id}:{}).limit(1).maybeSingle();
    texto='Aquí tienes nuestros vestidos 👗 Si alguno te gusta, cuéntame y te agendamos para que te lo pruebes.';
    waId=cat?.token?await sendWhatsappButtons(settings,a.telefono,texto,{titulo:'👗 Ver catálogo',url:`${origin}/c/${cat.token}`})
     :await sendWhatsappButtons(settings,a.telefono,'Cuéntame qué tipo de vestido buscas (XV, gala, novia) y tu talla, y te envío las opciones 💛',{titulo:'📅 Agendar cita',url:`${origin}/agendar-primera-cita?o=wa_crm`});
   }else if(/^ev[sf]_/.test(a.accion)){
    // After the event: «evs_<exc|bien|mej>_<contrato>» (satisfaction) and «evf_<falla>_<contrato>» (what to improve).
    const [,op,contrato]=a.accion.match(/^ev[sf]_([a-z]+)_([0-9a-f-]{36})$/)||[];if(!contrato)continue;
    const {data:r}=await db.rpc('post_evento_respuesta',{p_contrato:contrato,p_telefono:a.telefono,p_accion:op});
    const res=(r||{}) as {siguiente?:string;resena_url?:string|null;sede_id?:string|null;email?:string|null;nombre?:string};
    const nombre=res.nombre||'';
    if(res.siguiente==='resena'&&res.resena_url){
     texto=`¡Gracias, ${nombre}! 💛 Tu opinión ayuda a otras quinceañeras a elegir. ¿Nos cuentas tu experiencia en Google?`;
     waId=await sendWhatsappButtons(settings,a.telefono,texto,{titulo:'⭐ Dejar reseña',url:res.resena_url});
     await db.from('resenas_solicitudes').insert({telefono:a.telefono.slice(-10),email:res.email||null,canal:'whatsapp',origen:'contrato',contrato_id:contrato,sede_id:res.sede_id||null});
    }else if(res.siguiente==='falla'){
     texto='Gracias por decírnoslo. ¿Qué podemos mejorar?';
     waId=await sendWhatsappList(settings,a.telefono,texto,'Elegir',[['atencion','Atención'],['espera','Tiempo de espera'],['vestidos','Vestidos'],['precio','Precio'],['entrega','Entrega o devolución'],['instalaciones','Instalaciones'],['otro','Otro']].map(([k,t])=>({id:`evf_${k}_${contrato}`,titulo:t})));
    }else if(res.siguiente==='gracias'){
     texto=`Gracias por contarnos, ${nombre}. La administración de Ámbar te contactará para escucharte 💛`;
     waId=await sendWhatsappText(settings,a.telefono,texto);
    }else if(res.siguiente===undefined&&r&&/^evs_(exc|bien)/.test(a.accion)){
     texto=`¡Gracias, ${nombre}! 💛 Nos alegra mucho haberte acompañado.`;waId=await sendWhatsappText(settings,a.telefono,texto);
    }else continue;
   }else if(a.accion==='crm_no'||a.accion==='pr_baja'){
    await db.rpc('crm_cerrar_por_clienta',{p_conv:a.conversacion});
    if(a.accion==='pr_baja')await db.rpc('revocar_comercial_por_telefono',{p_telefono:a.telefono,p_origen:'boton'});
    texto=a.accion==='pr_baja'?'Listo, no te enviaremos más promociones. Si algún día necesitas un vestido, aquí estaremos 💛':'Entendido, no te escribiremos más por ahora. Si algún día necesitas un vestido, aquí estaremos 💛';
    waId=await sendWhatsappText(settings,a.telefono,texto);
   }else continue;
   const at=new Date().toISOString();
   await db.from('whatsapp_mensajes').insert({conversacion_id:a.conversacion,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'automatico',texto,estado:'sent',created_at:at});
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at}).eq('id',a.conversacion);
  }catch(e){console.error('Botón CRM:',e);}
 }
}
