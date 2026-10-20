'use client';
import {useEffect,useState} from 'react';
import {FileSignature,X} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';
import {CONFIG_FIELDS,missingConfig,type AllyContractConfig,type ContractSection} from '@/lib/ally-contract-text';
import AllyContractText from '@/components/AllyContractText';

const input='w-full mt-1 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none';

/** AMBAR's data for the alliance contract (admin). The signing link cannot be generated until it is complete. */
export function AllyContractConfigCard(){
 const [config,setConfig]=useState<AllyContractConfig|null>(null),[open,setOpen]=useState(false),[saving,setSaving]=useState(false);
 useEffect(()=>{void supabase.from('aliados_contrato_config').select('*').eq('id',1).maybeSingle().then(({data})=>{setConfig(data as AllyContractConfig|null);if(data&&missingConfig(data).length)setOpen(true);});},[]);
 if(!config)return null;
 const missing=missingConfig(config);
 const save=async()=>{
  setSaving(true);
  const values=Object.fromEntries(CONFIG_FIELDS.map(([k])=>{const v=config[k];return [k,v===''||v===null?null:typeof v==='string'?v.trim():v];}));
  const {error}=await supabase.from('aliados_contrato_config').update({...values,actualizado_at:new Date().toISOString()}).eq('id',1);
  setSaving(false);
  if(error)toast.error('No se pudo guardar: '+error.message);else{toast.success('Datos del contrato guardados');if(!missingConfig(config).length)setOpen(false);}
 };
 return <div className="bg-white rounded-[2rem] shadow-sm border border-zinc-200 p-6">
  <button type="button" onClick={()=>setOpen(o=>!o)} className="w-full flex items-center justify-between text-left">
   <span><span className="flex items-center gap-2 font-black text-zinc-900"><FileSignature className="w-5 h-5 text-amber-600"/> Contrato de aliados: datos de Ámbar</span>
    <span className={`text-xs font-bold ${missing.length?'text-rose-600':'text-emerald-600'}`}>{missing.length?`Faltan ${missing.length} datos para poder enviar el contrato a firmar`:'Completo: ya puedes enviar el enlace de firma a cada aliado'}</span></span>
   <span className="text-xs font-bold text-zinc-500">{open?'Ocultar':'Editar'}</span>
  </button>
  {open&&<div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
   {CONFIG_FIELDS.map(([k,label])=><label key={k} className="text-[11px] font-bold text-zinc-500 uppercase tracking-wide">{label}
    <input className={input} inputMode={['deposito_por_vestido','mora_por_dia','clausula_penal'].includes(k)?'numeric':undefined} value={config[k]??''} onChange={e=>setConfig({...config,[k]:['deposito_por_vestido','mora_por_dia','clausula_penal'].includes(k)?(e.target.value.replace(/\D/g,'')===''?null:Number(e.target.value.replace(/\D/g,''))):e.target.value})}/></label>)}
   <div className="sm:col-span-2 lg:col-span-3 flex justify-end"><button type="button" disabled={saving} onClick={()=>void save()} className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white text-sm font-bold disabled:opacity-50">{saving?'Guardando…':'Guardar datos del contrato'}</button></div>
  </div>}
 </div>;
}

/** Contract status for one ally: signing link while unsigned, signed copy afterwards. */
export function AllyContractButton({aliado,firmadoAt}:{aliado:{id:string;nombre_aliado:string;telefono?:string|null};firmadoAt?:string|null}){
 const [busy,setBusy]=useState(false),[copy,setCopy]=useState<{texto:ContractSection[];firma_base64:string;firmado_at:string}|null>(null);
 const sendLink=async()=>{
  setBusy(true);
  try{
   const {data:s}=await supabase.auth.getSession();
   const r=await fetch('/api/aliados/contrato/enlace',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.session?.access_token||''}`},body:JSON.stringify({referidor_id:aliado.id})});
   const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo generar el enlace.');
   const text=`Hola, ${aliado.nombre_aliado}. Para continuar en la Red de Aliados de Ámbar Couture, completa tus datos y firma el contrato de alianza aquí (una sola vez): ${d.link}`;
   try{await navigator.clipboard.writeText(d.link);}catch{}
   const phone=String(aliado.telefono||'').replace(/\D/g,'');
   if(phone&&window.confirm(`Enlace copiado (vence en ${d.dias} días).\n\n¿Abrir WhatsApp para enviárselo a ${aliado.nombre_aliado}?`))window.open(`https://wa.me/${phone.length===10?'57'+phone:phone}?text=${encodeURIComponent(text)}`,'_blank','noopener,noreferrer');
   else toast.success('Enlace de firma copiado');
  }catch(e){toast.error(e instanceof Error?e.message:'No se pudo generar el enlace.');}
  finally{setBusy(false);}
 };
 const view=async()=>{
  const {data,error}=await supabase.from('aliados_contratos_firmados').select('texto,firma_base64,firmado_at').eq('referidor_id',aliado.id).maybeSingle();
  if(error||!data)toast.error('No se pudo abrir el contrato firmado.');else setCopy(data as typeof copy);
 };
 return <>
  {firmadoAt
   ?<button type="button" onClick={(e)=>{e.stopPropagation();void view();}} className="px-2.5 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px] font-bold" title={`Firmado el ${new Date(firmadoAt).toLocaleDateString('es-CO')}`}>Contrato firmado</button>
   :<button type="button" disabled={busy} onClick={(e)=>{e.stopPropagation();void sendLink();}} className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-[11px] font-bold disabled:opacity-50" title="Generar enlace para que el aliado complete sus datos y firme">{busy?'Generando…':'Enviar contrato'}</button>}
  {copy&&<div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 text-left" onClick={()=>setCopy(null)}>
   <div className="bg-white w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-[2rem] p-6 relative" onClick={e=>e.stopPropagation()}>
    <button type="button" onClick={()=>setCopy(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-zinc-100"><X className="w-5 h-5"/></button>
    <h3 className="font-black text-lg mb-1">Contrato de {aliado.nombre_aliado}</h3>
    <p className="text-xs text-zinc-500 mb-4">Firmado digitalmente el {new Date(copy.firmado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</p>
    <AllyContractText sections={copy.texto}/>
    <div className="mt-6 border-t pt-4"><p className="text-xs font-bold text-zinc-500 mb-2">Firma de EL ALIADO</p><img src={copy.firma_base64} alt="Firma del aliado" className="max-h-28"/></div>
   </div>
  </div>}
 </>;
}
