import {publicServerClient} from '@/lib/public-db';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {allyInactiveEmail,allyMeasuresReminderEmail,allyRenewedEmail,sendAllyEmail} from '@/lib/ally-emails';
export const dynamic='force-dynamic';

const day=(d:Date)=>d.toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
const addYear=(d:string)=>{const [y,m,dd]=d.split('-');return `${Number(y)+1}-${m}-${dd}`;};

/** Daily task (pg_cron, same secret as the first-visit worker): agreement validity, client-ally link expiry and measures reminders. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado.'},{status:401});
 const db=publicServerClient(),today=day(new Date()),origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
 const out={renovados:0,inactivos:0,vinculos_vencidos:0,recordatorios:0};
 // 1. Agreement: 1 year from signing; renewed if the ally had at least one contract in that year, otherwise Inactive.
 const {data:due}=await db.from('aliados').select('id,nombre_completo,correo,vigente_hasta').eq('estado','activo').lte('vigente_hasta',today);
 for(const a of due||[]){
  const desde=`${Number(a.vigente_hasta.slice(0,4))-1}${a.vigente_hasta.slice(4)}`;
  const {count}=await db.from('contratos').select('id',{count:'exact',head:true}).eq('tiene_aliado',true).eq('aliado_id',a.id).gte('created_at',desde).not('estado','in','("anulado","cancelado","rechazado","borrador")');
  if((count||0)>0){const hasta=addYear(a.vigente_hasta);await db.from('aliados').update({vigente_hasta:hasta}).eq('id',a.id);await sendAllyEmail(a.correo,allyRenewedEmail(a.nombre_completo,hasta.split('-').reverse().join('/')));out.renovados++;}
  else{await db.from('aliados').update({estado:'inactivo'}).eq('id',a.id);await sendAllyEmail(a.correo,allyInactiveEmail(a.nombre_completo));out.inactivos++;}
 }
 // 2. Inactive allies: clients without contract go back to direct clients. 3. Link expires 1 year after registration without contract.
 const {data:inactive}=await db.from('aliados').select('id').eq('estado','inactivo');
 if(inactive?.length){const {count}=await db.from('aliado_clientas').update({vigente:false},{count:'exact'}).in('aliado_id',inactive.map(a=>a.id)).eq('vigente',true).is('contrato_id',null);out.vinculos_vencidos+=count||0;}
 const yearAgo=new Date(Date.now()-365*86400000).toISOString();
 const {count:expired}=await db.from('aliado_clientas').update({vigente:false},{count:'exact'}).eq('vigente',true).is('contrato_id',null).lt('creado_en',yearAgo);
 out.vinculos_vencidos+=expired||0;
 // 4. Measures reminder X days before the event (Configuración, default 30), sent once.
 const {data:cfg}=await db.from('aliados_config').select('dias_recordatorio_medidas').eq('id',1).maybeSingle();
 const dias=cfg?.dias_recordatorio_medidas||30,limite=day(new Date(Date.now()+dias*86400000));
 const {data:pend}=await db.from('contrato_medidas').select('contrato_id,token,recordatorio_at,contratos!inner(quinceanera_name,fecha_evento,aliados(estado,nombre_completo,correo))').in('estado',['Pendiente','Corrección solicitada']).lte('contratos.fecha_evento',limite).gte('contratos.fecha_evento',today);
 for(const m of (pend||[]) as unknown as {contrato_id:string;token:string;recordatorio_at:string|null;contratos:{quinceanera_name:string|null;fecha_evento:string;aliados:{estado:string;nombre_completo:string;correo:string}|null}}[]){
  if(m.recordatorio_at)continue;
  const a=m.contratos.aliados;if(!a||a.estado!=='activo')continue;
  const faltan=Math.round((Date.parse(m.contratos.fecha_evento)-Date.parse(today))/86400000);
  if(await sendAllyEmail(a.correo,allyMeasuresReminderEmail(a.nombre_completo,m.contratos.quinceanera_name||'',faltan,`${origin}/aliados/medidas#${m.token}`))){await db.from('contrato_medidas').update({recordatorio_at:new Date().toISOString()}).eq('contrato_id',m.contrato_id);out.recordatorios++;}
 }
 return Response.json(out);
}
