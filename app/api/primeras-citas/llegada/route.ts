import {createClient} from '@supabase/supabase-js';
import {verifyVideoLink,visitVideoLink} from '@/lib/first-visit-links';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const key=()=>process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
function server(){const secret=process.env.SUPABASE_SERVICE_ROLE_KEY;if(!secret||secret==='[SENSITIVE]')throw Error('No configurado');return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,secret,{auth:{persistSession:false,autoRefreshToken:false}});}
const uuid=(v:unknown)=>/^[0-9a-f-]{36}$/i.test(String(v||''));

/** Tracked video-call link: registers the arrival (from 30 min before to 2 h after the time) and opens the meeting. */
export async function GET(request:Request){
 const t=verifyVideoLink(new URL(request.url).searchParams.get('t')||'',key());
 const fail=(m:string)=>new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><body style="font-family:sans-serif;padding:32px;text-align:center"><h2>Ámbar Couture</h2><p>${m}</p></body>`,{status:400,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
 if(!t)return fail('El enlace venció o no es válido. Escríbenos por WhatsApp y te enviamos uno nuevo.');
 try{
  const db=server();
  const {data:c}=await db.from('primeras_citas').select('id,fecha,hora,enlace_virtual,estado').eq('id',t.id).single();
  if(!c?.enlace_virtual||!/^https:\/\//i.test(c.enlace_virtual))return fail('Tu cita aún no tiene enlace de videollamada. Te lo enviaremos antes de la hora.');
  if(c.estado==='cancelada')return fail('Esta cita fue cancelada.');
  const start=Date.parse(`${c.fecha}T${String(c.hora).slice(0,5)}:00-05:00`),now=Date.now();
  if(now>=start-30*60000&&now<=start+120*60000)await db.rpc('cita_llegada_marcar',{p_id:c.id,p_sede:null,p_via:'videollamada'});
  return new Response(null,{status:302,headers:{Location:c.enlace_virtual,'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
 }catch{return fail('No pudimos abrir la videollamada. Intenta de nuevo en un momento.');}
}

export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 try{
  const raw=await request.text();if(raw.length>1024)return reply({error:'Solicitud demasiado grande.'},413);
  const body=JSON.parse(raw);
  if(body.accion==='enlace'){
   // Staff only, through the user's own access to the visit (site RLS).
   const bearer=request.headers.get('authorization')||'';
   if(!bearer.startsWith('Bearer ')||!uuid(body.id))return reply({error:'Inicia sesión.'},401);
   const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
   const {data,error}=await userDb.from('primeras_citas').select('id,fecha').eq('id',String(body.id)).single();
   if(error||!data)return reply({error:'No tienes acceso a esta cita.'},403);
   return reply({enlace:visitVideoLink(new URL(request.url).origin,data.id,Date.parse(data.fecha+'T23:59:59-05:00')+86400000,key())});
  }
  // Store QR: the customer types the appointment code, ID number or phone of who booked.
  const dato=String(body.dato||'').trim().slice(0,40);
  if(!uuid(body.sede)||dato.length<4)return reply({error:'Escribe el código de tu cita, tu cédula o tu celular.'},400);
  const db=server();
  const {data,error}=await db.rpc('cita_llegada_buscar',{p_sede:body.sede,p_dato:dato});
  if(error)throw error;
  const c=(data||[])[0];
  if(!c)return reply({error:'No encontramos una cita para hoy en esta sede con ese dato. Verifícalo o avísale a la asesora.'},404);
  const {data:ok,error:e2}=await db.rpc('cita_llegada_marcar',{p_id:c.id,p_sede:body.sede,p_via:'qr'});
  if(e2||!ok)throw e2||Error('No marcada');
  return reply({nombre:c.nombre,hora:String(c.hora).slice(0,5)});
 }catch{return reply({error:'No pudimos registrar tu llegada. Avísale a la asesora.'},503);}
}
