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

/** Instagram direct messages read from Meta's Conversations API (every 2 minutes, Supabase cron), for when Meta does not
 *  deliver them by webhook (app without advanced access to instagram_manage_messages). Messages from the last 30 minutes
 *  go through storeSocialEvents like a webhook (repeats are ignored by their id). Outgoing messages count as answers typed
 *  in Instagram (they pause the AI) only if the ERP did not send that same text. Returns the chats with new customer messages. */
export async function pollInstagramMessages(db:SupabaseClient,s:SocialSettings){
 if(!s.instagramId)return [];
 const since=Date.now()-30*60000;
 const tk=encodeURIComponent(await pageToken(s));
 const graph=async(path:string)=>{const r=await fetch(`https://graph.facebook.com/${version()}/${path}&access_token=${tk}`,{signal:AbortSignal.timeout(25000)});const d=await r.json().catch(()=>({})) as Value;if(!r.ok)throw Error(String(d.error?.message||r.status));return d;};
 // Two light calls (Meta refuses one big one): recent conversations, then the last messages of each.
 const d=await graph(`${s.pageId}/conversations?platform=instagram&fields=updated_time&limit=6`);
 const messaging:Value[]=[];
 for(const c of (d.data||[]) as Value[]){
  if(new Date(c.updated_time).getTime()<since)continue;
  const ms=await graph(`${c.id}/messages?fields=id,created_time,from,to,message,attachments{image_data,video_data,file_url}&limit=8`);
  for(const m of (ms.data||[]) as Value[]){
   const at=new Date(m.created_time).getTime();if(!(at>=since))continue;
   const from=String(m.from?.id||''),to=String(m.to?.data?.[0]?.id||'');
   const own=from===s.instagramId||from===s.pageId;
   const att=(m.attachments?.data||[])[0] as Value|undefined;
   const message:Value={mid:m.id,...(m.message?{text:m.message}:{}),...(att?{attachments:[{type:att.image_data?'image':att.video_data?'video':'file',payload:{url:att.image_data?.url||att.video_data?.url||att.file_url||''}}]}:{})};
   if(own){
    // Already in the inbox when the ERP (AI or team) sent it: same text to this chat in the last hour.
    const {data:conv}=await db.from('whatsapp_conversaciones').select('id').eq('telefono',socialKey('instagram',to)).maybeSingle();
    if(conv&&m.message){const {count}=await db.from('whatsapp_mensajes').select('id',{count:'exact',head:true}).eq('conversacion_id',conv.id).eq('direccion','saliente').eq('texto',String(m.message)).gte('created_at',new Date(at-3600000).toISOString());if(count)continue;}
    if(!conv)continue;
    message.is_echo=true;
   }
   messaging.push({sender:{id:from},recipient:{id:to},timestamp:at,message});
  }
 }
 messaging.sort((a,b)=>a.timestamp-b.timestamp);
 return messaging.length?storeSocialEvents(db,s,{object:'instagram',entry:[{messaging}]}):[];
}

/** Sends a text reply on Messenger or Instagram (within Meta's 24-hour window). Returns the message id. */
export async function sendSocialText(s:SocialSettings,recipient:string,body:string){
 const r=await fetch(`https://graph.facebook.com/${version()}/${s.pageId}/messages?access_token=${encodeURIComponent(await pageToken(s))}`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({recipient:{id:recipient},messaging_type:'RESPONSE',message:{text:body.slice(0,1000)}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {message_id?:string;error?:{message?:string;code?:number}};
 if(!r.ok||!d.message_id)throw Error(d.error?.code===10||/outside of allowed window/i.test(String(d.error?.message))?'Pasaron más de 24 horas desde el último mensaje de la clienta: Meta no deja responderle por aquí. Escríbele desde Meta Business Suite.':`Meta no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 return d.message_id;
}

/** Comments webhooks: Instagram (field «comments») and the Facebook page (field «feed», item «comment»). Stores customer comments on our posts.
 *  Returns the new comment ids so the AI can answer them. */
export async function storeSocialComments(db:SupabaseClient,s:SocialSettings,payload:{object?:string;entry?:Value[]}){
 if(payload.object!=='instagram'&&payload.object!=='page')return [];
 const nuevos:string[]=[];
 for(const entry of payload.entry||[])for(const ch of entry.changes||[]){
  const v=ch.value||{};
  let row:Record<string,unknown>|null=null,postId='',postFields='';
  if(payload.object==='instagram'&&ch.field==='comments'){
   const autor=String(v.from?.id||'');
   if(!v.id||!autor||autor===s.instagramId||autor===s.pageId)continue;// our own replies
   postId=v.media?.id?String(v.media.id):'';postFields='permalink,caption';
   row={canal:'instagram',comentario_id:String(v.id),padre_id:v.parent_id?String(v.parent_id):null,autor_id:autor,autor_nombre:v.from?.username?String(v.from.username):null,texto:String(v.text||'').slice(0,2000)};
  }else if(payload.object==='page'&&ch.field==='feed'&&v.item==='comment'&&v.verb==='add'){
   const autor=String(v.from?.id||'');
   if(!v.comment_id||!autor||autor===s.pageId)continue;// our own replies
   postId=v.post_id?String(v.post_id):'';postFields='permalink_url,message';
   row={canal:'facebook',comentario_id:String(v.comment_id),padre_id:v.parent_id&&v.parent_id!==v.post_id?String(v.parent_id):null,autor_id:autor,autor_nombre:v.from?.name?String(v.from.name):null,texto:String(v.message||'').slice(0,2000)};
  }else continue;
  let url:string|null=null,caption:string|null=null;
  if(postId)try{const r=await fetch(`https://graph.facebook.com/${version()}/${postId}?fields=${postFields}&access_token=${encodeURIComponent(await pageToken(s))}`,{signal:AbortSignal.timeout(8000)});
   const d=await r.json() as Value;if(r.ok){url=d.permalink||d.permalink_url||null;const t=d.caption||d.message;caption=t?String(t).slice(0,500):null;}}catch{/* without the post link */}
  const {data,error}=await db.from('redes_comentarios').insert({...row,publicacion_id:postId||null,publicacion_url:url,publicacion_texto:caption}).select('id').single();
  if(error){if(error.code==='23505')continue;throw error;}
  nuevos.push(data.id);
 }
 return nuevos;
}
/** Text shown when a comment no longer exists in Meta (deleted or hidden by its author). */
export const COMMENT_GONE='Este comentario ya no existe en Meta: la persona lo borró, lo editó o quedó oculto. No se le puede responder desde el ERP; si hace falta, escríbele por mensaje directo desde Instagram o Facebook.';
/** Meta errors when replying to a comment, in plain Spanish. */
export function metaReplyError(msg:string){
 if(/does not exist|cannot be loaded|Unsupported post request/i.test(msg))return COMMENT_GONE;
 if(/pages_manage_engagement|pages_read_user_content/i.test(msg))return 'A la app de Meta le falta el permiso para responder en público en Facebook (pages_manage_engagement y pages_read_user_content). Actívalo en la app de Meta, genera un token nuevo y pégalo en Integraciones. Mientras tanto responde desde la página de Facebook.';
 if(/outside of allowed window|reply to this comment/i.test(msg))return 'Meta ya no deja responder este comentario por privado (pasaron más de 7 días o ya se le respondió por privado).';
 return `Meta no aceptó la respuesta: ${msg.slice(0,160)}`;
}
async function graphPost(path:string,s:SocialSettings,body:Value){
 const r=await fetch(`https://graph.facebook.com/${version()}/${path}?access_token=${encodeURIComponent(await pageToken(s))}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {id?:string;message_id?:string;recipient_id?:string;error?:{message?:string}};
 if(!r.ok||!(d.id||d.message_id))throw Error(metaReplyError(String(d.error?.message||r.status)));
 return {id:String(d.id||d.message_id),recipient:d.recipient_id?String(d.recipient_id):''};
}
/** Public reply under the comment (Instagram or Facebook). Returns the reply id. */
export const replyComment=async(s:SocialSettings,commentId:string,texto:string,canal='instagram')=>(await graphPost(canal==='facebook'?`${commentId}/comments`:`${commentId}/replies`,s,{message:texto.slice(0,2200)})).id;
/** Private reply: one Direct message to the person who commented (Meta allows it within 7 days of the comment). Returns the message id and the person's Instagram id. */
export const privateReplyComment=(s:SocialSettings,commentId:string,texto:string)=>graphPost(`${s.pageId}/messages`,s,{recipient:{comment_id:commentId},message:{text:texto.slice(0,1000)}});
/** After a private reply, the conversation opens in the inbox as an Instagram or Messenger chat (saved before Meta's echo arrives, so the AI is not paused). */
export async function chatFromPrivateReply(db:SupabaseClient,dm:{id:string;recipient:string},c:{autor_id?:string|null;autor_nombre?:string|null;texto?:string|null;canal?:string|null},texto:string,origen:'ia'|'erp',enviadoPor?:string){
 const red:Canal=c.canal==='facebook'?'messenger':'instagram';
 // Facebook comments carry a different id than Messenger: only the id Meta returns for the message opens the chat.
 const contacto=dm.recipient||(red==='instagram'?String(c.autor_id||''):'');
 if(!/^\d{3,40}$/.test(contacto))return;
 const now=new Date().toISOString();
 const {data:conv}=await db.from('whatsapp_conversaciones').upsert({telefono:socialKey(red,contacto),canal:red,contacto_id:contacto,nombre:c.autor_nombre||null},{onConflict:'telefono'}).select('id,ia_resumen').single();
 if(!conv)return;
 await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:dm.id,direccion:'saliente',origen,tipo:'text',texto,estado:'sent',created_at:now,...(enviadoPor?{enviado_por:enviadoPor}:{})});
 await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,...(conv.ia_resumen?{}:{ia_resumen:`Llegó por un comentario en ${red==='instagram'?'Instagram':'Facebook'}: «${String(c.texto||'').slice(0,200)}»`})}).eq('id',conv.id);
}
