import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
import {EMAIL_PROVIDERS,syncContacts,testConnection,type Contact,type EmailConnection} from '@/lib/email-providers';
export const dynamic='force-dynamic';
export const maxDuration=60;

/** Configuración › Integraciones › Correo: «Probar conexión» and «Sincronizar autorizadas». Admin only; the key never leaves the server. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 try{
  const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth}=await userDb.auth.getUser(bearer.slice(7));
  const {data:admin}=auth.user?await userDb.rpc('es_admin'):{data:false};
  if(admin!==true)return publicReply({error:'Solo administración puede usar las integraciones.'},403);
  const body=JSON.parse((await request.text()).slice(0,2000)||'{}'),db=publicServerClient();
  const {data:conn,error}=await db.rpc('integracion_correo_servidor');
  if(error||!conn?.secreto)return publicReply({error:'Primero guarda el proveedor y su clave.'},400);
  const c=conn as EmailConnection;
  if(body.accion==='probar'){
   const r=await testConnection(c);
   await db.from('integraciones').update({estado:r.ok?'conectada':'error',ultimo_error:r.ok?null:r.error,probado_at:new Date().toISOString()}).eq('id','correo');
   return r.ok?publicReply({ok:true,detalle:r.detalle}):publicReply({error:r.error},400);
  }
  if(body.accion==='sincronizar'){
   if(!EMAIL_PROVIDERS[c.proveedor].sincroniza)return publicReply({error:'Este proveedor no sincroniza contactos.'},400);
   // Only people with an active commercial authorization and an email.
   const contacts:Contact[]=[];
   for(let from=0;;from+=1000){
    const {data,error:e}=await db.from('autorizaciones_datos').select('email,nombre,telefono').eq('estado','autorizada').eq('comercial',true).not('email','is',null).order('id').range(from,from+999);
    if(e)return publicReply({error:'No se pudieron leer las autorizaciones.'},503);
    for(const a of data||[]){const email=String(a.email||'').trim().toLowerCase();if(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))contacts.push({email,nombre:a.nombre,telefono:a.telefono});}
    if(!data||data.length<1000)break;
   }
   const unique=[...new Map(contacts.map(x=>[x.email,x])).values()];
   const r=await syncContacts(c,unique);
   if(!r.ok)return publicReply({error:r.error},400);
   await db.from('integraciones').update({sincronizado_at:new Date().toISOString(),sincronizados:r.enviados}).eq('id','correo');
   return publicReply({ok:true,enviados:r.enviados});
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch{return publicReply({error:'El servicio no está disponible.'},503);}
}
