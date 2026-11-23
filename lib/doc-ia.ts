import Anthropic from '@anthropic-ai/sdk';
import {aiClient} from './ai-usage';
import type {SupabaseClient} from '@supabase/supabase-js';
import {Buffer} from 'node:buffer';
import {zipEntry} from './docx-text';

/** Documentos de la marca → IA de WhatsApp: reads a file of an area the AI may read and keeps only what helps to attend customers. */
const MODEL='claude-sonnet-5-5';
const BUCKET='documentos_marca';
export type DocPendiente={id:string;nombre:string;ruta:string;tipo:string|null;tamano:number|null;version:number};

const xmlText=(xml:string)=>xml.replace(/<\/(w:p|a:p|row)>/g,'\n').replace(/<[^>]+>/g,' ').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/g,'&').replace(/[ \t]+/g,' ').replace(/\n\s+/g,'\n').trim();
const tryEntry=(buf:Buffer,name:string)=>{try{return zipEntry(buf,name);}catch{return '';}};
/** Excel: every sheet as rows of «value | value» (shared strings resolved, so prices and names are kept). */
function excelText(buf:Buffer){
 const shared=[...tryEntry(buf,'xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m=>xmlText(m[1]));
 const out:string[]=[];
 for(let i=1;i<=20;i++){
  const sheet=tryEntry(buf,`xl/worksheets/sheet${i}.xml`);if(!sheet)break;
  for(const row of sheet.match(/<row[\s\S]*?<\/row>/g)||[]){
   const cells=[...row.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].map(c=>{const v=/<v>([\s\S]*?)<\/v>/.exec(c[2]||'')?.[1]??(/<t[^>]*>([\s\S]*?)<\/t>/.exec(c[2]||'')?.[1]||'');return /t="s"/.test(c[1])?shared[Number(v)]||'':xmlText(v);}).filter(Boolean);
   if(cells.length)out.push(cells.join(' | '));
  }
 }
 return out.join('\n');
}
/** PowerPoint: text of every slide. */
function slidesText(buf:Buffer){const out:string[]=[];for(let i=1;i<=80;i++){const s=tryEntry(buf,`ppt/slides/slide${i}.xml`);if(!s)break;out.push(`Diapositiva ${i}: ${xmlText(s)}`);}return out.join('\n');}

/** Claude content for the file, or null when it cannot be read (video, audio, very large). */
export function docBlocks(nombre:string,tipo:string,buf:Buffer):Anthropic.ContentBlockParam[]|null{
 const t=tipo.toLowerCase(),n=nombre.toLowerCase();
 if(['image/jpeg','image/png','image/gif','image/webp'].includes(t)&&buf.length<=4_500_000)return [{type:'image',source:{type:'base64',media_type:t as 'image/png',data:buf.toString('base64')}}];
 if((t==='application/pdf'||n.endsWith('.pdf'))&&buf.length<=25_000_000)return [{type:'document',source:{type:'base64',media_type:'application/pdf',data:buf.toString('base64')},title:nombre}];
 let text='';
 if(n.endsWith('.docx')||t.includes('wordprocessingml'))text=xmlText(tryEntry(buf,'word/document.xml'));
 else if(n.endsWith('.xlsx')||t.includes('spreadsheetml'))text=excelText(buf);
 else if(n.endsWith('.pptx')||t.includes('presentationml'))text=slidesText(buf);
 else if(t.startsWith('text/')||/\.(txt|csv|md)$/.test(n))text=buf.toString('utf8');
 return text.trim()?[{type:'text',text:`Contenido del archivo «${nombre}»:\n${text.slice(0,120000)}`}]:null;
}

const SYSTEM=`Eres la asistente que prepara información para la IA que atiende a las clientas de Ámbar Couture por WhatsApp (alquiler de vestidos de XV años, gala, novia y pajecitas en Colombia; también sesiones Pre XV).
Recibes un documento interno de la marca. Extrae SOLO lo que sirve para atender, asesorar y agendar clientas: planes y paquetes, precios y valores, qué incluye cada plan, condiciones, promociones vigentes, fechas, horarios, políticas de cara a la clienta, preguntas frecuentes y argumentos de venta.
Escribe en viñetas cortas y exactas (copia cifras y nombres tal cual, no inventes ni redondees). Si el documento indica una sede o ciudad, dilo. Omite datos internos (costos, márgenes, nómina, datos personales de empleadas o clientas, contraseñas).
Si el documento no tiene nada útil para atender clientas, responde exactamente: SIN_CONTENIDO`;

/** Reads one document and saves its summary for the AI (or why it could not). */
export async function readDocumentForAI(db:SupabaseClient,d:DocPendiente){
 const save=(estado:'ok'|'sin_contenido'|'error',resumen:string|null,error:string|null)=>db.from('doc_ia_resumenes').upsert({archivo_id:d.id,version:d.version,estado,resumen,error,updated_at:new Date().toISOString()},{onConflict:'archivo_id'});
 try{
  let blocks:Anthropic.ContentBlockParam[]|null;
  if(/^https?:\/\//.test(d.ruta)){
   // A Google Docs / Sheets / Slides link shared «anyone with the link»: its text is exported (read again every day).
   const g=/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]+)/.exec(d.ruta);
   if(!g){await save('sin_contenido',null,'La IA solo lee enlaces de Google Docs, Hojas de cálculo o Presentaciones (no carpetas ni otros enlaces).');return 'sin_contenido';}
   const url=`https://docs.google.com/${g[1]}/d/${g[2]}/export?format=${g[1]==='spreadsheets'?'csv':'txt'}`;
   const res=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(20000)});
   const text=res.ok&&!/text\/html/.test(res.headers.get('content-type')||'')?(await res.text()).trim():'';
   if(!text)throw Error('No se pudo abrir el enlace de Google: compártelo como «Cualquier persona con el enlace» (lector) o sube el archivo.');
   blocks=[{type:'text',text:`Contenido del documento «${d.nombre}»:\n${text.slice(0,120000)}`}];
  }else{
   const {data:file,error}=await db.storage.from(BUCKET).download(d.ruta);
   if(error||!file)throw Error('No se pudo descargar el archivo.');
   blocks=docBlocks(d.nombre,d.tipo||file.type||'',Buffer.from(await file.arrayBuffer()));
  }
  if(!blocks){await save('sin_contenido',null,'Formato que la IA no puede leer (video, audio o archivo muy pesado).');return 'sin_contenido';}
  const r=await aiClient('documentos_resumen',{timeout:55000,maxRetries:0}).messages.create({model:MODEL,max_tokens:3000,system:SYSTEM,messages:[{role:'user',content:[...blocks,{type:'text',text:`Documento: «${d.nombre}». Extrae lo útil para atender clientas.`}]}]});
  const text=r.content.find(b=>b.type==='text');const out=text&&text.type==='text'?text.text.trim():'';
  if(!out||/^SIN_CONTENIDO/.test(out)){await save('sin_contenido',null,null);return 'sin_contenido';}
  await save('ok',out.slice(0,12000),null);return 'ok';
 }catch(e){await save('error',null,(e instanceof Error?e.message:'Error').slice(0,300));return 'error';}
}

/** The documents section the WhatsApp AI receives (current summaries of readable areas). */
export async function documentsForAI(db:SupabaseClient){
 const {data}=await db.rpc('documentos_para_ia');
 return ((data||[]) as {nombre:string;sede:string|null;vence:string|null;resumen:string}[])
  .map(x=>`### ${x.nombre} · sede: ${x.sede||'todas'}${x.vence?` · vigente hasta ${x.vence}`:''}\n${x.resumen}`).join('\n\n').slice(0,40000);
}
