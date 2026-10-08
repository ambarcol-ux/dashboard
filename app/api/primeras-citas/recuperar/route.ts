import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
import {Resend} from 'resend';
import {visitManagementLink} from '@/lib/first-visit-links';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const accepted={ok:true,message:'Si el nombre y el correo coinciden con una primera cita que puedas reprogramar, recibirás un enlace privado. Revisa también la carpeta de spam. Si no llega o no registraste correo, contacta a tu asesora.'};
type Match={id:string;email:string;fecha:string;revision:number};
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 let nombre:string,email:string;
 try{const raw=await request.text();if(raw.length>2048)return reply({error:'Solicitud demasiado grande.'},413);const body=JSON.parse(raw);nombre=String(body.nombre||'').trim();email=String(body.email||'').trim().toLowerCase();if(nombre.length<2||nombre.length>120||email.length>160||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||body.website)return reply({error:'Revisa tu nombre completo y correo.'},400);}catch{return reply({error:'Revisa los datos.'},400);}
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY,mailKey=process.env.RESEND_API_KEY;
 if(!key||key==='[SENSITIVE]'||!mailKey)return reply({error:'No podemos recuperar el enlace en este momento. Contacta a tu asesora.'},503);
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}});
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const hash=(value:string)=>createHmac('sha256',key).update(value).digest('hex');
  const {data,error}=await db.rpc('recuperar_enlace_primera_cita',{p_nombre:nombre,p_email:email,p_limite_ip:hash('recuperar-ip:'+ip),p_limite_email:hash('recuperar-email:'+email)});
  if(error)return reply({error:'La consulta no está disponible. Intenta nuevamente.'},503);
  const matches=(data||[]) as Match[];
  if(matches.length){
   const bucket=Math.floor(Date.now()/900000),expires=bucket*900000+3600000;
   const origin=new URL(request.url).origin;
   const links=matches.map((m,i)=>`${i+1}. Cita del ${m.fecha}:\n${visitManagementLink(origin,m.id,expires,process.env.FIRST_VISIT_LINK_SECRET||key).replace('/gestionar#','/gestionar?accion=reprogramar#')}`).join('\n\n');
   const {error:mailError}=await new Resend(mailKey).emails.send({from:process.env.FIRST_VISIT_EMAIL_FROM||'Ámbar Couture <vip@ambarcouture.com>',to:matches[0].email,subject:'Reprogramar tu primera cita en Ámbar',text:`Recibimos una solicitud para reprogramar tu primera visita.\n\n${links}\n\nEste enlace privado vence en menos de una hora. Tu cita actual se conserva hasta confirmar un horario nuevo.\n\nSi no solicitaste este enlace, puedes ignorar este correo; tu cita no ha cambiado.`},{idempotencyKey:'primera-cita-'+hash(matches.map(m=>m.id+':'+m.revision).sort().join('|')+':'+bucket)});
   // Keep the response identical for unknown/mismatched addresses, limits and email-provider failures.
   if(mailError)console.error('No se pudo enviar un enlace de reprogramación de primera visita.');
  }
  return reply(accepted);
 }catch{return reply({error:'No pudimos procesar la solicitud. Intenta nuevamente.'},503);}
}
