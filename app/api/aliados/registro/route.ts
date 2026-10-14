import {publicServerClient,publicReply,readJson} from '@/lib/public-db';
import {allyRegistration} from '@/lib/ally-validation';
import {allyWelcomeEmail,sendAllyEmail} from '@/lib/ally-emails';
export const dynamic='force-dynamic';

// Public ally sign-up (/unete). Duplicate checks and the insert run on the server.
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let ally:ReturnType<typeof allyRegistration>;
 try{ally=allyRegistration(await readJson(request,8192));}catch(e){return publicReply({error:e instanceof Error&&!/JSON|TOO_LARGE/.test(e.message)?e.message:'Datos no válidos.'},400);}
 try{
  const db=publicServerClient();
  const [{data:byEmail,error:e1},{data:bySlug,error:e2}]=await Promise.all([
   db.from('referidores').select('id').ilike('correo',ally.correo).limit(1),
   db.from('referidores').select('id').eq('slug_unico',ally.slug_unico).limit(1),
  ]);
  if(e1||e2)return publicReply({error:'No se pudo procesar tu solicitud. Intenta nuevamente.'},503);
  if(byEmail?.length)return publicReply({error:'Este correo electrónico ya se encuentra vinculado a una cuenta de Aliado Activa. Por favor, ingresa un correo diferente o contacta a soporte.',campo:'correo'},409);
  if(bySlug?.length)return publicReply({error:'Ya existe una marca registrada con un nombre similar. Por favor añade un identificador extra a tu marca (ej. "Maquillaje Pro BQ").',campo:'marca'},409);
  const {error}=await db.from('referidores').insert(ally);
  if(error)return publicReply({error:error.code==='23505'?'Esa marca o correo ya está registrado.':'No se pudo procesar tu solicitud. Intenta nuevamente.'},error.code==='23505'?409:400);
  const link=`${new URL(request.url).origin}/recomendar/${ally.slug_unico}`;
  await sendAllyEmail(ally.correo,allyWelcomeEmail(ally.contacto_nombre,link));
  return publicReply({ok:true,link});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
