import type {Kit} from './BrandDesign';
/** Estudio de contenido › Reels editados: the browser plays the video once and records it on a 1080×1920 canvas with the cut
 *  (start and end), the brand's logo, an opening phrase and the WhatsApp code, keeping the sound. Output MP4 (Instagram needs it):
 *  works on Safari (iPhone) and recent Chrome. Recording takes as long as the cut lasts and the screen must stay open. */
export type ReelOpts={inicio:number;fin:number;logo:boolean;frase:string|null;codigo:string|null};

export function mp4Soportado(){
 if(typeof MediaRecorder==='undefined')return null;
 return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4;codecs=avc1,mp4a','video/mp4'].find(t=>MediaRecorder.isTypeSupported(t))||null;
}
const rgba=(hex:string,a:number)=>`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;

/** Step 1 loads the video, logo and fonts and leaves it at the cut's start. Step 2 (grabar) must run straight from a tap: phones only
 *  play sound when playback starts from a user gesture. */
export async function prepararReel(url:string,kit:Kit,o:ReelOpts){
 const tipo=mp4Soportado();if(!tipo)throw Error('Este navegador no graba MP4. Usa Safari en el celular o Chrome actualizado en el computador.');
 if(!(o.fin>o.inicio))throw Error('El final del corte debe ser después del inicio.');
 if(o.fin-o.inicio>90)throw Error('El reel editado puede durar máximo 90 segundos.');
 const v=document.createElement('video');v.crossOrigin='anonymous';v.playsInline=true;v.preload='auto';v.src=url;
 await new Promise((ok,fail)=>{v.onloadedmetadata=ok;v.onerror=()=>fail(Error('No se pudo cargar el video.'));});
 const fin=Math.min(o.fin,v.duration||o.fin);
 let logo:HTMLImageElement|null=null;
 if(o.logo&&kit.logo_url)logo=await new Promise(ok=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=kit.logo_url!;});
 await Promise.all([document.fonts.load(`700 60px "${kit.fuente_titulo}"`),document.fonts.load(`700 40px "${kit.fuente_texto}"`)]).catch(()=>null);
 const W=1080,H=1920,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d')!;
 // Sound: through WebAudio (Safari has no video.captureStream); not sent to the speakers, only to the recording.
 const ac=new AudioContext(),dest=ac.createMediaStreamDestination();ac.createMediaElementSource(v).connect(dest);
 const stream=new MediaStream([...c.captureStream(30).getVideoTracks(),...dest.stream.getAudioTracks()]);
 const rec=new MediaRecorder(stream,{mimeType:tipo,videoBitsPerSecond:6_000_000}),partes:Blob[]=[];
 rec.ondataavailable=e=>{if(e.data.size)partes.push(e.data);};
 let progreso:(p:number)=>void=()=>{};
 const pintar=()=>{
  const s=Math.max(W/v.videoWidth,H/v.videoHeight),fw=v.videoWidth*s,fh=v.videoHeight*s;
  g.fillStyle='#000';g.fillRect(0,0,W,H);g.drawImage(v,(W-fw)/2,(H-fh)/2,fw,fh);
  const t=v.currentTime-o.inicio;
  if(logo){const a=240,h=logo.height*a/logo.width;g.globalAlpha=0.9;g.drawImage(logo,W/2-a/2,90,a,h);g.globalAlpha=1;}
  if(o.frase&&t<3.5){
   g.globalAlpha=Math.min(1,t*2,(3.5-t)*2);g.fillStyle=rgba(kit.color_principal,0.75);g.fillRect(0,H/2-110,W,220);
   g.font=`700 64px "${kit.fuente_titulo}"`;let sz=64;while(g.measureText(o.frase).width>W-120&&sz>28){sz-=2;g.font=`700 ${sz}px "${kit.fuente_titulo}"`;}
   g.fillStyle=kit.color_texto;g.textAlign='center';g.textBaseline='middle';g.fillText(o.frase,W/2,H/2);g.globalAlpha=1;
  }
  if(o.codigo){
   const txt=`Escríbenos con el código ${o.codigo}`;g.font=`700 42px "${kit.fuente_texto}"`;const tw=Math.min(W-100,g.measureText(txt).width+80),y=H-300;
   g.fillStyle=kit.color_secundario;g.beginPath();g.roundRect((W-tw)/2,y-46,tw,92,46);g.fill();
   g.fillStyle=kit.color_principal;g.textAlign='center';g.textBaseline='middle';g.fillText(txt,W/2,y);
  }
  progreso(Math.max(0,Math.min(1,t/(fin-o.inicio))));
 };
 v.currentTime=o.inicio;await new Promise(ok=>{v.onseeked=ok;});
 pintar();
 return {grabar:async(cb:(p:number)=>void):Promise<Blob>=>{
  progreso=cb;const sonando=v.play();void ac.resume();
  const listo=new Promise<Blob>((ok,fail)=>{rec.onstop=()=>{void ac.close();if(partes.length)ok(new Blob(partes,{type:"video/mp4"}));else fail(Error("No se grabó el video."));};});
  rec.start(1000);await sonando;
  await new Promise<void>(ok=>{
   const paso=()=>{if(v.currentTime>=fin||v.ended){v.pause();ok();return;}pintar();requestAnimationFrame(paso);};
   requestAnimationFrame(paso);
  });
  rec.stop();progreso(1);
  return listo;
 }};
}
