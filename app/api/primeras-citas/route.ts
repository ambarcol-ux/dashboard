import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
import {visitManagementLink} from '@/lib/first-visit-links';
import {validateVisitInput} from '@/lib/first-visits';
import {publicClosedLabel} from '@/lib/agenda';
import {authLink,loadAuthTexts,registerAuthorization} from '@/lib/data-authorization';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function client(){
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]')throw new Error('NOT_CONFIGURED');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(15000)})}});
}
export async function GET(request:Request){
 try{
  const db=client(),q=new URL(request.url).searchParams;
  // Días que se pueden reservar (calendario público) y modalidades abiertas.
  if(q.has('desde')){
   if(!/^\d{4}-\d{2}-\d{2}$/.test(q.get('desde')||'')||!/^\d{4}-\d{2}-\d{2}$/.test(q.get('hasta')||'')||!['presencial','virtual'].includes(q.get('modalidad')||'')||!/^[0-9a-f-]{36}$/i.test(q.get('sede')||''))return reply({error:'Consulta inválida.'},400);
   const {data,error}=await db.rpc('dias_primera_cita',{p_modalidad:q.get('modalidad'),p_sede:q.get('sede'),p_desde:q.get('desde'),p_hasta:q.get('hasta')});
   if(error)return reply({error:'No pudimos consultar la agenda.'},400);
   const d=data as {modalidades:Record<string,boolean>;dias:{fecha:string;disponible:boolean;motivo:string|null}[]};
   return reply({modalidades:d.modalidades,cerrados:Object.fromEntries(d.dias.filter(x=>!x.disponible).map(x=>[x.fecha,publicClosedLabel(x.motivo)]))});
  }
  if(!q.has('fecha')){
   const [{data,error},t]=await Promise.all([db.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),loadAuthTexts(db)]);
   if(error)throw error;return reply({sedes:data,textos:{tratamiento:t.tratamiento,comercial:t.comercial}});
  }
  if(!/^\d{4}-\d{2}-\d{2}$/.test(q.get('fecha')||'')||!['presencial','virtual'].includes(q.get('modalidad')||'')||! /^[0-9a-f-]{36}$/i.test(q.get('sede')||''))return reply({error:'Selecciona fecha, sede y modalidad.'},400);
  const {data,error}=await db.rpc('disponibilidad_primera_cita',{p_fecha:q.get('fecha'),p_modalidad:q.get('modalidad'),p_sede:q.get('sede')});
  if(error)return reply({error:'No pudimos consultar ese día. Selecciona una fecha dentro de los próximos 90 días.'},400);
  return reply({horarios:data});
 }catch{return reply({error:'La agenda no está disponible en este momento. Intenta nuevamente.'},503);}
}
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 let input:ReturnType<typeof validateVisitInput>;
 try{
  const raw=await request.text();if(raw.length>4096)return reply({error:'Solicitud demasiado grande.'},413);
  input=validateVisitInput(JSON.parse(raw));
 }catch(e){return reply({error:e instanceof Error?e.message:'Revisa los datos.'},400);}
 try{
  const db=client();
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const key=createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex');
  const {data,error}=await db.rpc('reservar_primera_cita_documento',{p_id:input.id,p_documento:input.documento,p_fecha:input.fecha,p_hora:input.hora,p_modalidad:input.modalidad,p_sede:input.sede,p_nombre:input.nombre,p_telefono:input.telefono,p_email:input.email,p_consentimiento:true,p_limite:key,p_fecha_evento:input.fechaEvento||null,p_tipo_vestido:input.tipoVestido});
  if(error)return reply({error:'No se pudo confirmar la reserva. Revisa tus datos y vuelve a consultar el horario.'},400);
  if(!data?.reservada&&data?.error==='Ya tienes una primera cita pendiente. Contacta a la sede para cambiarla.')return reply({error:'Ya tienes una primera cita pendiente. Puedes cambiar su fecha y horario desde aquí.',reprogramar:true},409);
  if(!data?.reservada)return reply({error:data?.error||'El horario ya no está disponible.'},409);
  // o= of the link that brought her (catalog or campaign): saved once on the booked visit.
  if(input.origenEnlace){const {error:o}=await db.from('primeras_citas').update({origen_enlace:input.origenEnlace}).eq('id',data.id).is('origen_enlace',null);if(o)console.error('Origen de la cita no guardado:',o.message);}
  // «¿Cómo nos conociste?»: the channel when no marked link brought her (Ámbar Exitoso · datos limpios).
  if(input.comoSeEntero){const {error:c}=await db.from('primeras_citas').update({como_se_entero:input.comoSeEntero}).eq('id',data.id).is('como_se_entero',null);if(c)console.error('Cómo se enteró no guardado:',c.message);}
  // Data authorization: booked by the person → registered; booked by the team (session) → pending until she accepts with her link.
  let autorizacion:string|null=null;
  try{
   const session=request.headers.get('cookie')?.match(/(?:^|;\s*)sb-access-token=([^;]+)/)?.[1];
   const staff=session?(await db.auth.getUser(decodeURIComponent(session))).data.user:null;
   const a=await registerAuthorization(db,{documento:input.documento,telefono:input.telefono,nombre:input.nombre,email:input.email,sede:input.sede,origen:'agendamiento',tratamiento:!staff,comercial:!staff&&input.comercial,pendiente:!!staff,registradoPor:staff?.id||null});
   if(a.estado!=='autorizada')autorizacion=authLink(new URL(request.url).origin,a.token);
  }catch(e){console.error('Autorización de datos no registrada:',e);}
   return reply({reservada:true,id:data.id,autorizacion,enlace:visitManagementLink(new URL(request.url).origin,data.id,Date.parse(input.fecha+'T23:59:59-05:00')+30*86400000,process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY!)});
 }catch{return reply({error:'No se pudo confirmar la reserva. Reintenta con los mismos datos para comprobarla sin duplicarla.'},503);}
}
