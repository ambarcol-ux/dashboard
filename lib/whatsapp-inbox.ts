import type {SupabaseClient} from '@supabase/supabase-js';

/** Ventas y CRM › WhatsApp 304: stores what customers write, what is answered from the phone (coexistence echoes) and delivery statuses. */
type Value=Record<string,any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Payload={entry?:{changes?:{field?:string;value?:Value}[]}[]};

const LABELS:Record<string,string>={image:'📷 Foto',audio:'🎤 Audio',video:'🎬 Video',document:'📄 Documento',sticker:'Sticker',location:'📍 Ubicación',contacts:'👤 Contacto',reaction:'Reacción'};
/** Readable text of any WhatsApp message (media is shown as a label: it stays on the phone). */
export function messageText(m:Value):string{
 if(m.type==='text')return String(m.text?.body||'');
 if(m.type==='button')return String(m.button?.text||m.button?.payload||'');
 if(m.type==='interactive')return String(m.interactive?.button_reply?.title||m.interactive?.list_reply?.title||'');
 if(m.type==='reaction')return `Reacción ${m.reaction?.emoji||''}`.trim();
 if(m.type==='location')return `📍 Ubicación${m.location?.name?`: ${m.location.name}`:''}`;
 const caption=m[m.type]?.caption||m[m.type]?.filename;
 return `${LABELS[m.type]||'Mensaje'}${caption?`: ${caption}`:''}`;
}
export const digits=(v:unknown)=>String(v||'').replace(/\D/g,'');
const when=(ts:unknown)=>{const n=Number(ts);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():new Date().toISOString();};

/** Finds or creates the chat of a phone; a new chat takes the name and sede from the customer's visits and contracts. */
export async function conversationFor(db:SupabaseClient,phone:string,profileName?:string|null){
 const {data:found}=await db.from('whatsapp_conversaciones').select('id,nombre,sede_id,no_leidos').eq('telefono',phone).maybeSingle();
 if(found)return found as {id:string;nombre:string|null;sede_id:string|null;no_leidos:number};
 const {data:ctx}=await db.rpc('whatsapp_contexto_servidor',{p_tel:phone});
 const c=(ctx||{}) as {nombre?:string|null;sede_id?:string|null};
 const {data,error}=await db.from('whatsapp_conversaciones').upsert({telefono:phone,nombre:c.nombre||profileName||null,sede_id:c.sede_id||null},{onConflict:'telefono',ignoreDuplicates:false}).select('id,nombre,sede_id,no_leidos').single();
 if(error)throw error;
 return data as {id:string;nombre:string|null;sede_id:string|null;no_leidos:number};
}

/** Saves the events of one webhook call. Returns the chats with new customer messages (for the AI suggestion). */
export async function storeInboxEvents(db:SupabaseClient,data:Payload,accepted:string[]){
 const touched=new Set<string>();
 for(const entry of data.entry||[])for(const change of entry.changes||[]){
  const v=change.value;if(!v||(accepted.length&&!accepted.includes(String(v.metadata?.phone_number_id||''))))continue;
  const names=new Map<string,string>((v.contacts||[]).map((c:Value)=>[digits(c.wa_id),String(c.profile?.name||'')]));
  // Customer messages.
  for(const m of v.messages||[]){
   const phone=digits(m.from);if(!/^\d{8,15}$/.test(phone)||!m.id)continue;
   const conv=await conversationFor(db,phone,names.get(phone));
   const text=messageText(m).slice(0,4000),at=when(m.timestamp);
   const {error}=await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:String(m.id),direccion:'entrante',origen:'clienta',tipo:String(m.type||'text'),texto:text,created_at:at});
   if(error){if(error.code==='23505')continue;throw error;}
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:text.slice(0,200),ultimo_at:at,ultimo_entrante_at:at,no_leidos:(conv.no_leidos||0)+1,...(!conv.nombre&&names.get(phone)?{nombre:names.get(phone)}:{})}).eq('id',conv.id);
   conv.no_leidos=(conv.no_leidos||0)+1;
   if(m.type!=='reaction')touched.add(conv.id);
  }
  // Replies typed in the WhatsApp Business app of the phone (coexistence): field smb_message_echoes.
  for(const m of v.message_echoes||[]){
   const phone=digits(m.to);if(!/^\d{8,15}$/.test(phone)||!m.id)continue;
   const conv=await conversationFor(db,phone);
   const text=messageText(m).slice(0,4000),at=when(m.timestamp);
   const {error}=await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:String(m.id),direccion:'saliente',origen:'celular',tipo:String(m.type||'text'),texto:text,estado:'sent',created_at:at});
   if(error){if(error.code==='23505')continue;throw error;}
   // A person answered from the phone: the AI pauses in this chat.
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:text.slice(0,200),ultimo_at:at,no_leidos:0,ia_pausada:true,ia_pausada_at:at,ia_pausada_por:null}).eq('id',conv.id);
  }
  // Delivery statuses of what the ERP sent from this screen.
  for(const s of v.statuses||[]){
   if(!s.id||!['sent','delivered','read','failed'].includes(s.status))continue;
   await db.from('whatsapp_mensajes').update({estado:s.status}).eq('wa_id',String(s.id));
  }
 }
 return [...touched];
}

/** Sends a free text inside Meta's 24-hour window. Returns the WhatsApp message id. */
export async function sendWhatsappText(settings:{token:string;phoneNumberId:string},to:string,body:string){
 const version=process.env.META_GRAPH_VERSION||'v21.0';
 const r=await fetch(`https://graph.facebook.com/${version}/${settings.phoneNumberId}/messages`,{method:'POST',headers:{Authorization:`Bearer ${settings.token}`,'Content-Type':'application/json'},
  body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to,type:'text',text:{preview_url:true,body}}),signal:AbortSignal.timeout(15000)});
 const d=await r.json().catch(()=>({})) as {messages?:{id:string}[];error?:{message?:string;code?:number}};
 if(!r.ok||!d.messages?.[0]?.id){
  const code=d.error?.code;
  throw Error(code===131047?'Pasaron más de 24 horas desde el último mensaje de la clienta: Meta solo deja escribirle con una plantilla. Respóndele desde el celular.':`WhatsApp no aceptó el mensaje: ${String(d.error?.message||r.status).slice(0,160)}`);
 }
 return d.messages[0].id;
}
export const WINDOW_MS=24*3600*1000;
