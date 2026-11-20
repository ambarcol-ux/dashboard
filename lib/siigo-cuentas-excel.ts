import JSZip from 'jszip';

/** Reads Siigo's «Catálogo de cuentas» export (.xlsx): company name and rows {codigo,nombre,categoria,clase,activo}. Runs in the browser. */
export async function leerCatalogoCuentas(file:File){
 const zip=await JSZip.loadAsync(await file.arrayBuffer());
 const sheet=zip.file('xl/worksheets/sheet1.xml');if(!sheet)throw new Error('El archivo no es el catálogo de cuentas de Siigo.');
 const shared=await zip.file('xl/sharedStrings.xml')?.async('string');
 const parser=new DOMParser(),NS='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
 const strings=shared?[...parser.parseFromString(shared,'application/xml').getElementsByTagNameNS(NS,'si')].map(si=>[...si.getElementsByTagNameNS(NS,'t')].map(t=>t.textContent||'').join('')):[];
 const doc=parser.parseFromString((await sheet.async('string')).replace(/^﻿/,''),'application/xml');
 const col=(r:string|null)=>{const m=/^([A-Z]+)/.exec(r||'');return m?[...m[1]].reduce((n,ch)=>n*26+ch.charCodeAt(0)-64,0)-1:-1;};
 const filas=[...doc.getElementsByTagNameNS(NS,'row')].map(row=>{const out:string[]=[];let i=0;
  for(const c of [...row.getElementsByTagNameNS(NS,'c')]){const at=col(c.getAttribute('r'));if(at>=0)i=at;
   const v=c.getElementsByTagNameNS(NS,'v')[0]?.textContent??[...c.getElementsByTagNameNS(NS,'t')].map(t=>t.textContent||'').join('');
   out[i]=c.getAttribute('t')==='s'?strings[Number(v)]||'':String(v??'').trim();i++;}
  return out;});
 const h=filas.findIndex(f=>(f[0]||'').toLowerCase().startsWith('código'));
 if(h<0)throw new Error('No encontré la fila «Código · Nombre · Categoría…» del catálogo de cuentas.');
 const cuentas=filas.slice(h+1).filter(f=>/^\d+$/.test(f[0]||'')&&f[1]).map(f=>({codigo:f[0],nombre:f[1],categoria:f[2]||null,clase:f[3]||null,activo:!/^no/i.test(f[7]||'')}));
 return {empresa:[filas[1]?.[0],filas[2]?.[0]].filter(Boolean).join(' · '),cuentas};
}
