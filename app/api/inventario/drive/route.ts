import {createClient} from '@supabase/supabase-js';
import {PHOTO_FIELDS,codeCandidates,driveFolderId,priceFromName} from '@/lib/dress-photos';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const MAX=10*1024*1024,TYPES=['image/jpeg','image/png','image/webp'],PAGE=8;
type Result={archivo:string;tipo:'ok'|'aviso'|'error'|'omitido';mensaje:string};

/** Imports dress photos from a shared Google Drive folder, a few per call (the page loops with pageToken).
 * The reference at the start of each file name picks the dress; a price in the name is checked against the rental price.
 * Storage and dress updates run with the user's session, so the same permissions as uploading by hand apply. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 const key=process.env.GOOGLE_DRIVE_API_KEY;
 if(!key)return reply({error:'Falta configurar la clave de Google Drive (GOOGLE_DRIVE_API_KEY) en el servidor.'},503);
 let body:{carpeta?:string;pageToken?:string};
 try{body=JSON.parse((await request.text()).slice(0,4000)||'{}');}catch{return reply({error:'Datos no válidos.'},400);}
 const folder=driveFolderId(String(body.carpeta||''));
 if(!folder)return reply({error:'Pega el link de la carpeta de Google Drive.'},400);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth}=await db.auth.getUser(bearer.slice(7));
 if(!auth?.user)return reply({error:'Inicia sesión.'},401);
 const [{data:admin},{data:perms}]=await Promise.all([db.rpc('es_admin'),db.rpc('mis_permisos')]);
 if(admin!==true&&!(Array.isArray(perms)&&perms.includes('registros.editar_guardados')))return reply({error:'No tienes permiso para cargar fotos.'},403);

 const q=encodeURIComponent(`'${folder}' in parents and trashed=false and mimeType contains 'image/'`);
 const list=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType,size)&orderBy=name&pageSize=${PAGE}&key=${key}${body.pageToken?`&pageToken=${encodeURIComponent(body.pageToken)}`:''}`);
 if(!list.ok)return reply({error:list.status===404||list.status===403?'No se pudo abrir la carpeta: compártela como «Cualquier persona con el enlace» (lector).':'Google Drive no respondió. Intenta de nuevo.'},400);
 const page=await list.json() as {nextPageToken?:string;files?:{id:string;name:string;mimeType:string;size?:string}[]};

 const {data:dresses,error:de}=await db.from('vestidos').select('id,codigo,precio_sugerido,foto_frente,foto_espalda,foto_detalle').eq('archivado',false);
 if(de)return reply({error:'No se pudo leer el inventario.'},500);
 const byCode=new Map<string,Record<string,unknown>[]>();
 for(const v of dresses||[]){const k=String(v.codigo||'').trim().toUpperCase();if(k)byCode.set(k,[...(byCode.get(k)||[]),v]);}

 const resultados:Result[]=[];
 for(const f of page.files||[]){
  const cands=codeCandidates(f.name),code=cands.find(c=>byCode.has(c))||cands.at(-1)||'',targets=byCode.get(code)||[];
  if(!targets.length){resultados.push({archivo:f.name,tipo:'error',mensaje:`No hay vestido con la referencia «${code||f.name}». Revisa el nombre del archivo o el código en Inventario.`});continue;}
  if(!TYPES.includes(f.mimeType)){resultados.push({archivo:f.name,tipo:'error',mensaje:`Formato ${f.mimeType} no admitido (usa JPG, PNG o WebP; las fotos HEIC de iPhone se deben convertir).`});continue;}
  if(Number(f.size||0)>MAX){resultados.push({archivo:f.name,tipo:'error',mensaje:'La foto pesa más de 10 MB.'});continue;}
  const pending=targets.filter(v=>!PHOTO_FIELDS.some(k=>String(v[k]||'').includes(`drive-${f.id}`)));
  if(!pending.length){resultados.push({archivo:f.name,tipo:'omitido',mensaje:'Ya estaba cargada.'});continue;}
  try{
   const file=await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${key}`);
   if(!file.ok)throw Error('No se pudo descargar de Drive.');
   const bytes=await file.arrayBuffer(),hechos:string[]=[],avisos:string[]=[];
   for(const v of pending){
    const slot=PHOTO_FIELDS.find(k=>!v[k]);
    if(!slot){avisos.push(`${v.codigo} ya tiene 3 fotos`);continue;}
    const path=`${v.id}/drive-${f.id}-${slot}.${f.mimeType.split('/')[1].replace('jpeg','jpg')}`;
    const {error:ue}=await db.storage.from('vestidos_fotos').upload(path,bytes,{contentType:f.mimeType,upsert:true});
    if(ue)throw Error(ue.message);
    const url=db.storage.from('vestidos_fotos').getPublicUrl(path).data.publicUrl;
    const patch:Record<string,string>={[slot]:url,...(slot==='foto_frente'?{imagen_url:url}:{})};
    const {error:e2}=await db.from('vestidos').update(patch).eq('id',v.id);
    if(e2)throw Error(e2.message);
    Object.assign(v,patch);hechos.push(`${v.codigo} · ${slot.replace('foto_','')}`);
   }
   const precio=priceFromName(f.name,code),actual=Number(targets[0].precio_sugerido)||0;
   if(precio&&precio!==actual)avisos.push(`el precio del archivo (${precio.toLocaleString('es-CO')}) no coincide con el del inventario (${actual?actual.toLocaleString('es-CO'):'sin precio'})`);
   resultados.push({archivo:f.name,tipo:hechos.length?(avisos.length?'aviso':'ok'):'error',mensaje:[hechos.join(' · '),...avisos].filter(Boolean).join(' · ')});
  }catch(e){resultados.push({archivo:f.name,tipo:'error',mensaje:e instanceof Error?e.message:'No se pudo subir.'});}
 }
 return reply({resultados,next:page.nextPageToken||null});
}
