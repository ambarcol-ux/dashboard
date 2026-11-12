import type {SupabaseClient} from '@supabase/supabase-js';

/** Messenger and Instagram in the same inbox as the WhatsApp 304 (connection: Configuración › Integraciones › Redes). */
export type SocialSettings={token:string;pageId:string;instagramId:string;verifyToken:string;estado:string};
export type Canal='whatsapp'|'messenger'|'instagram';
type Value=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const version=()=>process.env.META_GRAPH_VERSION||'v21.0';

export async function loadSocialSettings(db:SupabaseClient):Promise<SocialSettings|null>{
 const {data}=await db.rpc('integracion_redes_servidor');
 const r=data as {activo?:boolean;estado?:string;config?:Record<string,string>;webhook_token?:string;secreto?:string}|null;
 if(!r?.activo||!r.secreto||!r.config?.page_id)return null;
 return {token:r.secreto,pageId:r.config.page_id,instagramId:r.config.instagram_id||'',verifyToken:String(r.webhook_token||''),estado:String(r.estado||'')};
}
/** The saved token may be a system-user token: Meta's Send API needs the page's own token, obtained from it (cached for 1 hour). */
const pageTokens=new Map<string,{token:string;at:number}>();
export async function pageToken(s:SocialSettings){
 const k=`${s.pageId}|${s.token.slice(-12)}`,hit=pageTokens.get(k);
 if(hit&&Date.now()-hit.at<3600000)return hit.token;
 let token=s.token;
 try{const r=await fetch(`https://graph.facebook.com/${version()}/${s.pageId}?fields=access_token&access_token=${encodeURIComponent(s.token)}`,{signal:AbortSignal.timeout(8000)});
  const d=await r.json() as {access_token?:string};if(r.ok&&d.access_token)token=d.access_token;}catch{/* the saved token is used as is */}
 pageTokens.set(k,{token,at:Date.now()});return token;
}
/** Chat key in the inbox: «fb:<id>» for Messenger, «ig:<id>» for Instagram (not a phone number). */
export const socialKey=(canal:Canal,id:string)=>`${canal==='instagram'?'ig':'fb'}:${id}`;
export const isSocial=(telefono:string)=>/^(fb|ig):/.test(telefono);

const LABELS:Record<string,string>={image:'📷 Foto',video:'🎬 Video',audio:'🎤 Audio',file:'📄 Archivo',story_mention:'Te mencionó en su historia',share:'Compartió una publicación',reel:'Compartió un reel',ig_reel:'Compartió un reel'};
function text(m:Value){
 if(m.text)return String(m.text);
 const a=(m.attachments||[])[0];
 return a?LABELS[a.type]||'Archivo adjunto':'Mensaje';
}
async function profileName(s:SocialSettings,canal:Canal,id:string){
 try{
  const fields=canal==='instagram'?'name,username':'first_name,last_name';
  const r=await fetch(`https://graph.facebook.com/${version()}/${id}?fields=${fields}&access_token=${encodeURIComponent(await pageToken(s))}`,{signal:AbortSignal.timeout(8000)});
  const d=await r.json() as Value;if(!r.ok)return null;
  return canal==='instagram'?String(d.name||d.username||'')||null:[d.first_name,d.last_name].filter(Boolean).join(' ')||null;
 }catch{return null;}
}

/** Stores Messenger/Instagram webhook events. Echoes (answers typed in Meta Business Suite) pause the AI, like the 304 phone. Returns the chats with new customer messages. */
export async function storeSocialEvents(db:SupabaseClient,s:SocialSettings,payload:{object?:string;entry?:Value[]}){
 const canal:Canal=payload.object==='instagram'?'instagram':'messenger';
 const own=new Set([s.pageId,s.instagramId].filter(Boolean));
 const touched=new Set<string>();
 for(const entry of payload.entry||[])for(const ev of entry.messaging||[]){
  const m=ev.message;if(!m?.mid)continue;
  const echo=!!m.is_echo||own.has(String(ev.sender?.id));
  const contact=String(echo?ev.recipient?.id:ev.sender?.id||'');if(!/^\d{3,40}$/.test(contact))continue;
  const key=socialKey(canal,contact),at=new Date(Number(ev.timestamp)||Date.now()).toISOString(),body=text(m);
  let {data:conv}=await db.from('whatsapp_conversaciones').select('id,nombre,no_leidos').eq('telefono',key).maybeSingle();
  if(!conv){
   const nombre=echo?null:await profileName(s,canal,contact);
   const {data,error}=await db.from('whatsapp_conversaciones').upsert({telefono:key,canal,contacto_id:contact,nombre},{onConflict:'telefono'}).select('id,nombre,no_leidos').single();
   if(error)throw error;conv=data;
  }
  const {error}=await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:String(m.mid),direccion:echo?'saliente':'entrante',origen:echo?'celular':'clienta',tipo:m.attachments?.[0]?.type||'text',texto:body,created_at:at,...(echo?{estado:'sent'}:{})});
  if(error){if(error.code==='23505')continue;throw error;}
  if(echo){await db.from('whatsapp_conversaciones').update({ultimo_mensaje:body.slice(0,200),ultimo_at:at,ia_pausada:true,ia_pausada_at:at,ia_sugerencia:null}).eq('id',conv.id);continue;}
  await db.from('whatsapp_conversaciones').update({ultimo_mensaje:body.slice(0,200),ultimo_at:at,ultimo_entrante_at:at,no_leidos:(conv.no_leidos||0)+1}).eq('id',conv.id);
  touched.add(conv.id);
 }
 return [...touched];
}

/** Sends a text reply on Messenger or Instagram (within Meta's 24-hour window). Returns the message id. */
export async function sendSocialText(s:SocialSettings,recipient:string,body:string){
 const r=await fetch(`https://graph.facebook.com/${version()}/${s.pageId}/messages?access_token=${encodeURIComponent(await pageToken(s))}`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({recipient:{id:recipient},messaging_type:'RESPONSE',message:{text:body.slice(0,1000)}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {message_id?:string;error?:{message?:string;code?:number}};
 if(!r.ok||!d.message_id)throw Error(d.error?.code===10||/outside of allowed window/i.test(String(d.error?.message))?'Pasaron más de 24 horas desde el último mensaje de la clienta: Meta no deja responderle por aquí. Escríbele desde Meta Business Suite.':`Meta no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 return d.message_id;
}

/** Instagram comments webhook (field «comments»): stores customer comments on our posts. Returns the new comment ids to suggest a reply. */
export async function storeSocialComments(db:SupabaseClient,s:SocialSettings,payload:{object?:string;entry?:Value[]}){
 if(payload.object!=='instagram')return [];
 const nuevos:string[]=[];
 for(const entry of payload.entry||[])for(const ch of entry.changes||[]){
  if(ch.field!=='comments')continue;
  const v=ch.value||{},autor=String(v.from?.id||'');
  if(!v.id||!autor||autor===s.instagramId||autor===s.pageId)continue;// our own replies
  let url:string|null=null,caption:string|null=null;
  if(v.media?.id)try{const r=await fetch(`https://graph.facebook.com/${version()}/${v.media.id}?fields=permalink,caption&access_token=${encodeURIComponent(await pageToken(s))}`,{signal:AbortSignal.timeout(8000)});
   const d=await r.json() as Value;if(r.ok){url=d.permalink||null;caption=d.caption?String(d.caption).slice(0,500):null;}}catch{/* without the post link */}
  const {data,error}=await db.from('redes_comentarios').insert({canal:'instagram',comentario_id:String(v.id),publicacion_id:v.media?.id?String(v.media.id):null,publicacion_url:url,publicacion_texto:caption,
   padre_id:v.parent_id?String(v.parent_id):null,autor_id:autor,autor_nombre:v.from?.username?String(v.from.username):null,texto:String(v.text||'').slice(0,2000)}).select('id').single();
  if(error){if(error.code==='23505')continue;throw error;}
  nuevos.push(data.id);
 }
 return nuevos;
}
async function graphPost(path:string,s:SocialSettings,body:Value){
 const r=await fetch(`https://graph.facebook.com/${version()}/${path}?access_token=${encodeURIComponent(await pageToken(s))}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {id?:string;message_id?:string;error?:{message?:string}};
 if(!r.ok||!(d.id||d.message_id))throw Error(`Meta no aceptó la respuesta: ${String(d.error?.message||r.status).slice(0,160)}`);
 return String(d.id||d.message_id);
}
/** Public reply under the Instagram comment. */
export const replyComment=(s:SocialSettings,commentId:string,texto:string)=>graphPost(`${commentId}/replies`,s,{message:texto.slice(0,2200)});
/** Private reply: one Direct message to the person who commented (Meta allows it within 7 days of the comment). */
export const privateReplyComment=(s:SocialSettings,commentId:string,texto:string)=>graphPost(`${s.pageId}/messages`,s,{recipient:{comment_id:commentId},message:{text:texto.slice(0,1000)}});
