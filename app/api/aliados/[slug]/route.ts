import {randomInt} from 'node:crypto';
import {publicServerClient,publicReply,readJson} from '@/lib/public-db';
import {vipPassRequest} from '@/lib/ally-validation';
import {sendAllyEmail,vipPassEmail} from '@/lib/ally-emails';
export const dynamic='force-dynamic';
const SLUG_RE=/^[a-z0-9-]{2,140}$/;
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());
const newCode=()=>'AMBAR-'+Array.from({length:4},()=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[randomInt(36)]).join('');

async function findAlly(slug:string){
 const {data,error}=await publicServerClient().from('referidores').select('id,nombre_aliado,slug_unico,estado').eq('slug_unico',slug).maybeSingle();
 if(error)throw error;
 return data;
}

// Public referral page (/recomendar/[slug]): only the ally's display name leaves the server.
export async function GET(_request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 if(!SLUG_RE.test(slug))return publicReply({error:'Enlace inválido.'},404);
 try{const ally=await findAlly(slug);if(!ally)return publicReply({error:'Aliado no encontrado.'},404);return publicReply({nombre_aliado:ally.nombre_aliado,slug_unico:ally.slug_unico,estado:ally.estado});}
 catch{return publicReply({error:'El servicio no está disponible.'},503);}
}

export async function POST(request:Request,{params}:{params:Promise<{slug:string}>}){
 const {slug}=await params;
 if(!SLUG_RE.test(slug))return publicReply({error:'Enlace inválido.'},404);
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let pass:ReturnType<typeof vipPassRequest>;
 try{pass=vipPassRequest(await readJson(request,8192),today());}catch(e){return publicReply({error:e instanceof Error&&!/JSON|TOO_LARGE/.test(e.message)?e.message:'Datos no válidos.'},400);}
 try{
  const ally=await findAlly(slug);if(!ally||ally.estado!=='Activo')return publicReply({error:'Esta invitación no está activa.'},404);
  const db=publicServerClient();
  for(let attempt=0;attempt<4;attempt++){
   const code=newCode();
   const {error}=await db.from('codigos_descuento').insert({codigo_seguridad:code,referidor_id:ally.id,nombre_quinceanera:pass.nombre,telefono_quinceanera:pass.telefono,correo_quinceanera:pass.correo,fecha_evento:pass.fecha,usado:false});
   if(!error){await sendAllyEmail(pass.correo,vipPassEmail(pass.nombre,code,ally.nombre_aliado));return publicReply({codigo:code});}
   if(error.code!=='23505')return publicReply({error:'Ocurrió un error inesperado al procesar tu invitación. Intenta nuevamente.'},400);
  }
  return publicReply({error:'Hubo un problema de colisión, intenta de nuevo.'},409);
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
