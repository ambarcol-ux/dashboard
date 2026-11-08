import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendWhatsappText,WINDOW_MS} from '@/lib/whatsapp-inbox';
import {suggestWhatsappReply,testWhatsappAI,adjustWhatsappConfig,aiErrorText} from '@/lib/whatsapp-ai';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Ventas y CRM › WhatsApp 304: send a reply, mark as read, assign the store or ask the AI again. Only for chats the user can see (RLS). */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  if(!auth.user)return publicReply({error:'Inicia sesión.'},401);
  const body=await request.json().catch(()=>({})) as {accion?:string;conversacion_id?:string;texto?:string;sede_id?:string|null;conocimientos?:string;instrucciones?:string;escalamiento?:string;mensaje?:string;pedido?:string;previos?:{rol:'admin'|'ia';texto:string}[];pausada?:boolean;conversacion?:{rol:'clienta'|'ambar';texto:string}[]};
  // «IA de WhatsApp» › Probar: answer a sample message with the settings being edited, without saving. Administration only.
  // «IA de WhatsApp» › chat: rewrite the settings from a request in plain Spanish. Nothing is saved here.
  if(body.accion==='ajustar'){
   const {data:admin}=await userDb.rpc('es_admin');
   if(admin!==true)return publicReply({error:'Solo administración puede ajustar la IA.'},403);
   if(!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);
   const pedido=String(body.pedido||'').trim();if(!pedido||pedido.length>4000)return publicReply({error:'Escribe qué quieres ajustar.'},400);
   const cfg={conocimientos:String(body.conocimientos||'').slice(0,30000),instrucciones:String(body.instrucciones||'').slice(0,15000),escalamiento:String(body.escalamiento||'').slice(0,15000)};
   const previos=(Array.isArray(body.previos)?body.previos:[]).filter(p=>p&&(p.rol==='admin'||p.rol==='ia')).map(p=>({rol:p.rol,texto:String(p.texto||'').slice(0,2000)}));
   try{return publicReply(await adjustWhatsappConfig(cfg,pedido,previos));}catch(e){return publicReply({error:aiErrorText(e)},502);}
  }
  if(body.accion==='probar'){
   const {data:admin}=await userDb.rpc('es_admin');
   if(admin!==true)return publicReply({error:'Solo administración puede probar la IA.'},403);
   if(!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);
   // A simulated conversation (customer and Ámbar turns); the last turn is the customer's.
   const turns=(Array.isArray(body.conversacion)?body.conversacion:[]).filter(t=>t&&(t.rol==='clienta'||t.rol==='ambar')&&String(t.texto||'').trim()).slice(-20).map(t=>({rol:t.rol,texto:String(t.texto).slice(0,2000)}));
   if(!turns.length||turns[turns.length-1].rol!=='clienta')return publicReply({error:'Escribe el mensaje de prueba.'},400);
   const cfg={conocimientos:String(body.conocimientos||'').slice(0,30000),instrucciones:String(body.instrucciones||'').slice(0,15000),escalamiento:String(body.escalamiento||'').slice(0,15000)};
   try{return publicReply(await testWhatsappAI(publicServerClient(),cfg,turns));}catch(e){return publicReply({error:aiErrorText(e)},502);}
  }
  if(!UUID_RE.test(String(body.conversacion_id||'')))return publicReply({error:'Chat no válido.'},400);
  // The user's own permissions decide: RLS returns the chat only if they can see it.
  const {data:conv}=await userDb.from('whatsapp_conversaciones').select('id,telefono,ultimo_entrante_at').eq('id',body.conversacion_id!).maybeSingle();
  if(!conv)return publicReply({error:'No tienes acceso a este chat.'},403);
  const db=publicServerClient();
  // Per-chat switch: a person pauses the AI to take the chat, and reactivates it when done.
  if(body.accion==='pausa'){
   const pausada=body.pausada===true;
   const {error}=await db.from('whatsapp_conversaciones').update(pausada?{ia_pausada:true,ia_pausada_at:new Date().toISOString(),ia_pausada_por:auth.user.id}:{ia_pausada:false,ia_pausada_at:null,ia_pausada_por:null}).eq('id',conv.id);
   return error?publicReply({error:'No se pudo cambiar la IA de este chat.'},500):publicReply({ok:true});
  }
  if(body.accion==='leido'){await db.from('whatsapp_conversaciones').update({no_leidos:0}).eq('id',conv.id);return publicReply({ok:true});}
  if(body.accion==='sede'){
   const sede=body.sede_id||null;
   if(sede&&!UUID_RE.test(sede))return publicReply({error:'Sede no válida.'},400);
   const {error}=await db.from('whatsapp_conversaciones').update({sede_id:sede}).eq('id',conv.id);
   return error?publicReply({error:'No se pudo asignar la sede.'},500):publicReply({ok:true});
  }
  if(body.accion==='ia'){
   if(!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);
   await suggestWhatsappReply(db,conv.id);return publicReply({ok:true});
  }
  if(body.accion==='enviar'){
   const texto=String(body.texto||'').trim();
   if(!texto||texto.length>4000)return publicReply({error:'Escribe el mensaje (máximo 4000 caracteres).'},400);
   if(!conv.ultimo_entrante_at||Date.now()-Date.parse(conv.ultimo_entrante_at)>WINDOW_MS)
    return publicReply({error:'Pasaron más de 24 horas desde el último mensaje de la clienta: Meta solo deja escribirle con una plantilla. Respóndele desde el celular del 304.'},409);
   const settings=await loadWhatsappSettings(db);
   if(!settings.token||!settings.phoneNumberId)return publicReply({error:'WhatsApp no está configurado.'},503);
   let waId:string;
   try{waId=await sendWhatsappText(settings,conv.telefono,texto);}catch(e){return publicReply({error:e instanceof Error?e.message:'No se pudo enviar.'},502);}
   const now=new Date().toISOString();
   await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'text',texto,estado:'sent',enviado_por:auth.user.id,created_at:now});
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,no_leidos:0,ia_sugerencia:null,ia_atender:false,ia_motivo:null,ia_pausada:true,ia_pausada_at:now,ia_pausada_por:auth.user.id}).eq('id',conv.id);
   return publicReply({ok:true});
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch{return publicReply({error:'No se pudo completar la acción.'},500);}
}
