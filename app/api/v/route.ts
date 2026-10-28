import {createHmac} from 'node:crypto';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {availabilityAnswer} from '@/lib/dress-availability';
export const dynamic='force-dynamic';

const cached=(data:unknown)=>Response.json(data,{headers:{'Cache-Control':'public, max-age=60, s-maxage=60','Referrer-Policy':'no-referrer'}});

/** Public dress QR (/v/[qr_token]): dress reference, and the same availability answer the ally link gives for a date. */
export async function GET(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const params=new URL(request.url).searchParams,token=String(params.get('t')||''),fecha=params.get('fecha');
 if(!UUID_RE.test(token))return publicReply({error:'El código QR no es válido.'},404);
 try{
  const db=publicServerClient();
  const ip=(request.headers.get('x-vercel-forwarded-for')||request.headers.get('x-forwarded-for')||'local').split(',')[0].trim();
  const {data:allowed}=await db.rpc('consumir_limite_publico',{p_clave:'qr:'+createHmac('sha256',process.env.SUPABASE_SERVICE_ROLE_KEY!).update(ip).digest('hex'),p_max:60,p_segundos:600});
  if(allowed!==true)return publicReply({error:'Has realizado muchas consultas. Intenta en unos minutos.'},429);
  const {data:v}=await db.from('vestidos').select('id,codigo,nombre,estado,archivado').eq('qr_token',token).maybeSingle();
  if(!v)return publicReply({error:'El código QR no es válido.'},404);
  if(v.archivado||/vendido|baja/i.test(String(v.estado||'')))return cached({noDisponible:true});
  if(!fecha)return cached({codigo:v.codigo,nombre:v.nombre});
  const r=await availabilityAnswer(db,{fecha,vestidoId:v.id});
  if('error' in r)return publicReply({error:r.error},r.status);
  return cached({disponible:r.disponible});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
