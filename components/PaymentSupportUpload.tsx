'use client';
import {useRef,useState} from 'react';
import {Camera,FileText,Loader2,Paperclip,X} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {SUPPORT_ACCEPT,SUPPORT_BUCKET,formatBytes,supportFileError,supportPath,supportType,type UploadedSupport} from '@/lib/payment-support';

type Props={sedeId:string|null|undefined;value:UploadedSupport[];onChange:(v:UploadedSupport[])=>void;onBusyChange?:(busy:boolean)=>void;
 title?:string;help?:string;missingMessage?:string;required?:boolean;disabled?:boolean};

/** Required payment support: uploads each photo/PDF right away so saving only unlocks once the file is stored. */
export default function PaymentSupportUpload({sedeId,value,onChange,onBusyChange,title='Soporte de ingreso',help='Comprobante de la transferencia o del pago. Foto o PDF.',missingMessage='Adjunta el soporte para poder guardar.',required=true,disabled}:Props){
 const fileRef=useRef<HTMLInputElement>(null),cameraRef=useRef<HTMLInputElement>(null);
 const [uploading,setUploading]=useState(0),[error,setError]=useState('');

 const upload=async(files:FileList|null)=>{
  if(!files?.length)return;
  if(!sedeId){setError('Primero elige la sede.');return;}
  const list=Array.from(files);
  const bad=list.map(supportFileError).find(Boolean);
  if(bad){setError(bad);return;}
  setError('');setUploading(n=>n+list.length);onBusyChange?.(true);
  const done:UploadedSupport[]=[];
  for(const file of list){
   const path=supportPath(sedeId,file),tipo=supportType(file);
   const {error}=await supabase.storage.from(SUPPORT_BUCKET).upload(path,file,{contentType:tipo,upsert:false});
   if(error)setError(`No se pudo subir «${file.name}». Revisa la conexión e intenta de nuevo.`);
   else done.push({path,nombre:file.name,tipo,tamano:file.size});
   setUploading(n=>n-1);
  }
  onBusyChange?.(false);
  if(done.length)onChange([...value,...done]);
 };
 const pick=(ref:React.RefObject<HTMLInputElement|null>)=>{if(!disabled&&!uploading)ref.current?.click();};
 const busy=uploading>0;

 return <div className={`rounded-2xl border p-4 space-y-3 ${required&&!value.length?'border-rose-200 bg-rose-50/40':'border-emerald-200 bg-white'}`}>
  <div>
   <h3 className="font-bold text-gray-700 text-sm">{title}{required&&<span className="text-rose-500"> *</span>}</h3>
   <p className="text-xs text-gray-500">{help}</p>
  </div>
  {value.length>0&&<ul className="space-y-2">{value.map(f=><li key={f.path} className="flex items-center justify-between gap-3 bg-gray-50 rounded-xl px-3 py-2 border border-gray-100">
   <span className="flex items-center gap-2 min-w-0"><FileText className="w-4 h-4 text-emerald-600 shrink-0"/><span className="truncate text-sm font-semibold text-gray-700">{f.nombre}</span>
    <span className="text-[11px] text-gray-400 shrink-0">{formatBytes(f.tamano)} · Cargado</span></span>
   {!disabled&&<button type="button" onClick={()=>onChange(value.filter(x=>x.path!==f.path))} className="p-1 text-gray-400 hover:text-rose-500" aria-label={`Quitar ${f.nombre}`}><X className="w-4 h-4"/></button>}
  </li>)}</ul>}
  <div className="flex flex-wrap gap-2">
   <button type="button" onClick={()=>pick(fileRef)} disabled={disabled||busy} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold hover:border-emerald-300 transition-colors disabled:opacity-50">
    <Paperclip className="w-4 h-4"/>{value.length?'Agregar otro soporte':'Elegir archivo'}</button>
   <button type="button" onClick={()=>pick(cameraRef)} disabled={disabled||busy} className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-semibold hover:border-emerald-300 transition-colors disabled:opacity-50">
    <Camera className="w-4 h-4"/>Tomar foto</button>
   {busy&&<span className="flex items-center gap-1.5 text-xs font-semibold text-gray-500"><Loader2 className="w-4 h-4 animate-spin"/>Subiendo…</span>}
  </div>
  <input ref={fileRef} type="file" accept={SUPPORT_ACCEPT} multiple hidden onChange={e=>{void upload(e.target.files);e.target.value='';}}/>
  <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={e=>{void upload(e.target.files);e.target.value='';}}/>
  <p className="text-[11px] text-gray-400">JPG, PNG, HEIC o PDF · máx. 10 MB. Puedes adjuntar varios si el pago se dividió.</p>
  {error&&<p role="alert" className="text-xs font-semibold text-rose-600">{error}</p>}
  {required&&!value.length&&!error&&<p className="text-xs font-semibold text-rose-600">{missingMessage}</p>}
 </div>;
}
