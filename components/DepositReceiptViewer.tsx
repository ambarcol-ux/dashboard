'use client';
import {useEffect,useRef,useState} from 'react';
import {X,ArrowUpRight} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {RECEIPT_MAX_BYTES,receiptKind,receiptPath} from '@/lib/deposit-daily';
import styles from '@/app/dashboard/devoluciones-depositos/deposits.module.css';

export type ReceiptTarget={tipo:'movimiento'|'soporte';id:string;contratoId:string;titulo:string;path:string|null};

/** Shows a deposit receipt inside the module; admin/contabilidad can replace or remove it (audited, amounts untouched). */
export default function DepositReceiptViewer({target,canChange,onClose,onChanged}:{target:ReceiptTarget;canChange:boolean;onClose:()=>void;onChanged:(notice:string)=>void}){
 const ref=useRef<HTMLDialogElement>(null),busy=useRef(false),operation=useRef(crypto.randomUUID());
 const [url,setUrl]=useState(''),[error,setError]=useState(''),[mode,setMode]=useState<''|'reemplazar'|'quitar'>(target.path?'':'reemplazar'),[file,setFile]=useState<File|null>(null),[reason,setReason]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{const dialog=ref.current;dialog?.showModal();return()=>dialog?.close();},[]);
 useEffect(()=>{if(!target.path)return;let live=true;void supabase.storage.from('comprobantes_depositos').createSignedUrl(target.path,300).then(({data,error})=>{if(!live)return;if(error||!data)setError('No se pudo abrir el comprobante. Vuelve a intentarlo.');else setUrl(data.signedUrl);});return()=>{live=false;};},[target.path]);
 async function save(event:React.FormEvent){
  event.preventDefault();if(busy.current)return;setError('');
  if(reason.trim().length<5){setError('Escribe el motivo del cambio (mínimo 5 caracteres).');return;}
  if(mode==='reemplazar'&&!file){setError('Selecciona el comprobante correcto.');return;}
  if(mode==='quitar'&&!window.confirm('¿Quitar este comprobante? El valor del depósito no cambia y el archivo anterior queda guardado en la auditoría.'))return;
  busy.current=true;setSaving(true);
  try{
   let path:string|null=null;
   if(mode==='reemplazar'&&file){
    if(file.size>RECEIPT_MAX_BYTES)throw Error('Adjunta un PDF, JPG, PNG o WebP de hasta 10 MB.');
    path=receiptPath(target.contratoId,operation.current,file.type,'comprobante-corregido');
    const {error:ue}=await supabase.storage.from('comprobantes_depositos').upload(path,file,{upsert:false});
    if(ue&&!/exists|duplicate/i.test(ue.message))throw Error('No se pudo subir el comprobante. Intenta nuevamente.');
   }
   const {error:re}=await supabase.rpc('cambiar_comprobante_deposito',{p_tipo:target.tipo,p_id:target.id,p_path:path,p_motivo:reason});
   if(re)throw Error(re.message||'No se pudo actualizar el comprobante.');
   onChanged(mode==='quitar'?'Comprobante quitado. El cambio quedó auditado.':'Comprobante actualizado. El cambio quedó auditado.');
  }catch(e){setError(e instanceof Error?e.message:'No se pudo actualizar el comprobante.');}finally{busy.current=false;setSaving(false);}
 }
 return <dialog ref={ref} className={styles.dialog} aria-labelledby="receipt-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}}>
  <div className={styles.modalHeader}><div><p>{target.titulo}</p><h2 id="receipt-title">Comprobante</h2></div><button aria-label="Cerrar comprobante" disabled={saving} onClick={onClose}><X size={20}/></button></div>
  {target.path?(url?<div className={styles.receiptPreview}>{receiptKind(target.path)==='pdf'?<iframe src={url} title="Comprobante en PDF"/>:<img src={url} alt="Comprobante del movimiento"/>}<a href={url} target="_blank" rel="noopener noreferrer">Abrir en otra pestaña <ArrowUpRight size={14}/></a></div>:!error&&<p className={styles.empty}>Cargando comprobante…</p>):<p className={styles.empty}>Este movimiento no tiene comprobante.</p>}
  {canChange&&<form onSubmit={save} className={styles.receiptForm}><fieldset disabled={saving}>
   <div className={styles.rowActions}>{target.path&&<button type="button" className={mode==='reemplazar'?styles.selected:''} onClick={()=>{setMode('reemplazar');setError('');}}>Reemplazar comprobante</button>}{target.path&&target.tipo==='movimiento'&&<button type="button" className={mode==='quitar'?styles.selected:''} onClick={()=>{setMode('quitar');setError('');}}>Quitar comprobante</button>}</div>
   {mode&&<>{mode==='reemplazar'&&<label>{target.path?'Comprobante correcto':'Adjuntar comprobante'}<input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><small>PDF o imagen · Máximo 10 MB · Acceso privado</small></label>}
    <label>Motivo del cambio<textarea maxLength={500} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ej.: se cargó el comprobante de otro cliente"/></label>
    <p className={styles.help}>El valor, la fecha y el método del movimiento no cambian. El archivo anterior se conserva y el cambio queda en la bitácora del contrato con tu usuario.</p>
    <footer className={styles.modalFooter}><button type="button" onClick={()=>setMode(target.path?'':'reemplazar')}>Cancelar</button><button className={styles.primary} type="submit">{saving?'Guardando…':mode==='quitar'?'Quitar comprobante':'Guardar comprobante'}</button></footer></>}
  </fieldset></form>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </dialog>;
}
