import Anthropic from '@anthropic-ai/sdk';
import type {SupabaseClient} from '@supabase/supabase-js';

/** «Lo que le falta a la IA»: after one question is answered (or marked «No aplica»), the pending questions with the same
 *  meaning get the same outcome, so administration answers each topic only once. */
const SCHEMA={type:'object',additionalProperties:false,required:['ids'],properties:{ids:{type:'array',items:{type:'integer'}}}};

export async function resolveSimilarMissing(db:SupabaseClient,id:number){
 const {data:base}=await db.from('whatsapp_ia_faltantes').select('id,falta,estado,respuesta').eq('id',id).maybeSingle();
 if(!base||base.estado==='pendiente')return {resueltas:[] as string[]};
 const {data:pend}=await db.from('whatsapp_ia_faltantes').select('id,falta').eq('estado','pendiente').limit(200);
 if(!pend?.length||!process.env.ANTHROPIC_API_KEY)return {resueltas:[] as string[]};
 const descartada=base.estado==='descartado';
 const client=new Anthropic({timeout:30000,maxRetries:1});
 const r=await client.messages.create({model:'claude-haiku-5-5',max_tokens:1000,output_config:{effort:'low',format:{type:'json_schema',schema:SCHEMA}},
  system:`Eres asistente de una tienda de alquiler de vestidos. Te doy un dato que administración ya ${descartada?'marcó como «No aplica»':'respondió'} y una lista de preguntas pendientes que la IA de WhatsApp no supo responder.
Devuelve en "ids" solo las pendientes que piden ESENCIALMENTE LO MISMO, de modo que ${descartada?'también deban descartarse':'la misma respuesta las conteste por completo'}. Si una pendiente pide algo más o distinto (otra sede, otra fecha, otro servicio u otro dato adicional que la respuesta no cubre), NO la incluyas. Ante la duda, no la incluyas.`,
  messages:[{role:'user',content:`Dato atendido: ${base.falta}\n${descartada?'':`Respuesta de administración: ${base.respuesta}\n`}\nPendientes:\n${pend.map(p=>`[${p.id}] ${p.falta}`).join('\n')}`}]});
 const t=r.content.find(b=>b.type==='text');
 const valid=new Set(pend.map(p=>p.id));
 const ids=t&&t.type==='text'?((JSON.parse(t.text) as {ids:number[]}).ids||[]).filter(x=>valid.has(x)&&x!==id):[];
 if(!ids.length)return {resueltas:[] as string[]};
 const {data:done}=await db.from('whatsapp_ia_faltantes').update({estado:base.estado,respuesta:base.respuesta,resuelto_at:new Date().toISOString()}).in('id',ids).eq('estado','pendiente').select('falta');
 return {resueltas:(done||[]).map(d=>String(d.falta))};
}
