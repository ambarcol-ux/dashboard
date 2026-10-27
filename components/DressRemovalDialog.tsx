'use client';
import {useEffect, useState} from 'react';
import {Archive, Loader2, Trash2} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {referenceChips, referenceTotal, type DressReferences} from '@/lib/inventory';

const NO_PERMISSION='No tienes permiso sobre códigos de esta sede.';

/** Deletes a code with no history; otherwise offers to archive it so contracts and reports keep it. */
export default function DressRemovalDialog({dress,onClose,onDone}:{dress:{id:string;codigo:string};onClose:()=>void;onDone:(message:string)=>void}){
 const [refs,setRefs]=useState<DressReferences|null>(null);
 const [error,setError]=useState('');
 const [motivo,setMotivo]=useState('');
 const [busy,setBusy]=useState(false);

 useEffect(()=>{
  let live=true;
  supabase.rpc('vestido_referencias',{p_id:dress.id}).then(({data,error})=>{
   if(!live)return;
   if(error)setError(error.message);else setRefs(data as DressReferences);
  });
  return ()=>{live=false;};
 },[dress.id]);

 const hasHistory=refs!==null&&referenceTotal(refs)>0;

 const removeForever=async()=>{
  setBusy(true);setError('');
  const {data,error}=await supabase.from('vestidos').delete().eq('id',dress.id).select('id');
  setBusy(false);
  if(error){
   if(error.code==='23503'){ // history was added meanwhile: switch to archive
    const {data:fresh}=await supabase.rpc('vestido_referencias',{p_id:dress.id});
    setRefs(fresh as DressReferences);return;
   }
   setError(error.message);return;
  }
  if(!data?.length){setError(NO_PERMISSION);return;}
  onDone(`Código ${dress.codigo} eliminado del inventario`);
 };

 const archive=async()=>{
  setBusy(true);setError('');
  const {error}=await supabase.rpc('archivar_vestido',{p_id:dress.id,p_motivo:motivo});
  setBusy(false);
  if(error){setError(error.message);return;}
  onDone(`Código ${dress.codigo} archivado. Puedes restaurarlo desde el filtro «Archivados».`);
 };

 return <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm" onClick={()=>!busy&&onClose()}>
  <div className="bg-white w-full max-w-lg rounded-[2rem] shadow-2xl p-8 space-y-5" onClick={e=>e.stopPropagation()}>
   {refs===null&&!error&&<div className="flex items-center gap-3 text-gray-500 font-bold"><Loader2 className="w-5 h-5 animate-spin"/>Revisando el historial del código {dress.codigo}…</div>}
   {refs!==null&&!hasHistory&&<>
    <h2 className="text-xl font-black text-gray-900">¿Eliminar el código {dress.codigo}?</h2>
    <p className="text-sm text-gray-600">Este código no tiene contratos, traslados ni mantenimientos registrados. Se borrará del inventario de forma permanente.</p>
   </>}
   {hasHistory&&<>
    <h2 className="text-xl font-black text-gray-900">El código {dress.codigo} no se puede borrar</h2>
    <p className="text-sm text-gray-600">Tiene historial que debe conservarse para los contratos y reportes:</p>
    <div className="flex flex-wrap gap-2">{referenceChips(refs).map(c=><span key={c} className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 text-xs font-black">{c}</span>)}</div>
    <p className="text-sm text-gray-600 bg-amber-50 border border-amber-100 rounded-2xl p-4">En su lugar puedes <b>archivarlo</b>: deja de aparecer en la bandeja y en los contratos nuevos, pero su historial queda intacto. Se puede restaurar desde el filtro «Archivados».</p>
    <label className="block space-y-1"><span className="text-xs font-black text-gray-500 uppercase tracking-widest">Motivo</span>
     <textarea value={motivo} onChange={e=>setMotivo(e.target.value)} rows={3} maxLength={500} minLength={30} className="w-full p-3 bg-gray-50 border border-gray-200 rounded-2xl text-sm font-bold text-gray-800" aria-describedby="motivo-ayuda" placeholder="Ej: Vestido vendido a cliente, se retira de la colección…"/></label>
     <p id="motivo-ayuda" className={`text-[11px] font-bold ${motivo.trim().length<30?'text-rose-500':'text-emerald-600'}`}>Explica por qué se archiva: {motivo.trim().length}/30 caracteres mínimos.</p>
   </>}
   {error&&<p className="text-sm font-bold text-rose-700 bg-rose-50 rounded-2xl p-3">{error}</p>}
   <div className="flex justify-end gap-3 pt-2">
    <button onClick={onClose} disabled={busy} className="px-5 py-3 bg-gray-100 hover:bg-gray-200 rounded-2xl text-xs font-black uppercase text-gray-700">Cancelar</button>
    {refs!==null&&!hasHistory&&<button onClick={removeForever} disabled={busy} className="px-5 py-3 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase flex items-center gap-2">
     {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Trash2 className="w-4 h-4"/>}Eliminar definitivamente</button>}
    {hasHistory&&<button onClick={archive} disabled={busy||motivo.trim().length<30} className="px-5 py-3 bg-gray-900 hover:bg-black disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase flex items-center gap-2">
     {busy?<Loader2 className="w-4 h-4 animate-spin"/>:<Archive className="w-4 h-4"/>}Archivar código</button>}
   </div>
  </div>
 </div>;
}
