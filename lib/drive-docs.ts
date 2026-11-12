/** Google Drive folder shared «anyone with the link»: lists its files (and subfolders) and downloads them, also Google Docs/Sheets/Slides as PDF/Excel. */
export type DriveDoc={id:string;nombre:string;clase:'archivo'|'documento'|'hoja'|'presentacion';carpeta:string};
const decode=(t:string)=>t.replace(/&amp;/g,'&').replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
export const driveId=(link:string)=>{const t=link.trim();return t.match(/\/(?:folders|d)\/([A-Za-z0-9_-]{10,})/)?.[1]||t.match(/[?&]id=([A-Za-z0-9_-]{10,})/)?.[1]||(/^[A-Za-z0-9_-]{10,}$/.test(t)?t:null);};

async function listFolder(folder:string,isRoot:boolean){
 const r=await fetch(`https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folder)}`,{signal:AbortSignal.timeout(15000)});
 const html=r.ok?await r.text():'';
 if(!r.ok||!/flip-entry|flip-list/.test(html)){if(isRoot)throw Error('No se pudo abrir la carpeta: en Drive compártela como «Cualquier persona con el enlace» (lector).');return [];}
 return [...html.matchAll(/id="entry-([A-Za-z0-9_-]{10,})"([\s\S]*?)class="flip-entry-title">([^<]*)</g)].map(m=>({id:m[1],nombre:decode(m[3]),href:m[2]}));
}
/** Files of the folder and its subfolders (up to 300). */
export async function listDriveFolder(link:string){
 const root=driveId(link);if(!root)throw Error('Pega el link de la carpeta de Google Drive.');
 const out:DriveDoc[]=[],queue=[{id:root,nombre:''}];let vistas=0;
 while(queue.length&&vistas<60&&out.length<300){
  const f=queue.shift()!;vistas++;
  for(const it of await listFolder(f.id,vistas===1)){
   if(/\/drive\/folders\/|\/folderview\?/.test(it.href)){queue.push({id:it.id,nombre:f.nombre?`${f.nombre} / ${it.nombre}`:it.nombre});continue;}
   const clase=/\/document\/d\//.test(it.href)?'documento':/\/spreadsheets\/d\//.test(it.href)?'hoja':/\/presentation\/d\//.test(it.href)?'presentacion':'archivo';
   if(clase==='archivo'&&/\.(mp4|mov|avi|mkv|m4v|3gp|zip|rar|exe)$/i.test(it.nombre))continue;// videos and archives stay as links
   out.push({id:it.id,nombre:it.nombre,clase,carpeta:f.nombre});
  }
 }
 return out;
}
const TIPOS:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',gif:'image/gif',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv'};
/** Downloads one file (Google files exported). Returns name with extension, type and bytes. */
export async function downloadDriveDoc(f:Pick<DriveDoc,'id'|'nombre'|'clase'>,max=50*1024*1024){
 const url=f.clase==='documento'?`https://docs.google.com/document/d/${f.id}/export?format=pdf`:f.clase==='hoja'?`https://docs.google.com/spreadsheets/d/${f.id}/export?format=xlsx`
  :f.clase==='presentacion'?`https://docs.google.com/presentation/d/${f.id}/export/pdf`:`https://drive.usercontent.google.com/download?id=${f.id}&export=download&confirm=t`;
 const r=await fetch(url,{signal:AbortSignal.timeout(40000)});
 if(!r.ok)throw Error('No se pudo descargar: revisa que esté compartido como «Cualquier persona con el enlace».');
 const ext=f.clase==='documento'||f.clase==='presentacion'?'pdf':f.clase==='hoja'?'xlsx':(f.nombre.split('.').pop()||'').toLowerCase();
 let tipo=String(r.headers.get('content-type')||'').split(';')[0].trim();
 if(!tipo||tipo==='application/octet-stream'||tipo.startsWith('text/html'))tipo=TIPOS[ext]||tipo;
 if(tipo.startsWith('text/html'))throw Error('Drive no entregó el archivo (puede ser muy pesado o no estar compartido).');
 const bytes=Buffer.from(await r.arrayBuffer());
 if(bytes.length>max)throw Error('Pesa más de 50 MB.');
 const nombre=f.clase==='archivo'?f.nombre:`${f.nombre}.${ext}`;
 return {nombre,tipo,bytes};
}
