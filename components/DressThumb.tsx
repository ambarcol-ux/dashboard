'use client';
import {useState,type CSSProperties} from 'react';
import {miniUrl} from '@/lib/dress-photos';

/** Small dress photo: loads the light preview and falls back to the full photo if the preview does not exist yet. */
export default function DressThumb({src,alt,className,style,title,onClick}:{src:string;alt:string;className?:string;style?:CSSProperties;title?:string;onClick?:()=>void}){
 const [url,setUrl]=useState(miniUrl(src));
 return <img src={url||src} alt={alt} title={title} loading="lazy" className={className} style={style} onClick={onClick} onError={()=>{if(url!==src)setUrl(src);}}/>;
}
