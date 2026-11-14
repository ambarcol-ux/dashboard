import {createHmac,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {whatsappPhone} from './first-visit-links';
import {visitDate,visitSite,visitTime,type VisitSite} from './first-visit-sites';
export function validMetaSignature(raw:string,signature:string,secret:string){
 if(!secret||!/^sha256=[a-f0-9]{64}$/.test(signature))return false;
 const expected='sha256='+createHmac('sha256',secret).update(raw).digest('hex');
 return timingSafeEqual(Buffer.from(signature),Buffer.from(expected));
}
export type NotificationVisit={id:string;fecha:string;hora:string;cliente_nombre:string;telefono:string;sede_id:string;modalidad:string};
export function whatsappPayload(type:string,c:NotificationVisit,site:string,link:string,lang='es_CO'){
 const text=(value:string)=>({type:'text',text:value});
 const template=(name:string,values:string[],language='es')=>({type:'template',template:{name,language:{code:language},components:[{type:'body',parameters:values.map(text)}]}});
 let content:Record<string,unknown>;
 const date=c.fecha.split('-').reverse().join('/');
 if(type==='confirmacion')content=template('ambar_confirmacion_cita',[c.cliente_nombre,site,date,c.hora.slice(0,5)]);
 else if(type==='recordatorio24'||type==='recordatorio2')content=template('ambar_recordatorio_cita',[c.cliente_nombre,type==='recordatorio24'?'24':'2',site,date,c.hora.slice(0,5),link]);
 else if(type==='post_cita')content={type:'template',template:{name:'ambar_post_cita_asistencia',language:{code:lang},components:['pc_asisti','pc_no_asisti'].map((payload,i)=>({type:'button',sub_type:'quick_reply',index:String(i),parameters:[{type:'payload',payload}]}))}};
 else if(type==='pregunta_alquiler')content={type:'interactive',interactive:{type:'button',body:{text:'Gracias por visitarnos. ¿Alquilaste tu vestido con Ámbar Couture?'},action:{buttons:[{type:'reply',reply:{id:'pc_alquile',title:'Sí alquilé'}},{type:'reply',reply:{id:'pc_no_alquile',title:'No alquilé'}}]}}};
 else if(type==='pregunta_motivo')content={type:'interactive',interactive:{type:'list',body:{text:'¿Cuál fue la principal razón por la que no alquilaste?'},action:{button:'Elegir motivo',sections:[{title:'Motivo principal',rows:[['mot_precio','Precio'],['mot_no_vestido','No encontré vestido'],['mot_otras_tiendas','Visitaré otras tiendas'],['mot_consultar','Debo consultarlo'],['mot_fecha_evento','Fecha del evento'],['mot_talla_diseno','Talla / diseño / ajuste'],['mot_otro','Otro']].map(([id,title])=>({id,title}))}]}}};
 else if(type==='reagendar')content={type:'text',text:{preview_url:false,body:`Puedes reprogramar tu primera cita aquí:\n${link}`}};
 else if(type==='recuperar')content=template(RECOVERY_TEMPLATE,[c.cliente_nombre,link],lang);
 else throw Error('Tipo de notificación desconocido');
 return {messaging_product:'whatsapp',to:whatsappPhone(c.telefono),...content};
}
/** Templates created in WhatsApp Manager for attendance (see docs/plantillas-whatsapp.md). */
export const REMINDER_CONFIRM_TEMPLATE='ambar_recordatorio_confirmar',RECOVERY_TEMPLATE='ambar_cita_reprogramar';
/** 24-hour reminder with «Confirmo» / «Reagendar» buttons; while Meta has not approved it, the plain reminder goes out. */
export function reminderConfirmPayload(c:NotificationVisit,site:string,lang='es_CO'){
 const values=[c.cliente_nombre,site,visitDate(c.fecha),visitTime(c.hora)];
 return {messaging_product:'whatsapp',to:whatsappPhone(c.telefono),type:'template',template:{name:REMINDER_CONFIRM_TEMPLATE,language:{code:lang},components:[
  {type:'body',parameters:values.map(text=>({type:'text',text}))},
  ...['rc_confirmo','rc_reagendar'].map((payload,i)=>({type:'button',sub_type:'quick_reply',index:String(i),parameters:[{type:'payload',payload}]}))]}};
}
/** While the customer wrote in the last 24 hours, reminders go as normal 304 messages (no template). Returns the text kept in the inbox too. */
export function openWindowPayload(type:string,c:NotificationVisit,siteName:string,link:string,sites?:VisitSite[]){
 const to=whatsappPhone(c.telefono),name=c.cliente_nombre.split(' ')[0],site=visitSite(siteName,sites),when=`${visitDate(c.fecha)} a las ${visitTime(c.hora)}`;
 const where=c.modalidad==='virtual'?'de forma virtual':`en ${siteName}${site?.direccion?` (${site.direccion})`:''}`;
 if(type==='recordatorio24'){const texto=`Hola ${name} 💛 Te recordamos tu primera cita ${where} el ${when}. ¿Nos confirmas que vienes?`;
  return {texto,payload:{messaging_product:'whatsapp',to,type:'interactive',interactive:{type:'button',body:{text:texto},action:{buttons:[{type:'reply',reply:{id:'rc_confirmo',title:'Confirmo'}},{type:'reply',reply:{id:'rc_reagendar',title:'Reagendar'}}]}}}};}
 if(type==='recordatorio2'){const texto=`Hola ${name}, ¡hoy es tu cita! Te esperamos ${where} a las ${visitTime(c.hora)}${site?.mapa?`. Cómo llegar: ${site.mapa}`:''}.${c.modalidad!=='virtual'&&site?.parqueadero?` ${site.parqueadero}`:''} Si se te presenta algo, puedes cambiarla aquí: ${link}`;
  return {texto,payload:{messaging_product:'whatsapp',to,type:'text',text:{preview_url:false,body:texto}}};}
 if(type==='recuperar'){const texto=`Hola ${name} 💛 Hoy te esperábamos en tu cita y nos quedamos con ganas de verte. Si quieres, elige una nueva fecha aquí y te tenemos los vestidos listos: ${link}`;
  return {texto,payload:{messaging_product:'whatsapp',to,type:'text',text:{preview_url:false,body:texto}}};}
 return null;
}
/** Readable copy of an automatic message for the 304 chat in the ERP (templates are shown by what they say, not their full text). */
export function inboxCopy(type:string,c:NotificationVisit,site:string,payload:Record<string,any>):string{ // eslint-disable-line @typescript-eslint/no-explicit-any
 if(payload.type==='text')return String(payload.text?.body||'');
 if(payload.type==='interactive'){const i=payload.interactive||{};const opts=(i.action?.buttons||[]).map((b:{reply?:{title?:string}})=>b.reply?.title).concat((i.action?.sections||[]).flatMap((s:{rows?:{title?:string}[]})=>(s.rows||[]).map(r=>r.title))).filter(Boolean);
  return `${String(i.body?.text||'')}${opts.length?`\n[${opts.join(' · ')}]`:''}`;}
 const when=`${visitDate(c.fecha)} a las ${visitTime(c.hora)}`,name=String(payload.template?.name||'');
 const label:Record<string,string>={confirmacion:`✅ Confirmación de su primera cita: ${when} · ${c.modalidad==='virtual'?'virtual':site}`,recordatorio24:`⏰ Recordatorio: su cita es mañana, ${when} · ${site}`,recordatorio2:`⏰ Recordatorio: su cita es hoy, ${when} · ${site}`,
  post_cita:'¿Asististe a tu cita?\n[Asistí · No asistí]',recuperar:'💛 Te esperábamos en tu cita: elige una nueva fecha (enlace para reprogramar).'};
 return `${label[type]||'Mensaje automático'}${name===REMINDER_CONFIRM_TEMPLATE?'\n[Confirmo · Reagendar]':''}\n(plantilla ${name})`;
}
/** Meta's delivery error codes, in words the team can act on. */
export function metaErrorText(code:unknown,title:unknown){
 const known:Record<number,string>={131049:'Meta limitó el mensaje para no saturar a la clienta (suele pasar con plantillas de Marketing o clientas que reciben muchos mensajes de empresas).',131026:'El número no tiene WhatsApp, no aceptó los términos nuevos o su app está desactualizada.',131047:'Pasaron más de 24 horas desde el último mensaje de la clienta: solo se puede escribir con plantilla.',131050:'La clienta pidió no recibir mensajes de marketing de Ámbar.',131042:'Problema con el método de pago de la cuenta de WhatsApp en Meta.',131048:'Meta limitó los envíos de este número por calidad (bloqueos o reportes).',131056:'Demasiados mensajes seguidos a esta misma clienta.',130472:'Meta no entregó el mensaje por un experimento propio de Meta.',131021:'El número de destino es el mismo que envía.'};
 const n=Number(code);return Number.isFinite(n)&&known[n]?`${known[n]} (código ${n})`:`${String(title||'Error de Meta').slice(0,150)}${Number.isFinite(n)?` (código ${n})`:''}`;
}
/** Detailed confirmation templates (address, map, phone, WhatsApp and reschedule page). Created in WhatsApp Manager; see docs/plantillas-whatsapp.md. */
export const CONFIRMATION_TEMPLATES={presencial:'ambar_cita_confirmada_sede',virtual:'ambar_cita_confirmada_virtual'};
/** Detailed confirmation for one visit, or null when the store has no contact details (the short template is used then). */
export function confirmationPayload(c:NotificationVisit,siteName:string,lang='es',sites?:VisitSite[]){
 const site=visitSite(siteName,sites);
 if(!site)return null;
 const values=c.modalidad==='virtual'
  ?[c.cliente_nombre,visitDate(c.fecha),visitTime(c.hora),site.nombre,site.telefono,`https://wa.me/${site.whatsapp}`]
  :[c.cliente_nombre,site.nombre,visitDate(c.fecha),visitTime(c.hora),site.parqueadero?`${site.direccion} · ${site.parqueadero}`:site.direccion,site.mapa,site.nombre,site.telefono,`https://wa.me/${site.whatsapp}`];
 const name=c.modalidad==='virtual'?CONFIRMATION_TEMPLATES.virtual:CONFIRMATION_TEMPLATES.presencial;
 return {messaging_product:'whatsapp',to:whatsappPhone(c.telefono),type:'template',template:{name,language:{code:lang},components:[{type:'body',parameters:values.map(text=>({type:'text',text}))}]}};
}
/** Meta template errors (missing, paused, not approved, wrong parameters): try the next payload instead of failing. */
export const isTemplateError=(code:unknown)=>typeof code==='number'&&code>=132000&&code<133000;
type EventDb={rpc:(name:string,args:Record<string,unknown>)=>PromiseLike<{error:unknown}>};
/** Applies Meta delivery statuses and button/list replies. Returns false when the caller should ask Meta to retry. */
/** phoneNumberIds: the numbers whose events are accepted (current and previous); empty or null accepts any. */
export async function applyWhatsappEvents(db:EventDb,data:{entry?:{changes?:{value?:Record<string,any>}[]}[]},phoneNumberIds?:string|string[]|null){ // eslint-disable-line @typescript-eslint/no-explicit-any
 const accepted=(Array.isArray(phoneNumberIds)?phoneNumberIds:[phoneNumberIds]).filter(Boolean) as string[];
 for(const entry of data.entry||[])for(const change of entry.changes||[]){const v=change.value;if(!v||(accepted.length&&!accepted.includes(String(v.metadata?.phone_number_id||''))))continue;
  for(const status of v.statuses||[]){if(!['sent','delivered','read','failed'].includes(status.status)||!/^\d+$/.test(String(status.timestamp)))continue;const date=new Date(Number(status.timestamp)*1000);if(!Number.isFinite(date.getTime()))continue;const failure=status.status==='failed'?status.errors?.[0]:null;const {error}=await db.rpc('estado_whatsapp_primera_cita',{p_provider_id:status.id,p_telefono:status.recipient_id,p_estado:status.status,p_fecha:date.toISOString(),...(failure?{p_error_codigo:Number.isFinite(Number(failure.code))?Number(failure.code):null,p_error_detalle:metaErrorText(failure.code,failure.error_data?.details||failure.title||failure.message)}:{})});if(error)return false;}
  for(const message of v.messages||[]){const action=message.button?.payload||message.interactive?.button_reply?.id||message.interactive?.list_reply?.id;if(!action||!message.context?.id)continue;const {error}=await db.rpc('respuesta_whatsapp_primera_cita',{p_message_id:message.id,p_context_id:message.context.id,p_telefono:message.from,p_accion:action});if(error)return false;}
 }
 return true;
}
