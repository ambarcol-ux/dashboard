import {publicServerClient,publicReply,readJson} from '@/lib/public-db';
import {planSigningToken,verifyPlanEnrollToken} from '@/lib/plan-ahorro-contrato';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendWhatsappText} from '@/lib/whatsapp-inbox';
export const dynamic='force-dynamic';

const linkKey=()=>process.env.FIRST_VISIT_LINK_SECRET||process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const limpio=(v:unknown,max:number)=>String(v||'').replace(/[<>]/g,'').trim().slice(0,max);
const origin=(request:Request)=>process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;

/** Public page /plan-ahorro-inscripcion: the family enrolls itself from the link the WhatsApp AI sent (the link carries its phone).
 *  «ver» returns the stores; «inscribir» creates the plan (same rules as the staff form) and returns the signing link, which also
 *  goes to its WhatsApp. The browser never reads the database. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 let body:Record<string,unknown>;
 try{body=await readJson(request,20_000);}catch{return publicReply({error:'Datos no válidos.'},400);}
 const link=verifyPlanEnrollToken(String(body.token||''),linkKey());
 if(!link)return publicReply({error:'El enlace no es válido o ya venció. Escríbenos por WhatsApp y te enviamos uno nuevo.'},404);
 try{
  const db=publicServerClient();
  if(body.accion!=='inscribir'){
   const {data:sedes}=await db.from('sedes').select('id,nombre').eq('activo',true).order('nombre');
   return publicReply({sedes:sedes||[],sede:link.sede,telefono:`*** *** ${link.telefono.slice(-4)}`});
  }
  const d=(body.datos||{}) as Record<string,unknown>;
  const {data:id,error}=await db.rpc('plan_ahorro_inscribir_servidor',{p:{telefono:link.telefono,sede_id:limpio(d.sede_id,40),titular_nombre:limpio(d.titular_nombre,120),
   titular_documento:limpio(d.titular_documento,20).replace(/\D/g,''),email:limpio(d.email,254).toLowerCase(),quinceanera_nombre:limpio(d.quinceanera_nombre,120),
   fecha_evento:limpio(d.fecha_evento,10),cuota_mensual:Number(d.cuota_mensual)||0,dia_pago:Number(d.dia_pago)||5}});
  if(error)return publicReply({error:error.message.slice(0,300)},400);
  const firma=`${origin(request)}/plan-ahorro-firma#${planSigningToken(String(id),linkKey())}`;
  // The signing link also goes to her WhatsApp (she just wrote from it, so the 24-hour window is normally open), and stays in the chat.
  try{
   const settings=await loadWhatsappSettings(db);
   const {data:conv}=await db.from('whatsapp_conversaciones').select('id,telefono').like('telefono',`%${link.telefono}`).eq('canal','whatsapp').order('ultimo_at',{ascending:false}).limit(1).maybeSingle();
   if(settings.token&&settings.phoneNumberId&&conv){
    const texto=`¡Listo, ${limpio(d.titular_nombre,60).split(' ')[0]}! 💛 Ya quedaste inscrita en el Plan Ahorro XV de Ámbar Couture. Este es tu contrato: léelo y fírmalo desde tu celular aquí 👉 ${firma}\n\nCuando lo firmes, la asesora de tu sede te escribe con los datos para pagar tu primera cuota.`;
    const waId=await sendWhatsappText(settings,conv.telefono,texto),at=new Date().toISOString();
    await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'automatico',texto,estado:'sent',created_at:at});
    await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:at}).eq('id',conv.id);
   }
  }catch(e){console.error('Plan Ahorro XV (enlace de firma por WhatsApp):',e);}
  return publicReply({firma});
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
