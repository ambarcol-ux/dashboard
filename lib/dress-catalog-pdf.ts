/** Catálogo en PDF del inventario: agrupado por tipo y categoría, con la foto de frente cargada en el inventario. */
export type CatalogDress={codigo:string;nombre:string|null;tipo:string;categoria:string|null;talla:string|null;color:string|null;precio:number|null;foto:string|null;fotos?:(string|null)[]};

const money=(v:number|null)=>v&&v>0?new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(v):'Consultar';

/** Photo as a small JPEG data URL (keeps the PDF light); null when it cannot be loaded. */
async function photo(url:string|null):Promise<string|null>{
 if(!url)return null;
 try{
  const blob=await (await fetch(url)).blob(),bmp=await createImageBitmap(blob),scale=Math.min(1,500/bmp.height);
  const c=document.createElement('canvas');c.width=Math.round(bmp.width*scale);c.height=Math.round(bmp.height*scale);
  c.getContext('2d')!.drawImage(bmp,0,0,c.width,c.height);return c.toDataURL('image/jpeg',0.75);
 }catch{return null;}
}

/** modo 'una': three dresses per row with one photo; 'tres': one dress per row with front, back and detail. */
export async function downloadCatalogPdf(rows:CatalogDress[],subtitle:string,modo:'una'|'tres'='una'){
 const {jsPDF}=await import('jspdf');
 const doc=new jsPDF({unit:'pt',format:'letter'}),W=612,H=792,M=36,COLS=3,GAP=14,cw=(W-2*M-GAP*(COLS-1))/COLS,ph=cw*1.35,ch=ph+58;
 const sorted=[...rows].sort((a,b)=>a.tipo.localeCompare(b.tipo)||(a.categoria||'~').localeCompare(b.categoria||'~')||(a.precio||0)-(b.precio||0)||a.codigo.localeCompare(b.codigo));
 const imgs=modo==='una'?await Promise.all(sorted.map(r=>photo(r.foto))):[];
 const tres=modo==='tres'?await Promise.all(sorted.map(r=>Promise.all([0,1,2].map(i=>photo((r.fotos||[r.foto])[i]||null))))):[];
 doc.setFont('helvetica','bold');doc.setFontSize(22);doc.text('Ámbar Couture · Catálogo',M,M+14);
 doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(110);doc.text(`${subtitle} · ${sorted.length} vestidos · ${new Date().toLocaleDateString('es-CO')}`,M,M+30);
 let y=M+48,col=0,group='';
 const newPage=()=>{doc.addPage();y=M;col=0;};
 sorted.forEach((r,i)=>{
  const g=`${r.tipo}${r.categoria?` · ${r.categoria}`:''}`;
  if(g!==group){
   if(col>0){y+=ch+GAP;col=0;}
   if(y+28+ch>H-M)newPage();
   doc.setTextColor(190,18,60);doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text(g,M,y+14);y+=28;group=g;
  }
  if(modo==='tres'){
   if(y+ch>H-M)newPage();
   ['Frente','Espalda','Detalle'].forEach((label,k)=>{const x=M+k*(cw+GAP),img=tres[i][k];
    doc.setDrawColor(230);doc.setFillColor(248,248,248);doc.roundedRect(x,y,cw,ph,6,6,'FD');
    if(img)doc.addImage(img,'JPEG',x,y,cw,ph,undefined,'FAST');else{doc.setTextColor(170);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Sin foto',x+cw/2,y+ph/2,{align:'center'});}
    doc.setTextColor(150);doc.setFontSize(7);doc.text(label,x+cw-4,y+ph-5,{align:'right'});});
   doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(11);doc.text(r.codigo,M,y+ph+14);
   doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor(90);doc.text(`${r.nombre||''} · Talla ${r.talla||'—'} · ${r.color||'—'}`.slice(0,110),M,y+ph+27);
   doc.setTextColor(190,18,60);doc.setFont('helvetica','bold');doc.text(`Alquiler ${money(r.precio)}`,M,y+ph+40);
   y+=ch+GAP;return;
  }
  if(y+ch>H-M)newPage();
  const x=M+col*(cw+GAP);
  doc.setDrawColor(230);doc.setFillColor(248,248,248);doc.roundedRect(x,y,cw,ph,6,6,'FD');
  if(imgs[i])doc.addImage(imgs[i]!,'JPEG',x,y,cw,ph,undefined,'FAST');
  else{doc.setTextColor(170);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.text('Sin foto',x+cw/2,y+ph/2,{align:'center'});}
  doc.setTextColor(20);doc.setFont('helvetica','bold');doc.setFontSize(10);doc.text(r.codigo,x,y+ph+14);
  doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(90);
  doc.text(doc.splitTextToSize(r.nombre||'',cw).slice(0,1),x,y+ph+26);
  doc.text(`Talla ${r.talla||'—'} · ${r.color||'—'}`,x,y+ph+37);
  doc.setTextColor(190,18,60);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text(`Alquiler ${money(r.precio)}`,x,y+ph+49);
  col++;if(col===COLS){col=0;y+=ch+GAP;}
 });
 doc.save(`catalogo-ambar-${new Date().toISOString().slice(0,10)}.pdf`);
}
