import {createClient} from '@supabase/supabase-js';
import sharp from 'sharp';
import {PHOTO_FIELDS,miniPath} from '@/lib/dress-photos';
export const dynamic='force-dynamic';
export const maxDuration=60;
const reply=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
const BATCH=6,MIN_BYTES=450*1024,MARK='/object/public/vestidos_fotos/';

/** Administration: creates the 400 px preview of every photo and shrinks dress photos already stored (over 450 KB) to 1600 px JPEG, keeping the same file (same link).
 * Works BATCH dresses per call by position; the page loops with «desde» until «siguiente» is null. */
export async function POST(request:Request){
 if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return reply({error:'Solicitud no permitida.'},403);
 const bearer=request.headers.get('authorization')||'';
 if(!bearer.startsWith('Bearer '))return reply({error:'Inicia sesión.'},401);
 const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
 const {data:admin}=await db.rpc('es_admin');
 if(admin!==true)return reply({error:'Solo Administración puede optimizar las fotos.'},403);
 let body:{desde?:number};try{body=JSON.parse((await request.text()).slice(0,1000)||'{}');}catch{body={};}
 const desde=Math.max(0,Number(body.desde)||0);
 const {data:rows,error,count}=await db.from('vestidos').select('id,foto_frente,foto_espalda,foto_detalle',{count:'exact'})
  .or('foto_frente.not.is.null,foto_espalda.not.is.null,foto_detalle.not.is.null').order('id').range(desde,desde+BATCH-1);
 if(error)return reply({error:'No se pudo leer el inventario.'},500);
 let revisadas=0,optimizadas=0,miniaturas=0,antes=0,despues=0;const errores:string[]=[];
 for(const v of rows||[])for(const k of PHOTO_FIELDS){
  const url=String((v as Record<string,unknown>)[k]||'');const at=url.indexOf(MARK);
  if(at<0)continue;
  const path=decodeURIComponent(url.slice(at+MARK.length).split('?')[0]);revisadas++;
  try{
   const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw Error(String(r.status));
   const buf=Buffer.from(await r.arrayBuffer());
   // Light preview (400 px) for lists, contracts, calendar and catalog cards.
   const mini=await sharp(buf).rotate().resize(400,400,{fit:'inside',withoutEnlargement:true}).jpeg({quality:70,mozjpeg:true}).toBuffer();
   const {error:me}=await db.storage.from('vestidos_fotos').upload(miniPath(path),mini,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});
   if(me)throw Error(me.message);
   miniaturas++;
   if(buf.length<=MIN_BYTES)continue;
   const out=await sharp(buf).rotate().resize(1600,1600,{fit:'inside',withoutEnlargement:true}).jpeg({quality:82,mozjpeg:true}).toBuffer();
   if(out.length>=buf.length)continue;
   const {error:ue}=await db.storage.from('vestidos_fotos').upload(path,out,{contentType:'image/jpeg',upsert:true,cacheControl:'3600'});
   if(ue)throw Error(ue.message);
   optimizadas++;antes+=buf.length;despues+=out.length;
  }catch(e){errores.push(`${path}: ${e instanceof Error?e.message:'error'}`);}
 }
 const siguiente=desde+BATCH<(count||0)?desde+BATCH:null;
 return reply({revisadas,optimizadas,miniaturas,antes,despues,errores,siguiente,total:count||0});
}
