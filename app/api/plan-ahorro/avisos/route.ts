import {createClient} from '@supabase/supabase-js';
import {authorizedVisitWorker} from '@/lib/first-visit-worker-config';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendOptionalTemplate} from '@/lib/whatsapp-inbox';
export const dynamic='force-dynamic';
export const maxDuration=60;

type Aviso={aviso_id:string;plan_id:string;tipo:'pago'|'recordatorio'|'pendiente'|'listo';telefono:string;nombre:string;sede:string;cuota:number;valor:number|null;
 ahorrado:number;disponible:number;vence:string|null;usar_desde:string};
const cop=(n:number|null)=>`$${Math.round(Number(n||0)).toLocaleString('es-CO')}`;
const dia=(d:string|null,anio=false)=>d?new Date(d+'T12:00:00Z').toLocaleDateString('es-CO',{day:'numeric',month:'long',...(anio?{year:'numeric'}:{}),timeZone:'UTC'}):'';
/** Colombian numbers are saved with 10 digits; WhatsApp needs the country code. */
const wa=(t:string)=>{const d=t.replace(/\D/g,'');return d.length===10?`57${d}`:d;};

/** The 4 Plan Ahorro XV templates (docs/plantillas-whatsapp.md): name, values and the text kept in the WhatsApp 304 chat. */
function plantilla(a:Aviso):{name:string;values:string[];texto:string}{
 const n=a.nombre.trim().split(/\s+/)[0]||'hola';
 if(a.tipo==='pago'){const v=[n,cop(a.valor),cop(a.ahorrado),cop(a.disponible),dia(a.usar_desde,true)];
  return {name:'ambar_ahorro_pago_recibido',values:v,texto:`Hola ${v[0]} 💛 Recibimos tu cuota de ${v[1]} del Plan Ahorro XV. Total ahorrado: ${v[2]}. Con tu extra, tienes ${v[3]} para escoger tu vestido y servicios desde el ${v[4]}. ¡Sigue así! 💛`};}
 if(a.tipo==='recordatorio'){const v=[n,cop(a.cuota),dia(a.vence),cop(a.ahorrado)];
  return {name:'ambar_ahorro_recordatorio',values:v,texto:`Hola ${v[0]} 💛 Te recordamos la cuota de tu Plan Ahorro XV por ${v[1]}, que vence el ${v[2]}. Hasta hoy llevas ${v[3]} ahorrados. Si ya pagaste, puedes ignorar este mensaje.`};}
 if(a.tipo==='pendiente'){const v=[n,cop(a.cuota),dia(a.vence)];
  return {name:'ambar_ahorro_pendiente',values:v,texto:`Hola ${v[0]}, no hemos recibido la cuota de ${v[1]} de tu Plan Ahorro XV que vencía el ${v[2]}. Recuerda que si se dejan de pagar 2 cuotas seguidas el plan termina. Responde este mensaje si necesitas ayuda.`};}
 const v=[n,a.sede,cop(a.disponible)];
 return {name:'ambar_ahorro_listo',values:v,texto:`Hola ${v[0]} 🎉 Ya puedes usar tu Plan Ahorro XV en Ámbar Couture ${v[1]}: tienes ${v[2]} para escoger tu vestido y servicios. Responde este mensaje para agendar tu cita de selección.`};
}

/** Supabase cron (every 15 min, 7 a. m.–7 p. m.): Plan Ahorro XV messages — payment received, reminder, overdue cuota and plan ready.
 *  A template Meta has not approved yet frees its claim so it is tried again on a later run. The message is also saved in the chat. */
export async function POST(request:Request){
 if(!authorizedVisitWorker(request))return Response.json({error:'No autorizado'},{status:401});
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const settings=await loadWhatsappSettings(db);
 if(!settings.token||!settings.phoneNumberId)return Response.json({activo:false,motivo:'WhatsApp sin configurar'});
 const {data,error}=await db.rpc('planes_ahorro_avisos_tomar',{p_limite:40});
 if(error)return Response.json({error:error.message},{status:500});
 let enviados=0,sinAprobar=0;const errores:string[]=[];
 for(const a of (data||[]) as Aviso[]){
  const t=plantilla(a),to=wa(a.telefono);
  try{
   const waId=await sendOptionalTemplate(settings,to,t.name,t.values);
   if(!waId){sinAprobar++;await db.from('planes_ahorro_avisos').delete().eq('id',a.aviso_id);continue;}
   await db.from('planes_ahorro_avisos').update({wa_id:waId}).eq('id',a.aviso_id);
   const {data:conv}=await db.from('whatsapp_conversaciones').select('id').like('telefono',`%${to.slice(-10)}`).order('ultimo_at',{ascending:false}).limit(1).maybeSingle();
   if(conv){const now=new Date().toISOString();
    await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'template',texto:t.texto,estado:'sent',created_at:now});
    await db.from('whatsapp_conversaciones').update({ultimo_mensaje:t.texto.slice(0,200),ultimo_at:now}).eq('id',conv.id);}
   enviados++;
  }catch(e){const m=e instanceof Error?e.message:'Error';errores.push(m);await db.from('planes_ahorro_avisos').update({error:m.slice(0,300)}).eq('id',a.aviso_id);}
 }
 return Response.json({enviados,plantilla_sin_aprobar:sinAprobar,errores});
}
