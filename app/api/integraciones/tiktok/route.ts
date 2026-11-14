import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {loadTiktok,tiktokAuthUrl,tiktokTest} from '@/lib/tiktok';
export const dynamic='force-dynamic';

/** Configuración › Integraciones › TikTok (admin): login link, connection test and «app audited» switch. The keys are saved with guardar_integracion_tiktok. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
 const {data:admin}=auth.user?await userDb.rpc('es_admin'):{data:false};
 if(admin!==true)return publicReply({error:'Solo administración puede usar las integraciones.'},403);
 const db=publicServerClient(),b=await request.json().catch(()=>({})) as {accion?:string;auditada?:boolean};
 const c=await loadTiktok(db);if(!c)return publicReply({error:'Primero guarda el Client key y el Client secret.'},400);
 try{
  if(b.accion==='conectar')return publicReply({ok:true,url:await tiktokAuthUrl(db,c)});
  if(b.accion==='auditada'){await db.rpc('integracion_tiktok_actualizar',{p_config:{auditada:b.auditada===true},p_secreto:null,p_estado:null,p_error:null});return publicReply({ok:true});}
  if(b.accion==='probar')return publicReply({ok:true,detalle:await tiktokTest(db,c)});
  return publicReply({error:'Acción no válida.'},400);
 }catch(e){
  const msg=e instanceof Error?e.message:'Error';
  if(b.accion==='probar')await db.rpc('integracion_tiktok_actualizar',{p_config:{},p_secreto:null,p_estado:'error',p_error:msg.slice(0,300)});
  return publicReply({error:msg},400);
 }
}
