import {createHmac,timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {whatsappPhone} from './first-visit-links';
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
 else throw Error('Tipo de notificación desconocido');
 return {messaging_product:'whatsapp',to:whatsappPhone(c.telefono),...content};
}
