'use client';
import {useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import styles from '@/app/agendar-primera-cita/visits.module.css';

type Qr={nombre:string;url:string;img:string};

/** Entrance poster (PNG): title, instructions, the QR and the store name, ready to print. */
async function poster(q:Qr){
 const c=document.createElement('canvas');c.width=1240;c.height=1754;
 const x=c.getContext('2d')!;
 x.fillStyle='#fff7f9';x.fillRect(0,0,c.width,c.height);
 x.textAlign='center';x.fillStyle='#d62f65';x.font='900 46px sans-serif';x.fillText('ÁMBAR COUTURE',620,150);
 x.fillStyle='#253044';x.font='800 78px sans-serif';x.fillText('¡Bienvenida!',620,270);
 x.font='600 42px sans-serif';x.fillText('Escanea y registra tu llegada',620,350);
 const img=new Image();img.src=q.img;await img.decode();
 x.fillStyle='#ffffff';x.fillRect(270,420,700,700);x.drawImage(img,300,450,640,640);
 x.fillStyle='#253044';x.font='600 38px sans-serif';
 x.fillText('¿Tienes cita? Escribe el código, tu cédula',620,1220);x.fillText('o tu celular.',620,1270);
 x.fillText('¿No tienes cita? Regístrate y te atendemos.',620,1350);
 x.fillStyle='#d62f65';x.font='900 64px sans-serif';x.fillText(`Sede ${q.nombre}`,620,1500);
 return await new Promise<Blob>((ok,ko)=>c.toBlob(b=>b?ok(b):ko(Error('No se pudo crear la imagen.')),'image/png'));
}

/** Printable QR per store: with an appointment she registers her arrival; without one she registers herself as a window visit. */
export default function ArrivalQr(){
 const dialog=useRef<HTMLDialogElement>(null);
 const [qrs,setQrs]=useState<Qr[]>([]),[error,setError]=useState('');
 async function open(){
  dialog.current?.showModal();setError('');
  try{
   const {data,error:e}=await supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre');if(e)throw e;
   const QR=(await import('qrcode')).default;
   setQrs(await Promise.all((data||[]).map(async s=>{const url=`${window.location.origin}/llegue?s=${s.id}`;return {nombre:String(s.nombre),url,img:await QR.toDataURL(url,{width:640,margin:1,errorCorrectionLevel:'M'})};})));
  }catch(err){setError(err instanceof Error?err.message:'No se pudieron generar los QR.');}
 }
 // Phones (iPhone) do not save data links: share the file (Save image / Files); computers download it.
 async function descargar(q:Qr){
  setError('');
  try{
   const blob=await poster(q),name=`QR-llegada-${q.nombre}.png`,file=new File([blob],name,{type:'image/png'});
   if(navigator.canShare?.({files:[file]})){await navigator.share({files:[file],title:name});return;}
   const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
   setTimeout(()=>URL.revokeObjectURL(url),2000);
  }catch(err){if(!(err instanceof DOMException&&err.name==='AbortError'))setError(err instanceof Error?err.message:'No se pudo descargar.');}
 }
 async function imprimir(lista:Qr[]){
  setError('');
  const w=window.open('','_blank');if(!w){setError('Permite las ventanas emergentes para imprimir.');return;}
  const urls=await Promise.all(lista.map(async q=>URL.createObjectURL(await poster(q))));
  w.document.write(`<!doctype html><title>QR de llegada</title><style>@page{size:A4;margin:0}body{margin:0}img{width:100%;display:block;page-break-after:always}</style>${urls.map(u=>`<img src="${u}">`).join('')}<script>window.onload=()=>setTimeout(()=>print(),300)<\/script>`);
  w.document.close();
 }
 return <><button type="button" onClick={()=>void open()}>QR de llegada</button>
  <dialog ref={dialog} className={styles.dialog} onClick={e=>{if(e.target===dialog.current)dialog.current?.close();}}>
   <h3>QR de llegada por sede</h3>
   <p className={styles.notice}>Imprímelo y ponlo en la entrada. Con cita: escribe el código, su cédula o su celular y la asistencia queda registrada sola. Sin cita: se registra ella misma como vitrina y la sede recibe el aviso.</p>
   {error&&<p className={styles.error}>{error}</p>}
   <div className={styles.grid2}>{qrs.map(q=><figure key={q.url} style={{textAlign:'center'}}><img src={q.img} alt={`QR ${q.nombre}`} style={{width:'100%'}}/><figcaption><strong>{q.nombre}</strong>
    <div className={styles.actions} style={{justifyContent:'center',marginTop:6}}><button type="button" onClick={()=>void descargar(q)}>Descargar afiche</button><button type="button" onClick={()=>void imprimir([q])}>Imprimir</button></div></figcaption></figure>)}</div>
   <div className={styles.actions}>{qrs.length>1&&<button type="button" onClick={()=>void imprimir(qrs)}>Imprimir todos</button>}<button type="button" onClick={()=>dialog.current?.close()}>Cerrar</button></div>
  </dialog></>;
}
