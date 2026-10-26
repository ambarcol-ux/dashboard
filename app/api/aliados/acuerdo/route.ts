import {createClient} from '@supabase/supabase-js';
import {publicServerClient} from '@/lib/public-db';
import {docxSections,zipEntry} from '@/lib/docx-text';
export const dynamic='force-dynamic';

const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const BUCKET='aliados_documentos';

// Only administration (es_admin) can upload or download the agreement.
async function admin(request:Request){
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return null;
 const userDb=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const [{data:auth},{data:ok}]=await Promise.all([userDb.auth.getUser(bearer.slice(7)),userDb.rpc('es_admin')]);
 return auth.user&&ok===true?auth.user:null;
}

/** Upload a new version of the agreement (Word .docx) with a note. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 try{
  const user=await admin(request);
  if(!user)return reply({error:'Solo administración puede subir el acuerdo.'},403);
  const form=await request.formData(),file=form.get('archivo'),nota=String(form.get('nota')||'').trim().slice(0,500);
  if(!(file instanceof File)||!/\.docx$/i.test(file.name))return reply({error:'Adjunta el acuerdo en Word (.docx).'},400);
  if(file.size>10*1024*1024)return reply({error:'El Word debe pesar máximo 10 MB.'},400);
  const buf=Buffer.from(await file.arrayBuffer());
  let secciones;
  try{secciones=docxSections(zipEntry(buf,'word/document.xml'));}catch(e){return reply({error:e instanceof Error?e.message:'No se pudo leer el Word.'},400);}
  const db=publicServerClient(),path=`acuerdos/${Date.now()}-${crypto.randomUUID()}.docx`;
  const {error:up}=await db.storage.from(BUCKET).upload(path,buf,{contentType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',upsert:false});
  if(up)return reply({error:'No se pudo guardar el archivo.'},503);
  const {data:p}=await db.from('profiles').select('nombre,email').eq('id',user.id).maybeSingle();
  const {data,error}=await db.from('acuerdos_aliado').insert({archivo_path:path,archivo_nombre:file.name.slice(0,200),secciones,nota,subido_por:user.id,subido_por_nombre:p?.nombre||p?.email||null}).select('version').single();
  if(error)return reply({error:'No se pudo guardar la versión.'},503);
  return reply({version:data.version});
 }catch{return reply({error:'El servicio no está disponible.'},503);}
}

/** Download link of one version's Word file. */
export async function GET(request:Request){
 try{
  if(!await admin(request))return reply({error:'Solo administración.'},403);
  const version=Number(new URL(request.url).searchParams.get('version'));
  const db=publicServerClient(),{data:row}=await db.from('acuerdos_aliado').select('archivo_path,archivo_nombre').eq('version',version).maybeSingle();
  if(!row)return reply({error:'Versión no encontrada.'},404);
  const {data}=await db.storage.from(BUCKET).createSignedUrl(row.archivo_path,300,{download:row.archivo_nombre});
  return data?reply({url:data.signedUrl}):reply({error:'No se pudo abrir el archivo.'},503);
 }catch{return reply({error:'El servicio no está disponible.'},503);}
}
