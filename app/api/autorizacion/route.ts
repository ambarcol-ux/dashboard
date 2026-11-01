import {publicServerClient,publicReply,readJson,UUID_RE} from '@/lib/public-db';
import {loadAuthTexts} from '@/lib/data-authorization';
export const dynamic='force-dynamic';

/** The person's own authorization link (/autorizacion/[token]): read the texts and her current choice, accept or revoke. */
export async function GET(request:Request){
 const token=new URL(request.url).searchParams.get('token')||'';
 if(!UUID_RE.test(token))return publicReply({error:'El enlace no es válido.'},404);
 try{
  const db=publicServerClient();
  const {data:a}=await db.from('autorizaciones_datos').select('nombre,estado,comercial').eq('token',token).maybeSingle();
  if(!a)return publicReply({error:'El enlace no es válido.'},404);
  const t=await loadAuthTexts(db);
  return publicReply({nombre:String(a.nombre||'').split(' ')[0],estado:a.estado,comercial:a.comercial,textos:{tratamiento:t.tratamiento,comercial:t.comercial}});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}

export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let b:Record<string,unknown>;
 try{b=await readJson(request,2000);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const token=String(b.token||''),accion=String(b.accion||'');
 if(!UUID_RE.test(token)||!['aceptar','revocar'].includes(accion))return publicReply({error:'Datos no válidos.'},400);
 if(accion==='aceptar'&&b.tratamiento!==true)return publicReply({error:'Para continuar marca la autorización de tratamiento de datos.'},400);
 try{
  const {data,error}=await publicServerClient().rpc('responder_autorizacion',{p_token:token,p_accion:accion,p_comercial:b.comercial===true});
  if(error)return publicReply({error:'El enlace no es válido.'},404);
  return publicReply(data);
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
