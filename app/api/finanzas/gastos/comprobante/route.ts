import {createClient} from '@supabase/supabase-js';
import {publicServerClient,publicReply} from '@/lib/public-db';
export const dynamic='force-dynamic';

const EXT:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','application/pdf':'pdf'};

/** Finanzas › Gastos: «subir» gives a one-time link to upload the receipt into comprobantes_caja/<store or «administracion»>/…
 *  (the store whose cash register pays it); «ver» opens a receipt of an expense or of a movement between stores the user can see. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const b=await request.json().catch(()=>({})) as {accion?:string;sede_id?:string;cuenta_id?:string;medio?:string;entre_sedes?:boolean;tipo?:string;path?:string};
 const storage=publicServerClient().storage.from('comprobantes_caja');
 if(b.accion==='ver'){
  const path=String(b.path||'');
  // RLS decides: the receipt must belong to an expense or a movement the user can see.
  const [{data:g},{data:m}]=await Promise.all([userDb.from('gastos').select('id').eq('comprobante_path',path).limit(1),userDb.from('movimientos_entre_sedes').select('id').eq('comprobante_path',path).limit(1)]);
  if(!g?.length&&!m?.length)return publicReply({error:'No tienes acceso a este comprobante.'},403);
  const {data,error}=await storage.createSignedUrl(path,600);
  return error||!data?publicReply({error:'No se pudo abrir el comprobante.'},503):publicReply({url:data.signedUrl});
 }
 const ext=EXT[String(b.tipo)];if(!ext)return publicReply({error:'Sube el comprobante en JPG, PNG, WEBP o PDF.'},400);
 const {data:carpeta,error:e}=await userDb.rpc('gastos_carpeta_comprobante',{p_sede:b.sede_id||null,p_cuenta:b.cuenta_id||null,p_medio:b.medio||'',p_entre_sedes:b.entre_sedes===true});
 if(e||!carpeta)return publicReply({error:e?.message||'No tienes acceso.'},403);
 const ruta=`${carpeta}/${b.entre_sedes?'entre-sedes':'gastos'}/${crypto.randomUUID()}.${ext}`;
 const {data,error}=await storage.createSignedUploadUrl(ruta);
 if(error)return publicReply({error:'No se pudo preparar la subida.'},500);
 return publicReply({ok:true,ruta,token:data.token});
}
