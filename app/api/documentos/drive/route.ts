import {createClient} from '@supabase/supabase-js';
import {publicReply,UUID_RE} from '@/lib/public-db';
import {listDriveFolder,downloadDriveDoc,type DriveDoc} from '@/lib/drive-docs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const limpio=(n:string)=>n.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^A-Za-z0-9._-]+/g,'-').slice(-80);

/** Documentos de la marca › Importar de Drive: «listar» shows the files of a shared folder; «importar» copies up to 4 into the area
 *  with the user's own session (same permissions as uploading by hand). Files already imported to the area are skipped. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return publicReply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';if(!bearer.startsWith('Bearer '))return publicReply({error:'Inicia sesión.'},401);
 const body=await request.json().catch(()=>({})) as {accion?:string;carpeta?:string;area_id?:string;archivos?:DriveDoc[];sede_id?:string|null;vence?:string|null;descripcion?:string};
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:auth}=await db.auth.getUser(bearer.slice(7));if(!auth?.user)return publicReply({error:'Inicia sesión.'},401);
 if(body.accion==='listar'){
  try{return publicReply({archivos:await listDriveFolder(String(body.carpeta||''))});}
  catch(e){return publicReply({error:e instanceof Error?e.message:'Google Drive no respondió.'},400);}
 }
 if(body.accion!=='importar')return publicReply({error:'Acción no válida.'},400);
 const area=String(body.area_id||'');if(!UUID_RE.test(area))return publicReply({error:'Área no válida.'},400);
 const sede=body.sede_id&&UUID_RE.test(body.sede_id)?body.sede_id:null,vence=body.vence&&/^\d{4}-\d{2}-\d{2}$/.test(body.vence)?body.vence:null,descripcion=String(body.descripcion||'').trim().slice(0,300)||null;
 const files=(Array.isArray(body.archivos)?body.archivos:[]).filter(f=>/^[A-Za-z0-9_-]{10,}$/.test(String(f?.id))).slice(0,4);
 const {data:ya}=await db.from('doc_archivos').select('drive_id').eq('area_id',area).in('drive_id',files.map(f=>f.id));
 const repetidos=new Set((ya||[]).map(x=>String(x.drive_id)));
 const resultados:{nombre:string;ok:boolean;mensaje:string;id?:string}[]=[];
 for(const f of files){
  if(repetidos.has(f.id)){resultados.push({nombre:f.nombre,ok:true,mensaje:'Ya estaba en esta área.'});continue;}
  try{
   const d=await downloadDriveDoc(f);
   const ruta=`${area}/${crypto.randomUUID()}-${limpio(d.nombre)}`;
   const {error:e1}=await db.storage.from('documentos_marca').upload(ruta,d.bytes,{contentType:d.tipo||undefined});
   if(e1)throw Error(/row-level|policy|unauthor/i.test(e1.message)?'No tienes permiso para subir archivos en esta área.':e1.message);
   const nombre=d.nombre.replace(/\.[^.]+$/,'').slice(0,160)||'Documento';
   const {data,error:e2}=await db.from('doc_archivos').insert({area_id:area,nombre:nombre.length<2?`${nombre} doc`:nombre,descripcion:descripcion||(f.carpeta?`Drive: ${f.carpeta}`.slice(0,300):null),sede_id:sede,vence,ruta,tipo:d.tipo||null,tamano:d.bytes.length,drive_id:f.id}).select('id').single();
   if(e2)throw Error(/row-level|policy/i.test(e2.message)?'No tienes permiso para subir archivos en esta área.':e2.message);
   await db.from('doc_versiones').insert({archivo_id:data.id,version:1,ruta,tipo:d.tipo||null,tamano:d.bytes.length});
   resultados.push({nombre:f.nombre,ok:true,mensaje:'Importado.',id:data.id});
  }catch(e){resultados.push({nombre:f.nombre,ok:false,mensaje:e instanceof Error?e.message:'No se pudo importar.'});}
 }
 return publicReply({resultados});
}
