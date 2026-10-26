import {publicServerClient,publicReply,readJson,UUID_RE} from '@/lib/public-db';
import {allyClientSignup,clientId} from '@/lib/ally-clients';
import {allyClientConfirmEmail,allyClientDuplicateEmail,allyClientNoticeEmail,sendAllyEmail} from '@/lib/ally-emails';
export const dynamic='force-dynamic';

const today=()=>new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});

/** Public form of an ally's clients: by the ally's private link (token) or by the ally's code. Only Active allies. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:Record<string,unknown>;
 try{body=await readJson(request,20_000);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const token=String(body.token||''),codigo=String(body.codigo||'').trim().toUpperCase();
 if(!UUID_RE.test(token)&&!/^[A-Z]{3}-\d{4,}$/.test(codigo))return publicReply({error:'Escribe el código de tu aliado (ej.: ORG-0001).'},400);
 try{
  const db=publicServerClient();
  const q=db.from('aliados').select('id,nombre_completo,correo,codigo').eq('estado','activo');
  const {data:ally,error}=await (UUID_RE.test(token)?q.eq('token',token):q.eq('codigo',codigo)).maybeSingle();
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  if(!ally)return publicReply({error:'El enlace o código no es válido o el aliado no está activo.'},404);
  if(body.accion!=='registrar')return publicReply({aliado:{nombre:ally.nombre_completo,codigo:ally.codigo}});
  let d;
  try{d=allyClientSignup((body.datos||{}) as Record<string,unknown>,today());}catch(e){return publicReply({error:e instanceof Error?e.message:'Revisa los datos.'},400);}
  const {data:prev}=await db.from('aliado_clientas').select('numero,aliado_id,aliados(nombre_completo)').eq('clienta_documento',d.clienta_documento).maybeSingle();
  const {data:admins}=await db.from('profiles').select('email').eq('rol','admin').eq('activo',true);
  const adminEmails=(admins||[]).map(a=>a.email).filter(Boolean) as string[];
  if(prev){
   // The original ally is kept; administration is told about the attempt.
   await sendAllyEmail(adminEmails,allyClientDuplicateEmail(d.clienta_nombre,d.clienta_documento,(prev.aliados as {nombre_completo?:string}|null)?.nombre_completo||'',ally.nombre_completo));
   return publicReply({ok:true,duplicado:true});
  }
  const now=new Date().toISOString();
  const {data:row,error:e2}=await db.from('aliado_clientas').insert({...d,aliado_id:ally.id,autoriza_datos_at:now}).select('numero').single();
  if(e2)return e2.code==='23505'?publicReply({ok:true,duplicado:true}):publicReply({error:'No se pudo guardar el registro. Revisa los datos.'},400);
  const id=clientId(row.numero),origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
  await Promise.all([
   sendAllyEmail(String(d.rep_correo||d.clienta_correo),allyClientConfirmEmail(d.clienta_nombre,id,ally.nombre_completo,`${origin}/agendar-primera-cita`)),
   sendAllyEmail(ally.correo,allyClientNoticeEmail(ally.nombre_completo,d.clienta_nombre,`${d.tipo_evento==='XV'?'XV años':'Gala'} ${d.categoria}`)),
  ]);
  return publicReply({ok:true,id});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
