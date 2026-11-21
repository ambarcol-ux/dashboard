'use client';
import {useRef,useState} from 'react';
import {Paperclip} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';
import {SUPPORT_ACCEPT,SUPPORT_BUCKET,supportFileError,supportPath,supportType} from '@/lib/payment-support';

/** «Adjuntar soporte» for a contract payment registered without one (e.g. the initial payment saved «soporte después»). */
export default function AttachPaymentSupport({sedeId,pagoId,onDone}:{sedeId:string;pagoId:string;onDone:()=>void}){
 const input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false);
 const upload=async(file:File|undefined)=>{
  if(!file)return;
  const bad=supportFileError(file);if(bad){toast.error(bad);return;}
  setBusy(true);
  try{
   const path=supportPath(sedeId,file);
   const {error:ue}=await supabase.storage.from(SUPPORT_BUCKET).upload(path,file,{contentType:supportType(file),upsert:false});
   if(ue)throw Error('No se pudo subir el soporte.');
   const {error}=await supabase.rpc('agregar_soporte_pago',{p_pago:pagoId,p_soportes:[{path,nombre:file.name,tipo:supportType(file),tamano:file.size}],p_motivo:'Adjuntado desde el contrato'});
   if(error)throw Error(error.message);
   toast.success('Soporte adjuntado.');onDone();
  }catch(e){toast.error(e instanceof Error?e.message:'No se pudo adjuntar el soporte.');}finally{setBusy(false);}
 };
 return <>
  <button type="button" disabled={busy} onClick={()=>input.current?.click()} className="mt-2 flex items-center gap-1.5 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 disabled:opacity-50">
   <Paperclip className="w-3.5 h-3.5"/>{busy?'Subiendo…':'Sin soporte · Adjuntar soporte'}</button>
  <input ref={input} type="file" accept={SUPPORT_ACCEPT} hidden onChange={e=>{void upload(e.target.files?.[0]);e.target.value='';}}/>
 </>;
}
