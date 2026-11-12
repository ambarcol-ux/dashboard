import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {applyIaChanges,loadErpContext,type IaCambio,type IaConfig} from './whatsapp-ai';

/** IA de WhatsApp › análisis semanal: which chats ended in a first visit and which did not, why, and exact changes to propose. */
const MODEL='claude-sonnet-5-5';
const DAY=86400000;
type Conv={id:string;telefono:string;created_at:string;anuncio_id:string|null;ia_atender:boolean;etiqueta:string|null};
type Msg={conversacion_id:string;direccion:string;origen:string;texto:string|null;created_at:string};
type Cita={telefono:string;created_at:string;estado:string};

const SYSTEM=`Eres la analista comercial de Ámbar Couture (alquiler de vestidos de XV años, gala, novia y pajecitas en Colombia).
Cada día revisas los chats de WhatsApp de la línea 304 de los últimos 7 días, que atiende una IA (a veces una asesora), para que cada día se agenden más primeras citas, la IA suene más humana y cercana, y haga falta cada vez menos una persona.
También recibes los datos que la IA dijo que le faltaban (preguntas que no pudo responder): no inventes esas respuestas; si el dato ya está en lo que el ERP entrega, propón la instrucción para que la IA lo use; si no, déjalo para que administración lo complete.
Recibes: métricas de la semana y de la semana anterior, la configuración actual de la IA (conocimientos, instrucciones, escalamiento), lo que la IA ya recibe del ERP, y chats de muestra marcados con su resultado (CITA = agendó primera cita; SIN CITA = no agendó).
Escribe en "resumen" un informe breve en español claro para la dueña (sin tecnicismos, máximo 12 líneas):
1. Cómo le fue a estos 7 días comparado con el análisis anterior (con las cifras).
2. Qué hicieron distinto los chats que terminaron en cita.
3. En qué momento se pierden las clientas que no agendan (con ejemplos cortos y concretos de los chats, sin nombres completos ni teléfonos).
4. Qué cambiarías y por qué.
En "cambios" propone como máximo 4 cambios exactos a la configuración que ayuden a conseguir más citas (mismas reglas: agregar = texto nuevo en viñetas; reemplazar/quitar = "antes" copiado EXACTAMENTE del texto actual). No propongas copiar datos que el ERP ya entrega, ni inventar precios, descuentos o políticas, ni quitar protecciones. Pasar el chat a una persona debe ser el último recurso y la IA debe sonar humana. Si no hay datos suficientes, dilo y no propongas cambios.`;
const SCHEMA={type:'object',additionalProperties:false,required:['resumen','cambios'],properties:{
 resumen:{type:'string'},
 cambios:{type:'array',items:{type:'object',additionalProperties:false,required:['seccion','operacion','antes','despues'],properties:{
  seccion:{type:'string',enum:['conocimientos','instrucciones','escalamiento']},operacion:{type:'string',enum:['agregar','reemplazar','quitar']},antes:{type:'string'},despues:{type:'string'}}}},
}};
const last10=(t:string)=>String(t||'').replace(/\D/g,'').slice(-10);
const pct=(a:number,b:number)=>b?Math.round(100*a/b):0;

/** Builds the weekly report (last 7 days), saves it and leaves it in the knowledge chat with the proposed changes pending approval. */
export async function weeklyChatAnalysis(db:SupabaseClient,now=Date.now()){
 const hasta=new Date(now),desde=new Date(now-7*DAY);
 const {data:convs}=await db.from('whatsapp_conversaciones').select('id,telefono,created_at,anuncio_id,ia_atender,etiqueta').gte('ultimo_at',desde.toISOString()).limit(400);
 const list=(convs||[]) as Conv[];
 const ids=list.map(c=>c.id),msgs:Msg[]=[];
 for(let i=0;i<ids.length;i+=100){const {data}=await db.from('whatsapp_mensajes').select('conversacion_id,direccion,origen,texto,created_at').in('conversacion_id',ids.slice(i,i+100)).gte('created_at',new Date(now-14*DAY).toISOString()).order('created_at',{ascending:true}).limit(5000);msgs.push(...((data||[]) as Msg[]));}
 const {data:citasData}=await db.from('primeras_citas').select('telefono,created_at,estado').gte('created_at',new Date(now-8*DAY).toISOString()).or('origen.is.null,origen.neq.vitrina').limit(2000);
 const citas=new Map<string,Cita>();for(const c of (citasData||[]) as Cita[])citas.set(last10(c.telefono),c);
 // Per chat: did the customer write this week, who answered, and did she book a first visit after writing.
 const rows=list.map(c=>{
  const m=msgs.filter(x=>x.conversacion_id===c.id),entrantes=m.filter(x=>x.direccion==='entrante'&&Date.parse(x.created_at)>=desde.getTime());
  const first=m.find(x=>x.direccion==='entrante');const cita=citas.get(last10(c.telefono));
  const agendo=!!cita&&!!first&&Date.parse(cita.created_at)>=Date.parse(first.created_at)-3600000;
  const salientes=m.filter(x=>x.direccion==='saliente');
  return {c,m,activa:entrantes.length>0,agendo,ia:salientes.some(x=>x.origen==='ia'),persona:salientes.some(x=>x.origen!=='ia'),sinRespuesta:!salientes.length,unSolo:m.filter(x=>x.direccion==='entrante').length<=1};
 }).filter(r=>r.activa);
 const n=rows.length,conCita=rows.filter(r=>r.agendo).length,anuncio=rows.filter(r=>r.c.anuncio_id),soloIa=rows.filter(r=>r.ia&&!r.persona);
 const metricas={desde:desde.toISOString().slice(0,10),hasta:hasta.toISOString().slice(0,10),chats:n,con_cita:conCita,conversion:pct(conCita,n),
  anuncios:anuncio.length,anuncios_con_cita:anuncio.filter(r=>r.agendo).length,solo_ia:soloIa.length,solo_ia_con_cita:soloIa.filter(r=>r.agendo).length,
  sin_respuesta:rows.filter(r=>r.sinRespuesta).length,un_solo_mensaje:rows.filter(r=>r.unSolo).length,para_persona:rows.filter(r=>r.c.ia_atender).length};
 const {data:prev}=await db.from('whatsapp_ia_analisis').select('metricas,created_at').order('id',{ascending:false}).limit(1).maybeSingle();
 const {data:row}=await db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento,auto_aprender').eq('id',1).single();
 const {data:faltantes}=await db.from('whatsapp_ia_faltantes').select('falta,veces').eq('estado','pendiente').order('veces',{ascending:false}).limit(30);
 const faltaTxt=((faltantes||[]) as {falta:string;veces:number}[]).map(f=>`- ${f.falta} (${f.veces} ${f.veces===1?'vez':'veces'})`).join('\n');
 const cfg:IaConfig={conocimientos:row?.conocimientos||'',instrucciones:row?.instrucciones||'',escalamiento:row?.escalamiento||''};
 const {count:ajustes}=await db.from('whatsapp_ia_historial').select('id',{count:'exact',head:true}).gte('created_at',desde.toISOString());
 // Sample: every chat that booked plus those that did not (with at least 2 customer messages first: they show where she was lost).
 const sample=[...rows.filter(r=>r.agendo).slice(0,15),...rows.filter(r=>!r.agendo).sort((a,b)=>Number(a.unSolo)-Number(b.unSolo)).slice(0,25)];
 const chats=sample.map((r,i)=>`### Chat ${i+1} · ${r.agendo?'CITA':'SIN CITA'}${r.c.anuncio_id?' · llegó por anuncio':''}\n`+r.m.slice(-12).map(x=>`${x.direccion==='entrante'?'Clienta':x.origen==='ia'?'IA':'Asesora'}: ${String(x.texto||'').replace(/\s+/g,' ').slice(0,220)}`).join('\n')).join('\n\n');
 let resumen='No hubo chats esta semana.',cambios:IaCambio[]=[];
 if(n&&process.env.ANTHROPIC_API_KEY){
  const client=new Anthropic({timeout:50000,maxRetries:0});
  const r=await client.messages.create({model:MODEL,max_tokens:4000,system:SYSTEM,output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
   messages:[{role:'user',content:`<datos_que_le_faltan_a_la_ia>\n${faltaTxt||'(ninguno)'}\n</datos_que_le_faltan_a_la_ia>\n<metricas_semana>\n${JSON.stringify(metricas)}\n</metricas_semana>\n<metricas_semana_anterior>\n${prev?JSON.stringify(prev.metricas):'(primera semana analizada)'}\n</metricas_semana_anterior>\n<ajustes_a_la_ia_esta_semana>${ajustes||0}</ajustes_a_la_ia_esta_semana>\n<configuracion_actual>\n<conocimientos>\n${cfg.conocimientos}\n</conocimientos>\n<instrucciones>\n${cfg.instrucciones}\n</instrucciones>\n<escalamiento>\n${cfg.escalamiento}\n</escalamiento>\n</configuracion_actual>\n<datos_del_erp>\n${(await loadErpContext(db)).slice(0,20000)}\n</datos_del_erp>\n<chats>\n${chats}\n</chats>`}]});
  const t=r.content.find(b=>b.type==='text');
  if(t&&t.type==='text'){const out=JSON.parse(t.text) as {resumen:string;cambios:IaCambio[]};resumen=out.resumen;
   // Only changes that still apply to the current text are proposed.
   cambios=(out.cambios||[]).filter(ch=>{try{applyIaChanges(cfg,[ch]);return true;}catch{return false;}}).slice(0,4);
   try{applyIaChanges(cfg,cambios);}catch{cambios=[];}}
 }
 // Authorized by administration: the improvements are applied right away (the history keeps every version to go back).
 let aplicados=false;
 if(cambios.length&&row?.auto_aprender!==false){
  const nuevo=applyIaChanges(cfg,cambios);
  const {error}=await db.rpc('guardar_whatsapp_ia_servidor',{p_conocimientos:nuevo.conocimientos,p_instrucciones:nuevo.instrucciones,p_escalamiento:nuevo.escalamiento});
  aplicados=!error;
 }
 const cifras=`📊 Análisis diario de los chats (${metricas.desde} a ${metricas.hasta})\n${n} chats · ${conCita} con primera cita (${metricas.conversion} %) · anuncios: ${metricas.anuncios_con_cita} de ${metricas.anuncios} · solo IA: ${metricas.solo_ia_con_cita} de ${metricas.solo_ia} · sin respuesta: ${metricas.sin_respuesta} · un solo mensaje: ${metricas.un_solo_mensaje}`;
 const pendientes=(faltantes||[]).length?`\n\n📝 Para responder sola necesito que completes ${(faltantes||[]).length} dato${(faltantes||[]).length===1?'':'s'} en «Lo que le falta a la IA».`:'';
 const texto=`${cifras}\n\n${resumen}${aplicados?'\n\n✅ Ya apliqué los cambios de abajo (puedes volver a una versión anterior en el historial).':cambios.length?'\n\nTe propongo los cambios de abajo. ¿Los aplico?':''}${pendientes}`.slice(0,8000);
 await db.from('whatsapp_ia_analisis').insert({desde:metricas.desde,hasta:metricas.hasta,metricas,resumen,propuesta:cambios});
 if(cambios.length&&!aplicados)await db.from('whatsapp_ia_conocimiento_chat').update({estado:'descartada'}).eq('estado','pendiente');
 await db.from('whatsapp_ia_conocimiento_chat').insert({rol:'ia',texto,...(cambios.length?{propuesta:cambios,estado:aplicados?'aplicada':'pendiente'}:{})});
 return {metricas,cambios:cambios.length};
}
