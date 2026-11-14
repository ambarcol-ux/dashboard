import type {SupabaseClient} from '@supabase/supabase-js';
import type {Pieza} from './content-studio';

/** TikTok (Content Posting API): connection from Configuración › Integraciones and publishing from the Estudio de contenido.
 *  While TikTok has not audited the app, posts can only be private (SELF_ONLY); once audited, mark it in Integraciones. */
const API='https://open.tiktokapis.com/v2';
export const ORIGIN=(process.env.FIRST_VISIT_PUBLIC_ORIGIN||'https://erp.ambarcouture.com').replace(/\/$/,'');
export const REDIRECT=`${ORIGIN}/api/integraciones/tiktok/callback`;
const SCOPES='user.info.basic,video.publish,video.upload';

type Secret={client_secret:string;access_token?:string;refresh_token?:string;expires_at?:number;refresh_expires_at?:number;open_id?:string};
export type TiktokConn={clientKey:string;secret:Secret;config:Record<string,unknown>;estado:string};

export async function loadTiktok(db:SupabaseClient):Promise<TiktokConn|null>{
 const {data}=await db.rpc('integracion_tiktok_servidor');
 const r=data as {activo?:boolean;estado?:string;config?:Record<string,unknown>;secreto?:string}|null;
 if(!r?.activo||!r.secreto||!r.config?.client_key)return null;
 try{return {clientKey:String(r.config.client_key),secret:JSON.parse(r.secreto) as Secret,config:r.config,estado:String(r.estado||'')};}catch{return null;}
}
const save=(db:SupabaseClient,config:Record<string,unknown>|null,secret:Secret|null,estado:string|null,error:string|null)=>
 db.rpc('integracion_tiktok_actualizar',{p_config:config||{},p_secreto:secret?JSON.stringify(secret):null,p_estado:estado,p_error:error});

/** Login link for «Conectar TikTok» (the state is kept 15 minutes against forged callbacks). */
export async function tiktokAuthUrl(db:SupabaseClient,c:TiktokConn){
 const state=crypto.randomUUID();
 await save(db,{oauth_state:state,oauth_at:Date.now()},null,null,null);
 return `https://www.tiktok.com/v2/auth/authorize/?${new URLSearchParams({client_key:c.clientKey,scope:SCOPES,response_type:'code',redirect_uri:REDIRECT,state})}`;
}

async function tokenCall(c:TiktokConn,params:Record<string,string>){
 const r=await fetch(`${API}/oauth/token/`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_key:c.clientKey,client_secret:c.secret.client_secret,...params}),signal:AbortSignal.timeout(20000)});
 const d=await r.json().catch(()=>({})) as {access_token?:string;expires_in?:number;refresh_token?:string;refresh_expires_in?:number;open_id?:string;error?:string;error_description?:string};
 if(!r.ok||!d.access_token)throw Error(`TikTok: ${d.error_description||d.error||r.status}`);
 return {...c.secret,access_token:d.access_token,refresh_token:d.refresh_token||c.secret.refresh_token,open_id:d.open_id||c.secret.open_id,
  expires_at:Date.now()+(d.expires_in||86400)*1000,refresh_expires_at:Date.now()+(d.refresh_expires_in||31536000)*1000} as Secret;
}

/** Callback: exchanges the code for tokens and saves the connected account's name. */
export async function tiktokConnect(db:SupabaseClient,c:TiktokConn,code:string,state:string){
 if(!state||state!==c.config.oauth_state||Date.now()-Number(c.config.oauth_at||0)>15*60000)throw Error('El enlace de conexión venció. Vuelve a pulsar «Conectar TikTok».');
 const secret=await tokenCall(c,{code,grant_type:'authorization_code',redirect_uri:REDIRECT});
 const u=await call(secret.access_token!,'/user/info/?fields=display_name,avatar_url','GET').catch(()=>null) as {user?:{display_name?:string}}|null;
 await save(db,{oauth_state:null,cuenta:u?.user?.display_name||'',conectado_at:new Date().toISOString()},secret,'conectada',null);
}

/** Valid access token (TikTok's last 24 h; renewed with the refresh token, which lasts a year). */
export async function tiktokToken(db:SupabaseClient,c:TiktokConn){
 if(!c.secret.access_token)throw Error('TikTok no está conectado: pulsa «Conectar TikTok» en Integraciones.');
 if(Number(c.secret.expires_at||0)-Date.now()>10*60000)return c.secret.access_token;
 if(!c.secret.refresh_token||Number(c.secret.refresh_expires_at||0)<Date.now())throw Error('La conexión con TikTok venció: vuelve a pulsar «Conectar TikTok».');
 try{c.secret=await tokenCall(c,{grant_type:'refresh_token',refresh_token:c.secret.refresh_token});}
 catch(e){await save(db,null,null,'error',e instanceof Error?e.message:'Error');throw e;}
 await save(db,null,c.secret,null,null);
 return c.secret.access_token!;
}

async function call(token:string,path:string,method:'GET'|'POST'='POST',body?:unknown){
 const r=await fetch(`${API}${path}`,{method,headers:{Authorization:`Bearer ${token}`,...(method==='POST'?{'Content-Type':'application/json; charset=UTF-8'}:{})},...(method==='POST'?{body:JSON.stringify(body||{})}:{}),signal:AbortSignal.timeout(25000)});
 const d=await r.json().catch(()=>({})) as {data?:Record<string,unknown>;error?:{code?:string;message?:string}};
 if(!r.ok||(d.error?.code&&d.error.code!=='ok'))throw Error(`TikTok: ${d.error?.message||d.error?.code||r.status}`);
 return d.data||{};
}

/** «Probar conexión»: who is connected and which privacy levels the account allows. */
export async function tiktokTest(db:SupabaseClient,c:TiktokConn){
 const tk=await tiktokToken(db,c);
 const info=await call(tk,'/post/publish/creator_info/query/') as {creator_nickname?:string;privacy_level_options?:string[]};
 await save(db,{cuenta:info.creator_nickname||c.config.cuenta||''},null,'conectada',null);
 return `Cuenta «${info.creator_nickname||'—'}» · privacidad permitida: ${(info.privacy_level_options||[]).join(', ')||'—'}${c.config.auditada?'':' · App sin auditar: se publica en privado'}`;
}

/** Photos reach TikTok through erp.ambarcouture.com (TikTok only downloads from a verified domain). */
const viaErp=(url:string)=>`${ORIGIN}/api/marketing/media?u=${encodeURIComponent(url)}`;

/** Publishes a piece on TikTok. Videos are uploaded by the ERP; photos are pulled by TikTok. TikTok processes them a while:
 *  the publish id stays in the state and the next run checks it. Returns true when finished. */
export async function publishTiktok(db:SupabaseClient,p:Pieza,state:Record<string,string>){
 if(state.id)return true;
 const c=await loadTiktok(db);if(!c)throw Error('TikTok no está configurado (Integraciones).');
 const tk=await tiktokToken(db,c);
 if(!state.publish_id){
  const privacy=c.config.auditada?'PUBLIC_TO_EVERYONE':'SELF_ONLY',texto=p.texto||'';
  const video=p.medios.find(m=>m.tipo==='video');
  if(video){
   const r=await fetch(video.url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('No se pudo leer el video de la biblioteca.');
   const buf=Buffer.from(await r.arrayBuffer()),size=buf.length,MB=1024*1024;
   // TikTok: one chunk up to 64 MB; otherwise 10 MB chunks and the last one takes the rest.
   const chunk=size<=64*MB?size:10*MB,count=size<=64*MB?1:Math.floor(size/chunk);
   const init=await call(tk,'/post/publish/video/init/','POST',{post_info:{title:texto.slice(0,2200),privacy_level:privacy,disable_comment:false,disable_duet:false,disable_stitch:false},
    source_info:{source:'FILE_UPLOAD',video_size:size,chunk_size:chunk,total_chunk_count:count}}) as {publish_id?:string;upload_url?:string};
   for(let i=0;i<count;i++){
    const a=i*chunk,b=i===count-1?size:a+chunk;
    const up=await fetch(init.upload_url!,{method:'PUT',headers:{'Content-Type':video.url.endsWith('.mov')?'video/quicktime':'video/mp4','Content-Length':String(b-a),'Content-Range':`bytes ${a}-${b-1}/${size}`},body:buf.subarray(a,b),signal:AbortSignal.timeout(50000)});
    if(!up.ok&&up.status!==206)throw Error(`TikTok no recibió el video (${up.status}).`);
   }
   state.publish_id=String(init.publish_id||'');
  }else{
   const fotos=p.medios.filter(m=>m.tipo==='imagen').slice(0,35).map(m=>viaErp(m.url));
   if(!fotos.length)throw Error('La pieza no tiene fotos ni video para TikTok.');
   const init=await call(tk,'/post/publish/content/init/','POST',{post_info:{title:texto.split('\n')[0].slice(0,90),description:texto.slice(0,4000),privacy_level:privacy,disable_comment:false,auto_add_music:true},
    source_info:{source:'PULL_FROM_URL',photo_cover_index:0,photo_images:fotos},post_mode:'DIRECT_POST',media_type:'PHOTO'}) as {publish_id?:string};
   state.publish_id=String(init.publish_id||'');
  }
  if(!state.publish_id)throw Error('TikTok no devolvió el número de publicación.');
 }
 const st=await call(tk,'/post/publish/status/fetch/','POST',{publish_id:state.publish_id}) as {status?:string;fail_reason?:string;publicaly_available_post_id?:(string|number)[]};
 if(st.status==='FAILED')throw Error(`TikTok rechazó la publicación: ${st.fail_reason||'sin motivo'}`);
 if(st.status!=='PUBLISH_COMPLETE')return false;
 const id=st.publicaly_available_post_id?.[0];
 state.id=String(id||state.publish_id);
 if(id&&c.config.usuario)state.enlace=`https://www.tiktok.com/@${encodeURIComponent(String(c.config.usuario||''))}/video/${id}`;
 if(!c.config.auditada)state.nota='Publicada en privado: hazla pública desde la app de TikTok';
 return true;
}
