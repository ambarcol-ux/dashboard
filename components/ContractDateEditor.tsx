'use client';
import {useState} from 'react';
import {CalendarClock,Lock} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {can,usePermissions} from '@/lib/use-permissions';

type Field='fecha_evento'|'fecha_prueba_final';
const LABELS:Record<Field,string>={fecha_evento:'Fecha de evento',fecha_prueba_final:'Fecha de prueba final'};

/** Event and final-fitting dates of a contract: editable only with the role permission, with mandatory reason (audited). */
export default function ContractDateEditor({contract,userId,onSaved}:{contract:{id:string;fecha_evento?:string|null;fecha_prueba_final?:string|null;fecha_elaboracion?:string|null;created_at?:string|null};userId?:string|null;onSaved:(message:string)=>void}){
 const permissions=usePermissions(userId);
 const [values,setValues]=useState<Record<Field,string>>({fecha_evento:String(contract.fecha_evento||'').slice(0,10),fecha_prueba_final:String(contract.fecha_prueba_final||'').slice(0,10)});
 const [reason,setReason]=useState(''),[busy,setBusy]=useState<Field|null>(null),[error,setError]=useState('');
 const allowed=(f:Field)=>can(permissions,`contratos.editar_${f}`);
 const elabOriginal=String(contract.fecha_elaboracion||'').slice(0,10)||(contract.created_at?new Date(contract.created_at).toLocaleDateString('en-CA',{timeZone:'America/Bogota'}):'');
 const [elab,setElab]=useState(elabOriginal);
 if(permissions===null)return null;
 const canElab=can(permissions,'contratos.editar_fecha_elaboracion');
 const save=async(f:Field)=>{
  setError('');
  if(!values[f])return setError('Selecciona la nueva fecha.');
  if(reason.trim().length<5)return setError('Escribe el motivo del cambio (mínimo 5 caracteres).');
  setBusy(f);
  const {error:e}=await supabase.rpc('cambiar_fecha_contrato',{p_contrato:contract.id,p_campo:f,p_fecha:values[f],p_motivo:reason.trim()});
  setBusy(null);
  if(e)return setError(e.message);
  setReason('');onSaved(`${LABELS[f]} actualizada. El cambio quedó en la bitácora del contrato.`);
 };
 // Elaboration date: also moves that day's contract payments in the cash register (database); asks before touching a closed register.
 const saveElab=async(confirmar=false):Promise<void>=>{
  setError('');
  if(reason.trim().length<10)return setError('Escribe el motivo del cambio (mínimo 10 caracteres).');
  setBusy('fecha_evento');
  const {data,error:e}=await supabase.rpc('cambiar_fecha_elaboracion',{p_contrato:contract.id,p_fecha:elab,p_motivo:reason.trim(),p_confirmar:confirmar});
  setBusy(null);
  if(e&&e.message.startsWith('CAJA_CERRADA')&&window.confirm(e.message.replace('CAJA_CERRADA: ','')+' ¿Continuar?'))return saveElab(true);
  if(e)return setError(e.message.replace('CAJA_CERRADA: ',''));
  setReason('');onSaved(`Fecha de elaboración actualizada; ${data?.abonos_movidos||0} abono(s) movido(s) en caja. Quedó en la bitácora.`);
 };
 const any=allowed('fecha_evento')||allowed('fecha_prueba_final')||canElab;
 return <section className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
  <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 flex items-center gap-2"><CalendarClock className="w-4 h-4 text-rose-500"/>Fechas del contrato</h4>
  <div className="grid sm:grid-cols-2 gap-3">{(Object.keys(LABELS) as Field[]).map(f=>{const original=String(contract[f]||'').slice(0,10);return <div key={f}>
   <label className="text-[11px] font-bold text-gray-500 flex items-center gap-1">{LABELS[f]}{!allowed(f)&&<Lock className="w-3 h-3"/>}</label>
   <div className="flex gap-2 mt-1"><input type="date" disabled={!allowed(f)||!!busy} value={values[f]} onChange={e=>setValues({...values,[f]:e.target.value})} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500"/>
    {allowed(f)&&values[f]!==original&&<button type="button" disabled={!!busy} onClick={()=>void save(f)} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-black disabled:opacity-50">{busy===f?'Guardando…':'Guardar'}</button>}</div>
  </div>;})}
   <div><label className="text-[11px] font-bold text-gray-500 flex items-center gap-1">Fecha de elaboración{!canElab&&<Lock className="w-3 h-3"/>}</label>
    <div className="flex gap-2 mt-1"><input type="date" disabled={!canElab||!!busy} value={elab} max={new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'})} onChange={e=>setElab(e.target.value)} className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm font-bold disabled:bg-gray-100 disabled:text-gray-500"/>
     {canElab&&elab!==elabOriginal&&<button type="button" disabled={!!busy} onClick={()=>void saveElab()} className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-black disabled:opacity-50">Guardar</button>}</div></div>
  </div>
  {any&&<input value={reason} maxLength={300} onChange={e=>setReason(e.target.value)} placeholder="Motivo del cambio (obligatorio)" className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm"/>}
  {!any&&<p className="text-[11px] text-gray-400">Solo las asesoras líderes y el Administrador pueden cambiar estas fechas.</p>}
  {error&&<p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 rounded-xl p-2">{error}</p>}
 </section>;
}
