import {createClient} from '@supabase/supabase-js';
import {PHOTO_FIELDS,codeCandidates,driveFolderId,priceFromName,slotFromName,suggestDresses,type DressRef,type Suggestion} from '@/lib/dress-photos';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const MAX=10*1024*1024,TYPES=['image/jpeg','image/png','image/webp'],BATCH=8,MAX_FOLDERS=400,MAX_FILES=4000;
type DriveFile={id:string;name:string;carpeta:string;vestido_id?:string};
type Result={archivo:string;tipo:'ok'|'aviso'|'error'|'omitido'|'sugerencia';mensaje:string;file?:DriveFile;candidatos?:Suggestion[]};

/** Imports dress photos from a shared Google Drive folder and its subfolders (one folder per dress is fine).
 * accion 'listar' walks the folders; accion 'importar' uploads up to BATCH files. The reference (and price) comes from
 * the file name or, if it has none, from its folder name. Uploads run with the user's session (same permissions as by hand). */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 let body:{accion?:string;carpeta?:string;archivos?:DriveFile[]};
 try{body=JSON.parse((await request.text()).slice(0,200000)||'{}');}catch{return reply({error:'Datos no válidos.'},400);}
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth}=await db.auth.getUser(bearer.slice(7));
 if(!auth?.user)return reply({error:'Inicia sesión.'},401);
 const [{data:admin},{data:perms}]=await Promise.all([db.rpc('es_admin'),db.rpc('mis_permisos')]);
 if(admin!==true&&!(Array.isArray(perms)&&perms.includes('registros.editar_guardados')))return reply({error:'No tienes permiso para cargar fotos.'},403);
 const key=process.env.GOOGLE_DRIVE_API_KEY;

 if(body.accion==='listar'){
  const folder=driveFolderId(String(body.carpeta||''));
  if(!folder)return reply({error:'Pega el link de la carpeta de Google Drive.'},400);
  try{return reply({archivos:await walk(folder,key)});}
  catch(e){return reply({error:e instanceof Error?e.message:'Google Drive no respondió. Intenta de nuevo.'},400);}
 }

 const files=(Array.isArray(body.archivos)?body.archivos:[]).slice(0,BATCH).filter(f=>/^[A-Za-z0-9_-]{10,}$/.test(String(f?.id)));
 const {data:dresses,error:de}=await db.from('vestidos').select('id,codigo,nombre,color,precio_sugerido,foto_frente,foto_espalda,foto_detalle').eq('archivado',false);
 if(de)return reply({error:'No se pudo leer el inventario.'},500);
 const byCode=new Map<string,Record<string,unknown>[]>();
 for(const v of dresses||[]){const k=String(v.codigo||'').trim().toUpperCase();if(k)byCode.set(k,[...(byCode.get(k)||[]),v]);}

 const resultados:Result[]=[];
 for(const f of files){
  const label=f.carpeta?`${f.carpeta} / ${f.name}`:f.name;
  // Reference from the file name; if it is not a known reference, from the folder name.
  const fromFile=codeCandidates(String(f.name)),fromFolder=codeCandidates(String(f.carpeta||''));
  const code=fromFile.find(c=>byCode.has(c))||fromFolder.find(c=>byCode.has(c))||fromFile.at(-1)||fromFolder.at(-1)||'';
  const source=fromFile.includes(code)?String(f.name):String(f.carpeta||'');
  // An approved suggestion names the dress; otherwise the exact reference.
  const approved=f.vestido_id?(dresses||[]).find(v=>String(v.id)===String(f.vestido_id)):null;
  const targets=approved?[approved]:byCode.get(code)||[];
  if(!targets.length){
   const list=dresses as unknown as DressRef[],candidatos=suggestDresses(String(f.name),list).length?suggestDresses(String(f.name),list):suggestDresses(String(f.carpeta||''),list);
   resultados.push(candidatos.length?{archivo:label,tipo:'sugerencia',mensaje:'Revisa y aprueba el vestido.',file:f,candidatos}:{archivo:label,tipo:'error',mensaje:`No hay vestido con la referencia «${code||'—'}». Revisa el nombre o el código en Inventario.`});
   continue;
  }
  const pending=targets.filter(v=>!PHOTO_FIELDS.some(k=>String(v[k]||'').includes(`drive-${f.id}`)));
  if(!pending.length){resultados.push({archivo:label,tipo:'omitido',mensaje:'Ya estaba cargada.'});continue;}
  try{
   const file=await fetch(key?`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media&key=${key}`:`https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`);
   const type=String(file.headers.get('content-type')||'').split(';')[0].trim();
   if(!file.ok)throw Error('No se pudo descargar de Drive: revisa que la carpeta esté compartida como «Cualquier persona con el enlace».');
   if(!TYPES.includes(type))throw Error(/heic|heif/i.test(type)?'La foto está en HEIC (iPhone): guárdala como JPG.':`No es una foto JPG, PNG o WebP (${type||'desconocido'}).`);
   const bytes=await file.arrayBuffer(),hechos:string[]=[],avisos:string[]=[];
   if(bytes.byteLength>MAX)throw Error('La foto pesa más de 10 MB.');
   for(const v of pending){
    const hint=slotFromName(String(f.name))||slotFromName(String(f.carpeta||''));
    const slot=hint&&!v[hint]?hint:PHOTO_FIELDS.find(k=>!v[k]);
    if(!slot){avisos.push(`${v.codigo} ya tiene 3 fotos`);continue;}
    const path=`${v.id}/drive-${f.id}-${slot}.${type.split('/')[1].replace('jpeg','jpg')}`;
    const {error:ue}=await db.storage.from('vestidos_fotos').upload(path,bytes,{contentType:type});
    if(ue)throw Error(ue.message);
    const url=db.storage.from('vestidos_fotos').getPublicUrl(path).data.publicUrl;
    const patch:Record<string,string>={[slot]:url,...(slot==='foto_frente'?{imagen_url:url}:{})};
    const {error:e2}=await db.from('vestidos').update(patch).eq('id',v.id);
    if(e2)throw Error(e2.message);
    Object.assign(v,patch);hechos.push(`${v.codigo} · ${slot.replace('foto_','')}`);
   }
   const precio=priceFromName(approved?String(f.name):source,approved?(String(f.name).match(/^[A-Za-z]{0,4}\d{3,}/)?.[0]||''):code),actual=Number(targets[0].precio_sugerido)||0;
   if(precio&&precio!==actual)avisos.push(`el precio del nombre (${precio.toLocaleString('es-CO')}) no coincide con el del inventario (${actual?actual.toLocaleString('es-CO'):'sin precio'})`);
   resultados.push({archivo:label,tipo:hechos.length?(avisos.length?'aviso':'ok'):'error',mensaje:[hechos.join(' · '),...avisos].filter(Boolean).join(' · ')});
  }catch(e){resultados.push({archivo:label,tipo:'error',mensaje:e instanceof Error?e.message:'No se pudo subir.'});}
 }
 return reply({resultados});
}

/** All files under the folder and its subfolders (breadth first), with the name of the folder each one is in. */
async function walk(root:string,key?:string){
 const out:DriveFile[]=[],queue:{id:string;name:string}[]=[{id:root,name:''}];let seen=0;
 while(queue.length&&seen<MAX_FOLDERS&&out.length<MAX_FILES){
  const folder=queue.shift()!;seen++;
  const items=key?await listWithKey(folder.id,key):await listPublic(folder.id,seen===1);
  for(const it of items){if(it.folder)queue.push({id:it.id,name:it.name});else out.push({id:it.id,name:it.name,carpeta:folder.name});}
 }
 return out;
}
type Item={id:string;name:string;folder:boolean};
/** With an API key: Drive API v3 (folders and images). */
async function listWithKey(folder:string,key:string){
 const items:Item[]=[];let token='';
 do{
  const q=encodeURIComponent(`'${folder}' in parents and trashed=false and (mimeType='application/vnd.google-apps.folder' or mimeType contains 'image/')`);
  const r=await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&key=${key}${token?`&pageToken=${encodeURIComponent(token)}`:''}`);
  if(!r.ok)throw Error(r.status===404||r.status===403?'No se pudo abrir la carpeta: compártela como «Cualquier persona con el enlace» (lector).':'Google Drive no respondió. Intenta de nuevo.');
  const d=await r.json() as {nextPageToken?:string;files?:{id:string;name:string;mimeType:string}[]};
  for(const f of d.files||[])items.push({id:f.id,name:f.name,folder:f.mimeType==='application/vnd.google-apps.folder'});
  token=d.nextPageToken||'';
 }while(token);
 return items;
}
/** Without a key: the public view of a folder shared «anyone with the link». */
async function listPublic(folder:string,isRoot:boolean){
 const r=await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folder)}`);
 const html=r.ok?await r.text():'';
 if(!r.ok||!/flip-entry|flip-list/.test(html)){
  if(isRoot)throw Error('No se pudo abrir la carpeta: compártela como «Cualquier persona con el enlace» (lector).');
  return [];
 }
 const decode=(t:string)=>t.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
 const items:Item[]=[];
 for(const m of html.matchAll(/id="entry-([A-Za-z0-9_-]{10,})"([\s\S]*?)class="flip-entry-title">([^<]*)</g)){
  items.push({id:m[1],name:decode(m[3]),folder:/\/drive\/folders\/|\/folderview\?/.test(m[2])});
 }
 return items;
}
