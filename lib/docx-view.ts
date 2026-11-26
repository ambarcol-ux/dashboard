import JSZip from 'jszip';

const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const R='http://schemas.openxmlformats.org/officeDocument/2006/relationships';

/** Renders a Word file (.docx) as safe HTML elements inside `into`, in the browser: paragraphs, headings, bold/italic/underline,
 *  lists (as bullets), tables and embedded images. Text is inserted as text (never as HTML), so a document cannot run code. */
export async function renderDocx(data:ArrayBuffer,into:HTMLElement){
 const zip=await JSZip.loadAsync(data);
 const xml=await zip.file('word/document.xml')?.async('string');
 if(!xml)throw Error('El archivo no es un documento de Word válido.');
 const rels=new Map<string,string>();
 const relXml=await zip.file('word/_rels/document.xml.rels')?.async('string');
 if(relXml)for(const r of Array.from(new DOMParser().parseFromString(relXml,'application/xml').getElementsByTagName('Relationship')))rels.set(r.getAttribute('Id')||'',r.getAttribute('Target')||'');
 const doc=new DOMParser().parseFromString(xml,'application/xml');
 const body=doc.getElementsByTagNameNS(W,'body')[0];
 const kids=(el:Element,name:string)=>Array.from(el.children).filter(c=>c.namespaceURI===W&&c.localName===name);
 const one=(el:Element|undefined,name:string)=>el?kids(el,name)[0]:undefined;
 const imagen=async(run:Element)=>{
  const blip=run.getElementsByTagNameNS('http://schemas.openxmlformats.org/drawingml/2006/main','blip')[0];
  const id=blip?.getAttributeNS(R,'embed');const target=id?rels.get(id):undefined;
  const file=target?zip.file('word/'+target.replace(/^\/?word\//,'')):null;if(!file)return null;
  const img=document.createElement('img');img.src=URL.createObjectURL(await file.async('blob'));img.style.maxWidth='100%';img.alt='';return img;
 };
 const parrafo=async(p:Element)=>{
  const pr=one(p,'pPr'),estilo=one(pr,'pStyle')?.getAttributeNS(W,'val')||'',lista=!!one(pr,'numPr');
  const nivel=/^(Heading|Ttulo|Titulo|Title)(\d)?/i.exec(estilo);
  const el=document.createElement(nivel?(estilo.toLowerCase().startsWith('title')?'h1':`h${Math.min(6,Number(nivel[2]||1)+1)}`):lista?'li':'p');
  const jc=one(pr,'jc')?.getAttributeNS(W,'val');if(jc==='center'||jc==='right')el.style.textAlign=jc;
  el.style.margin='0 0 8px';
  for(const r of Array.from(p.getElementsByTagNameNS(W,'r'))){
   const rp=one(r,'rPr');
   for(const c of Array.from(r.children)){
    if(c.namespaceURI!==W)continue;
    if(c.localName==='t'){let n:HTMLElement=document.createElement('span');n.textContent=c.textContent||'';
     if(one(rp,'b')&&one(rp,'b')?.getAttributeNS(W,'val')!=='0'){const b=document.createElement('strong');b.appendChild(n);n=b;}
     if(one(rp,'i')&&one(rp,'i')?.getAttributeNS(W,'val')!=='0'){const i=document.createElement('em');i.appendChild(n);n=i;}
     if(one(rp,'u')&&one(rp,'u')?.getAttributeNS(W,'val')!=='none'){const u=document.createElement('u');u.appendChild(n);n=u;}
     el.appendChild(n);}
    else if(c.localName==='br')el.appendChild(document.createElement('br'));
    else if(c.localName==='tab')el.appendChild(document.createTextNode('    '));
    else if(c.localName==='drawing'){const img=await imagen(c);if(img)el.appendChild(img);}
   }
  }
  if(!el.childNodes.length)el.appendChild(document.createElement('br'));
  return el;
 };
 const bloque=async(node:Element,dest:HTMLElement)=>{
  let ul:HTMLElement|null=null;
  for(const c of Array.from(node.children)){
   if(c.namespaceURI!==W)continue;
   if(c.localName==='p'){const el=await parrafo(c);
    if(el.tagName==='LI'){if(!ul){ul=document.createElement('ul');ul.style.margin='0 0 8px 20px';dest.appendChild(ul);}ul.appendChild(el);}
    else{ul=null;dest.appendChild(el);}}
   else if(c.localName==='tbl'){ul=null;const t=document.createElement('table');t.style.borderCollapse='collapse';t.style.margin='0 0 12px';t.style.width='100%';
    for(const tr of kids(c,'tr')){const row=document.createElement('tr');
     for(const tc of kids(tr,'tc')){const td=document.createElement('td');td.style.border='1px solid #cbd5e1';td.style.padding='4px 6px';td.style.verticalAlign='top';await bloque(tc,td);row.appendChild(td);}
     t.appendChild(row);}
    dest.appendChild(t);}
  }
 };
 into.replaceChildren();
 if(body)await bloque(body,into);
}
