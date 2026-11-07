import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';

/** Ventas y CRM › WhatsApp 304: the AI reads the chat, labels it, detects the store and leaves a suggested reply. It never sends anything. */
export const WHATSAPP_TAGS=['cita','disponibilidad','precio','pago','contrato','reclamo','aliado','otro'] as const;
const MODEL='claude-haiku-5-5';

const SYSTEM=`Eres la asistente de WhatsApp de Ámbar Couture, tiendas de alquiler de vestidos de XV años, gala, novia y pajecitas en Colombia.
Lees la conversación de una clienta con la línea 304 y preparas un borrador para que una asesora lo revise antes de enviarlo.

Reglas para la respuesta sugerida:
- Español de Colombia, cálida, breve (máximo 4 frases), sin tecnicismos. Trata a la clienta de tú. Puedes usar un emoji como máximo.
- Nunca inventes precios, disponibilidad de vestidos, descuentos, fechas ni políticas. Si la clienta pregunta algo que no está en los datos que recibes, di que una asesora le confirma enseguida.
- Para conocer vestidos y precios, invita a agendar la primera cita (presencial o virtual) con el enlace de agenda de su sede.
- Usa solo direcciones, teléfonos y enlaces que aparezcan en los datos de las sedes.
- Si ya tiene contrato o cita, tenlo en cuenta (por ejemplo, recuérdale su cita) sin dar datos de dinero.
- Si es un reclamo, un pago o un cambio de contrato, responde con empatía y di que una asesora la atiende personalmente.
- No saludes de nuevo si ya hubo saludo reciente en la conversación.

Además: elige la etiqueta del tema principal, la sede de la clienta (solo si es clara por la conversación o sus datos; si no, cadena vacía) y un resumen de una frase para la asesora.`;

const SCHEMA={type:'object',additionalProperties:false,required:['etiqueta','sede','resumen','respuesta'],properties:{
 etiqueta:{type:'string',enum:[...WHATSAPP_TAGS]},
 sede:{type:'string',description:'Nombre exacto de una de las sedes, o cadena vacía'},
 resumen:{type:'string'},
 respuesta:{type:'string'},
}};

type Msg={direccion:string;origen:string;texto:string|null;created_at:string};
type Site={id:string;nombre:string;direccion:string|null;direccion_clientes:string|null;whatsapp:string|null;mapa_url:string|null};

/** Builds the suggestion for one chat and saves it. Errors are saved in ia_error so the screen can show them. */
export async function suggestWhatsappReply(db:SupabaseClient,conversationId:string){
 if(!process.env.ANTHROPIC_API_KEY)return;
 try{
  const [{data:conv},{data:msgs},{data:sites}]=await Promise.all([
   db.from('whatsapp_conversaciones').select('id,telefono,nombre,sede_id').eq('id',conversationId).single(),
   db.from('whatsapp_mensajes').select('direccion,origen,texto,created_at').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(20),
   db.from('sedes').select('id,nombre,direccion,direccion_clientes,whatsapp,mapa_url').eq('activo',true).order('nombre'),
  ]);
  if(!conv||!msgs?.length)return;
  const history=(msgs as Msg[]).reverse();
  if(history[history.length-1].direccion!=='entrante')return;// already answered
  const {data:ctx}=await db.rpc('whatsapp_contexto_servidor',{p_tel:conv.telefono});
  const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
  const sedes=(sites as Site[]||[]).map(s=>`- ${s.nombre}: dirección ${s.direccion_clientes||s.direccion||'—'}; WhatsApp ${s.whatsapp||'—'}; mapa ${s.mapa_url||'—'}; agenda de primera cita ${origin}/agendar-primera-cita?sede=${s.id}`).join('\n');
  const chat=history.map(m=>`[${new Date(m.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'})}] ${m.direccion==='entrante'?'Clienta':'Ámbar'}: ${m.texto||''}`).join('\n');
  const today=new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const client=new Anthropic();
  const response=await client.messages.create({
   model:MODEL,max_tokens:2000,
   system:SYSTEM,
   output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
   messages:[{role:'user',content:`Hoy es ${today}.\n\nSedes:\n${sedes}\n\nDatos de la clienta en el ERP (nombre, sede, primeras citas y contratos):\n${JSON.stringify({nombre_whatsapp:conv.nombre,...(ctx||{})})}\n\nConversación (la más reciente al final):\n${chat}`}],
  });
  if(response.stop_reason==='refusal')throw Error('La IA no quiso responder este chat.');
  const text=response.content.find(b=>b.type==='text');
  if(!text||text.type!=='text')throw Error('La IA no devolvió respuesta.');
  const out=JSON.parse(text.text) as {etiqueta:string;sede:string;resumen:string;respuesta:string};
  const sede=(sites as Site[]||[]).find(s=>s.nombre.toLowerCase()===out.sede.trim().toLowerCase());
  await db.from('whatsapp_conversaciones').update({etiqueta:out.etiqueta,ia_resumen:out.resumen.slice(0,500),ia_sugerencia:out.respuesta.slice(0,2000),ia_at:new Date().toISOString(),ia_error:null,...(!conv.sede_id&&sede?{sede_id:sede.id}:{})}).eq('id',conversationId);
 }catch(e){
  const message=e instanceof Anthropic.APIError?`Anthropic ${e.status}: ${e.message}`:e instanceof Error?e.message:'Error de la IA';
  await db.from('whatsapp_conversaciones').update({ia_error:message.slice(0,300),ia_at:new Date().toISOString()}).eq('id',conversationId);
 }
}
