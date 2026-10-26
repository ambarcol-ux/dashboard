import {inflateRawSync} from 'node:zlib';
import type {ContractSection} from './ally-contract-text';

/** Reads one file from a .docx (zip) without extra libraries. */
export function zipEntry(buf:Buffer,name:string){
 let end=buf.length-22;
 while(end>=0&&buf.readUInt32LE(end)!==0x06054b50)end--;
 if(end<0)throw Error('El archivo no es un Word (.docx) válido.');
 let p=buf.readUInt32LE(end+16);
 for(let i=buf.readUInt16LE(end+10);i>0;i--){
  const method=buf.readUInt16LE(p+10),size=buf.readUInt32LE(p+20),nameLen=buf.readUInt16LE(p+28),extra=buf.readUInt16LE(p+30),comment=buf.readUInt16LE(p+32),local=buf.readUInt32LE(p+42);
  if(buf.toString('utf8',p+46,p+46+nameLen)===name){
   const start=local+30+buf.readUInt16LE(local+26)+buf.readUInt16LE(local+28),data=buf.subarray(start,start+size);
   return (method===8?inflateRawSync(data):data).toString('utf8');
  }
  p+=46+nameLen+extra+comment;
 }
 throw Error('El archivo no es un Word (.docx) válido.');
}
const decode=(s:string)=>s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/g,'&');
/** Word paragraphs as contract sections: headings (Word style or short uppercase lines) start a new section. */
export function docxSections(xml:string):ContractSection[]{
 const out:ContractSection[]=[];
 for(const m of xml.match(/<w:p[ >][\s\S]*?<\/w:p>/g)||[]){
  const text=decode(m.replace(/<w:tab\/>/g,' ').replace(/<w:br\/>/g,'\n').match(/<w:t(?: [^>]*)?>[^<]*<\/w:t>|\n| /g)?.map(t=>t.replace(/<[^>]+>/g,'')).join('')||'').trim();
  if(!text)continue;
  const style=/<w:pStyle w:val="([^"]+)"/.exec(m)?.[1]||'';
  const heading=/heading|t[ií]tulo|title/i.test(style)||(text.length<=90&&text===text.toUpperCase()&&/[A-ZÁÉÍÓÚÑ]/.test(text)&&!/[.:,]$/.test(text));
  if(heading||!out.length)out.push({titulo:heading?text:'',parrafos:heading?[]:[text]});
  else out[out.length-1].parrafos.push(text);
 }
 if(!out.length)throw Error('El Word no tiene texto.');
 return out;
}
/** Fills {nombre} {cédula} {tipo} {fecha} with the ally's data at signing time. */
export function fillAgreement(sections:ContractSection[],v:{nombre:string;cedula:string;tipo:string;fecha:string}):ContractSection[]{
 const f=(s:string)=>s.replace(/\{\s*nombre\s*\}/gi,v.nombre).replace(/\{\s*c[eé]dula\s*\}/gi,v.cedula).replace(/\{\s*tipo\s*\}/gi,v.tipo).replace(/\{\s*fecha\s*\}/gi,v.fecha);
 return sections.map(s=>({titulo:f(s.titulo),parrafos:s.parrafos.map(f),...(s.lista?{lista:s.lista.map(f)}:{})}));
}
