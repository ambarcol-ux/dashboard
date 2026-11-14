import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {conversationFor,followupText,sendWhatsappFollowup,followupPromoText,sendWhatsappFollowupPromo} from '@/lib/whatsapp-inbox';
import {PROMO_FIELDS,promoApplies,type Promotion} from '@/lib/promotions';
import {whatsappPhone} from '@/lib/first-visit-links';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Etapa={seguimiento_id:string;cita_id:string;etapa:number;total:number;nombre:string|null;telefono:string;sede:string;tipo:string;motivo:string|null;tipo_vestido:string|null;fecha_evento:string|null;comercial:boolean};
const TIPO:Record<string,string>={asistida:'asistió y no alquiló',no_asistida:'no asistió a su cita',vitrina:'visitó la tienda (vitrina) y no alquiló'};

const TIPO_ID:[RegExp,number][]=[[/xv|quince/i,2],[/novia/i,1],[/gala|grado/i,3],[/pajecita/i,4]];
/** Promotion for the greeting: the one in force for her store and dress type that ends soonest, as «20% de descuento … hasta el 30 de noviembre». */
function promoFor(promos:Promotion[]|null,sedeId:string|null,tipoVestido:string|null){
 const tipo=TIPO_ID.find(([re])=>re.test(String(tipoVestido||'')))?.[1];
 if(!promos||!tipo)return null;
 const p=promos.filter(x=>promoApplies(x,{sede:sedeId,tipos:[tipo]})).sort((a,b)=>a.hasta.localeCompare(b.hasta))[0];
 if(!p)return null;
 const fin=Date.parse(p.hasta+'T12:00:00Z')-Date.now()<90*86400000?` hasta el ${new Date(p.hasta+'T12:00:00Z').toLocaleDateString('es-CO',{day:'numeric',month:'long',timeZone:'UTC'})}`:'';
 return `${p.nombre.replace(/\s*\([^)]*\)\s*$/,'')}${fin}`;
}

/** Monday to Saturday 10:05 a. m. and 4:05 p. m. (Supabase cron): sends the due follow-up stages by WhatsApp (304) with the follow-up template.
 *  When the customer answers, the chat AI continues (it receives the follow-up context). Off when the AI's automatic replies are off. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:cfg}=await db.from('whatsapp_ia_config').select('auto_activa').eq('id',1).maybeSingle();
 if(!cfg?.auto_activa)return Response.json({activo:false,motivo:'Respuestas automáticas de la IA apagadas'});
 const settings=await loadWhatsappSettings(db);
 if(!settings.token||!settings.phoneNumberId)return Response.json({activo:false,motivo:'WhatsApp sin configurar'});
 const {data,error}=await db.rpc('seguimientos_auto_tomar',{p_limite:40});
 if(error)return Response.json({error:error.message},{status:500});
 let enviados=0;const errores:string[]=[];let promos:Promotion[]|null=null;const sedes=new Map<string,string>();
 for(const e of (data||[]) as Etapa[]){
  if(!promos){const [{data:p},{data:s}]=await Promise.all([db.from('promociones').select(PROMO_FIELDS).eq('activo',true),db.from('sedes').select('id,nombre')]);
   promos=(p||[]) as Promotion[];for(const x of (s||[]) as {id:string;nombre:string}[])sedes.set(x.nombre.toLowerCase(),x.id);}
  const phone=whatsappPhone(e.telefono),nombre=String(e.nombre||'').trim().split(/\s+/)[0]||'hola',sede=e.sede||'';
  try{
   // The promotion in force for her store and dress type goes in the greeting as the hook to answer (plain greeting if none or template pending).
   const promo=promoFor(promos,sedes.get(sede.toLowerCase())||null,e.tipo_vestido);
   let waId=promo?await sendWhatsappFollowupPromo(settings,phone,nombre,sede,promo):null;
   const texto=waId&&promo?followupPromoText(nombre,sede,promo):followupText(nombre,sede),now=new Date().toISOString();
   if(!waId)waId=await sendWhatsappFollowup(settings,phone,nombre,sede);
   // Mirrored in the inbox: when she answers, the AI knows why we wrote and continues the conversation.
   const conv=await conversationFor(db,phone,e.nombre);
   await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'ia',tipo:'template',texto,estado:'sent',created_at:now});
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,ia_pausada:false,ia_pausada_at:null,ia_pausada_por:null,
    ia_resumen:`Seguimiento automático ${e.etapa}/${e.total}: ${TIPO[e.tipo]||'no alquiló'}${e.tipo_vestido?` · ${e.tipo_vestido}`:''}${e.motivo?` · Motivo: ${e.motivo}`:''}`.slice(0,500)}).eq('id',conv.id);
   await db.rpc('seguimiento_auto_registrar',{p_id:e.seguimiento_id,p_ok:true,p_texto:texto,p_error:null});
   enviados++;
  }catch(err){
   const m=err instanceof Error?err.message:'Error';errores.push(m);
   await db.rpc('seguimiento_auto_registrar',{p_id:e.seguimiento_id,p_ok:false,p_texto:null,p_error:m});
   if(/plantilla/i.test(m))break;// template not approved yet: the rest waits for the next run
  }
 }
 return Response.json({enviados,errores:errores.slice(0,5)});
}
