import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendWhatsappText,WINDOW_MS} from '@/lib/whatsapp-inbox';
import {resolveAd,adsSpend,adsTokenReady} from '@/lib/meta-ads';
import {suggestWhatsappReply,testWhatsappAI,knowledgeChatTurn,applyIaChanges,loadContractClauses,aiErrorText,type IaCambio} from '@/lib/whatsapp-ai';
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
  const body=await request.json().catch(()=>({})) as {accion?:string;conversacion_id?:string;texto?:string;sede_id?:string|null;conocimientos?:string;instrucciones?:string;escalamiento?:string;mensaje?:string;aplicar?:boolean;desde?:string;hasta?:string;pausada?:boolean;conversacion?:{rol:'clienta'|'ambar';texto:string}[]};
  // «IA de WhatsApp» › Probar: answer a sample message with the settings being edited, without saving. Administration only.
  // WhatsApp 304 › Anuncios: per ad, chats → visits (virtual / in person) → attended → contracts, with spend and cost from Meta. Administration only.
  if(body.accion==='anuncios'){
   const desde=String(body.desde||''),hasta=String(body.hasta||'');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(desde)||!/^\d{4}-\d{2}-\d{2}$/.test(hasta)||desde>hasta)return publicReply({error:'Elige un rango de fechas válido.'},400);
   const {data:rows,error}=await userDb.rpc('whatsapp_anuncios_resumen',{p_desde:desde,p_hasta:hasta});
   if(error)return publicReply({error:error.message},403);
   const list=(rows||[]) as {anuncio_id:string;nombre:string|null}[];
   // Ads still without name: ask Meta now (needs META_ADS_TOKEN), then read the summary again.
   const db=publicServerClient();
   let final=list;
   if(adsTokenReady()&&list.some(r=>!r.nombre)){
    for(const r of list.filter(r=>!r.nombre).slice(0,30))await resolveAd(db,r.anuncio_id).catch(()=>null);
    const again=await userDb.rpc('whatsapp_anuncios_resumen',{p_desde:desde,p_hasta:hasta});
    if(!again.error)final=(again.data||[]) as typeof list;
   }
   const gasto=await adsSpend(final.map(r=>r.anuncio_id),desde,hasta);
   return publicReply({token:adsTokenReady(),filas:final.map(r=>({...r,gasto:gasto[r.anuncio_id]??null}))});
  }
  // «IA de WhatsApp» › chat de conocimientos: saved conversation; changes are proposed (before → after) and applied only after confirmation.
  if(body.accion==='conocimiento'||body.accion==='conocimiento_decidir'){
   const {data:admin}=await userDb.rpc('es_admin');
   if(admin!==true)return publicReply({error:'Solo administración puede ajustar la IA.'},403);
   if(body.accion==='conocimiento'&&!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);
   const db=publicServerClient();
   const [{data:row},{data:pend}]=await Promise.all([
    db.from('whatsapp_ia_config').select('conocimientos,instrucciones,escalamiento').eq('id',1).single(),
    db.from('whatsapp_ia_conocimiento_chat').select('id,propuesta').eq('estado','pendiente').order('id',{ascending:false}).limit(1).maybeSingle(),
   ]);
   const cfg={conocimientos:row?.conocimientos||'',instrucciones:row?.instrucciones||'',escalamiento:row?.escalamiento||''};
   const say=(texto:string,extra:Record<string,unknown>={})=>db.from('whatsapp_ia_conocimiento_chat').insert({rol:'ia',texto:texto.slice(0,8000),...extra});
   // Applies (through the user's own session, so the history records who) or discards the pending proposal.
   const decide=async(aplicar:boolean)=>{
    if(!pend)return 'No hay ningún cambio pendiente por confirmar.';
    if(aplicar){
     const nuevo=applyIaChanges(cfg,(pend.propuesta||[]) as IaCambio[]);
     const {error}=await userDb.rpc('guardar_whatsapp_ia',{p_conocimientos:nuevo.conocimientos,p_instrucciones:nuevo.instrucciones,p_escalamiento:nuevo.escalamiento});
     if(error)throw Error(error.message);
    }
    await db.from('whatsapp_ia_conocimiento_chat').update({estado:aplicar?'aplicada':'descartada'}).eq('id',pend.id);
    return aplicar?'Listo, ya lo ajusté y quedó guardado. Puedes comprobarlo en «Probar como clienta».':'Listo, no cambié nada.';
   };
   try{
    if(body.accion==='conocimiento_decidir'){await say(await decide(body.aplicar===true));return publicReply({ok:true});}
    const texto=String(body.texto||'').trim();
    if(!texto||texto.length>4000)return publicReply({error:'Escribe tu mensaje (máximo 4000 caracteres).'},400);
    const {data:prev}=await db.from('whatsapp_ia_conocimiento_chat').select('rol,texto').order('id',{ascending:false}).limit(15);
    const history=[...((prev||[]) as {rol:'admin'|'ia';texto:string}[]).reverse(),{rol:'admin' as const,texto}];
    const turn=await knowledgeChatTurn(cfg,history,pend?(pend.propuesta as IaCambio[]):null,await loadContractClauses(db));
    // The admin message is saved only when the AI answered, so a failed attempt can simply be sent again.
    await db.from('whatsapp_ia_conocimiento_chat').insert({rol:'admin',texto,usuario_id:auth.user.id});
    if(turn.accion==='confirmar'&&pend)await say(await decide(true));
    else if(turn.accion==='descartar'&&pend){await decide(false);await say(turn.respuesta||'Listo, no cambié nada.');}
    else if(turn.accion==='proponer'&&turn.cambios.length){
     try{applyIaChanges(cfg,turn.cambios);}catch(e){await say(e instanceof Error?e.message:'No pude preparar ese cambio. Pídemelo otra vez.');return publicReply({ok:true});}
     if(pend)await db.from('whatsapp_ia_conocimiento_chat').update({estado:'descartada'}).eq('id',pend.id);
     await say(turn.respuesta,{propuesta:turn.cambios,estado:'pendiente'});
    }
    else await say(turn.respuesta);
    return publicReply({ok:true});
   }catch(e){return publicReply({error:aiErrorText(e)},502);}
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
