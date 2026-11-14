import {publicServerClient,publicReply} from '@/lib/public-db';
export const dynamic='force-dynamic';

type Row={nombre:string;tipo:string|null;sede:string|null;descripcion:string|null;instagram:string|null;tiktok:string|null;facebook:string|null;whatsapp:string|null;logo_path:string|null;destacado:boolean};

/** Public directory «Aliados Ámbar»: active allies who authorized it (name, service, store, social networks, WhatsApp, logo). */
export async function GET(){
 try{
  const db=publicServerClient(),{data,error}=await db.rpc('directorio_aliados');
  if(error)throw error;
  const aliados=((data||[]) as Row[]).map(a=>({...a,whatsapp:a.whatsapp?(a.whatsapp.length===10?`57${a.whatsapp}`:a.whatsapp):null,
   logo:a.logo_path?db.storage.from('aliados_logos').getPublicUrl(a.logo_path).data.publicUrl:null,logo_path:undefined}));
  return publicReply({aliados});
 }catch{return publicReply({error:'El directorio no está disponible.'},503);}
}
