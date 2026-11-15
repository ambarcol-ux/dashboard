/** Estudio de contenido › Kit de marca: design templates drawn in the browser (canvas) over a piece's photo, with the brand's logo,
 *  colors and fonts. The result is a JPG (Instagram only accepts JPG) that replaces the photo in the piece. */
export type Kit={logo_url:string|null;color_principal:string;color_secundario:string;color_texto:string;fuente_titulo:string;fuente_texto:string;usuario_instagram:string|null;frase:string|null};
export const FUENTES=['Playfair Display','Cormorant Garamond','Bodoni Moda','Great Vibes','Montserrat','Lato','Poppins','Raleway'];
export const PLANTILLAS:Record<string,string>={marco:'Marco elegante',franja:'Franja con frase',codigo:'Código para WhatsApp'};

const cargadas=new Set<string>();
/** Loads the two Google fonts of the kit before drawing (canvas falls back silently otherwise). */
async function fuentes(kit:Kit){
 for(const f of [kit.fuente_titulo,kit.fuente_texto]){
  if(!cargadas.has(f)){
   const l=document.createElement('link');l.rel='stylesheet';l.href=`https://fonts.googleapis.com/css2?family=${encodeURIComponent(f)}:wght@400;700&display=swap`;
   document.head.appendChild(l);cargadas.add(f);await new Promise(r=>{l.onload=r;l.onerror=r;});
  }
  await Promise.all([document.fonts.load(`700 40px "${f}"`),document.fonts.load(`400 40px "${f}"`)]).catch(()=>null);
 }
}
function imagen(url:string){
 return new Promise<HTMLImageElement>((ok,fail)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>fail(Error('No se pudo cargar la foto.'));
  i.src=url+(url.includes('?')?'&':'?')+'cors=1';});
}
const rgba=(hex:string,a:number)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;

/** Draws the template and returns the JPG. Size: 1080×1920 for stories, 1080×1350 for posts and carousels. */
export async function disenar(url:string,plantilla:string,kit:Kit,o:{historia:boolean;codigo?:string|null;titulo?:string|null}):Promise<Blob>{
 await fuentes(kit);
 const [foto,logo]=await Promise.all([imagen(url),kit.logo_url?imagen(kit.logo_url).catch(()=>null):Promise.resolve(null)]);
 const W=1080,H=o.historia?1920:1350,c=document.createElement('canvas');c.width=W;c.height=H;
 const g=c.getContext('2d')!;
 // Photo covering the whole canvas (cropped to fill, centered, slightly towards the top where faces usually are).
 const s=Math.max(W/foto.width,H/foto.height),fw=foto.width*s,fh=foto.height*s;
 g.drawImage(foto,(W-fw)/2,Math.min(0,(H-fh)*0.35),fw,fh);
 const pintarLogo=(x:number,y:number,ancho:number,centro=false)=>{if(!logo)return 0;const h=logo.height*ancho/logo.width;g.drawImage(logo,centro?x-ancho/2:x,y,ancho,h);return h;};
 const texto=(t:string,x:number,y:number,size:number,fuente:string,color:string,align:CanvasTextAlign='center',peso=700)=>{
  g.font=`${peso} ${size}px "${fuente}"`;g.fillStyle=color;g.textAlign=align;g.textBaseline='middle';
  let sz=size;while(g.measureText(t).width>W-140&&sz>18){sz-=2;g.font=`${peso} ${sz}px "${fuente}"`;}
  g.fillText(t,x,y);
 };
 const usuario=kit.usuario_instagram?`@${kit.usuario_instagram}`:'';
 if(plantilla==='marco'){
  const m=34;g.strokeStyle=kit.color_secundario;g.lineWidth=5;g.strokeRect(m,m,W-2*m,H-2*m);
  const grad=g.createLinearGradient(0,H-300,0,H);grad.addColorStop(0,rgba(kit.color_principal,0));grad.addColorStop(1,rgba(kit.color_principal,0.85));
  g.fillStyle=grad;g.fillRect(m+3,H-300,W-2*m-6,300-m-3);
  const h=pintarLogo(W/2,H-m-200,260,true);
  if(usuario)texto(usuario,W/2,H-m-(h?50:90),30,kit.fuente_texto,kit.color_texto,'center',400);
 }else if(plantilla==='franja'){
  const bh=o.historia?300:240;g.fillStyle=rgba(kit.color_principal,0.88);g.fillRect(0,H-bh,W,bh);
  g.fillStyle=kit.color_secundario;g.fillRect(0,H-bh,W,6);
  texto(o.titulo||kit.frase||'Ámbar Couture',logo?60:W/2,H-bh/2-(usuario?22:0),54,kit.fuente_titulo,kit.color_texto,logo?'left':'center');
  if(usuario)texto(usuario,logo?60:W/2,H-bh/2+42,28,kit.fuente_texto,kit.color_texto,logo?'left':'center',400);
  if(logo){const a=200,h=logo.height*a/logo.width;g.drawImage(logo,W-60-a,H-bh/2-h/2,a,h);}
 }else{
  if(logo){const a=220,h=logo.height*a/logo.width;g.fillStyle=rgba(kit.color_principal,0.55);g.beginPath();g.roundRect(30,30,a+40,h+40,24);g.fill();g.drawImage(logo,50,50,a,h);}
  const t=o.codigo?`Escríbenos con el código ${o.codigo}`:(o.titulo||kit.frase||'Escríbenos por WhatsApp');
  g.font=`700 40px "${kit.fuente_texto}"`;const tw=Math.min(W-100,g.measureText(t).width+80),y=H-(o.historia?260:120);
  g.fillStyle=kit.color_secundario;g.beginPath();g.roundRect((W-tw)/2,y-45,tw,90,45);g.fill();
  texto(t,W/2,y,40,kit.fuente_texto,kit.color_principal);
 }
 return new Promise<Blob>((ok,fail)=>{try{c.toBlob(b=>b?ok(b):fail(Error('No se pudo crear la imagen.')),'image/jpeg',0.9);}catch{fail(Error('La foto no permite editarse (origen externo).'));}});
}
