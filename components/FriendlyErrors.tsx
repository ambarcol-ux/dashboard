'use client';
import {toast} from 'sonner';
import {mensajeAmigable} from '@/lib/friendly-error';

// Every error notice of the ERP goes through toast.error: translate technical database messages once, for all modules.
type ToastError=typeof toast.error;
const t=toast as unknown as {error:ToastError&{__amigable?:boolean}};
if(typeof window!=='undefined'&&!t.error.__amigable){
 const original=t.error;
 const traducido=((message:Parameters<ToastError>[0],data?:Parameters<ToastError>[1])=>original(typeof message==='string'?mensajeAmigable(message):message,data)) as ToastError&{__amigable?:boolean};
 traducido.__amigable=true;
 t.error=traducido;
}

export default function FriendlyErrors(){return null;}
