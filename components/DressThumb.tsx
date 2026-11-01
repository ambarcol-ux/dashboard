'use client';
import {useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {miniUrl} from '@/lib/dress-photos';

/** Small dress photo: loads the light preview and falls back to the full photo if the preview does not exist yet. */
export default function DressThumb({src,alt,className,style,title,onClick,zoom}:{src:string;alt:string;className?:string;style?:CSSProperties;title?:string;onClick?:()=>void;zoom?:boolean}){
 const [url,setUrl]=useState(miniUrl(src)),[big,setBig]=useState(false);
 const img=<img src={url||src} alt={alt} title={title} loading="lazy" className={className} style={{...style,...(zoom?{cursor:'zoom-in'}:{})}} onClick={zoom?e=>{e.stopPropagation();e.preventDefault();setBig(true);}:onClick} onError={()=>{if(url!==src)setUrl(src);}}/>;
 if(!zoom)return img;
 // zoom: tap to see the full photo on screen; tap anywhere to close.
 return <>{img}{big&&createPortal(<div role="dialog" aria-label={alt} onClick={e=>{e.stopPropagation();setBig(false);}} style={{position:'fixed',inset:0,zIndex:400,background:'rgba(0,0,0,.85)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:16,gap:10}}>
  <img src={src} alt={alt} style={{maxWidth:'100%',maxHeight:'85vh',objectFit:'contain',borderRadius:12}}/>
  <span style={{color:'#fff',fontWeight:800,fontSize:14}}>{title||alt} · toca para cerrar</span>
 </div>,document.body)}</>;
}
