import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {CONFIRMATION_TEMPLATES} from '@/lib/first-visit-messaging';
export const dynamic='force-dynamic';

/** Templates the ERP sends; the first three are required, the detailed confirmations fall back to the short one. */
const REQUIRED=['ambar_confirmacion_cita','ambar_recordatorio_cita','ambar_post_cita_asistencia'];
const OPTIONAL=[CONFIRMATION_TEMPLATES.presencial,CONFIRMATION_TEMPLATES.virtual];

/** Configuración › Integraciones › WhatsApp: «Probar conexión» checks token, number, account and approved templates. Admin only. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  const {data:admin}=auth.user?await userDb.rpc('es_admin'):{data:false};
  if(admin!==true)return publicReply({error:'Solo administración puede usar las integraciones.'},403);
  const db=publicServerClient(),version=process.env.META_GRAPH_VERSION||'v21.0';
  const {data:row}=await db.rpc('integracion_whatsapp_servidor');
  const cfg=(row?.config||{}) as Record<string,string>,token=String(row?.secreto||'');
  if(!token||!cfg.phone_number_id||!cfg.waba_id)return publicReply({error:'Primero guarda el número, la cuenta y el token.'},400);
  const get=async(path:string)=>{const r=await fetch(`https://graph.facebook.com/${version}/${path}`,{headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});const d=await r.json().catch(()=>({}));return {ok:r.ok,d:d as Record<string,unknown>};};
  const fail=async(error:string)=>{await db.from('integraciones').update({estado:'error',ultimo_error:error,probado_at:new Date().toISOString()}).eq('id','whatsapp');return publicReply({error},400);};
  const phone=await get(`${cfg.phone_number_id}?fields=display_phone_number,verified_name,quality_rating`);
  if(!phone.ok)return fail(`Meta no reconoce el número o el token: ${String((phone.d.error as {message?:string})?.message||'').slice(0,160)}`);
  const numbers=await get(`${cfg.waba_id}/phone_numbers?fields=id`);
  if(!numbers.ok)return fail('El token no tiene acceso a esa cuenta de WhatsApp Business.');
  if(!((numbers.d.data as {id:string}[])||[]).some(n=>n.id===cfg.phone_number_id))return fail('Ese número no pertenece a esa cuenta de WhatsApp Business.');
  const templates=await get(`${cfg.waba_id}/message_templates?fields=name,status,language&limit=200`);
  if(!templates.ok)return fail('No se pudieron leer las plantillas de la cuenta.');
  const approved=new Set(((templates.d.data as {name:string;status:string}[])||[]).filter(t=>t.status==='APPROVED').map(t=>t.name));
  const missing=REQUIRED.filter(t=>!approved.has(t)),optional=OPTIONAL.filter(t=>!approved.has(t));
  if(missing.length)return fail(`Faltan plantillas aprobadas en esa cuenta: ${missing.join(', ')}.`);
  await db.from('integraciones').update({estado:'conectada',ultimo_error:optional.length?`Aviso: sin aprobar ${optional.join(', ')} (se usa la confirmación corta).`:null,probado_at:new Date().toISOString()}).eq('id','whatsapp');
  return publicReply({ok:true,detalle:`${String(phone.d.verified_name||'')} · ${String(phone.d.display_phone_number||'')} · calidad ${String(phone.d.quality_rating||'—')}`,avisos:optional});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
