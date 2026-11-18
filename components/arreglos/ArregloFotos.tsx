'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {shrink} from '@/lib/attach-client';

/** Uploads the photos of a repair to the private bucket «arreglos_fotos» under the dress's folder (reduced to 1600 px, JPEG). */
export async function subirFotosArreglo(vestidoId:string,files:FileList|File[]):Promise<string[]>{
 const rutas:string[]=[];
 for(const f of Array.from(files)){
  if(!f.type.startsWith('image/'))throw Error('Solo se aceptan fotos.');
  const blob=await shrink(f),ruta=`${vestidoId}/${crypto.randomUUID()}.jpg`;
  const {error}=await supabase.storage.from('arreglos_fotos').upload(ruta,blob,{contentType:'image/jpeg'});
  if(error)throw Error('No se pudo subir la foto: '+error.message);
  rutas.push(ruta);
 }
 return rutas;
}

/** Thumbnails of the «antes» / «después» photos of a repair (signed links, 10 minutes); a tap opens the photo. */
export default function ArregloFotos({antes=[],despues=[]}:{antes?:string[]|null;despues?:string[]|null}){
 const [urls,setUrls]=useState<Record<string,string>>({});
 const todas=[...(antes||[]),...(despues||[])],clave=todas.join('|');
 useEffect(()=>{
  let live=true;const rutas=clave?clave.split('|'):[];
  if(rutas.length)void supabase.storage.from('arreglos_fotos').createSignedUrls(rutas,600).then(({data})=>{
   if(live&&data)setUrls(Object.fromEntries(data.filter(d=>d.signedUrl&&d.path).map(d=>[d.path as string,d.signedUrl])));
  });
  return()=>{live=false;};
 },[clave]);
 if(!todas.length)return null;
 const fila=(t:string,l:string[]|null|undefined)=>l&&l.length?<div className="flex items-center gap-1.5 flex-wrap"><span className="text-[10px] font-black uppercase text-gray-500 w-14">{t}</span>
  {l.map(r=>urls[r]?<a key={r} href={urls[r]} target="_blank" rel="noopener noreferrer"><img src={urls[r]} alt={`Foto ${t.toLowerCase()}`} className="w-14 h-14 rounded-lg object-cover border"/></a>
   :<span key={r} className="w-14 h-14 rounded-lg bg-gray-100 border inline-block"/>)}</div>:null;
 return <div className="space-y-1.5">{fila('Antes',antes)}{fila('Después',despues)}</div>;
}
