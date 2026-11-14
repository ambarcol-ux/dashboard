import {createClient} from '@supabase/supabase-js';
import {allyLinks} from '@/lib/direct-allies';
import {allyApprovedEmail,allyRejectedEmail,sendAllyEmail} from '@/lib/ally-emails';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {conversationFor,sendWhatsappText,sendAllyWelcome,allyWelcomeText,WINDOW_MS} from '@/lib/whatsapp-inbox';
export const dynamic='force-dynamic';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

/** Administration: approve (code + links email), reject (notice email) or resend the links of an Active ally. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 const body=await request.json().catch(()=>({})),id=String(body?.id||'');
 if(!/^[0-9a-f-]{36}$/i.test(id))return reply({error:'Aliado no válido.'},400);
 try{
  const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const [{data:isAdmin},{data:perms}]=await Promise.all([db.rpc('es_admin'),db.rpc('mis_permisos')]);
  const need=body.accion==='reenviar'?'aliados.gestionar':'aliados.aprobar';
  if(isAdmin!==true&&!(perms as string[]|null)?.includes(need))return reply({error:'No tienes permiso para esta acción.'},403);
  const origin=process.env.FIRST_VISIT_PUBLIC_ORIGIN?.replace(/\/$/,'')||new URL(request.url).origin;
  let a:{id:string;estado:string;codigo:string|null;token:string;nombre:string;correo:string;motivo:string|null};
  if(body.accion==='reenviar'){
   const {data,error}=await db.from('aliados').select('id,estado,codigo,token,nombre:nombre_completo,correo').eq('id',id).maybeSingle();
   if(error||!data)return reply({error:'Aliado no encontrado.'},404);
   if(data.estado!=='activo'||!data.codigo)return reply({error:'Los enlaces solo se envían a aliados Activos.'},409);
   a={...data,motivo:null};
  }else{
   const {data,error}=await db.rpc('resolver_aliado',{p_id:id,p_aprobar:body.aprobar===true,p_motivo:String(body.motivo||'').slice(0,300)});
   if(error)return reply({error:error.message},400);
   a=data;
  }
  const sent=a.estado==='activo'?await sendAllyEmail(a.correo,allyApprovedEmail({nombre:a.nombre,id:a.id,codigo:a.codigo!},allyLinks(origin,a.token))):await sendAllyEmail(a.correo,allyRejectedEmail(a.nombre,a.motivo));
  // Welcome by WhatsApp when approved: a normal message while the 24 h window is open, otherwise the welcome template (once Meta approves it).
  let whatsapp=false;
  if(a.estado==='activo'&&body.accion!=='reenviar')try{whatsapp=await allyWelcomeWhatsapp(a.id,a.nombre,a.codigo!);}catch(e){console.error('Bienvenida por WhatsApp no enviada:',e);}
  return reply({estado:a.estado,codigo:a.codigo,correo:sent,whatsapp});
 }catch{return reply({error:'El servicio no está disponible.'},503);}
}

/** Sends the ally's welcome to the 304 chat of their phone; true if it went out. */
async function allyWelcomeWhatsapp(id:string,nombre:string,codigo:string){
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const [{data:ally},settings]=await Promise.all([db.from('aliados').select('celular').eq('id',id).maybeSingle(),loadWhatsappSettings(db)]);
 const digits=String(ally?.celular||'').replace(/\D/g,'');
 if(digits.length<10||!settings.token||!settings.phoneNumberId)return false;
 const tel=digits.length===10?`57${digits}`:digits,first=nombre.trim().split(/\s+/)[0]||nombre;
 const conv=await conversationFor(db,tel,nombre);
 const {data:c}=await db.from('whatsapp_conversaciones').select('ultimo_entrante_at').eq('id',conv.id).maybeSingle();
 const open=c?.ultimo_entrante_at&&Date.now()-Date.parse(c.ultimo_entrante_at)<WINDOW_MS;
 const texto=allyWelcomeText(first,codigo);
 const waId=open?await sendWhatsappText(settings,tel,texto):await sendAllyWelcome(settings,tel,first,codigo);
 if(!waId)return false;
 const now=new Date().toISOString();
 await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:open?'text':'template',texto,estado:'sent',created_at:now});
 await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,etiqueta:'aliado'}).eq('id',conv.id);
 return true;
}
