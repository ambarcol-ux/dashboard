const LOGO='https://ambarcouture.com/wp-content/uploads/2026/06/logo-ambar-transparente.png';
type QrDress={codigo:string;qr_token?:string|null};

const qrUrl=(d:QrDress)=>`${window.location.origin}/v/${d.qr_token}`;
const qrPng=async(d:QrDress,width=600)=>(await import('qrcode')).toDataURL(qrUrl(d),{width,margin:1,errorCorrectionLevel:'M'});

/** Dress QR as an image (data URL) to show it on screen. */
export async function dressQrImage(d:QrDress){
 if(!d.qr_token)throw Error('Este vestido aún no tiene QR. Recarga la página.');
 return qrPng(d,800);
}

/** Downloads the dress QR (public /v/[qr_token] page) as PNG. */
export async function downloadDressQr(d:QrDress){
 if(!d.qr_token)throw Error('Este vestido aún no tiene QR. Recarga la página.');
 const a=document.createElement('a');a.href=await qrPng(d);a.download=`QR-${d.codigo}.png`;a.click();
}

async function logoData():Promise<string|null>{
 try{const b=await (await fetch(LOGO)).blob();return await new Promise(r=>{const f=new FileReader();f.onload=()=>r(String(f.result));f.onerror=()=>r(null);f.readAsDataURL(b);});}catch{return null;}
}

/** A4 sheet of labels: 3 cm QR + code + logo, 4 x 6 per page. */
export async function dressLabelsPdf(dresses:QrDress[]){
 const list=dresses.filter(d=>d.qr_token);
 if(!list.length)throw Error('No hay vestidos con QR en la lista.');
 const {jsPDF}=await import('jspdf');
 const pdf=new jsPDF({unit:'mm',format:'a4'}),logo=await logoData();
 const cols=4,rows=6,w=50,h=47,mx=5,my=7;
 for(let i=0;i<list.length;i++){
  const k=i%(cols*rows);
  if(i&&!k)pdf.addPage();
  const x=mx+(k%cols)*w,y=my+Math.floor(k/cols)*h;
  pdf.setDrawColor(220);pdf.rect(x+1,y+1,w-2,h-2);
  if(logo)pdf.addImage(logo,'PNG',x+w/2-4,y+2,8,8);
  pdf.addImage(await qrPng(list[i],300),'PNG',x+w/2-15,y+10,30,30);
  pdf.setFont('helvetica','bold');pdf.setFontSize(10);pdf.text(list[i].codigo,x+w/2,y+44,{align:'center'});
 }
 pdf.save(`etiquetas-qr-${new Date().toISOString().slice(0,10)}.pdf`);
}
