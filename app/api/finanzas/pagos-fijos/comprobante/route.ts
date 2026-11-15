import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
export const dynamic='force-dynamic';

const EXT:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};

/** Pagos fijos de sede: one-time link to upload the payment receipt into the store's cash receipts (comprobantes_caja/<sede>/…),
 *  for anyone who can see that installment (accounting cannot upload to that space directly). */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const b=await request.json().catch(()=>({})) as {cuota_id?:string;tipo?:string};
 const ext=EXT[String(b.tipo)];if(!ext)return publicReply({error:'Sube el comprobante en JPG, PNG, WEBP o PDF.'},400);
 const {data:sede}=await userDb.rpc('pagos_fijos_sede_cuota',{p_id:b.cuota_id});
 if(!sede)return publicReply({error:'No tienes acceso a esta cuota.'},403);
 const ruta=`${sede}/pagos-fijos/${crypto.randomUUID()}.${ext}`;
 const {data,error}=await publicServerClient().storage.from('comprobantes_caja').createSignedUploadUrl(ruta);
 if(error)return publicReply({error:'No se pudo preparar la subida.'},500);
 return publicReply({ok:true,ruta,token:data.token});
}
