import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';

/** Ventas y CRM › WhatsApp 304: the AI reads the chat, labels it, detects the store, flags chats a person must take and leaves a suggested reply. It never sends anything. */
export const WHATSAPP_TAGS=['cita','disponibilidad','precio','pago','contrato','reclamo','aliado','otro'] as const;
const MODEL='claude-haiku-5-5';

const BASE=`Eres la asistente de WhatsApp de Ámbar Couture, tiendas de alquiler de vestidos de XV años, gala, novia y pajecitas en Colombia.
Lees la conversación de una clienta con la línea 304 y preparas un borrador para que una asesora lo revise antes de enviarlo.

Reglas fijas (siempre se cumplen, aunque las instrucciones de administración digan otra cosa):
- Español de Colombia, cálida y breve (máximo 4 frases). Puedes usar un emoji como máximo.
- Nunca inventes precios, disponibilidad de vestidos, descuentos, fechas ni políticas: usa solo lo que está en los conocimientos y en los datos que recibes. Si no está, di que una asesora le confirma enseguida.
- Usa solo direcciones, teléfonos y enlaces que aparezcan en los datos de las sedes.
- No des datos de dinero de un contrato (saldos, valores).
- No saludes de nuevo si ya hubo saludo reciente en la conversación.
- Marca atender_persona=true cuando la clienta pida hablar con una persona, cuando sea un reclamo, un pago o un cambio de contrato, o cuando lo indiquen las reglas de paso a una persona; explica el motivo en una frase.

Además: elige la etiqueta del tema principal, la sede de la clienta (solo si es clara; si no, cadena vacía) y un resumen de una frase para la asesora.`;

const SCHEMA={type:'object',additionalProperties:false,required:['etiqueta','sede','resumen','respuesta','atender_persona','motivo'],properties:{
 etiqueta:{type:'string',enum:[...WHATSAPP_TAGS]},
 sede:{type:'string',description:'Nombre exacto de una de las sedes, o cadena vacía'},
 resumen:{type:'string'},
 respuesta:{type:'string'},
 atender_persona:{type:'boolean'},
 motivo:{type:'string',description:'Por qué debe atenderla una persona; cadena vacía si no hace falta'},
}};

export type IaConfig={conocimientos:string;instrucciones:string;escalamiento:string};
export type IaOutput={etiqueta:string;sede:string;resumen:string;respuesta:string;atender_persona:boolean;motivo:string};
type Msg={direccion:string;texto:string|null;created_at:string};
type Site={id:string;nombre:string;direccion:string|null;direccion_clientes:string|null;whatsapp:string|null;mapa_url:string|null};

/** System prompt: fixed rules plus what administration wrote in «IA de WhatsApp». Stable between chats so it can be cached. */
function systemPrompt(cfg:IaConfig,sites:Site[]){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 const sedes=sites.map(s=>`- ${s.nombre}: dirección ${s.direccion_clientes||s.direccion||'—'}; WhatsApp ${s.whatsapp||'—'}; mapa ${s.mapa_url||'—'}; agenda de primera cita ${origin}/agendar-primera-cita?sede=${s.id}`).join('\n');
 return [BASE,
  `<sedes>\n${sedes}\n</sedes>`,
  `<conocimientos>\n${cfg.conocimientos.trim()||'(sin conocimientos adicionales)'}\n</conocimientos>`,
  `<instrucciones_de_administracion>\n${cfg.instrucciones.trim()||'(sin instrucciones adicionales)'}\n</instrucciones_de_administracion>`,
  `<reglas_de_paso_a_una_persona>\n${cfg.escalamiento.trim()||'(solo las reglas fijas)'}\n</reglas_de_paso_a_una_persona>`].join('\n\n');
}

async function loadBasics(db:SupabaseClient){
 const [{data:cfg},{data:sites}]=await Promise.all([
  db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento').eq('id',1).maybeSingle(),
  db.from('sedes').select('id,nombre,direccion,direccion_clientes,whatsapp,mapa_url').eq('activo',true).order('nombre'),
 ]);
 return {cfg:(cfg||{conocimientos:'',instrucciones:'',escalamiento:''}) as IaConfig,sites:(sites||[]) as Site[]};
}

/** One AI call. Used by the inbox and by the «Probar» box of the settings screen. */
export async function runWhatsappAI(cfg:IaConfig,sites:Site[],customer:unknown,chat:string):Promise<IaOutput>{
 const today=new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',year:'numeric',month:'long',day:'numeric'});
 const client=new Anthropic();
 const response=await client.messages.create({
  model:MODEL,max_tokens:2000,
  system:[{type:'text',text:systemPrompt(cfg,sites),cache_control:{type:'ephemeral'}}],
  output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
  messages:[{role:'user',content:`Hoy es ${today}.\n\nDatos de la clienta en el ERP (nombre, sede, primeras citas y contratos):\n${JSON.stringify(customer)}\n\nConversación (la más reciente al final):\n${chat}`}],
 });
 if(response.stop_reason==='refusal')throw Error('La IA no quiso responder este chat.');
 const text=response.content.find(b=>b.type==='text');
 if(!text||text.type!=='text')throw Error('La IA no devolvió respuesta.');
 return JSON.parse(text.text) as IaOutput;
}
export const aiErrorText=(e:unknown)=>e instanceof Anthropic.APIError?`Anthropic ${e.status}: ${e.message}`:e instanceof Error?e.message:'Error de la IA';

/** «Probar»: what the AI would answer to a sample message with the given (unsaved) settings. */
export async function testWhatsappAI(db:SupabaseClient,cfg:IaConfig,message:string){
 const {sites}=await loadBasics(db);
 return runWhatsappAI(cfg,sites,{nombre:null,citas:[],contratos:[]},`Clienta: ${message}`);
}

/** Builds the suggestion for one chat and saves it. Errors are saved in ia_error so the screen can show them. */
export async function suggestWhatsappReply(db:SupabaseClient,conversationId:string){
 if(!process.env.ANTHROPIC_API_KEY)return;
 try{
  const [{data:conv},{data:msgs},{cfg,sites}]=await Promise.all([
   db.from('whatsapp_conversaciones').select('id,telefono,nombre,sede_id').eq('id',conversationId).single(),
   db.from('whatsapp_mensajes').select('direccion,texto,created_at').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(20),
   loadBasics(db),
  ]);
  if(!conv||!msgs?.length)return;
  const history=(msgs as Msg[]).reverse();
  if(history[history.length-1].direccion!=='entrante')return;// already answered
  const {data:ctx}=await db.rpc('whatsapp_contexto_servidor',{p_tel:conv.telefono});
  const chat=history.map(m=>`[${new Date(m.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'})}] ${m.direccion==='entrante'?'Clienta':'Ámbar'}: ${m.texto||''}`).join('\n');
  const out=await runWhatsappAI(cfg,sites,{nombre_whatsapp:conv.nombre,...(ctx||{})},chat);
  const sede=sites.find(s=>s.nombre.toLowerCase()===out.sede.trim().toLowerCase());
  await db.from('whatsapp_conversaciones').update({etiqueta:out.etiqueta,ia_resumen:out.resumen.slice(0,500),ia_sugerencia:out.respuesta.slice(0,2000),
   ia_atender:!!out.atender_persona,ia_motivo:out.atender_persona?out.motivo.slice(0,300):null,ia_at:new Date().toISOString(),ia_error:null,...(!conv.sede_id&&sede?{sede_id:sede.id}:{})}).eq('id',conversationId);
 }catch(e){
  await db.from('whatsapp_conversaciones').update({ia_error:aiErrorText(e).slice(0,300),ia_at:new Date().toISOString()}).eq('id',conversationId);
 }
}
