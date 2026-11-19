import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {loadWhatsappSettings} from './whatsapp-config';
import {sendWhatsappText,sendWhatsappImage,downloadWhatsappImage,sendWhatsappButtons,CRM_BOTONES} from './whatsapp-inbox';
import {attachmentBlocks} from './ai-attachments';
import {allySlug} from './ally-validation';
import {isPublicCatalogDress,type CatalogDress} from './catalog-public';
import {WHATSAPP_TOOLS,runWhatsappTool} from './whatsapp-tools';
import {loadSocialSettings,sendSocialText,replyComment,privateReplyComment,chatFromPrivateReply,COMMENT_GONE} from './social-inbox';
import {marcarCanal} from './event-channel';
import {documentsForAI} from './doc-ia';
import {inventoryCandidates} from './dress-photo-match';
import {planEnrollToken} from './plan-ahorro-contrato';
import {enviarHorarios} from './whatsapp-booking';
import {aiClient} from './ai-usage';
import {PROMO_FIELDS,promoState,promoBenefit,type Promotion} from './promotions';

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
- Fotos y archivos: si la clienta envía la foto de un vestido (de nuestro catálogo, de redes o de su inspiración), compárala con las fotos de <candidatos_inventario>. Si una es el mismo vestido (mismo modelo, color y adornos), dile que sí lo tenemos y responde lo que pregunta con sus datos (código, sede, talla, color, precio de alquiler); si está en su sede, pon su código en «fotos». Si ninguno es el mismo, dile con calidez que ese modelo exacto no lo tenemos y ofrécele hasta 3 opciones parecidas del inventario visible de la sede más cercana a ella (la de su chat, su cita o la ciudad que dijo; si no la sabes, pregúntale en qué ciudad está), con sus códigos en «fotos». Si en esa sede no hay nada parecido, ofrécele una cita virtual con una asesora para revisar si en otras sedes está lo que busca, con el enlace de agenda de su sede. Nunca afirmes que es el mismo vestido si no estás segura.
- Fotos del inventario: los vestidos marcados con 📷 en el inventario tienen foto. Si la clienta pide ver un vestido concreto o le propones opciones (por color, talla, categoría o precio), pon en «fotos» hasta 3 códigos con 📷 del inventario visible de su sede y en la respuesta preséntalos en pocas palabras (las fotos llegan justo después de tu mensaje, cada una con su código). No envíes fotos de otra sede ni de vestidos sin 📷, ni repitas fotos que ya enviaste en el chat. Si pide ver muchos modelos, envía el catálogo de su sede.
- Venta: además de alquilar, Ámbar vende sus vestidos. Si la clienta quiere comprar, dale el precio de venta del inventario de su sede (columna «venta», distinto del de alquiler; también aparece en los catálogos). Si dice «venta a consultar», di que una asesora le confirma el precio de ese modelo. Para compras desde el exterior o al por mayor, sigue lo que digan los conocimientos.
- Catálogo: si la clienta pide ver vestidos, modelos, fotos o el catálogo, envíale el enlace del catálogo de su sede y tipo de vestido tal cual aparece en <catalogos> (no lo modifiques). Si sabes la sede pero no el tipo de vestido, envía el enlace general de esa sede (ahí la clienta elige el tipo). Si no sabes la sede, pregúntala primero. Si esa combinación no está en la lista, di que una asesora le comparte opciones. Invítala a agendar su primera cita desde el catálogo.
- Cláusulas del contrato: si preguntan por depósito, devoluciones, multas, mora, cancelación, arreglos, accesorios u otras reglas, explícalas en palabras sencillas y en pocas frases, según las cláusulas que recibes; no copies el texto legal completo. Las cláusulas marcadas [PreXV] aplican solo a contratos con sesión Pre XV. No interpretes casos particulares en disputa ni prometas excepciones.
- Aliados directos: si quien escribe ofrece servicios de eventos (fotografía, maquillaje y peinado, organización, decoración, salón de eventos, wedding planner, etc.) o pregunta por el programa de aliados, es un posible aliado, no una clienta: etiqueta «aliado». Explícale el programa con las cláusulas de <programa_aliados> (sin inventar nada que no esté ahí). Empieza por lo atractivo: incluye en sus paquetes los vestidos de Ámbar, con descuentos especiales para aliados (5 % sobre el catálogo) y acceso a más de 600 vestidos de XV y gala en 4 sedes, con los catálogos de <catalogos> para mostrarle a sus clientas; Pre XV con 50 % si el vestido sale y vuelve el mismo día; envíos a todo Colombia y al exterior con seguro obligatorio; medidas con guías en video y la asesora de la sede; pagos en pesos por transferencia o PayPal; la cuenta bancaria es para devolverle el depósito y reembolsos; además gana visibilidad: recibe una mención de bienvenida, por cada evento con vestido Ámbar 3 historias en Instagram, TikTok y Facebook y 1 reel en colaboración, y si es constante (al menos 1 evento al mes durante 3 meses) una publicación semanal en esas redes y en los estados de WhatsApp de Ámbar; para eso debe autorizarlo en el formulario y enviar el material del evento en máximo 3 días. Ámbar no paga comisiones. El precio que el aliado cobra en su paquete lo define él (el acuerdo le permite hasta 20 % sobre el catálogo en el vestido); menciónalo solo si pregunta cómo gana o a qué precio puede vender. Pregúntale su ciudad o país, su tipo de negocio y cuántos eventos maneja al mes; sugiérele la sede más cercana (Llanos y Meta → Villavicencio; Bogotá, Cundinamarca, Boyacá y Tolima → Bogotá; Eje Cafetero, Valle y Antioquia → Pereira; Costa Caribe → Barranquilla; exterior → la que prefiera) y envíale el enlace de vinculación de esa sede de <programa_aliados>. Si ya es aliado o pregunta por un contrato, una clienta o un pago de aliado, marca atender_persona=true.
- Parqueadero: si una sede tiene «parqueadero» en <sedes>, dalo cuando pregunten por parqueadero o cuando agende o confirme una cita presencial en esa sede: aclara que es un parqueadero aliado (no propio) y que para el descuento debe pedir en Ámbar el sello en su tiquete de parqueo. Si la sede no tiene «parqueadero», no inventes uno: di que no hay convenio de parqueadero en esa sede.
- Agendar con botones (solo WhatsApp): si la clienta quiere agendar su primera cita, sabes su sede y no tiene una primera cita pendiente en sus datos, pon «agendar»='presencial' ('virtual' si la pide virtual o no puede ir a la sede) y «tipo_vestido_cita» (Quince, Gala o Novia; si no lo sabes, el más probable por la conversación). El ERP le envía justo después de tu respuesta los horarios libres más cercanos como lista: ella toca uno, acepta el uso de sus datos y queda reservada. En tu respuesta dile, corto y cálido, que le envías los horarios disponibles para que elija con un toque; no pongas el enlace de agenda (la lista trae «Ver más días»). Si no sabes la sede, pregúntala primero y deja «agendar» vacío. Cuando quiera agendar, no le pidas antes la fecha del evento ni otros datos: primero envíale los horarios; la fecha se pregunta después de reservar. En Instagram o Messenger deja «agendar» vacío.
- Cita primero: el objetivo de cada chat nuevo es su primera cita (no tiene costo). Si en los datos de la clienta viene «sede_del_chat» (por ejemplo, llegó por un anuncio de esa sede) o ya dijo su ciudad, ofrécele la cita desde tu primera o segunda respuesta con «agendar», aunque aún no sepas el tipo de evento ni la fecha: responde en una frase lo que preguntó y envíale los horarios. No pidas la fecha del evento ni el tipo de vestido antes de ofrecer la cita: pregúntalos después o deduce el tipo por el anuncio o lo que escribió. Si escribe que quiere agendar, agenda de una. Si vive lejos de las sedes, ofrécele cita virtual con la sede más cercana. Si no sabes su ciudad, pregúntala en tu primera respuesta junto con lo que te preguntó. Si dice qué día puede ir, pon ese día en «agendar_desde» para que la lista empiece ese día (no le vuelvas a mandar la misma lista). Si ya le enviaste los horarios y no pidió otro día ni otra modalidad, no los envíes de nuevo («agendar» vacío): solo recuérdale tocar «Elegir horario» en la lista de arriba.
- Vestidos para niñas: si el vestido es para una niña (pajecita, niña de cortejo o de honor, menor de 13 años), ofrece solo vestidos de tipo Pajecita y mira «Vestidos para niñas» en <catalogos> para saber qué sedes los tienen. Las tallas con número (6, 8, 10, 12…) de Gala, XV y Novia son tallas de mujer, no edades: nunca se las ofrezcas para una niña. Si su sede no tiene pajecitas, díselo de una vez y ofrécele la sede que sí tiene (cita presencial o virtual).
- Plan Ahorro XV: si la fecha del evento es a 6 meses o más, o la clienta dice que el presupuesto no le alcanza o que quiere ir pagando, ofrécele el Plan Ahorro XV con las condiciones de <documentos_de_la_marca> (cuota desde $150.000 al mes, extra del 10 % sobre lo ahorrado y premios en préstamo). Si el evento es en menos de 6 meses no lo ofrezcas: va por la venta normal. Cuando pregunte por el plan o quiera inscribirse, pon «plan_ahorro»=true y dile que al final de tu mensaje va su enlace para inscribirse ella misma y firmar el contrato desde el celular, y que al firmar la asesora de su sede le escribe para la primera cuota (no escribas tú el enlace: el sistema lo agrega).
- Datos tras reservar: cuando ya reservó por WhatsApp, el ERP le pide su nombre completo y correo (opcionales). Si los escribe, ponlos en «nombre_completo» y «correo» y agradécele corto; si no quiere darlos, no insistas.
- No le pidas a la clienta que escriba «confirmo» u otra palabra para confirmar o cambiar su cita: la confirmación, el recordatorio y el cambio de horario le llegan con botones.
- Reagendar o cancelar la primera cita (no confundir con cancelar un contrato): si quiere reagendar y escribe por WhatsApp, pon «agendar» con la modalidad de su cita: el ERP le envía la lista de horarios libres para cambiarla con un toque, sin cédula (dile que se la envías). Por Instagram o Messenger, envíale el enlace para reprogramar que aparece en <sedes>; ahí escribe su cédula y elige el nuevo horario. Si dice que no la encuentra con su cédula, marca atender_persona=true. Si quiere cancelar, ofrécele primero reagendar para no perder su cita; si insiste en cancelar, dile que una asesora la ayuda y marca atender_persona=true con el motivo «Cancelar cita». Si ya tiene contrato y quiere cambiar las citas de medidas, prueba o entrega, marca atender_persona=true.
- Marca atender_persona=true (tu respuesta igual se envía y el chat queda marcado para una asesora) solo cuando la clienta pida hablar con una persona, reclame o discuta un cobro, una multa o una cláusula, pida una excepción, cuando sea un reclamo, un pago o un cambio de contrato, o cuando lo indiquen las reglas de paso a una persona; explica el motivo en una frase.

Seguimiento (clientas que ya tuvieron cita o visitaron la tienda y no alquilaron):
- Si en los datos de la clienta viene «seguimiento», Ámbar le escribió para retomar su búsqueda. Habla de la cita, la sede y la fecha que vienen en «seguimiento» (es la cita por la que le escribimos), no de otras citas que aparezcan en sus datos. Retómala con calidez según «tipo»: si no asistió, ayúdale a reagendar; si asistió o vino a la tienda y no alquiló, pregúntale cómo va con su vestido y, según «motivo_no_alquiler», ofrécele una salida concreta (otro modelo o categoría del inventario, el catálogo de su sede, separar la fecha). El objetivo es que agende una nueva cita.
- Promociones: ofrécele las de <promociones> que apliquen a su sede y tipo de vestido, con su fecha límite, como gancho para que agende o separe. Nunca inventes promociones ni digas que se acumulan.
- Fecha del evento: en los datos del ERP cada cita y contrato trae «evento_ya_paso». Si el evento ya pasó y hay contrato, mira su estado, «entregado_evento» y «finalizado_at» para saber si ya se realizó (no lo preguntes). Si no hay contrato, pregúntale a ella con naturalidad si ya fue su evento o si cambió la fecha; nunca lo pongas en «falta_informacion». Cuando la clienta te diga la fecha de su evento (nueva o por primera vez), escríbela en «fecha_evento_nueva» como AAAA-MM-DD; si no dio una fecha exacta, cadena vacía.
- En «cierre_seguimiento» marca evento_realizado si dice que su evento ya pasó y no alquiló con nosotras; alquilo_otro si dice que ya alquiló o compró en otro lugar, no_interesa si dice que ya no lo necesita o no le interesa, no_contactar si pide que no le escriban más (en ese caso despídete con respeto y no insistas). En cualquier otro caso, cadena vacía.

Lo que no sabes: si la clienta pregunta algo que no está en tus conocimientos ni en los datos del ERP, no lo inventes. Dile con naturalidad que lo confirmas y, en «falta_informacion», escribe en una frase corta qué dato le falta a Ámbar darte (ej.: «Horario de atención los domingos en Pereira», «Si se puede pagar con tarjeta de crédito»), para que administración lo complete y la próxima vez respondas sola. Si no falta nada, cadena vacía.

Además: elige la etiqueta del tema principal, la sede de la clienta (solo si es clara; si no, cadena vacía) y un resumen de una frase para la asesora.`;

const SCHEMA={type:'object',additionalProperties:false,required:['etiqueta','sede','resumen','respuesta','atender_persona','motivo','cierre_seguimiento','falta_informacion','fecha_evento_nueva','fotos','agendar','agendar_desde','tipo_vestido_cita','nombre_completo','correo','plan_ahorro'],properties:{
 etiqueta:{type:'string',enum:[...WHATSAPP_TAGS]},
 sede:{type:'string',description:'Nombre exacto de una de las sedes, o cadena vacía'},
 resumen:{type:'string'},
 respuesta:{type:'string'},
 atender_persona:{type:'boolean'},
 motivo:{type:'string',description:'Por qué debe atenderla una persona; cadena vacía si no hace falta'},
 cierre_seguimiento:{type:'string',enum:['','alquilo_otro','no_interesa','no_contactar','evento_realizado'],description:'Solo si la clienta lo dice en este chat; si no, cadena vacía'},
 falta_informacion:{type:'string',description:'Dato del negocio que no tienes y que administración debe darte; cadena vacía si no falta nada'},
 fecha_evento_nueva:{type:'string',description:'Fecha del evento que la clienta dijo en este chat (AAAA-MM-DD); cadena vacía si no la dijo'},
 fotos:{type:'array',items:{type:'string'},description:'Códigos (máximo 3) de vestidos con 📷 del inventario visible de su sede cuya foto se le envía con esta respuesta; lista vacía si no'},
 agendar_desde:{type:'string',description:'Si la clienta dijo qué día quiere ir a la cita, ese día como AAAA-MM-DD (la lista de horarios empieza ese día); cadena vacía si no'},
 agendar:{type:'string',enum:['','presencial','virtual'],description:'Solo por WhatsApp: el ERP le envía ya los horarios libres de su sede como lista para reservar con un toque; cadena vacía si no'},
 tipo_vestido_cita:{type:'string',enum:['','Quince','Gala','Novia'],description:'Tipo de vestido de la cita que se agenda; cadena vacía si no se agenda'},
 nombre_completo:{type:'string',description:'Nombre y apellido que la clienta escribió en este chat para sus datos (no el nombre del perfil); cadena vacía si no lo escribió'},
 correo:{type:'string',description:'Correo electrónico que la clienta escribió en este chat; cadena vacía si no lo escribió'},
 plan_ahorro:{type:'boolean',description:'true si la clienta pregunta por el Plan Ahorro XV (plan separe o plan reserva) o muestra interés en inscribirse; false si no'},
}};

export type IaConfig={conocimientos:string;instrucciones:string;escalamiento:string;documentos?:string;promociones?:string;aliados?:string};
export type IaOutput={etiqueta:string;sede:string;resumen:string;respuesta:string;atender_persona:boolean;motivo:string;cierre_seguimiento?:string;falta_informacion?:string;fecha_evento_nueva?:string;fotos?:string[];agendar_desde?:string;agendar?:string;tipo_vestido_cita?:string;nombre_completo?:string;correo?:string;plan_ahorro?:boolean};
type Msg={direccion:string;texto:string|null;created_at:string;media_id?:string|null;media_tipo?:string|null};
type Site={id:string;nombre:string;direccion:string|null;direccion_clientes:string|null;whatsapp:string|null;mapa_url:string|null;parqueadero?:string|null};

/** System prompt: fixed rules plus what administration wrote in «IA de WhatsApp». Stable between chats so it can be cached. */
function systemPrompt(cfg:IaConfig,sites:Site[],clauses:string,catalogs=''){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 const sedes=sites.map(s=>`- ${s.nombre}: dirección ${s.direccion_clientes||s.direccion||'—'}; WhatsApp ${s.whatsapp||'—'}; mapa ${s.mapa_url||'—'}${s.parqueadero?`; parqueadero: ${s.parqueadero}`:''}; agenda de primera cita ${origin}/agendar-primera-cita?sede=${s.id}&o=ia-whatsapp`).join('\n');
 return [BASE,
  `<sedes>\n${sedes}\nEnlace para reprogramar la primera cita (todas las sedes): ${origin}/reprogramar-primera-cita\n</sedes>`,
  `<conocimientos>\n${cfg.conocimientos.trim()||'(sin conocimientos adicionales)'}\n</conocimientos>`,
  `<instrucciones_de_administracion>\n${cfg.instrucciones.trim()||'(sin instrucciones adicionales)'}\n</instrucciones_de_administracion>`,
  `<reglas_de_paso_a_una_persona>\n${cfg.escalamiento.trim()||'(solo las reglas fijas)'}\n</reglas_de_paso_a_una_persona>`,
  `<clausulas_del_contrato>\n${clauses||'(sin cláusulas)'}\n</clausulas_del_contrato>`,
  `<catalogos>\n${catalogs||'(sin catálogos disponibles)'}\n</catalogos>`,
  `<programa_aliados>\nEnlaces de vinculación por sede:\n${sites.map(s=>`- ${s.nombre}: ${origin}/aliados/vincular?o=ia-whatsapp&sede=${s.id}`).join('\n')}\nAcuerdo con Aliado vigente (lo que firma el aliado; aplícalo con el representante de la sede que escoja):\n${cfg.aliados||'(no disponible: di que una asesora le explica el programa y marca atender_persona=true)'}\n</programa_aliados>`,
  `<promociones>\nPromociones vigentes registradas en el ERP (Ventas y CRM › Promociones). Solo estas existen.\n${cfg.promociones||'(sin promociones vigentes)'}\n</promociones>`,
  `<documentos_de_la_marca>\nResumen de documentos vigentes de la marca (planes, precios, condiciones, promociones). Úsalos como tus conocimientos; si un documento es de una sede, aplícalo solo a clientas de esa sede.\n${cfg.documentos||'(sin documentos)'}\n</documentos_de_la_marca>`].join('\n\n');
}

/** Latest ally agreement (Aliados directos › Contrato de vinculación): considerations and clauses, for the AI to explain the program. */
export async function allyAgreementForAI(db:SupabaseClient){
 const {data}=await db.from('acuerdos_aliado').select('secciones').order('version',{ascending:false}).limit(1).maybeSingle();
 return ((data?.secciones||[]) as {titulo:string;parrafos:string[]}[]).filter(s=>/consideraciones|cl[aá]usulas/i.test(s.titulo)).flatMap(s=>s.parrafos).join('\n').slice(0,12000);
}

/** Promotions in force today (Ventas y CRM › Promociones) with their stores, dress types, categories, conditions and end date. */
export async function promotionsForAI(db:SupabaseClient){
 const [{data:promos},{data:sites},{data:types}]=await Promise.all([
  db.from('promociones').select(PROMO_FIELDS).eq('activo',true),
  db.from('sedes').select('id,nombre'),
  db.from('clasificaciones_vestido').select('id,nombre'),
 ]);
 const sede=new Map(((sites||[]) as {id:string;nombre:string}[]).map(s=>[s.id,s.nombre])),tipo=new Map(((types||[]) as {id:number;nombre:string}[]).map(t=>[t.id,t.nombre]));
 const fecha=(d:string)=>new Date(d+'T12:00:00Z').toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
 return ((promos||[]) as Promotion[]).filter(p=>promoState(p)==='Vigente').map(p=>`- ${p.nombre}: ${promoBenefit(p)} · sedes: ${p.sede_ids?.length?p.sede_ids.map(id=>sede.get(id)||'—').join(', '):'todas'} · tipo: ${p.clasificacion_ids?.length?p.clasificacion_ids.map(id=>tipo.get(id)||'—').join(', '):'todos'}${p.categorias?.length?` · categorías: ${p.categorias.join(', ')}`:''} · hasta el ${fecha(p.hasta)}${p.codigo?` · código ${p.codigo}`:''}${p.condiciones?` · condiciones: ${p.condiciones}`:''}`).join('\n');
}

/** Current contract clauses (Administración › Cláusulas del contrato), as plain text: the same ones the customer signs. */
export async function loadContractClauses(db:SupabaseClient){
 const {data}=await db.from('plantillas_contratos').select('titulo,contenido').order('numero_orden',{ascending:true});
 const plain=(v:unknown)=>String(v||'').replace(/<br\s*\/?>/gi,'\n').replace(/<\/(p|div|li)>/gi,'\n').replace(/<[^>]+>/g,'').replace(/&nbsp;/g,' ').replace(/\n{3,}/g,'\n\n').trim();
 return ((data||[]) as {titulo:string;contenido:string}[]).map(c=>`${plain(c.titulo)}\n${plain(c.contenido)}`).join('\n\n').slice(0,60000);
}

/** Photo of a dress WhatsApp can send (JPG or PNG; front first), or null. */
const dressPhoto=(d:CatalogDress)=>[d.foto_frente,d.imagen_url,d.foto_espalda,d.foto_detalle].find(u=>u&&/^https:\/\/.+\.(jpe?g|png)$/i.test(u))||null;
/** Sends after the AI reply the photos of up to 3 dresses it chose: only visible dresses of the chat's store (or of any store if unknown). */
async function sendDressPhotos(db:SupabaseClient,settings:{token:string;phoneNumberId:string},conversationId:string,to:string,codes:string[],sedeId:string|null){
 const want=[...new Set(codes.map(c=>String(c).trim().toUpperCase()).filter(Boolean))].slice(0,3);if(!want.length)return;
 const {data}=await db.from('vestidos').select('codigo,sede_actual_id,foto_frente,foto_espalda,foto_detalle,imagen_url,precio_sugerido,para_alquiler,estado').eq('archivado',false).in('codigo',want);
 const list=((data||[]) as (CatalogDress&{codigo:string;sede_actual_id:string|null})[]).filter(d=>isPublicCatalogDress(d)&&(!sedeId||d.sede_actual_id===sedeId));
 for(const code of want){
  const d=list.find(x=>String(x.codigo).trim().toUpperCase()===code),link=d&&dressPhoto(d);if(!d||!link)continue;
  const caption=`Vestido ${String(d.codigo).trim()}`;
  const waId=await sendWhatsappImage(settings,to,link,caption).catch(()=>null);if(!waId)continue;
  await db.from('whatsapp_mensajes').insert({conversacion_id:conversationId,wa_id:waId,direccion:'saliente',origen:'ia',tipo:'image',texto:`📷 ${caption}\n${link}`,estado:'sent',created_at:new Date().toISOString()});
 }
}

/** Sale price of a dress for the AI's inventory list. */
const ventaTxt=(d:CatalogDress&{precio_venta?:number|null})=>Number(d.precio_venta)>0?`venta $${Number(d.precio_venta).toLocaleString('es-CO')}`:'venta a consultar';

/** Catalog links per store and dress type with dresses visible to customers (same rule as the public catalog), marked as sent by the AI. */
export async function loadCatalogLinks(db:SupabaseClient){
 const origin=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
 const [{data:dresses},{data:sites},{data:types}]=await Promise.all([
  db.from('vestidos').select('codigo,categoria,talla,color,sede_actual_id,clasificacion_id,foto_frente,foto_espalda,foto_detalle,imagen_url,precio_sugerido,precio_venta,para_alquiler,estado').eq('archivado',false).order('precio_sugerido'),
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
 // Dresses for girls: only the «Pajecita» type (numbered sizes of the other types are women's sizes).
 const paje=((types||[]) as {id:number;nombre:string}[]).find(t=>/pajecit|niñ/i.test(t.nombre));
 if(paje){
  const allDresses=((dresses||[]) as (CatalogDress&{talla:string|null;sede_actual_id:string|null;clasificacion_id:number|null})[]).filter(d=>d.clasificacion_id===paje.id&&d.sede_actual_id&&isPublicCatalogDress(d));
  const porSede=((sites||[]) as {id:string;nombre:string}[]).map(s=>{const l=allDresses.filter(d=>d.sede_actual_id===s.id);return l.length?`${s.nombre} (${l.length} vestidos; tallas ${[...new Set(l.map(d=>String(d.talla||'').trim()).filter(Boolean))].join(', ')||'—'})`:'';}).filter(Boolean);
  const sin=((sites||[]) as {id:string;nombre:string}[]).filter(s=>!allDresses.some(d=>d.sede_actual_id===s.id)).map(s=>s.nombre);
  lines.push(`\nVestidos para niñas (tipo ${paje.nombre}): ${porSede.length?porSede.join(' · '):'ninguna sede tiene en este momento'}${sin.length?`. No hay en ${sin.join(', ')}`:''}.`);
 }
 // Dresses customers can see, so the AI can answer what they ask for (color, size, category, price).
 const tipoNombre=new Map(((types||[]) as {id:number;nombre:string}[]).map(t=>[t.id,t.nombre]));
 const inv=((dresses||[]) as (CatalogDress&{codigo:string;categoria:string|null;talla:string|null;color:string|null;sede_actual_id:string|null;clasificacion_id:number|null})[]).filter(d=>d.sede_actual_id&&isPublicCatalogDress(d));
 for(const s of (sites||[]) as {id:string;nombre:string}[]){
  const del=inv.filter(d=>d.sede_actual_id===s.id);if(!del.length)continue;
  lines.push(`\nInventario visible en ${s.nombre} (código · tipo · categoría · talla · color · alquiler · venta; 📷 = tiene foto):`);
  for(const d of del)lines.push(`${String(d.codigo).trim()} · ${tipoNombre.get(d.clasificacion_id!)||'—'} · ${d.categoria||'—'} · ${d.talla||'—'} · ${d.color||'—'} · $${Number(d.precio_sugerido).toLocaleString('es-CO')} · ${ventaTxt(d)}${dressPhoto(d)?' 📷':''}`);
 }
 return lines.join('\n');
}

async function loadBasics(db:SupabaseClient){
 const [{data:cfg},{data:sites},clauses,catalogs]=await Promise.all([
  db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento,auto_activa,reactivar_horas').eq('id',1).maybeSingle(),
  db.from('sedes').select('id,nombre,direccion,direccion_clientes,whatsapp,mapa_url,parqueadero').eq('activo',true).order('nombre'),
  loadContractClauses(db),
  loadCatalogLinks(db),
 ]);
 const [documentos,promociones,aliados]=await Promise.all([documentsForAI(db).catch(()=>''),promotionsForAI(db).catch(()=>''),allyAgreementForAI(db).catch(()=>'')]);
 return {clauses,catalogs,cfg:{...(cfg||{conocimientos:'',instrucciones:'',escalamiento:'',auto_activa:false,reactivar_horas:12}),documentos,promociones,aliados} as IaConfig&{auto_activa:boolean;reactivar_horas:number},sites:(sites||[]) as Site[]};
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
  const response=await aiClient('comentarios_redes').messages.create({model:MODEL,max_tokens:1500,
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
 }catch(e){const m=aiErrorText(e).slice(0,300);await db.from('redes_comentarios').update({ia_error:m,ia_at:new Date().toISOString(),...(m===COMMENT_GONE?{estado:'eliminado'}:{})}).eq('id',id);}
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
 const client=aiClient('whatsapp_respuesta');
 // Photos and files the customer sent go first, then the conversation.
 const messages:Anthropic.MessageParam[]=[{role:'user',content:[...extra,{type:'text',text:`Hoy es ${today}.\n\nDatos de la clienta en el ERP (nombre, sede, primeras citas y contratos):\n${JSON.stringify(customer)}\n\nConversación (la más reciente al final):\n${chat}${extra.length?'\n\n(Los archivos de arriba los envió la clienta en sus últimos mensajes, salvo los de <candidatos_inventario>, que son del inventario de Ámbar.)':''}`}]}];
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
 const {sites,clauses,catalogs,cfg:actual}=await loadBasics(db);
 return runWhatsappAI({...cfg,documentos:actual.documentos},sites,{nombre:null,citas:[],contratos:[]},turns.map(t=>`${t.rol==='clienta'?'Clienta':'Ámbar'}: ${t.texto}`).join('\n'),clauses,catalogs,blocks,db);
}

/** Builds the suggestion for one chat and saves it. Errors are saved in ia_error so the screen can show them. */
/** Nudge: we answered last and she has not come back nor booked; one short message before the 24 h window closes. */
const EMPUJON='\n\n[Nota del sistema, no la cites: no ha vuelto a escribir desde hace unas 20 horas. Escríbele UN mensaje corto y cálido para retomar. Si es clienta: recuerda lo que buscaba, ofrécele la promoción vigente si aplica a su tipo de vestido y propón agendar: por WhatsApp, si sabes su sede, pon «agendar» para enviarle los horarios con botones; si no, el enlace de su sede (o pregúntale su ciudad si no la sabes). Si es un posible aliado: resuelve la duda que le quede y anímalo a completar su vinculación con el enlace de su sede. No repitas lo que ya le dijiste ni pidas disculpas.]';
export async function suggestWhatsappReply(db:SupabaseClient,conversationId:string,opts:{empujon?:boolean}={}){
 if(!process.env.ANTHROPIC_API_KEY)return;
 try{
  const [{data:conv},{data:msgs},{cfg,sites,clauses,catalogs}]=await Promise.all([
   db.from('whatsapp_conversaciones').select('id,telefono,nombre,sede_id,ia_pausada,ia_pausada_at,canal,contacto_id,anuncio_titulo').eq('id',conversationId).single(),
   db.from('whatsapp_mensajes').select('id,direccion,texto,created_at,media_id,media_tipo').eq('conversacion_id',conversationId).order('created_at',{ascending:false}).limit(20),
   loadBasics(db),
  ]);
  if(!conv||!msgs?.length)return;
  const history=(msgs as Msg[]).reverse();
  if(history[history.length-1].direccion!=='entrante'&&!opts.empujon)return;// already answered
  if(opts.empujon&&history[history.length-1].direccion==='entrante')return;// she wrote meanwhile: the normal reply handles it
  const social=conv.canal&&conv.canal!=='whatsapp';
  const [{data:ctx},{data:seguimiento}]=social?[{data:null},{data:null}]:await Promise.all([db.rpc('whatsapp_contexto_servidor',{p_tel:conv.telefono}),db.rpc('seguimiento_info_chat',{p_tel:conv.telefono})]);
  const chat=history.map(m=>`[${new Date(m.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota',dateStyle:'short',timeStyle:'short'})}] ${m.direccion==='entrante'?'Clienta':'Ámbar'}: ${m.texto||''}`).join('\n');
  // Photos the customer sent since Ámbar's last reply (up to 2), so the AI can see them.
  const pendientes:(Msg&{media_id?:string|null})[]=[];for(let i=history.length-1;i>=0&&history[i].direccion==='entrante';i--)pendientes.push(history[i]);
  // Photos sent earlier in the chat (last 48 h) still count: she often sends the photo, gets a reply, and then asks «¿lo tienen?».
  const recientes=pendientes.some(m=>m.media_id)?pendientes:[...history].reverse().filter(m=>m.direccion==='entrante'&&Date.now()-Date.parse(m.created_at)<48*3600000);
  const fotos=recientes.filter(m=>m.media_id&&(!m.media_tipo||/^image\//.test(m.media_tipo))).slice(0,2);
  const extra:Anthropic.ContentBlockParam[]=[];
  if(fotos.length){const settings=await loadWhatsappSettings(db);if(settings.token)for(const m of fotos){const img=await downloadWhatsappImage(settings,String(m.media_id)).catch(()=>null);
   if(img&&['image/jpeg','image/png','image/webp','image/gif'].includes(img.tipo))extra.push({type:'image',source:{type:'base64',media_type:img.tipo as 'image/jpeg',data:img.datos}});}}
  // Her photos are compared with the inventory: the closest dresses go to the AI with their data and photo.
  if(extra.length)extra.push(...await inventoryCandidates(db,extra).catch(()=>[]));
  // The store of the chat (from the ad she clicked or assigned by an adviser) and the ad, so the AI offers the visit right away.
  const sedeChat=sites.find(s=>s.id===conv.sede_id)?.nombre;
  const out=await runWhatsappAI(cfg,sites,{canal:conv.canal||'whatsapp',nombre_perfil:conv.nombre,...(sedeChat?{sede_del_chat:sedeChat}:{}),...(conv.anuncio_titulo?{llego_por_anuncio:conv.anuncio_titulo}:{}),...(ctx||{}),...(seguimiento?{seguimiento}:{})},chat+(opts.empujon?EMPUJON:''),clauses,catalogs,extra,db);
  out.respuesta=marcarCanal(out.respuesta,conv.canal);
  // She said she already rented, is not interested or wants no more messages: the follow-up of her phone is closed.
  if(!social&&out.cierre_seguimiento)await db.rpc('seguimiento_cerrar_por_chat',{p_tel:conv.telefono,p_motivo:out.cierre_seguimiento});
  // She told her (new) event date: it is saved on her latest open visit and her follow-up plan is recalculated.
  if(!social&&/^\d{4}-\d{2}-\d{2}$/.test(String(out.fecha_evento_nueva||'')))await db.rpc('cita_evento_por_chat',{p_tel:conv.telefono,p_fecha:out.fecha_evento_nueva});
  // Interested in the Plan Ahorro XV: the chat is flagged once (filter «Plan Ahorro» in WhatsApp 304) so an adviser enrolls her.
  if(!social&&out.plan_ahorro)await db.from('whatsapp_conversaciones').update({plan_ahorro_at:new Date().toISOString()}).eq('id',conversationId).is('plan_ahorro_at',null);
  // …and gets her own enrollment link once (she enrolls and signs from her phone; the store is told when she signs).
  if(!social&&out.plan_ahorro&&out.respuesta.trim()&&!history.some(m=>/plan-ahorro-inscripcion/.test(String(m.texto||'')))){
   try{const link=`${(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'')}/plan-ahorro-inscripcion#${planEnrollToken(conv.telefono,conv.sede_id||sites.find(s=>s.nombre.toLowerCase()===out.sede.trim().toLowerCase())?.id||null,process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'')}`;
    out.respuesta=`${out.respuesta.trim()}\n\nInscríbete tú misma aquí y firma tu contrato desde el celular 👉 ${link}`;}catch(e){console.error('Plan Ahorro XV (enlace de inscripción):',e);}
  }
  // She wrote her full name or email (asked after booking in the chat): saved on her latest open visit.
  if(!social&&(String(out.nombre_completo||'').trim()||String(out.correo||'').trim()))await db.rpc('cita_datos_por_chat',{p_tel:conv.telefono,p_nombre:out.nombre_completo||'',p_correo:out.correo||''});
  // Information the AI did not have: administration is told what to add (repeated questions add up instead of duplicating).
  const falta=String(out.falta_informacion||'').trim().slice(0,300);
  if(falta.length>=3){
   const pregunta=history.filter(m=>m.direccion==='entrante').slice(-1)[0]?.texto?.slice(0,300)||null;
   const {data:igual}=await db.from('whatsapp_ia_faltantes').select('id,veces').eq('estado','pendiente').ilike('falta',falta.replace(/[%_]/g,'')).maybeSingle();
   if(igual)await db.from('whatsapp_ia_faltantes').update({veces:igual.veces+1,ultima_at:new Date().toISOString(),pregunta,conversacion_id:conversationId}).eq('id',igual.id);
   else await db.from('whatsapp_ia_faltantes').insert({falta,pregunta,conversacion_id:conversationId});
  }
  const sede=sites.find(s=>s.nombre.toLowerCase()===out.sede.trim().toLowerCase());
  // On WhatsApp the booking goes with the slot list, not with the link: if the AI wrote the agenda link instead, it becomes the list.
  if(!social&&out.etiqueta!=='aliado'&&(conv.sede_id||sede)&&!out.agendar&&/agendar-primera-cita/.test(out.respuesta)){
   out.agendar=/virtual/i.test(out.respuesta)&&!/presencial/i.test(out.respuesta)?'virtual':'presencial';
   out.tipo_vestido_cita=out.tipo_vestido_cita||(/gala|grado/i.test(out.resumen)?'Gala':/novia/i.test(out.resumen)?'Novia':'Quince');
   out.respuesta=out.respuesta.replace(/[^.!?\n]*\S*agendar-primera-cita\S*[^.!?\n]*[.!?]?/g,' Te envío los horarios disponibles aquí abajo para que elijas con un toque 👇').replace(/ {2,}/g,' ').trim();
  }
  // When an adviser sends the suggestion by hand the slot list does not go out: the suggestion carries the booking link instead.
  const sedeCita=conv.sede_id||sede?.id||null,conAgenda=!social&&sedeCita&&(out.agendar==='presencial'||out.agendar==='virtual');
  const sugerencia=conAgenda?`${out.respuesta}\n\n${(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'')}/agendar-primera-cita?sede=${sedeCita}&o=ia-whatsapp`:out.respuesta;
  await db.from('whatsapp_conversaciones').update({etiqueta:out.etiqueta,ia_resumen:out.resumen.slice(0,500),ia_sugerencia:sugerencia.slice(0,2000),
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
  const texto=out.respuesta.trim().slice(0,4000);let waId:string,agenda:(()=>Promise<void>)|null=null;
  if(social){const s=await loadSocialSettings(db);if(!s||!conv.contacto_id)return;waId=await sendSocialText(s,conv.contacto_id,texto);}
  else{const settings=await loadWhatsappSettings(db);if(!settings.token||!settings.phoneNumberId)return;waId=opts.empujon&&texto.length<=1024?await sendWhatsappButtons(settings,conv.telefono,texto,CRM_BOTONES):await sendWhatsappText(settings,conv.telefono,texto);
   if(out.fotos?.length)await sendDressPhotos(db,settings,conversationId,conv.telefono,out.fotos,conv.sede_id||sede?.id||null);
   // Booking inside the chat: the list of free slots goes after her reply (lib/whatsapp-booking.ts).
   if(out.agendar==='presencial'||out.agendar==='virtual')agenda=()=>enviarHorarios(db,settings,{conversacion:conversationId,telefono:conv.telefono,sede_id:conv.sede_id||sede?.id||null},out.agendar as 'presencial'|'virtual',out.tipo_vestido_cita||'Quince',
    // The list starts on the day she asked for (horariosLibres lists the days after «desde»).
    /^\d{4}-\d{2}-\d{2}$/.test(String(out.agendar_desde||''))?new Date(Date.parse(`${out.agendar_desde}T12:00:00Z`)-86400000).toISOString().slice(0,10):undefined).then(()=>undefined).catch(e=>console.error('Horarios por WhatsApp:',e));}
  const at=new Date().toISOString();
  await db.from('whatsapp_mensajes').insert({conversacion_id:conversationId,wa_id:waId,direccion:'saliente',origen:'ia',tipo:'text',texto,estado:'sent',created_at:at});
  await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at,ia_sugerencia:null,...(expired?{ia_pausada:false,ia_pausada_at:null,ia_pausada_por:null}:{})}).eq('id',conversationId);
  if(agenda)await agenda();
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
 const client=aiClient('ia_chat_conocimientos',{timeout:55000,maxRetries:0});
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
