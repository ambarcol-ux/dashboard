import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
import {visitManagementLink} from '@/lib/first-visit-links';
import {validateVisitInput} from '@/lib/first-visits';
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
  if(!q.has('fecha')){
   const {data,error}=await db.from('sedes').select('id,nombre').eq('activo',true).order('nombre');
   if(error)throw error;return reply({sedes:data});
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
  if(!data?.reservada)return reply({error:data?.error||'El horario ya no está disponible.'},409);
  return reply({reservada:true,id:data.id,enlace:visitManagementLink(new URL(request.url).origin,data.id,Date.parse(input.fecha+'T23:59:59-05:00')+30*86400000,process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY!)});
 }catch{return reply({error:'No se pudo confirmar la reserva. Reintenta con los mismos datos para comprobarla sin duplicarla.'},503);}
}
