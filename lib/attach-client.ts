'use client';
/** Browser side of the AI chat attachments: photos are shrunk (max 1600 px, JPEG) and every file is sent as base64. */
export type AdjuntoCliente={nombre:string;tipo:string;datos:string};
export const ACCEPT_ADJUNTOS='image/jpeg,image/png,image/webp,image/gif,application/pdf,.docx,.txt,.csv';
const MAX_ARCHIVO=2_500_000;

const toBase64=(blob:Blob)=>new Promise<string>((ok,fail)=>{const r=new FileReader();r.onload=()=>ok(String(r.result).split(',')[1]||'');r.onerror=()=>fail(Error('No se pudo leer el archivo.'));r.readAsDataURL(blob);});

async function shrink(file:File):Promise<Blob>{
 try{
  const bmp=await createImageBitmap(file),scale=Math.min(1,1600/Math.max(bmp.width,bmp.height));
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);
  return await new Promise<Blob>((ok,fail)=>c.toBlob(b=>b?ok(b):fail(Error('No se pudo preparar la foto.')),'image/jpeg',0.85));
 }catch{return file;}
}

/** Reads the chosen files; audio and video are refused with a clear message. */
export async function prepareAttachments(files:FileList|File[]):Promise<AdjuntoCliente[]>{
 const out:AdjuntoCliente[]=[];
 for(const f of Array.from(files)){
  if(/^(audio|video)\//.test(f.type))throw Error(`«${f.name}»: la IA todavía no analiza audios ni videos.`);
  const esImagen=/^image\/(jpeg|png|webp|gif)$/.test(f.type),esHeic=/heic|heif/i.test(f.type)||/\.hei[cf]$/i.test(f.name);
  const blob=esImagen||esHeic?await shrink(f):f;
  if(blob.size>MAX_ARCHIVO)throw Error(`«${f.name}» pesa demasiado (máximo 2,5 MB). Envía un archivo más liviano.`);
  const tipo=esImagen||esHeic?(blob.type||'image/jpeg'):(f.type||(f.name.endsWith('.docx')?'application/vnd.openxmlformats-officedocument.wordprocessingml.document':'text/plain'));
  out.push({nombre:f.name,tipo,datos:await toBase64(blob)});
 }
 return out;
}
