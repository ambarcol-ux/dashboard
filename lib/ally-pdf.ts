import {jsPDF} from 'jspdf';
import type {ContractSection} from './ally-contract-text';

/** Signed agreement as PDF (server): text, the ally's signature and the verification line. */
export function allyAgreementPdf(sections:ContractSection[],firma:string,pie:string){
 const doc=new jsPDF({unit:'pt',format:'letter'}),W=532,H=792,M=40;
 let y=M;
 const write=(text:string,size:number,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
  for(const line of doc.splitTextToSize(text,W) as string[]){if(y>H-M){doc.addPage();y=M;}doc.text(line,M,y);y+=size*1.35;}y+=4;};
 for(const s of sections){if(s.titulo)write(s.titulo,11,true);s.parrafos.forEach(p=>write(p,9.5));(s.lista||[]).forEach(l=>write('• '+l,9.5));}
 if(y>H-M-110){doc.addPage();y=M;}
 write('Firma de EL ALIADO',10,true);
 doc.addImage(firma,'PNG',M,y,160,70);y+=80;
 write(pie,8);
 return Buffer.from(doc.output('arraybuffer'));
}
