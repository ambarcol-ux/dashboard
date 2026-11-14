import {publicServerClient} from '@/lib/public-db';
import {loadTiktok,tiktokConnect,ORIGIN} from '@/lib/tiktok';
export const dynamic='force-dynamic';

/** TikTok sends the admin back here after login: the code becomes tokens (checked against the saved state). */
export async function GET(request:Request){
 const q=new URL(request.url).searchParams,back=(m:string)=>Response.redirect(`${ORIGIN}/admin/config/integraciones?tiktok=${encodeURIComponent(m)}`,302);
 if(q.get('error'))return back(`TikTok no autorizó la conexión: ${q.get('error_description')||q.get('error')}`);
 try{
  const db=publicServerClient(),c=await loadTiktok(db);
  if(!c)return back('TikTok no está configurado.');
  await tiktokConnect(db,c,q.get('code')||'',q.get('state')||'');
  return back('ok');
 }catch(e){return back(e instanceof Error?e.message:'No se pudo conectar.');}
}
