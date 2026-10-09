import {createClient} from '@supabase/supabase-js';
import {createHmac} from 'node:crypto';
import {signRescheduleLink} from '@/lib/first-visit-links';
export const dynamic='force-dynamic';
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
type Match={id:string;fecha:string;hora:string;sede:string;modalidad:string};
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 let documento:string;
 try{const raw=await request.text();if(raw.length>1024)return reply({error:'Solicitud demasiado grande.'},413);const body=JSON.parse(raw);documento=String(body.documento||'').replace(/[.\s-]/g,'');if(!/^\d{5,15}$/.test(documento)||body.website)return reply({error:'Ingresa tu cédula, solo números.'},400);}catch{return reply({error:'Revisa la cédula.'},400);}
 const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!key||key==='[SENSITIVE]')return reply({error:'No podemos consultar la cita en este momento. Contacta a tu asesora.'},503);
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(12000)})}});
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const hash=(value:string)=>createHmac('sha256',key).update(value).digest('hex');
  const {data,error}=await db.rpc('buscar_primera_cita_documento',{p_documento:documento,p_limite_ip:hash('cedula-ip:'+ip),p_limite_documento:hash('cedula:'+documento)});
  if(error)return reply({error:'La consulta no está disponible. Intenta nuevamente.'},503);
  const citas=((data||[]) as Match[]).map(m=>({fecha:m.fecha,hora:m.hora,sede:m.sede,modalidad:m.modalidad,enlace:'/agendar-primera-cita/gestionar?accion=reprogramar#'+signRescheduleLink(m.id,Date.now()+15*60000,process.env.FIRST_VISIT_LINK_SECRET||key)}));
  return reply({citas,message:citas.length?'Selecciona la cita que quieres reprogramar.':'No encontramos una cita disponible para esa cédula. Revisa el número o contacta a tu asesora para completar tus datos. Si ya hiciste varias consultas, inténtalo más tarde.'});
 }catch{return reply({error:'No pudimos consultar la cita. Intenta nuevamente.'},503);}
}
