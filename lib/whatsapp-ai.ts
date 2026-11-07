import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadWhatsappSettings} from './whatsapp-config';
import {sendWhatsappText} from './whatsapp-inbox';

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
  db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento,auto_activa,reactivar_horas').eq('id',1).maybeSingle(),
  db.from('sedes').select('id,nombre,direccion,direccion_clientes,whatsapp,mapa_url').eq('activo',true).order('nombre'),
 ]);
 return {cfg:(cfg||{conocimientos:'',instrucciones:'',escalamiento:'',auto_activa:false,reactivar_horas:12}) as IaConfig&{auto_activa:boolean;reactivar_horas:number},sites:(sites||[]) as Site[]};
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
   db.from('whatsapp_conversaciones').select('id,telefono,nombre,sede_id,ia_pausada,ia_pausada_at').eq('id',conversationId).single(),
   db.from('whatsapp_mensajes').select('id,direccion,texto,created_at').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(20),
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
  // Automatic reply: general switch on, chat not paused by a person (or paused longer than the configured hours), and nothing a person must take.
  if(!cfg.auto_activa||out.atender_persona||!out.respuesta.trim())return;
  const expired=conv.ia_pausada&&conv.ia_pausada_at&&Date.now()-Date.parse(conv.ia_pausada_at)>cfg.reactivar_horas*3600000;
  if(conv.ia_pausada&&!expired)return;
  // Send only if nothing changed meanwhile: same last message (a newer one gets its own reply) and no person stepped in.
  const [{data:last},{data:now}]=await Promise.all([
   db.from('whatsapp_mensajes').select('id').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   db.from('whatsapp_conversaciones').select('ia_pausada,ia_pausada_at').eq('id',conversationId).single(),
  ]);
  const lastId=(history[history.length-1] as Msg&{id?:string}).id;
  if(!last||last.id!==lastId||(now?.ia_pausada&&now.ia_pausada_at!==conv.ia_pausada_at))return;
  const settings=await loadWhatsappSettings(db);
  if(!settings.token||!settings.phoneNumberId)return;
  const texto=out.respuesta.trim().slice(0,4000),waId=await sendWhatsappText(settings,conv.telefono,texto),at=new Date().toISOString();
  await db.from('whatsapp_mensajes').insert({conversacion_id:conversationId,wa_id:waId,direccion:'saliente',origen:'ia',tipo:'text',texto,estado:'sent',created_at:at});
  await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at,ia_sugerencia:null,...(expired?{ia_pausada:false,ia_pausada_at:null,ia_pausada_por:null}:{})}).eq('id',conversationId);
 }catch(e){
  await db.from('whatsapp_conversaciones').update({ia_error:aiErrorText(e).slice(0,300),ia_at:new Date().toISOString()}).eq('id',conversationId);
 }
}

const EDITOR=`Ayudas a la administración de Ámbar Couture a configurar la IA que sugiere respuestas en WhatsApp.
Recibes la configuración actual (conocimientos, instrucciones y tono, reglas de paso a una persona) y un pedido escrito en lenguaje normal.
Devuelve la configuración completa ya ajustada:
- Cambia solo lo que el pedido pide; conserva todo lo demás tal cual.
- Pon cada cosa en su sección: datos del negocio en conocimientos; forma de responder en instrucciones; cuándo debe atender una persona en reglas.
- Escribe en viñetas cortas, en español claro.
- Si el pedido contradice algo existente, reemplázalo y dilo en la explicación.
- Si el pedido es ambiguo o falta un dato (por ejemplo, un precio o un horario), no inventes: deja la configuración sin ese cambio y haz la pregunta en "pregunta".
- No agregues reglas que permitan inventar precios o disponibilidad, enviar mensajes sin revisión o dar saldos: esas protecciones son fijas.
En "explicacion" resume en 1 a 3 frases qué cambiaste.`;
const EDIT_SCHEMA={type:'object',additionalProperties:false,required:['conocimientos','instrucciones','escalamiento','explicacion','pregunta'],properties:{
 conocimientos:{type:'string'},instrucciones:{type:'string'},escalamiento:{type:'string'},explicacion:{type:'string'},pregunta:{type:'string',description:'Pregunta para administración si falta un dato; cadena vacía si no'},
}};
export type IaEdit=IaConfig&{explicacion:string;pregunta:string};

/** «IA de WhatsApp» › chat: administration writes what it needs and the AI rewrites the settings (they are saved only when administration accepts). */
export async function adjustWhatsappConfig(cfg:IaConfig,pedido:string,previos:{rol:'admin'|'ia';texto:string}[]):Promise<IaEdit>{
 // Vercel stops the request at 60 s: fail with a clear message before that.
 const client=new Anthropic({timeout:55000,maxRetries:0});
 const history=previos.slice(-10).map(p=>`${p.rol==='admin'?'Administración':'Asistente'}: ${p.texto}`).join('\n');
 const response=await client.messages.create({
  model:'claude-opus-5-5',max_tokens:16000,system:EDITOR,
  output_config:{effort:'medium',format:{type:'json_schema',schema:EDIT_SCHEMA}},
  messages:[{role:'user',content:`<configuracion_actual>\n<conocimientos>\n${cfg.conocimientos}\n</conocimientos>\n<instrucciones>\n${cfg.instrucciones}\n</instrucciones>\n<reglas_de_paso_a_una_persona>\n${cfg.escalamiento}\n</reglas_de_paso_a_una_persona>\n</configuracion_actual>\n\n${history?`Conversación previa:\n${history}\n\n`:''}Pedido nuevo de administración:\n${pedido}`}],
 });
 if(response.stop_reason==='refusal')throw Error('La IA no quiso hacer ese cambio. Escríbelo de otra forma.');
 if(response.stop_reason==='max_tokens')throw Error('La configuración es demasiado larga para ajustarla de una vez. Resume un poco los textos.');
 const text=response.content.find(b=>b.type==='text');
 if(!text||text.type!=='text')throw Error('La IA no devolvió respuesta.');
 return JSON.parse(text.text) as IaEdit;
}
