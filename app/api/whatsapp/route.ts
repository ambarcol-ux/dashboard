import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {loadWhatsappSettings} from '@/lib/whatsapp-config';
import {sendWhatsappText,downloadWhatsappImage,sendWhatsappFollowup,followupText,conversationFor,WINDOW_MS} from '@/lib/whatsapp-inbox';
import {resolveAd,adsSpend,adsTokenReady,adsPortfolio,adsChange} from '@/lib/meta-ads';
import {loadSocialSettings,sendSocialText,replyComment,privateReplyComment,chatFromPrivateReply,COMMENT_GONE} from '@/lib/social-inbox';
import {attachmentBlocks,type Adjunto} from '@/lib/ai-attachments';
import {weeklyChatAnalysis} from '@/lib/whatsapp-analysis';
import {dailyAdsAnalysis} from '@/lib/ads-analysis';
import {resolveSimilarMissing} from '@/lib/ia-faltantes';
import {suggestWhatsappReply,suggestCommentReply,testWhatsappAI,knowledgeChatTurn,applyIaChanges,loadContractClauses,loadErpContext,aiErrorText,type IaCambio} from '@/lib/whatsapp-ai';
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
  const body=await request.json().catch(()=>({})) as {accion?:string;tipo?:string;id?:string;valor?:number;conversacion_id?:string;texto?:string;sede_id?:string|null;conocimientos?:string;instrucciones?:string;escalamiento?:string;mensaje?:string;aplicar?:boolean;adjuntos?:Adjunto[];desde?:string;hasta?:string;pausada?:boolean;mensaje_id?:string;comentario_id?:string;modo?:string;telefono?:string;conversacion?:{rol:'clienta'|'ambar';texto:string}[]};
  // «IA de WhatsApp» › Probar: answer a sample message with the settings being edited, without saving. Administration only.
  // WhatsApp 304 › Anuncios: per ad, chats → visits (virtual / in person) → attended → contracts, with spend and cost from Meta. Administration only.
  // Anuncios fase 1: the whole Meta portfolio (campaigns, ad sets and ads with status, budget and metrics) joined with the ERP results
  // of each ad (chats, visits, attendance, contracts). Read only. Administration only.
  // Marketing › Anuncios: generate the daily AI report now (the same one the 7:10 a. m. task makes). Administration only.
  if(body.accion==='anuncios_informe'){
   const {data:admin}=await userDb.rpc('es_admin');if(admin!==true)return publicReply({error:'Solo administración.'},403);
   try{return publicReply(await dailyAdsAnalysis(publicServerClient()));}catch(e){return publicReply({error:e instanceof Error?e.message:'No se pudo generar el informe.'},502);}
  }
  if(body.accion==='anuncios_portafolio'){
   const desde=String(body.desde||''),hasta=String(body.hasta||'');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(desde)||!/^\d{4}-\d{2}-\d{2}$/.test(hasta)||desde>hasta)return publicReply({error:'Elige un rango de fechas válido.'},400);
   const {data:admin}=await userDb.rpc('es_admin');if(admin!==true)return publicReply({error:'Solo administración.'},403);
   const [{cuentas,anuncios,errores},{data:erp}]=await Promise.all([adsPortfolio(desde,hasta),userDb.rpc('whatsapp_anuncios_resumen',{p_desde:desde,p_hasta:hasta})]);
   const res=new Map(((erp||[]) as {anuncio_id:string;chats:number;citas:number;asistieron:number;contratos:number}[]).map(r=>[r.anuncio_id,r]));
   return publicReply({token:adsTokenReady(),cuentas:cuentas.map(c=>({nombre:c.name,moneda:c.currency})),errores,
    filas:anuncios.map(a=>{const r=res.get(a.anuncio_id);return {...a,chats:Number(r?.chats||0),citas:Number(r?.citas||0),asistieron:Number(r?.asistieron||0),contratos:Number(r?.contratos||0)};})});
  }
  // Anuncios fase 2: pause, activate or change the daily budget of a campaign or ad set, within the caps of Configuración. Administration only.
  if(body.accion==='anuncios_cambiar'){
   const {data:admin}=await userDb.rpc('es_admin');if(admin!==true)return publicReply({error:'Solo administración.'},403);
   const tipo=String(body.tipo||''),id=String(body.id||'');
   if(!['pausar','activar','presupuesto'].includes(tipo))return publicReply({error:'Acción inválida.'},400);
   const {data:ps}=await userDb.from('config_parametros').select('clave,valor').in('clave',['anuncios_tope_diario','anuncios_cambio_max_pct']);
   const p=Object.fromEntries(((ps||[]) as {clave:string;valor:unknown}[]).map(x=>[x.clave,Number(x.valor)]));
   try{
    const {antes,despues}=await adsChange({id,tipo:tipo as 'pausar'|'activar'|'presupuesto',valor:Number(body.valor),tope:p.anuncios_tope_diario||100000,maxPct:p.anuncios_cambio_max_pct||50});
    const {error}=await userDb.rpc('anuncios_registrar',{p_id:id,p_accion:tipo,p_antes:antes,p_despues:despues});
    if(error)console.error('anuncios_registrar',error.message);
    return publicReply({ok:true,despues});
   }catch(e){return publicReply({error:e instanceof Error?e.message:'No se pudo cambiar.'},400);}
  }
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
  // «IA de WhatsApp» › Analizar la última semana now (it also runs by itself every Monday). Administration only.
  // «Lo que le falta a la IA»: the pending questions with the same meaning get the answer just given (or «No aplica»).
  if(body.accion==='faltantes_parecidos'){
   const {data:admin}=await userDb.rpc('es_admin');
   if(admin!==true)return publicReply({error:'Solo administración.'},403);
   const fid=Number((body as {faltante_id?:unknown}).faltante_id);
   if(!Number.isInteger(fid)||fid<=0)return publicReply({error:'Dato no válido.'},400);
   try{return publicReply(await resolveSimilarMissing(publicServerClient(),fid));}catch(e){return publicReply({error:aiErrorText(e)},502);}
  }
  if(body.accion==='analisis'){
   const {data:admin}=await userDb.rpc('es_admin');
   if(admin!==true)return publicReply({error:'Solo administración puede pedir el análisis.'},403);
   if(!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);
   try{return publicReply(await weeklyChatAnalysis(publicServerClient()));}catch(e){return publicReply({error:aiErrorText(e)},502);}
  }
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
    // Attached files (price lists, policies, photos): read now; only their names are saved in the conversation.
    const blocks=attachmentBlocks(body.adjuntos),nombres=(body.adjuntos||[]).map(a=>String(a?.nombre||'archivo').slice(0,120));
    const escrito=String(body.texto||'').trim();
    if((!escrito&&!blocks.length)||escrito.length>4000)return publicReply({error:'Escribe tu mensaje (máximo 4000 caracteres) o adjunta un archivo.'},400);
    const texto=[escrito||'Analiza el archivo adjunto.',nombres.length?`📎 ${nombres.join(', ')}`:''].filter(Boolean).join('\n');
    const {data:prev}=await db.from('whatsapp_ia_conocimiento_chat').select('rol,texto').order('id',{ascending:false}).limit(15);
    const history=[...((prev||[]) as {rol:'admin'|'ia';texto:string}[]).reverse(),{rol:'admin' as const,texto}];
    const turn=await knowledgeChatTurn(cfg,history,pend?(pend.propuesta as IaCambio[]):null,await loadContractClauses(db),blocks,await loadErpContext(db));
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
   try{return publicReply(await testWhatsappAI(publicServerClient(),cfg,turns,body.adjuntos));}catch(e){return publicReply({error:aiErrorText(e)},502);}
  }
  // Start or resume a chat with the follow-up template (the customer has not written in 24 hours or never wrote to the 304).
  // Allowed only for a phone the user can already see: her chat or one of her first visits (RLS).
  if(body.accion==='iniciar'){
   const digits=String(body.telefono||'').replace(/\D/g,''),tel=digits.length===10?'57'+digits:digits,ten=tel.slice(-10);
   if(!/^57\d{10}$/.test(tel))return publicReply({error:'Celular no válido.'},400);
   const [{data:chat},{data:cita}]=await Promise.all([
    userDb.from('whatsapp_conversaciones').select('id').eq('telefono',tel).maybeSingle(),
    userDb.from('primeras_citas').select('cliente_nombre,sede_id').or(`telefono.eq.${ten},telefono.eq.${tel}`).order('created_at',{ascending:false}).limit(1).maybeSingle(),
   ]);
   if(!chat&&!cita)return publicReply({error:'No tienes acceso a esta clienta.'},403);
   const db=publicServerClient(),settings=await loadWhatsappSettings(db);
   if(!settings.token||!settings.phoneNumberId)return publicReply({error:'WhatsApp no está configurado.'},503);
   const conv=await conversationFor(db,tel,cita?.cliente_nombre||null);
   const {data:sede}=await db.from('sedes').select('nombre').eq('id',conv.sede_id||cita?.sede_id||'00000000-0000-0000-0000-000000000000').maybeSingle();
   const nombre=String(conv.nombre||cita?.cliente_nombre||'').trim().split(/\s+/)[0]||'',lugar=sede?.nombre||'';
   let waId:string;
   try{waId=await sendWhatsappFollowup(settings,tel,nombre||'hola',lugar);}catch(e){return publicReply({error:e instanceof Error?e.message:'No se pudo enviar.'},502);}
   const now=new Date().toISOString(),texto=followupText(nombre,lugar).replace(/\s+/g,' ');
   await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'template',texto,estado:'sent',enviado_por:auth.user.id,created_at:now});
   // The person who wrote takes the chat: the AI stays paused here until it is reactivated (or the configured hours pass).
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,ia_pausada:true,ia_pausada_at:now,ia_pausada_por:auth.user.id,...(!conv.sede_id&&cita?.sede_id?{sede_id:cita.sede_id}:{})}).eq('id',conv.id);
   return publicReply({ok:true,conversacion_id:conv.id});
  }
  // WhatsApp 304 › Comentarios: reply in public or by private message, ask the AI again, or set aside. RLS decides who sees them.
  if(body.accion?.startsWith('comentario_')){
   if(!UUID_RE.test(String(body.comentario_id||'')))return publicReply({error:'Comentario no válido.'},400);
   const {data:c}=await userDb.from('redes_comentarios').select('id,canal,comentario_id,estado,autor_id,autor_nombre,texto').eq('id',body.comentario_id!).maybeSingle();
   if(!c)return publicReply({error:'No tienes acceso a este comentario.'},403);
   const db=publicServerClient();
   if(body.accion==='comentario_ia'){if(!process.env.ANTHROPIC_API_KEY)return publicReply({error:'Falta ANTHROPIC_API_KEY en Vercel.'},503);await suggestCommentReply(db,c.id);return publicReply({ok:true});}
   if(body.accion==='comentario_ignorar'){await db.from('redes_comentarios').update({estado:'ignorado',respondido_por:auth.user.id,respondido_at:new Date().toISOString()}).eq('id',c.id);return publicReply({ok:true});}
   if(body.accion==='comentario_responder'){
    const texto=String(body.texto||'').trim(),privado=body.modo==='privado';
    if(!texto||texto.length>(privado?1000:2200))return publicReply({error:`Escribe la respuesta (máximo ${privado?1000:2200} caracteres).`},400);
    const s=await loadSocialSettings(db);
    if(!s)return publicReply({error:'Instagram y Facebook no están conectados en Integraciones.'},503);
    let rid:string;
    try{if(privado){const dm=await privateReplyComment(s,c.comentario_id,texto);rid=dm.id;await chatFromPrivateReply(db,dm,c,texto,'erp',auth.user.id);}else rid=await replyComment(s,c.comentario_id,texto,c.canal);}
    catch(e){const m=e instanceof Error?e.message:'No se pudo responder.';
     if(m===COMMENT_GONE)await db.from('redes_comentarios').update({estado:'eliminado',ia_error:m,respondido_at:new Date().toISOString()}).eq('id',c.id);
     return publicReply({error:m},502);}
    await db.from('redes_comentarios').update({estado:privado?'privado':'respondido',respuesta:texto,respuesta_id:rid,respondido_por:auth.user.id,respondido_at:new Date().toISOString()}).eq('id',c.id);
    return publicReply({ok:true});
   }
   return publicReply({error:'Acción no válida.'},400);
  }
  if(!UUID_RE.test(String(body.conversacion_id||'')))return publicReply({error:'Chat no válido.'},400);
  // The user's own permissions decide: RLS returns the chat only if they can see it.
  const {data:conv}=await userDb.from('whatsapp_conversaciones').select('id,telefono,ultimo_entrante_at,canal,contacto_id').eq('id',body.conversacion_id!).maybeSingle();
  if(!conv)return publicReply({error:'No tienes acceso a este chat.'},403);
  const db=publicServerClient();
  // Per-chat switch: a person pauses the AI to take the chat, and reactivates it when done.
  if(body.accion==='pausa'){
   const pausada=body.pausada===true;
   const {error}=await db.from('whatsapp_conversaciones').update(pausada?{ia_pausada:true,ia_pausada_at:new Date().toISOString(),ia_pausada_por:auth.user.id}:{ia_pausada:false,ia_pausada_at:null,ia_pausada_por:null}).eq('id',conv.id);
   return error?publicReply({error:'No se pudo cambiar la IA de este chat.'},500):publicReply({ok:true});
  }
  // Customer photo: fetched from WhatsApp each time it is opened (Meta keeps it about 30 days); the ERP does not store it.
  if(body.accion==='foto'){
   if(!UUID_RE.test(String(body.mensaje_id||'')))return publicReply({error:'Mensaje no válido.'},400);
   const {data:m}=await db.from('whatsapp_mensajes').select('media_id').eq('id',body.mensaje_id!).eq('conversacion_id',conv.id).maybeSingle();
   if(!m?.media_id)return publicReply({error:'Este mensaje no tiene foto.'},404);
   // Saved in the ERP the first time it opens: later openings are instant and the photo outlives Meta's 30 days.
   const ruta=`${conv.id}/${body.mensaje_id}`,fotos=db.storage.from('whatsapp_fotos');
   const firmada=async()=>(await fotos.createSignedUrl(ruta,3600)).data?.signedUrl||null;
   const ya=await firmada();if(ya)return publicReply({url:ya});
   const settings=await loadWhatsappSettings(db);
   const img=settings.token?await downloadWhatsappImage(settings,String(m.media_id)).catch(()=>null):null;
   if(!img||img.datos.length>4_200_000)return publicReply({error:'La foto ya no está disponible en WhatsApp (Meta la guarda unos 30 días).'},404);
   const {error:up}=await fotos.upload(ruta,Buffer.from(img.datos,'base64'),{contentType:img.tipo,upsert:true});
   const url=up?null:await firmada();
   return publicReply(url?{url}:img);
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
   let waId:string;
   if(conv.canal&&conv.canal!=='whatsapp'){
    const s=await loadSocialSettings(db);
    if(!s||!conv.contacto_id)return publicReply({error:'Instagram/Messenger no está conectado en Integraciones.'},503);
    try{waId=await sendSocialText(s,conv.contacto_id,texto);}catch(e){return publicReply({error:e instanceof Error?e.message:'No se pudo enviar.'},502);}
   }else{
    const settings=await loadWhatsappSettings(db);
    if(!settings.token||!settings.phoneNumberId)return publicReply({error:'WhatsApp no está configurado.'},503);
    try{waId=await sendWhatsappText(settings,conv.telefono,texto);}catch(e){return publicReply({error:e instanceof Error?e.message:'No se pudo enviar.'},502);}
   }
   const now=new Date().toISOString();
   await db.from('whatsapp_mensajes').insert({conversacion_id:conv.id,wa_id:waId,direccion:'saliente',origen:'erp',tipo:'text',texto,estado:'sent',enviado_por:auth.user.id,created_at:now});
   await db.from('whatsapp_conversaciones').update({ultimo_mensaje:texto.slice(0,200),ultimo_at:now,no_leidos:0,ia_sugerencia:null,ia_atender:false,ia_motivo:null,ia_pausada:true,ia_pausada_at:now,ia_pausada_por:auth.user.id}).eq('id',conv.id);
   return publicReply({ok:true});
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch{return publicReply({error:'No se pudo completar la acción.'},500);}
}
