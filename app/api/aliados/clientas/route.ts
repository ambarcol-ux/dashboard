import {publicServerClient,publicReply,readJson,UUID_RE} from '@/lib/public-db';
import {erpNoticeEmails} from '@/lib/erp-notice-email';
import {ALLY_EVENT_LABEL,allyClientSignup,clientId,type AllyCategory} from '@/lib/ally-clients';
import {allyClientConfirmEmail,allyClientDuplicateEmail,allyClientNoticeEmail,sendAllyEmail} from '@/lib/ally-emails';
import {authLink,loadAuthTexts,registerAuthorization} from '@/lib/data-authorization';
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
  const q=db.from('aliados').select('id,nombre_completo,correo,codigo,sede_principal').eq('estado','activo');
  const {data:ally,error}=await (UUID_RE.test(token)?q.eq('token',token):q.eq('codigo',codigo)).maybeSingle();
  if(error)return publicReply({error:'El servicio no está disponible.'},503);
  if(!ally)return publicReply({error:'El enlace o código no es válido o el aliado no está activo.'},404);
  const {data:cats,error:ec}=await db.rpc('categorias_aliado');
  if(ec)return publicReply({error:'El servicio no está disponible.'},503);
  const categorias=((cats||[]) as AllyCategory[]).map(c=>({tipo:c.tipo,nombre:c.nombre,desde:Number(c.desde)||0,hasta:c.hasta==null?null:Number(c.hasta)}));
  if(body.accion!=='registrar')return publicReply({aliado:{nombre:ally.nombre_completo,codigo:ally.codigo},categorias,declaracion:(await loadAuthTexts(db)).declaracion_aliado?.texto||null});
  let d;
  try{d=allyClientSignup((body.datos||{}) as Record<string,unknown>,today(),categorias);}catch(e){return publicReply({error:e instanceof Error?e.message:'Revisa los datos.'},400);}
  const {data:prev}=await db.from('aliado_clientas').select('numero,aliado_id,aliados(nombre_completo)').eq('clienta_documento',d.clienta_documento).maybeSingle();
  // Internal notices go only to the ERP notifications address (Configuración › Parámetros), not to every administrator.
  const adminEmails=await erpNoticeEmails(db);
  if(prev){
   // The original ally is kept; administration is told about the attempt.
   if(adminEmails.length)await sendAllyEmail(adminEmails,allyClientDuplicateEmail(d.clienta_nombre,d.clienta_documento,(prev.aliados as {nombre_completo?:string}|null)?.nombre_completo||'',ally.nombre_completo));
   return publicReply({ok:true,duplicado:true});
  }
  const now=new Date().toISOString();
  const {data:row,error:e2}=await db.from('aliado_clientas').insert({...d,aliado_id:ally.id,autoriza_datos_at:now}).select('numero').single();
  if(e2)return e2.code==='23505'?publicReply({ok:true,duplicado:true}):publicReply({error:'No se pudo guardar el registro. Revisa los datos.'},400);
  const id=clientId(row.numero),origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
  // The ally declared the permission; the client accepts with her own link (pending until then).
  let autorizacion:string|null=null;
  try{const a=await registerAuthorization(db,{documento:d.clienta_documento,telefono:d.clienta_celular||d.rep_celular,nombre:d.clienta_nombre,email:d.clienta_correo||d.rep_correo,sede:ally.sede_principal?String(ally.sede_principal):null,origen:'clienta_aliado',tratamiento:false,comercial:false,pendiente:true,aliado:ally.id});
   if(a.estado!=='autorizada')autorizacion=authLink(origin,a.token);}catch(e){console.error('Autorización de datos no registrada:',e);}
  await Promise.all([
   sendAllyEmail(String(d.rep_correo||d.clienta_correo),allyClientConfirmEmail(d.clienta_nombre,id,ally.nombre_completo,`${origin}/agendar-primera-cita`,autorizacion)),
   sendAllyEmail(ally.correo,allyClientNoticeEmail(ally.nombre_completo,d.clienta_nombre,`${ALLY_EVENT_LABEL[d.tipo_evento]} ${d.categoria}`)),
  ]);
  return publicReply({ok:true,id,autorizacion});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
