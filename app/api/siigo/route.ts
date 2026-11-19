/* eslint-disable @typescript-eslint/no-explicit-any */
import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply,UUID_RE} from '@/lib/public-db';
import {siigoCatalogos,siigoEnviarFactura,siigoToken,type SiigoCred,type SiigoParams} from '@/lib/siigo';
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
   const {data:d}=await db.from('siigo_documentos').select('id,sede_id,tipo,origen,origen_id,datos,estado,intentos,updated_at').eq('id',body.id).single();
   if(!d)return publicReply({error:'Documento no disponible.'},404);
   if(d.tipo!=='factura')return publicReply({error:'Por ahora solo se envían facturas.'},400);
   if(d.estado==='enviado'||d.estado==='anulado')return publicReply({error:d.estado==='enviado'?'Ya se envió a Siigo.':'Documento anulado.'},409);
   // Claim it so two clicks never create two invoices.
   const {data:claim}=await db.from('siigo_documentos').update({intentos:d.intentos+1,updated_at:new Date().toISOString()}).eq('id',d.id).eq('updated_at',d.updated_at).in('estado',['pendiente','error']).select('id');
   if(!claim?.length)return publicReply({error:'Este documento se está enviando. Espera un momento.'},409);
   const c=await cred(d.sede_id);
   const fail=async(msg:string)=>{await db.from('siigo_documentos').update({estado:'error',error:msg.slice(0,1000),updated_at:new Date().toISOString()}).eq('id',d.id);
    if(d.origen==='venta')await db.from('ventas_vestidos').update({siigo_estado:'error'}).eq('id',d.origen_id);return publicReply({error:msg},400);};
   if(!c)return fail('Esta sede no tiene credenciales de Siigo.');
   try{
    const r=await siigoEnviarFactura(c,((c as any).parametros||{}) as SiigoParams,d as any);
    await db.from('siigo_documentos').update({estado:'enviado',error:null,siigo_id:r.id,siigo_numero:r.numero,respuesta:r.respuesta,enviado_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',d.id);
    if(d.origen==='venta')await db.from('ventas_vestidos').update({siigo_estado:'enviada',numero_factura:r.numero.slice(0,40)||null}).eq('id',d.origen_id);
    return publicReply({ok:true,numero:r.numero});
   }catch(e){return fail(e instanceof Error?e.message:'No se pudo enviar a Siigo.');}
  }
  return publicReply({error:'Acción no válida.'},400);
 }catch(e){
  if(e instanceof Error&&e.message==='NOT_CONFIGURED')return publicReply({error:'El servidor no está configurado.'},503);
  return publicReply({error:e instanceof Error?e.message:'Error con Siigo.'},502);
 }
}
