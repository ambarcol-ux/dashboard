import {timingSafeEqual} from 'node:crypto';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {parseEvents,EMAIL_PROVIDERS,type EmailProviderId} from '@/lib/email-providers';
export const dynamic='force-dynamic';

/** Webhook of the email provider (URL with ?t=<token> shown in Configuración › Integraciones). Unsubscribe/spam revokes the commercial authorization. */
export async function POST(request:Request){
 const token=String(new URL(request.url).searchParams.get('t')||'');
 try{
  const raw=await request.text();if(raw.length>1_000_000)return publicReply({error:'Demasiado grande'},413);
  const db=publicServerClient();
  const {data:conn}=await db.rpc('integracion_correo_servidor');
  const expected=String(conn?.webhook_token||'');
  if(!expected||token.length!==expected.length||!timingSafeEqual(Buffer.from(token),Buffer.from(expected)))return publicReply({error:'No autorizado'},403);
  const proveedor=conn.proveedor as EmailProviderId;
  if(!EMAIL_PROVIDERS[proveedor]?.eventos)return publicReply({recibido:0});
  const events=parseEvents(proveedor,JSON.parse(raw||'{}'));
  for(const e of events){
   let revoco=false;
   if(e.baja&&e.email){const {data}=await db.rpc('revocar_comercial_por_correo',{p_email:e.email,p_proveedor:proveedor});revoco=Number(data)>0;}
   await db.from('correo_eventos').insert({proveedor,evento:e.evento,email:e.email,revoco,payload:e.payload});
  }
  return publicReply({recibido:events.length});
 }catch{return publicReply({error:'No se pudo procesar'},400);}
}
