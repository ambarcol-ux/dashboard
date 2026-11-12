import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';
import {applyIaChanges,type IaCambio,type IaConfig} from './whatsapp-ai';

/** Weekly first-visit funnel report: booked → attended → rented, what is failing and who must act (system or people). */
const MODEL='claude-sonnet-5-5';
const DAY=86400000;
const day=(t:number)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date(t));
export type FunnelAction={responsable:'sistema'|'administracion'|'sede'|'asesora';quien:string;accion:string;por_que:string;prioridad:'alta'|'media'|'baja'};

const SYSTEM=`Eres la directora comercial de Ámbar Couture (alquiler de vestidos de XV años, gala, grado, novia y pajecitas en Colombia; sedes Bogotá, Barranquilla, Villavicencio y Pereira).
Cada lunes analizas el embudo de primeras visitas: AGENDÓ → ASISTIÓ → ALQUILÓ (citas presenciales y virtuales) y las vitrinas (clientas que entraron sin cita).
Recibes las métricas de la semana cerrada (citas de hace 9 a 3 días, ya con la asistencia resuelta) y las de las 4 semanas anteriores, el historial de tus reportes anteriores y la configuración de la IA de WhatsApp que agenda las citas.
Qué hace hoy el sistema solo: confirmación y recordatorios por WhatsApp (al agendar, 24 h y 2 h antes), QR de llegada en la sede, enlace de videollamada que registra asistencia, «No asistió» automático a las 48 h, seguimientos automáticos por WhatsApp a quienes no asistieron o no alquilaron, y avisos a la sede de citas próximas.
Escribe "resumen" para la dueña, en español claro, sin tecnicismos, máximo 15 líneas:
1. Cómo le fue a la semana frente a las 4 anteriores (asistencia y alquiler, con cifras y %).
2. Por qué no asisten: cruza confirmación, WhatsApp entregado, anticipación con que agendan, día y hora, modalidad y sede.
3. Por qué asisten y no alquilan: sede, asesora, tipo de vestido, meses al evento, motivos registrados (y cuántos quedaron sin motivo).
4. Qué cambió desde el reporte anterior y si las acciones anteriores funcionaron.
En "acciones" da de 3 a 8 acciones concretas y medibles, ordenadas por impacto en alquileres. Cada una con:
- responsable: "sistema" (lo ajusta la IA de WhatsApp sola: cómo agenda, qué horarios sugiere, cómo confirma), "administracion", "sede" o "asesora".
- quien: nombre de la sede o de la asesora (o "Todas"/"IA de WhatsApp").
- accion (qué hacer exactamente esta semana), por_que (con la cifra que lo justifica) y prioridad.
Si los números son pocos (menos de 10), dilo y no saques conclusiones fuertes. No inventes datos que no estén en las métricas. Sé respetuosa con las asesoras: habla de procesos, no de culpas.
En "cambios_ia" propone como máximo 3 cambios exactos a la configuración de la IA de WhatsApp que ayuden a que más clientas asistan (por ejemplo, sugerir los días y horas con mejor asistencia, pedir confirmación, fecha del evento): agregar = texto nuevo en viñetas; reemplazar/quitar = "antes" copiado EXACTAMENTE del texto actual. Si no hace falta, deja la lista vacía.`;
const SCHEMA={type:'object',additionalProperties:false,required:['resumen','acciones','cambios_ia'],properties:{
 resumen:{type:'string'},
 acciones:{type:'array',items:{type:'object',additionalProperties:false,required:['responsable','quien','accion','por_que','prioridad'],properties:{
  responsable:{type:'string',enum:['sistema','administracion','sede','asesora']},quien:{type:'string'},accion:{type:'string'},por_que:{type:'string'},prioridad:{type:'string',enum:['alta','media','baja']}}}},
 cambios_ia:{type:'array',items:{type:'object',additionalProperties:false,required:['seccion','operacion','antes','despues'],properties:{
  seccion:{type:'string',enum:['conocimientos','instrucciones','escalamiento']},operacion:{type:'string',enum:['agregar','reemplazar','quitar']},antes:{type:'string'},despues:{type:'string'}}}},
}};

/** Builds and saves the report; changes to the WhatsApp AI are applied when administration enabled automatic learning. */
export async function weeklyFunnelReport(db:SupabaseClient,now=Date.now()){
 const hasta=day(now-3*DAY),desde=day(now-9*DAY),antesHasta=day(now-10*DAY),antesDesde=day(now-37*DAY);
 const [{data:metricas,error},{data:anteriores},{data:prev},{data:row}]=await Promise.all([
  db.rpc('embudo_metricas',{p_desde:desde,p_hasta:hasta}),
  db.rpc('embudo_metricas',{p_desde:antesDesde,p_hasta:antesHasta}),
  db.from('embudo_reportes').select('created_at,resumen,acciones').order('id',{ascending:false}).limit(3),
  db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento,auto_aprender').eq('id',1).maybeSingle(),
 ]);
 if(error)throw Error('No se pudieron calcular las métricas del embudo.');
 const cfg:IaConfig={conocimientos:row?.conocimientos||'',instrucciones:row?.instrucciones||'',escalamiento:row?.escalamiento||''};
 let resumen='No hay suficientes datos para analizar esta semana.',acciones:FunnelAction[]=[],cambios:IaCambio[]=[];
 if(process.env.ANTHROPIC_API_KEY){
  const client=new Anthropic({timeout:55000,maxRetries:0});
  const r=await client.messages.create({model:MODEL,max_tokens:5000,system:SYSTEM,output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
   messages:[{role:'user',content:`<semana_cerrada>\n${JSON.stringify(metricas)}\n</semana_cerrada>\n<cuatro_semanas_anteriores>\n${JSON.stringify(anteriores)}\n</cuatro_semanas_anteriores>\n<reportes_anteriores>\n${(prev||[]).map(p=>`${String(p.created_at).slice(0,10)}: ${p.resumen}\nAcciones: ${JSON.stringify(p.acciones)}`).join('\n\n')||'(primer reporte)'}\n</reportes_anteriores>\n<configuracion_ia_whatsapp>\n## conocimientos\n${cfg.conocimientos}\n## instrucciones\n${cfg.instrucciones}\n## escalamiento\n${cfg.escalamiento}\n</configuracion_ia_whatsapp>`}]});
  const t=r.content.find(b=>b.type==='text');
  if(t&&t.type==='text'){
   const out=JSON.parse(t.text) as {resumen:string;acciones:FunnelAction[];cambios_ia:IaCambio[]};
   resumen=out.resumen;acciones=(out.acciones||[]).slice(0,8);
   cambios=(out.cambios_ia||[]).filter(ch=>{try{applyIaChanges(cfg,[ch]);return true;}catch{return false;}}).slice(0,3);
   try{applyIaChanges(cfg,cambios);}catch{cambios=[];}
  }
 }
 let aplicados:IaCambio[]|null=null;
 if(cambios.length&&row?.auto_aprender!==false){
  const nuevo=applyIaChanges(cfg,cambios);
  const {error:e}=await db.rpc('guardar_whatsapp_ia_servidor',{p_conocimientos:nuevo.conocimientos,p_instrucciones:nuevo.instrucciones,p_escalamiento:nuevo.escalamiento});
  if(!e)aplicados=cambios;
 }
 const {error:ie}=await db.from('embudo_reportes').insert({desde,hasta,metricas,anteriores,resumen,acciones,aplicados});
 if(ie)throw Error('No se pudo guardar el reporte.');
 return {desde,hasta,acciones:acciones.length,ia:aplicados?.length||0};
}
