export const SUPPORT_BUCKET='soportes_pagos';
export const SUPPORT_MAX_BYTES=10*1024*1024;
const TYPES:Record<string,string>={'application/pdf':'pdf','image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/heic':'heic','image/heif':'heif'};
const EXTENSIONS:Record<string,string>={pdf:'application/pdf',jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',webp:'image/webp',heic:'image/heic',heif:'image/heif'};
export const SUPPORT_ACCEPT='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif,application/pdf';

export type UploadedSupport={path:string;nombre:string;tipo:string;tamano:number};
export type SavedSupport={id:string;path:string;nombre:string;tipo:string;subido_at?:string;subido_por?:string|null};

/** Content type of a support file; iPhone photos (HEIC) often arrive without a type, so the extension decides. */
export function supportType(file:{name:string;type:string}){
 if(TYPES[file.type])return file.type;
 const ext=file.name.split('.').pop()?.toLowerCase()||'';
 return EXTENSIONS[ext]||'';
}

/** Error message for a file that cannot be a payment support, or '' when it is valid. */
export function supportFileError(file:{name:string;type:string;size:number}){
 if(!supportType(file))return `«${file.name}» no es una foto (JPG, PNG, HEIC) ni un PDF.`;
 if(file.size>SUPPORT_MAX_BYTES)return `«${file.name}» supera 10 MB.`;
 if(file.size===0)return `«${file.name}» está vacío.`;
 return '';
}

/** sede / año / mes / archivo — the payment is linked in the database, so the path never needs the contract number. */
export function supportPath(sedeId:string,file:{name:string;type:string},now=new Date(),id=crypto.randomUUID()){
 const type=supportType(file);
 if(!type)throw Error('Tipo de archivo no permitido.');
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota',year:'numeric',month:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${sedeId}/${parts.year}/${parts.month}/${id}.${TYPES[type]}`;
}

export const formatBytes=(n:number)=>n<1024*1024?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1024/1024).toFixed(1)} MB`;
