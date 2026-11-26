import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
export const dynamic='force-dynamic';

const CERT_TYPES:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

/** Public page /aliados/certificado#token: the ally uploads the missing bank certification with their private link.
 *  The file replaces the previous one; Contabilidad still validates the account and administration approves the ally. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 try{
  const form=await request.formData(),token=String(form.get('token')||''),cert=form.get('certificacion');
  if(!UUID_RE.test(token))return publicReply({error:'El enlace no es válido. Pide uno nuevo a Ámbar Couture.'},400);
  const db=publicServerClient();
  const {data:ally}=await db.from('aliados').select('id,nombre_completo,estado,archivado_at').eq('token',token).maybeSingle();
  if(!ally||ally.archivado_at||ally.estado==='rechazado')return publicReply({error:'El enlace no es válido. Pide uno nuevo a Ámbar Couture.'},404);
  if(form.get('accion')==='ver')return publicReply({nombre:ally.nombre_completo});
  if(!(cert instanceof File)||!CERT_TYPES[cert.type]||cert.size>10*1024*1024)return publicReply({error:'Adjunta la certificación bancaria (PDF, JPG, PNG o WebP de máximo 10 MB).'},400);
  const path=`${ally.id}/certificacion/${crypto.randomUUID()}.${CERT_TYPES[cert.type]}`;
  const {error:up}=await db.storage.from('aliados_documentos').upload(path,Buffer.from(await cert.arrayBuffer()),{contentType:cert.type});
  if(up)return publicReply({error:'No se pudo subir la certificación. Intenta nuevamente.'},503);
  const {error}=await db.from('aliados').update({certificacion_path:path}).eq('id',ally.id);
  if(error)return publicReply({error:'No se pudo guardar la certificación. Intenta nuevamente.'},503);
  return publicReply({ok:true,nombre:ally.nombre_completo});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
