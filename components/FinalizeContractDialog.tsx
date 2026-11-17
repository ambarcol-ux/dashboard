'use client';
import MoneyInput from '@/components/MoneyInput';
import {useEffect,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money,depositSummary,type DepositReturn,type DepositContract} from '@/lib/deposits';
import {closingAmounts} from '@/lib/finalize-deposit';
import {pendienteTexto} from '@/lib/saldo';
import {collectPages} from '@/lib/collect-pages';
import styles from '@/app/dashboard/devoluciones-depositos/deposits.module.css';
export default function FinalizeContractDialog({contract,onClose,onSaved}:{contract:{id:string;numero_contrato:string};onClose:()=>void;onSaved:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null),busy=useRef(false);
 const [preview,setPreview]=useState<{available:number;request:any}|null>(null);
 const [discount,setDiscount]=useState('0'),[reason,setReason]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false);
 useEffect(()=>{
  dialog.current?.showModal();let live=true;
  void (async()=>{
   const [c,returns,requests]=await Promise.all([
    supabase.from('contratos').select('id,valor_deposito,estado,saldo,total_multas').eq('id',contract.id).single(),
    collectPages<DepositReturn>((a,b)=>supabase.from('devoluciones_depositos').select('*').eq('contrato_id',contract.id).order('id').range(a,b)),
    supabase.from('solicitudes_depositos').select('id,monto,descuento,motivo,estado').eq('contrato_id',contract.id).in('estado',['pendiente','en_proceso','pagado']).order('created_at').limit(1),
   ]);
   if(c.error||requests.error)throw new Error('No se pudo consultar el depósito. Cierra y vuelve a intentar.');
   if(!c.data||c.data.estado?.toLowerCase()!=='mantenimiento')throw new Error('Actualiza el contrato: debe estar en mantenimiento.');
   if(Number(c.data.saldo||0)+Number(c.data.total_multas||0)>0)throw new Error(`El contrato tiene ${pendienteTexto(c.data.saldo,c.data.total_multas)} y no puede finalizarse.`);
   const available=depositSummary(c.data as unknown as DepositContract,returns).available;
   if(available<0)throw new Error('Revisa el saldo del depósito antes de finalizar.');
   if(live)setPreview({available,request:requests.data?.[0]??null});
  })().catch(e=>{if(live)setError(e.message);});
  return()=>{live=false;};
 },[contract.id]);
 const refund=preview?.request?Number(preview.request.monto):Math.max(0,(preview?.available??0)-Number(discount||0));
 async function submit(e:React.FormEvent){
  e.preventDefault();if(!preview||busy.current)return;
  setError('');busy.current=true;setSaving(true);
  try{
   const amounts=closingAmounts(preview.available,preview.request?'0':discount,reason);
   const {data,error}=await supabase.rpc('finalizar_contrato_con_deposito',{
    p_contrato:contract.id,p_descuento:amounts.discount,p_motivo:preview.request?'':reason.trim(),
    p_saldo_esperado:preview.available,p_solicitud_esperada:preview.request?.id??null,
   });
   if(error)throw new Error(error.message);
   if(!data?.finalizado)throw new Error('No se confirmó el cierre del contrato.');
   window.dispatchEvent(new Event('depositos-actualizados'));onSaved();
  }catch(e){setError(e instanceof Error?e.message:'No se pudo finalizar el contrato.');}
  finally{busy.current=false;setSaving(false);}
 }
 return <dialog ref={dialog} className={styles.dialog} aria-labelledby="finalize-contract-title" onCancel={e=>{e.preventDefault();if(!saving)onClose();}}>
  <form onSubmit={submit}>
   <header className={styles.modalHeader}><div><p>Contrato {contract.numero_contrato}</p><h2 id="finalize-contract-title">Revisar depósito antes de finalizar</h2></div></header>
   <p>Al confirmar se finalizará el contrato y se liberarán los vestidos, incluso si quedan días de mantenimiento.</p>
   {!preview&&!error&&<p role="status">Consultando el saldo del depósito…</p>}
   {preview&&<fieldset disabled={saving}>
    <div className={styles.available}>Saldo disponible del depósito <strong>{money(preview.available)}</strong></div>
    {preview.request?<><p>Ya existe una solicitud de devolución. Se conservarán sus importes y su estado.</p><p>Descuento registrado: {money(Number(preview.request.descuento))} · {preview.request.motivo||'Sin motivo de descuento'}</p></>:<>
     <label>Descuento por daño o cobro (COP)<MoneyInput type="number" min="0" max={preview.available} step="0.01" required value={discount} onChange={e=>setDiscount(e.target.value)}/></label>
     <label>Motivo del descuento{Number(discount)>0?' (obligatorio)':''}<textarea required={Number(discount)>0} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Describe el daño o cobro acordado con el cliente"/></label>
    </>}
    <div className={styles.available}>Valor a devolver al cliente <strong>{money(Number.isFinite(refund)?refund:0)}</strong></div>
    <p>{preview.request?'Se mantendrá la solicitud existente.':preview.available>0?'Contabilidad recibirá la solicitud con este descuento y valor a devolver.':'Este contrato no tiene saldo de depósito por devolver.'} El depósito original se conserva.</p>
   </fieldset>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <footer className={styles.modalFooter}><button type="button" disabled={saving} onClick={onClose}>Cancelar</button><button className={styles.primary} type="submit" disabled={saving||!preview}>{saving?'Finalizando…':'Confirmar y finalizar contrato'}</button></footer>
  </form>
 </dialog>;
}
