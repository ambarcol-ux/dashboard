/* eslint-disable @typescript-eslint/no-explicit-any */
import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {siigoCatalogos,siigoToken,type SiigoCred} from '@/lib/siigo';
import {siigoEnviarDocumento} from '@/lib/siigo-queue';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Siigo per site. accion «catalogos» (admin): test the keys and list the choices. accion «enviar»: send one queued invoice the user can see. The keys never leave the server. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 let body:any;try{body=JSON.parse((await request.text()).slice(0,2000)||'{}');}catch{return publicReply({error:'Solicitud no válida.'},400);}
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
 if(!auth.user)return publicReply({error:'Inicia sesión.'},401);
 const db=publicServerClient();
 const cred=async(sede:string)=>{const {data}=await db.rpc('siigo_credencial_servidor',{p_sede_id:sede});return data?.access_key?data as SiigoCred:null;};
 try{
  if(body.accion==='catalogos'){
   const {data:admin}=await userDb.rpc('es_admin');
   if(admin!==true)return publicReply({error:'Solo administración.'},403);
   if(!UUID_RE.test(String(body.sede)))return publicReply({error:'Sede no válida.'},400);
   const c=await cred(body.sede);if(!c)return publicReply({error:'Primero guarda las credenciales de esta sede.'},400);
   await siigoToken(c,true);
   return publicReply({ok:true,...await siigoCatalogos(c)});
  }
  if(body.accion==='enviar'){
   if(!UUID_RE.test(String(body.id)))return publicReply({error:'Documento no válido.'},400);
   // RLS decides whether this user may see (and so send) the document.
   const {data:visible}=await userDb.from('siigo_documentos').select('id').eq('id',body.id).maybeSingle();
   if(!visible)return publicReply({error:'Documento no disponible.'},404);
   const r=await siigoEnviarDocumento(db,body.id);
   return r.ok?publicReply({ok:true,numero:r.numero}):publicReply({error:r.error},r.status);
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch(e){
  if(e instanceof Error&&e.message==='NOT_CONFIGURED')return publicReply({error:'El servidor no está configurado.'},503);
  return publicReply({error:e instanceof Error?e.message:'Error con Siigo.'},502);
 }
}
