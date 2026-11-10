import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {loadSocialSettings,pageToken} from '@/lib/social-inbox';
export const dynamic='force-dynamic';

/** Configuración › Integraciones › Instagram y Messenger: «Probar conexión» checks the page token, the Instagram account and subscribes the page to the ERP webhook. Admin only. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  const {data:admin}=auth.user?await userDb.rpc('es_admin'):{data:false};
  if(admin!==true)return publicReply({error:'Solo administración puede usar las integraciones.'},403);
  const db=publicServerClient(),s=await loadSocialSettings(db),v=process.env.META_GRAPH_VERSION||'v21.0';
  if(!s)return publicReply({error:'Primero guarda el ID de la página y el token.'},400);
  const pt=await pageToken(s);
  const get=async(path:string,init?:RequestInit)=>{const r=await fetch(`https://graph.facebook.com/${v}/${path}${path.includes('?')?'&':'?'}access_token=${encodeURIComponent(pt)}`,{...init,signal:AbortSignal.timeout(15000)});return {ok:r.ok,d:await r.json().catch(()=>({})) as Record<string,any>};}; // eslint-disable-line @typescript-eslint/no-explicit-any
  const fail=async(msg:string)=>{await db.from('integraciones').update({estado:'error',ultimo_error:msg.slice(0,300),probado_at:new Date().toISOString()}).eq('id','redes');return publicReply({error:msg},400);};
  const page=await get(`${s.pageId}?fields=name,instagram_business_account{id,username}`);
  if(!page.ok)return fail(`Meta no aceptó el token o el ID de la página: ${String(page.d.error?.message||'').slice(0,160)}`);
  const ig=page.d.instagram_business_account as {id?:string;username?:string}|undefined;
  if(s.instagramId&&ig?.id&&ig.id!==s.instagramId)return fail(`La cuenta de Instagram unida a la página es @${ig.username} (ID ${ig.id}); corrige el ID guardado.`);
  // Subscribes the page to the app webhook: new messages and replies typed in Meta Business Suite.
  const sub=await get(`${s.pageId}/subscribed_apps?subscribed_fields=messages,message_echoes`,{method:'POST'});
  if(!sub.ok)return fail(`No se pudo suscribir la página a los mensajes: ${String(sub.d.error?.message||'').slice(0,160)}. Revisa que el token tenga pages_messaging y pages_manage_metadata.`);
  // Diagnosis: is the page subscribed to this app, and where does the app send page/Instagram events?
  const subs=await get(`${s.pageId}/subscribed_apps`);
  const apps=((subs.d.data||[]) as {id?:string;name?:string;subscribed_fields?:string[]}[]);
  const me=await get('app');
  const appId=String(me.d.id||''),secret=process.env.META_APP_SECRET||'';
  const mine=apps.find(a=>a.id===appId);
  let destino='';
  if(appId&&secret){
   const r=await fetch(`https://graph.facebook.com/${v}/${appId}/subscriptions?access_token=${encodeURIComponent(`${appId}|${secret}`)}`,{signal:AbortSignal.timeout(15000)});
   const d=await r.json().catch(()=>({})) as {data?:{object:string;callback_url:string;active:boolean;fields:{name:string}[]}[];error?:{message?:string}};
   destino=r.ok?(d.data||[]).filter(x=>x.object==='page'||x.object==='instagram').map(x=>`${x.object}: ${x.active?'activo':'inactivo'} → ${x.callback_url} [${x.fields.map(f=>f.name).join(', ')}]`).join(' | ')||'la app no tiene webhooks de page ni instagram':`no se pudo leer (${String(d.error?.message||r.status).slice(0,120)}; ¿META_APP_SECRET es de otra app?)`;
  }
  const detalle=`Página «${page.d.name}»${ig?.username?` · Instagram @${ig.username}`:' · sin Instagram unido a la página'} · App ${appId}: página ${mine?`suscrita (${(mine.subscribed_fields||[]).join(', ')})`:'NO suscrita'}${apps.length>1?` · otras apps suscritas: ${apps.filter(a=>a.id!==appId).map(a=>a.name||a.id).join(', ')}`:''} · Webhooks: ${destino||'sin datos'}`;
  await db.from('integraciones').update({estado:'conectada',ultimo_error:null,probado_at:new Date().toISOString(),config:{page_id:s.pageId,instagram_id:s.instagramId||ig?.id||'',nombre_pagina:String(page.d.name||''),instagram_usuario:ig?.username||''}}).eq('id','redes');
  return publicReply({ok:true,detalle});
 }catch{return publicReply({error:'No se pudo probar la conexión.'},500);}
}
