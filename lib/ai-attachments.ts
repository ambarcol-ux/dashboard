import type Anthropic from '@anthropic-ai/sdk';
import {Buffer} from 'node:buffer';
import {zipEntry} from './docx-text';

/** Files sent to the WhatsApp AI chats (knowledge and test): images, PDF, Word and plain text, as base64. */
export type Adjunto={nombre:string;tipo:string;datos:string};
const IMAGE_TYPES=['image/jpeg','image/png','image/gif','image/webp'] as const;
/** Vercel accepts ~4.5 MB per request: attachments are capped below that (the browser shrinks photos first). */
export const MAX_ADJUNTOS=4,MAX_BASE64=3_800_000;

const wordText=(buf:Buffer)=>zipEntry(buf,'word/document.xml').replace(/<\/w:p>/g,'\n').replace(/<[^>]+>/g,'')
 .replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&').replace(/\n{3,}/g,'\n\n').trim();

/** Validates the files and turns them into Claude content blocks (image, PDF document or extracted text). */
export function attachmentBlocks(input:unknown):Anthropic.ContentBlockParam[]{
 const list=(Array.isArray(input)?input:[]) as Adjunto[];
 if(!list.length)return [];
 if(list.length>MAX_ADJUNTOS)throw Error(`Adjunta máximo ${MAX_ADJUNTOS} archivos por mensaje.`);
 if(list.reduce((n,a)=>n+String(a?.datos||'').length,0)>MAX_BASE64)throw Error('Los archivos pesan demasiado. Envía menos archivos o un PDF más liviano (máximo unos 2,5 MB en total).');
 return list.map(a=>{
  const nombre=String(a?.nombre||'archivo').slice(0,120),tipo=String(a?.tipo||'').toLowerCase(),datos=String(a?.datos||'');
  if(!/^[A-Za-z0-9+/=]+$/.test(datos))throw Error(`No se pudo leer el archivo ${nombre}.`);
  if((IMAGE_TYPES as readonly string[]).includes(tipo))return {type:'image',source:{type:'base64',media_type:tipo as typeof IMAGE_TYPES[number],data:datos}};
  if(tipo==='application/pdf')return {type:'document',source:{type:'base64',media_type:'application/pdf',data:datos},title:nombre};
  const buf=Buffer.from(datos,'base64');
  if(tipo==='application/vnd.openxmlformats-officedocument.wordprocessingml.document'||/\.docx$/i.test(nombre))
   return {type:'text',text:`Contenido del archivo Word «${nombre}»:\n${wordText(buf).slice(0,60000)}`};
  if(tipo.startsWith('text/')||/\.(txt|csv|md)$/i.test(nombre))return {type:'text',text:`Contenido del archivo «${nombre}»:\n${buf.toString('utf8').slice(0,60000)}`};
  throw Error(`«${nombre}»: solo se pueden analizar imágenes, PDF, Word (.docx) y texto. Audios y videos todavía no.`);
 });
}
