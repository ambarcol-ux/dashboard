import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {conversationFor,sendPostEventSurvey,postEventText,sendReviewTemplate} from '@/lib/whatsapp-inbox';
import {reviewPlaceId} from '@/lib/first-visit-messaging';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Supabase cron (10:20 a. m. and 4:20 p. m. Bogotá): satisfaction survey to customers whose contract was finalized (dress returned)
 *  20 hours to 4 days ago, and the Google review requests that are due (no answer in 24 h, or «Puede mejorar» closed / 72 h).
 *  The answers to the buttons are handled by the WhatsApp webhook (handleCrmButtons). */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const settings=await loadWhatsappSettings(db);
 if(!settings.token||!settings.phoneNumberId)return Response.json({activo:false,motivo:'WhatsApp sin configurar'});
 const guardar=async(telefono:string,waId:string,texto:string)=>{const conv=await conversationFor(db,telefono);const at=new Date().toISOString();
  await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'template',texto,estado:'sent',created_at:at});
  await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at}).eq('id',conv.id);};
 let encuestas=0,resenas=0,pendiente=false;const errores:string[]=[];
 const {data:k}=await db.rpc('post_evento_tomar',{p_limite:20});
 for(const c of (k||[]) as {id:string;nombre:string;telefono:string;sede:string|null}[]){
  const tel=c.telefono.length===10?`57${c.telefono}`:c.telefono;
  try{
   const waId=pendiente?null:await sendPostEventSurvey(settings,tel,c.nombre,c.sede||'',c.id);
   // Template not approved yet: the contract is asked again in the next run.
   if(!waId){pendiente=true;await db.from('contratos').update({encuesta_wa_at:null}).eq('id',c.id);continue;}
   await guardar(tel,waId,postEventText(c.nombre||'',c.sede||''));encuestas++;
  }catch(e){errores.push(e instanceof Error?e.message:'Error');}
 }
 const {data:r}=await db.rpc('post_evento_resena_tomar',{p_limite:20});
 for(const c of (r||[]) as {id:string;nombre:string;telefono:string;email:string|null;sede_id:string|null;resena_url:string|null}[]){
  const tel=c.telefono.length===10?`57${c.telefono}`:c.telefono,place=reviewPlaceId(c.resena_url);
  try{
   const waId=place?await sendReviewTemplate(settings,tel,c.nombre,place):null;
   if(!waId){await db.from('contratos').update({resena_wa_at:null}).eq('id',c.id);continue;}
   await guardar(tel,waId,`Hola ${c.nombre} 💛 Tu opinión ayuda a otras quinceañeras a elegir. ¿Nos cuentas tu experiencia en Google?\n[Dejar reseña · Ahora no]`);
   await db.from('resenas_solicitudes').insert({telefono:c.telefono.slice(-10),email:c.email,canal:'whatsapp',origen:'contrato',contrato_id:c.id,sede_id:c.sede_id});
   resenas++;
  }catch(e){errores.push(e instanceof Error?e.message:'Error');}
 }
 return Response.json({encuestas,resenas,plantilla_pendiente:pendiente,errores:errores.slice(0,5)});
}
