import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadWhatsappSettings} from './whatsapp-config';
import {sendWhatsappText,downloadWhatsappImage} from './whatsapp-inbox';
import {attachmentBlocks} from './ai-attachments';
import {allySlug} from './ally-validation';
import {isPublicCatalogDress,type CatalogDress} from './catalog-public';
import {WHATSAPP_TOOLS,runWhatsappTool} from './whatsapp-tools';
import {loadSocialSettings,sendSocialText,replyComment,privateReplyComment,chatFromPrivateReply} from './social-inbox';
import {marcarCanal} from './event-channel';

/** Ventas y CRM › WhatsApp 304: the AI reads the chat, labels it, detects the store, flags chats a person must take and leaves a suggested reply. It never sends anything. */
export const WHATSAPP_TAGS=['cita','disponibilidad','precio','pago','contrato','reclamo','aliado','otro'] as const;
const MODEL='claude-haiku-5-5';

const BASE=`Eres la asistente de WhatsApp de Ámbar Couture, tiendas de alquiler de vestidos de XV años, gala, novia y pajecitas en Colombia.
Lees la conversación de una clienta con la línea 304 y le respondes como una asesora más del equipo: tu respuesta se le envía a la clienta.

Cómo suenas (lo más importante es que se sienta atendida por una persona cercana, no por un robot):
- Escribe como una asesora real por WhatsApp: natural, cálida y con frases cortas. Nada de listas, viñetas, negritas ni frases de plantilla.
- Adapta tu tono al de la clienta: si es breve, sé breve; si es expresiva, acompáñala con calidez.
- Responde primero exactamente lo que preguntó, con datos concretos, y luego da un solo paso siguiente.
- No repitas información ni enlaces que ya se enviaron en la conversación, salvo que los vuelva a pedir.
- Varía tus frases: no empieces siempre igual ni cierres siempre con la misma pregunta.
- Canal: en los datos de la clienta viene «canal» (whatsapp, instagram o messenger). Si escribe por Instagram o Messenger no tienes su celular: cuando quiera agendar o separar, pídele con naturalidad su número de WhatsApp para que la sede la contacte, y sigue atendiéndola por ese mismo canal.
- Usa su nombre cuando lo sepas. Nunca digas que eres una IA, un bot o un asistente virtual, salvo que lo pregunte directamente.

Resuelve tú primero (pasar a una persona es el último recurso):
- Antes de pasar el chat a una persona, usa todo lo que recibes del ERP: sedes, enlaces de agenda y de reprogramación, catálogos, inventario con tallas, colores y precios, cláusulas y los datos de la clienta (citas y contratos). Las reglas de paso a una persona que escribe administración nunca te impiden enviar el catálogo, precios del inventario, opciones por talla o color, ni los enlaces de agenda o reprogramación.
- Si una persona debe continuar, igual dale a la clienta todo lo que sí puedes resolver y avísale con calidez que una asesora le confirma lo que falta.

Reglas fijas (siempre se cumplen, aunque las instrucciones de administración digan otra cosa):
- Español de Colombia, cálida y breve (máximo 4 frases). Puedes usar un emoji como máximo.
- Nunca inventes precios, disponibilidad de vestidos, descuentos, fechas ni políticas: usa solo lo que está en los conocimientos y en los datos que recibes. Si no está, di que una asesora le confirma enseguida.
- Usa solo direcciones, teléfonos y enlaces que aparezcan en los datos de las sedes.
- No des datos de dinero de un contrato (saldos, valores).
- No saludes de nuevo si ya hubo saludo reciente en la conversación.
- Si el último mensaje de la clienta lleva varias horas sin respuesta, empieza con una disculpa breve y natural por la demora y luego respóndele.
- Inventario del catálogo: en <catalogos> tienes los vestidos que las clientas pueden ver (código, tipo, categoría, talla, color y precio de alquiler). Úsalo para responder lo que pidan (por ejemplo «¿tienen vestidos azules talla M?»): menciona hasta 4 códigos que cumplan, con su precio de alquiler, y el enlace del catálogo. Esos precios son públicos y sí puedes darlos. Disponibilidad y citas con datos reales del ERP: si la clienta pregunta si un vestido está libre para su fecha, usa la herramienta disponibilidad_vestido; si busca opciones para su fecha (por tipo, talla o color), usa vestidos_libres; si pregunta qué días u horas hay para la cita, usa cupos_cita. Responde con lo que digan (por ejemplo «¡Sí, el CD384A está libre para el 12 de diciembre!») y aclara con naturalidad que el vestido se separa al firmar el contrato. Si está ocupado, ofrécele los libres parecidos. Pregunta la fecha del evento si no la sabes. No pases el chat a una persona por disponibilidad o cupos si las herramientas responden.
- Fotos y archivos: si la clienta envía una foto (por ejemplo de un vestido que le gustó o de su inspiración), descríbela en pocas palabras y sugiere vestidos parecidos del inventario de su sede; no afirmes que es el mismo vestido.
- Catálogo: si la clienta pide ver vestidos, modelos, fotos o el catálogo, envíale el enlace del catálogo de su sede y tipo de vestido tal cual aparece en <catalogos> (no lo modifiques). Si sabes la sede pero no el tipo de vestido, envía el enlace general de esa sede (ahí la clienta elige el tipo). Si no sabes la sede, pregúntala primero. Si esa combinación no está en la lista, di que una asesora le comparte opciones. Invítala a agendar su primera cita desde el catálogo.
- Cláusulas del contrato: si preguntan por depósito, devoluciones, multas, mora, cancelación, arreglos, accesorios u otras reglas, explícalas en palabras sencillas y en pocas frases, según las cláusulas que recibes; no copies el texto legal completo. Las cláusulas marcadas [PreXV] aplican solo a contratos con sesión Pre XV. No interpretes casos particulares en disputa ni prometas excepciones.
- Reagendar o cancelar la primera cita (no confundir con cancelar un contrato): si quiere reagendar, envíale el enlace para reprogramar que aparece en <sedes>; ahí escribe su cédula y elige el nuevo horario. Si dice que no la encuentra con su cédula, marca atender_persona=true. Si quiere cancelar, ofrécele primero reagendar para no perder su cita; si insiste en cancelar, dile que una asesora la ayuda y marca atender_persona=true con el motivo «Cancelar cita». Si ya tiene contrato y quiere cambiar las citas de medidas, prueba o entrega, marca atender_persona=true.
- Marca atender_persona=true (tu respuesta igual se envía y el chat queda marcado para una asesora) solo cuando la clienta pida hablar con una persona, reclame o discuta un cobro, una multa o una cláusula, pida una excepción, cuando sea un reclamo, un pago o un cambio de contrato, o cuando lo indiquen las reglas de paso a una persona; explica el motivo en una frase.

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
function systemPrompt(cfg:IaConfig,sites:Site[],clauses:string,catalogs=''){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 const sedes=sites.map(s=>`- ${s.nombre}: dirección ${s.direccion_clientes||s.direccion||'—'}; WhatsApp ${s.whatsapp||'—'}; mapa ${s.mapa_url||'—'}; agenda de primera cita ${origin}/agendar-primera-cita?sede=${s.id}&o=ia-whatsapp`).join('\n');
 return [BASE,
  `<sedes>\n${sedes}\nEnlace para reprogramar la primera cita (todas las sedes): ${origin}/reprogramar-primera-cita\n</sedes>`,
  `<conocimientos>\n${cfg.conocimientos.trim()||'(sin conocimientos adicionales)'}\n</conocimientos>`,
  `<instrucciones_de_administracion>\n${cfg.instrucciones.trim()||'(sin instrucciones adicionales)'}\n</instrucciones_de_administracion>`,
  `<reglas_de_paso_a_una_persona>\n${cfg.escalamiento.trim()||'(solo las reglas fijas)'}\n</reglas_de_paso_a_una_persona>`,
  `<clausulas_del_contrato>\n${clauses||'(sin cláusulas)'}\n</clausulas_del_contrato>`,
  `<catalogos>\n${catalogs||'(sin catálogos disponibles)'}\n</catalogos>`].join('\n\n');
}

/** Current contract clauses (Administración › Cláusulas del contrato), as plain text: the same ones the customer signs. */
export async function loadContractClauses(db:SupabaseClient){
 const {data}=await db.from('plantillas_contratos').select('titulo,contenido').order('numero_orden',{ascending:true});
 const plain=(v:unknown)=>String(v||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\n{3,}/g,'\n\n').trim();
 return ((data||[]) as {titulo:string;contenido:string}[]).map(c=>`${plain(c.titulo)}\n${plain(c.contenido)}`).join('\n\n').slice(0,60000);
}

/** Catalog links per store and dress type with dresses visible to customers (same rule as the public catalog), marked as sent by the AI. */
export async function loadCatalogLinks(db:SupabaseClient){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 const [{data:dresses},{data:sites},{data:types}]=await Promise.all([
  db.from('vestidos').select('codigo,categoria,talla,color,sede_actual_id,clasificacion_id,foto_frente,foto_espalda,foto_detalle,imagen_url,precio_sugerido,para_alquiler,estado').eq('archivado',false).order('precio_sugerido'),
  db.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),
  db.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('nombre'),
 ]);
 const count=new Map<string,number>();
 for(const d of (dresses||[]) as (CatalogDress&{sede_actual_id:string|null;clasificacion_id:number|null})[])
  if(d.sede_actual_id&&d.clasificacion_id&&isPublicCatalogDress(d)){const k=`${d.sede_actual_id}|${d.clasificacion_id}`;count.set(k,(count.get(k)||0)+1);}
 const lines:string[]=[];
 for(const s of (sites||[]) as {id:string;nombre:string}[]){
  // General link of the store: the customer chooses the dress type there.
  if([...count.keys()].some(k=>k.startsWith(`${s.id}|`)))lines.push(`- ${s.nombre} · todos los tipos (la clienta elige): ${origin}/${allySlug(s.nombre)}?o=ia-whatsapp`);
  for(const t of (types||[]) as {id:number;nombre:string}[]){
  const n=count.get(`${s.id}|${t.id}`);if(n)lines.push(`- ${s.nombre} · ${t.nombre} (${n} vestidos): ${origin}/${allySlug(s.nombre)}/${allySlug(t.nombre)}?o=ia-whatsapp`);
  }
 }
 // Dresses customers can see, so the AI can answer what they ask for (color, size, category, price).
 const tipoNombre=new Map(((types||[]) as {id:number;nombre:string}[]).map(t=>[t.id,t.nombre]));
 const inv=((dresses||[]) as (CatalogDress&{codigo:string;categoria:string|null;talla:string|null;color:string|null;sede_actual_id:string|null;clasificacion_id:number|null})[]).filter(d=>d.sede_actual_id&&isPublicCatalogDress(d));
 for(const s of (sites||[]) as {id:string;nombre:string}[]){
  const del=inv.filter(d=>d.sede_actual_id===s.id);if(!del.length)continue;
  lines.push(`\nInventario visible en ${s.nombre} (código · tipo · categoría · talla · color · alquiler):`);
  for(const d of del)lines.push(`${String(d.codigo).trim()} · ${tipoNombre.get(d.clasificacion_id!)||'—'} · ${d.categoria||'—'} · ${d.talla||'—'} · ${d.color||'—'} · $${Number(d.precio_sugerido).toLocaleString('es-CO')}`);
 }
 return lines.join('\n');
}

async function loadBasics(db:SupabaseClient){
 const [{data:cfg},{data:sites},clauses,catalogs]=await Promise.all([
  db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento,auto_activa,reactivar_horas').eq('id',1).maybeSingle(),
  db.from('sedes').select('id,nombre,direccion,direccion_clientes,whatsapp,mapa_url').eq('activo',true).order('nombre'),
  loadContractClauses(db),
  loadCatalogLinks(db),
 ]);
 return {clauses,catalogs,cfg:(cfg||{conocimientos:'',instrucciones:'',escalamiento:'',auto_activa:false,reactivar_horas:12}) as IaConfig&{auto_activa:boolean;reactivar_horas:number},sites:(sites||[]) as Site[]};
}

const COMMENT_SCHEMA={type:'object',additionalProperties:false,required:['tipo','publica','privado'],properties:{
 tipo:{type:'string',enum:['interes','elogio','negativo','otro'],description:'interes: pregunta precio, disponibilidad, tallas, sedes, citas, «info» o muestra intención de alquilar. elogio: halagos, emojis, etiquetas a amigas. negativo: queja, reclamo o crítica. otro: lo demás o spam.'},
 publica:{type:'string',description:'Respuesta pública bajo el comentario: máximo 2 frases cortas y cálidas, sin precios exactos ni datos personales. Si es interés, di que le escribimos por mensaje directo.'},
 privado:{type:'string',description:'Solo si es interés: primer mensaje directo a la persona, como una asesora, respondiendo lo que preguntó con los datos del ERP y dando un paso siguiente (catálogo de su sede o agendar). Si no es interés, cadena vacía.'},
}};

/** Instagram or Facebook comment: the AI classifies it and writes the public reply and, if there is buying interest, the first private message.
 *  With automatic replies on: interest → private message (it becomes a chat the AI keeps answering) + short public reply; praise → public thanks;
 *  complaints and the rest stay pending for a person. */
export async function handleComment(db:SupabaseClient,id:string,auto=true){
 if(!process.env.ANTHROPIC_API_KEY)return;
 const {data:c}=await db.from('redes_comentarios').select('id,canal,comentario_id,texto,autor_id,autor_nombre,publicacion_texto,estado,created_at').eq('id',id).maybeSingle();
 if(!c?.texto)return;
 try{
  const {cfg,sites,clauses,catalogs}=await loadBasics(db);
  const today=new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',year:'numeric',month:'long',day:'numeric'});
  const response=await new Anthropic().messages.create({model:MODEL,max_tokens:1500,
   system:[{type:'text',text:systemPrompt(cfg,sites,clauses,catalogs),cache_control:{type:'ephemeral'}}],
   output_config:{effort:'low',format:{type:'json_schema',schema:COMMENT_SCHEMA}},
   messages:[{role:'user',content:`Hoy es ${today}. Recibimos un COMENTARIO PÚBLICO en una publicación de ${c.canal==='facebook'?'Facebook':'Instagram'} de Ámbar Couture${c.publicacion_texto?` (texto de la publicación: «${String(c.publicacion_texto).slice(0,400)}»)`:''}.\nComentario de ${c.canal==='facebook'?'':'@'}${c.autor_nombre||'cliente'}: ${c.texto}\n\nClasifícalo y escribe la respuesta pública y, si hay interés, el primer mensaje directo. El mensaje directo empieza mencionando con naturalidad que vimos su comentario. Si no sabes su ciudad, pregúntala para enviarle el catálogo de su sede.`}]});
  const text=response.content.find(b=>b.type==='text');
  if(!text||text.type!=='text')throw Error('La IA no devolvió respuesta.');
  const out=JSON.parse(text.text) as {tipo:string;publica:string;privado:string};
  const publica=out.publica.trim().slice(0,2000),red=c.canal==='facebook'?'messenger':'instagram',privado=marcarCanal(out.privado.trim(),red).slice(0,1000);
  await db.from('redes_comentarios').update({ia_tipo:out.tipo,ia_sugerencia:publica||null,ia_privado:privado||null,ia_error:null,ia_at:new Date().toISOString()}).eq('id',id);
  if(!auto||!cfg.auto_activa||c.estado!=='pendiente'||!['interes','elogio'].includes(out.tipo))return;
  const s=await loadSocialSettings(db);if(!s)return;
  const now=new Date().toISOString(),cambios:Record<string,unknown>={respondido_at:now};
  if(out.tipo==='interes'&&privado&&Date.now()-Date.parse(c.created_at)<7*86400000){
   const dm=await privateReplyComment(s,c.comentario_id,privado);
   await chatFromPrivateReply(db,dm,c,privado,'ia');
   Object.assign(cambios,{estado:'privado',respuesta:privado,respuesta_id:dm.id});
  }
  if(publica){try{const pid=await replyComment(s,c.comentario_id,publica,c.canal);Object.assign(cambios,{respuesta_publica:publica,respuesta_publica_id:pid});if(!cambios.estado)Object.assign(cambios,{estado:'respondido',respuesta:publica,respuesta_id:pid});}catch(e){if(!cambios.estado)throw e;cambios.ia_error=`Mensaje privado enviado; la respuesta pública falló: ${aiErrorText(e)}`.slice(0,300);}}
  if(cambios.estado)await db.from('redes_comentarios').update(cambios).eq('id',id);
 }catch(e){await db.from('redes_comentarios').update({ia_error:aiErrorText(e).slice(0,300),ia_at:new Date().toISOString()}).eq('id',id);}
}
/** «Sugerir con IA» in the comments tab: new suggestion only, nothing is sent. */
export const suggestCommentReply=(db:SupabaseClient,id:string)=>handleComment(db,id,false);

/** What the WhatsApp AI gets from the ERP on every chat (fixed rules, stores, catalogs and inventory), for the knowledge chat. */
export async function loadErpContext(db:SupabaseClient){
 const {sites,catalogs}=await loadBasics(db);
 const empty:IaConfig={conocimientos:'',instrucciones:'',escalamiento:''};
 return systemPrompt(empty,sites,'',catalogs).split('\n\n<conocimientos>')[0]+`\n\n<catalogos>\n${catalogs||'(sin catálogos)'}\n</catalogos>\n\nAdemás, en cada chat recibe los datos de la clienta en el ERP: nombre, sede, primeras citas y contratos.`;
}

/** One AI call. Used by the inbox and by the «Probar» box of the settings screen. */
export async function runWhatsappAI(cfg:IaConfig,sites:Site[],customer:unknown,chat:string,clauses='',catalogs='',extra:Anthropic.ContentBlockParam[]=[],db?:SupabaseClient):Promise<IaOutput>{
 const today=new Date().toLocaleDateString('es-CO',{timeZone:'America/Bogota',weekday:'long',year:'numeric',month:'long',day:'numeric'});
 const client=new Anthropic();
 // Photos and files the customer sent go first, then the conversation.
 const messages:Anthropic.MessageParam[]=[{role:'user',content:[...extra,{type:'text',text:`Hoy es ${today}.\n\nDatos de la clienta en el ERP (nombre, sede, primeras citas y contratos):\n${JSON.stringify(customer)}\n\nConversación (la más reciente al final):\n${chat}${extra.length?'\n\n(Los archivos de arriba los envió la clienta en sus últimos mensajes.)':''}`}]}];
 // With the database, the AI can look up dress availability and free visit slots (up to 4 rounds of lookups).
 let response:Anthropic.Message;
 for(let round=0;;round++){
  response=await client.messages.create({
   model:MODEL,max_tokens:2000,
   system:[{type:'text',text:systemPrompt(cfg,sites,clauses,catalogs),cache_control:{type:'ephemeral'}}],
   output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
   ...(db?{tools:WHATSAPP_TOOLS,tool_choice:{type:'auto' as const}}:{}),
   messages,
  });
  if(response.stop_reason!=='tool_use'||!db||round>=4)break;
  const calls=response.content.filter((b):b is Anthropic.ToolUseBlock=>b.type==='tool_use');
  const results=await Promise.all(calls.map(async c=>{
   try{return {type:'tool_result' as const,tool_use_id:c.id,content:await runWhatsappTool(db,sites,c.name,c.input as Record<string,unknown>)};}
   catch{return {type:'tool_result' as const,tool_use_id:c.id,content:'No se pudo consultar ahora.',is_error:true};}
  }));
  messages.push({role:'assistant',content:response.content},{role:'user',content:results});
 }
 if(response.stop_reason==='refusal')throw Error('La IA no quiso responder este chat.');
 const text=response.content.find(b=>b.type==='text');
 if(!text||text.type!=='text')throw Error('La IA no devolvió respuesta.');
 return JSON.parse(text.text) as IaOutput;
}
export const aiErrorText=(e:unknown)=>e instanceof Anthropic.APIError?`Anthropic ${e.status}: ${e.message}`:e instanceof Error?e.message:'Error de la IA';

/** «Probar»: what the AI would answer to a sample message with the given (unsaved) settings. */
export async function testWhatsappAI(db:SupabaseClient,cfg:IaConfig,turns:{rol:'clienta'|'ambar';texto:string}[],adjuntos?:unknown){
 const blocks=attachmentBlocks(adjuntos);
 const {sites,clauses,catalogs}=await loadBasics(db);
 return runWhatsappAI(cfg,sites,{nombre:null,citas:[],contratos:[]},turns.map(t=>`${t.rol==='clienta'?'Clienta':'Ámbar'}: ${t.texto}`).join('\n'),clauses,catalogs,blocks,db);
}

/** Builds the suggestion for one chat and saves it. Errors are saved in ia_error so the screen can show them. */
export async function suggestWhatsappReply(db:SupabaseClient,conversationId:string){
 if(!process.env.ANTHROPIC_API_KEY)return;
 try{
  const [{data:conv},{data:msgs},{cfg,sites,clauses,catalogs}]=await Promise.all([
   db.from('whatsapp_conversaciones').select('id,telefono,nombre,sede_id,ia_pausada,ia_pausada_at,canal,contacto_id').eq('id',conversationId).single(),
   db.from('whatsapp_mensajes').select('id,direccion,texto,created_at,media_id,media_tipo').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(20),
   loadBasics(db),
  ]);
  if(!conv||!msgs?.length)return;
  const history=(msgs as Msg[]).reverse();
  if(history[history.length-1].direccion!=='entrante')return;// already answered
  const social=conv.canal&&conv.canal!=='whatsapp';
  const {data:ctx}=social?{data:null}:await db.rpc('whatsapp_contexto_servidor',{p_tel:conv.telefono});
  const chat=history.map(m=>`[${new Date(m.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'})}] ${m.direccion==='entrante'?'Clienta':'Ámbar'}: ${m.texto||''}`).join('\n');
  // Photos the customer sent since Ámbar's last reply (up to 2), so the AI can see them.
  const pendientes:(Msg&{media_id?:string|null})[]=[];for(let i=history.length-1;i>=0&&history[i].direccion==='entrante';i--)pendientes.push(history[i]);
  const fotos=pendientes.filter(m=>m.media_id).slice(0,2);
  const extra:Anthropic.ContentBlockParam[]=[];
  if(fotos.length){const settings=await loadWhatsappSettings(db);if(settings.token)for(const m of fotos){const img=await downloadWhatsappImage(settings,String(m.media_id)).catch(()=>null);
   if(img&&['image/jpeg','image/png','image/webp','image/gif'].includes(img.tipo))extra.push({type:'image',source:{type:'base64',media_type:img.tipo as 'image/jpeg',data:img.datos}});}}
  const out=await runWhatsappAI(cfg,sites,{canal:conv.canal||'whatsapp',nombre_perfil:conv.nombre,...(ctx||{})},chat,clauses,catalogs,extra,db);
  out.respuesta=marcarCanal(out.respuesta,conv.canal);
  const sede=sites.find(s=>s.nombre.toLowerCase()===out.sede.trim().toLowerCase());
  await db.from('whatsapp_conversaciones').update({etiqueta:out.etiqueta,ia_resumen:out.resumen.slice(0,500),ia_sugerencia:out.respuesta.slice(0,2000),
   ia_atender:!!out.atender_persona,ia_motivo:out.atender_persona?out.motivo.slice(0,300):null,ia_at:new Date().toISOString(),ia_error:null,...(!conv.sede_id&&sede?{sede_id:sede.id}:{})}).eq('id',conversationId);
  // Automatic reply: general switch on and chat not paused by a person (or paused longer than the configured hours).
  // When a person must continue, the reply is still sent (it helps with what the AI can solve) and the chat stays flagged.
  if(!cfg.auto_activa||!out.respuesta.trim())return;
  const expired=conv.ia_pausada&&conv.ia_pausada_at&&Date.now()-Date.parse(conv.ia_pausada_at)>cfg.reactivar_horas*3600000;
  if(conv.ia_pausada&&!expired)return;
  // Send only if nothing changed meanwhile: same last message (a newer one gets its own reply) and no person stepped in.
  const [{data:last},{data:now}]=await Promise.all([
   db.from('whatsapp_mensajes').select('id').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   db.from('whatsapp_conversaciones').select('ia_pausada,ia_pausada_at').eq('id',conversationId).single(),
  ]);
  const lastId=(history[history.length-1] as Msg&{id?:string}).id;
  if(!last||last.id!==lastId||(now?.ia_pausada&&now.ia_pausada_at!==conv.ia_pausada_at))return;
  const texto=out.respuesta.trim().slice(0,4000);let waId:string;
  if(social){const s=await loadSocialSettings(db);if(!s||!conv.contacto_id)return;waId=await sendSocialText(s,conv.contacto_id,texto);}
  else{const settings=await loadWhatsappSettings(db);if(!settings.token||!settings.phoneNumberId)return;waId=await sendWhatsappText(settings,conv.telefono,texto);}
  const at=new Date().toISOString();
  await db.from('whatsapp_mensajes').insert({conversacion_id:conversationId,wa_id:waId,direccion:'saliente',origen:'ia',tipo:'text',texto,estado:'sent',created_at:at});
  await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at,ia_sugerencia:null,...(expired?{ia_pausada:false,ia_pausada_at:null,ia_pausada_por:null}:{})}).eq('id',conversationId);
 }catch(e){
  await db.from('whatsapp_conversaciones').update({ia_error:aiErrorText(e).slice(0,300),ia_at:new Date().toISOString()}).eq('id',conversationId);
 }
}

const KNOWLEDGE=`Eres la asistente que administra lo que sabe la IA de WhatsApp de Ámbar Couture (tiendas de alquiler de vestidos de XV, gala, novia y pajecitas en Colombia).
Conversas con la administración. También recibes las cláusulas vigentes del contrato: puedes explicarlas y la IA de WhatsApp las usa, pero no las cambias (se editan en «Cláusulas del contrato» del ERP); si piden cambiarlas, indícalo. Recibes la configuración actual en tres secciones: conocimientos (datos del negocio), instrucciones (forma de responder y tono) y escalamiento (cuándo debe atender una persona), y la conversación.
También recibes <datos_del_erp>: las reglas fijas de la IA de WhatsApp y lo que ella recibe automáticamente del ERP en cada chat (sedes con dirección y enlaces, catálogos por sede y tipo, inventario visible con talla, color y precio de alquiler, y los datos de la clienta: sus citas y contratos). Eso ya lo sabe la IA de WhatsApp: no propongas copiarlo a la configuración; si piden agregar algo que ya está ahí, dilo y explica de dónde lo toma. Nunca digas que falta un dato que está en <datos_del_erp>.
Pasar a una persona es el último recurso y la IA debe sonar humana y cercana. Si una regla de la configuración manda a una persona algo que la IA puede resolver con los datos del ERP, o contradice las reglas fijas, avísalo y propón corregirlo.

Qué haces en cada mensaje (campo "accion"):
- "responder": contestar una pregunta sobre lo que sabes, o pedir un dato que falta. Si te preguntan algo que no está en la configuración, dilo claramente y ofrece agregarlo.
- "proponer": cuando la administración quiere agregar, corregir o quitar algo. No lo aplicas: propones los cambios exactos y en "respuesta" preguntas si confirma. Cada cambio es una de estas operaciones sobre una sección:
  · agregar: "despues" es el texto nuevo (viñetas cortas); "antes" vacío.
  · reemplazar: "antes" es un fragmento copiado EXACTAMENTE del texto actual de esa sección y "despues" su versión corregida.
  · quitar: "antes" es el fragmento exacto a borrar; "despues" vacío.
  Pon cada cosa en su sección. Si algo nuevo contradice lo que ya existe, reemplaza lo existente en vez de agregar una contradicción.
- "confirmar": la administración aceptó la propuesta pendiente (dice sí, dale, confírmalo, etc.).
- "descartar": la administración rechazó la propuesta pendiente sin pedir otra cosa.
Nunca inventes datos (precios, horarios, políticas): si faltan, pregúntalos con "responder".
No propongas cambios que permitan inventar precios o disponibilidad, enviar mensajes sin control o dar saldos: esas protecciones son fijas.
Escribe en español claro, breve y cálido. Trata a la administración de tú.`;
const KNOWLEDGE_SCHEMA={type:'object',additionalProperties:false,required:['accion','respuesta','cambios'],properties:{
 accion:{type:'string',enum:['responder','proponer','confirmar','descartar']},
 respuesta:{type:'string'},
 cambios:{type:'array',items:{type:'object',additionalProperties:false,required:['seccion','operacion','antes','despues'],properties:{
  seccion:{type:'string',enum:['conocimientos','instrucciones','escalamiento']},
  operacion:{type:'string',enum:['agregar','reemplazar','quitar']},
  antes:{type:'string'},despues:{type:'string'},
 }}},
}};
export type IaCambio={seccion:keyof IaConfig;operacion:'agregar'|'reemplazar'|'quitar';antes:string;despues:string};
export type KnowledgeTurn={accion:'responder'|'proponer'|'confirmar'|'descartar';respuesta:string;cambios:IaCambio[]};

/** Applies proposed changes to the settings; fails if a fragment to replace or remove is no longer in the text. */
export function applyIaChanges(cfg:IaConfig,cambios:IaCambio[]):IaConfig{
 const out={...cfg};
 for(const c of cambios){
  const actual=out[c.seccion]||'';
  if(c.operacion==='agregar'){out[c.seccion]=`${actual.trimEnd()}${actual.trim()?'\n':''}${c.despues.trim()}`;continue;}
  if(!c.antes||!actual.includes(c.antes))throw Error(`No encontré en ${c.seccion} el texto «${c.antes.slice(0,80)}». Pídeme el cambio otra vez.`);
  out[c.seccion]=actual.replace(c.antes,c.operacion==='quitar'?'':c.despues).replace(/\n{3,}/g,'\n\n');
 }
 return out;
}

/** One turn of the knowledge chat. The model answers, proposes exact changes, or recognizes a confirmation. */
export async function knowledgeChatTurn(cfg:IaConfig,history:{rol:'admin'|'ia';texto:string}[],pendiente:IaCambio[]|null,clauses='',extra:Anthropic.ContentBlockParam[]=[],erp=''):Promise<KnowledgeTurn>{
 // Vercel stops the request at 60 s: fail with a clear message before that.
 const client=new Anthropic({timeout:55000,maxRetries:0});
 const chat=history.slice(-16).map(h=>`${h.rol==='admin'?'Administración':'Asistente'}: ${h.texto}`).join('\n\n');
 const response=await client.messages.create({
  model:'claude-opus-5-5',max_tokens:8000,system:KNOWLEDGE,
  output_config:{effort:'low',format:{type:'json_schema',schema:KNOWLEDGE_SCHEMA}},
  // Files the administration attached (price lists, policies, photos) go first, then the request.
  messages:[{role:'user',content:[...extra,{type:'text',text:`<configuracion_actual>\n<conocimientos>\n${cfg.conocimientos}\n</conocimientos>\n<instrucciones>\n${cfg.instrucciones}\n</instrucciones>\n<escalamiento>\n${cfg.escalamiento}\n</escalamiento>\n</configuracion_actual>\n\n<clausulas_del_contrato>\n${clauses||'(sin cláusulas)'}\n</clausulas_del_contrato>\n\n<datos_del_erp>\n${erp||'(no disponibles)'}\n</datos_del_erp>\n\n<propuesta_pendiente>\n${pendiente?JSON.stringify(pendiente):'ninguna'}\n</propuesta_pendiente>\n\n<conversacion>\n${chat}\n</conversacion>\n\nResponde al último mensaje de la administración.`}]}],
 });
 if(response.stop_reason==='refusal')throw Error('La IA no quiso responder eso. Escríbelo de otra forma.');
 const text=response.content.find(b=>b.type==='text');
 if(!text||text.type!=='text')throw Error('La IA no devolvió respuesta.');
 return JSON.parse(text.text) as KnowledgeTurn;
}
