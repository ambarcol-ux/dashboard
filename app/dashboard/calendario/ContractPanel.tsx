'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { X, ChevronUp, ChevronDown, ArrowUpRight, Pencil } from 'lucide-react';
import { saveCalendarContract } from '@/lib/save-calendar-contract';
import { contractEvents, milestoneTypes, type CalendarContract } from '@/lib/contract-calendar';
import { dateInput, editableDateFields, timestampFields, contactFields } from '@/lib/calendar-edit';
import PreXvFields from '@/components/PreXvFields';
import { prexvFields, includedPrexv, prexvSummary, hasPrexv, type PrexvData } from '@/lib/prexv';
import styles from './calendar.module.css';
const labels:Record<string,string>={cliente_nombre:'Nombre del cliente',quinceanera_name:'Quinceañera',cliente_email:'Correo',cliente_whatsapp:'WhatsApp',cliente_direccion:'Dirección',observaciones_vestido:'Observaciones del vestido'};
export default function ContractPanel({contract,field,onClose,onSaved,onNavigate,canPrevious,canNext}:{contract:CalendarContract;field:string;onClose:()=>void;onSaved:(c:CalendarContract)=>void;onNavigate:(direction:number)=>void;canPrevious:boolean;canNext:boolean}){
 const dialog=useRef<HTMLDialogElement>(null);
 const [editing,setEditing]=useState(false),[saving,setSaving]=useState(false),[message,setMessage]=useState('');
 const [snapshot,setSnapshot]=useState(contract);
 const [prexv,setPrexv]=useState<PrexvData>(contract);
 const prexvKeys=[...prexvFields,'fecha_pre_xv','fecha_fotografia','fecha_maquillaje'] as const;
 const prexvDirty=prexvKeys.some(k=>JSON.stringify(prexv[k]??null)!==JSON.stringify(snapshot[k]??null));
 const initial=Object.fromEntries([...contactFields,...editableDateFields].map(key=>[key,editableDateFields.includes(key as never)?dateInput(snapshot[key as keyof CalendarContract] as string):String(snapshot[key as keyof CalendarContract]||'')]));
 const [form,setForm]=useState<Record<string,string>>(initial);
 const dirty=editing&&(prexvDirty||Object.keys(initial).some(k=>form[k]!==initial[k]));
 const close=()=>{if(!saving&&(!dirty||window.confirm('Tienes cambios sin guardar. ¿Quieres descartarlos?')))onClose();};
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 const events=contractEvents([contract]);const selected=events.find(e=>e.field===field);
 const save=async()=>{
  setSaving(true);setMessage('');
  try{
   const changes=Object.fromEntries(Object.keys(initial).filter(k=>form[k]!==initial[k]).map(k=>[k,form[k]]));
   for(const key of prexvKeys) if(JSON.stringify(prexv[key]??null)!==JSON.stringify(snapshot[key]??null)) changes[key]=(['fecha_fotografia','fecha_maquillaje'].includes(key)?dateInput(prexv[key] as string):prexv[key]) as never;
   const original=Object.fromEntries([...new Set([...Object.keys(changes),...(Object.keys(changes).some(k=>(prexvKeys as readonly string[]).includes(k))?prexvKeys:[])])].map(k=>[k,snapshot[k as keyof CalendarContract]??null]));
   const data=await saveCalendarContract({id:contract.id,changes,original});
   setSnapshot(data.contract);setPrexv(data.contract);setForm(Object.fromEntries([...contactFields,...editableDateFields].map(key=>[key,editableDateFields.includes(key as never)?dateInput(data.contract[key as keyof CalendarContract] as string):String(data.contract[key as keyof CalendarContract]||'')])));onSaved(data.contract);setEditing(false);setMessage(data.warning||'Cambios guardados en el contrato.');
  }catch(e){setMessage(e instanceof Error?e.message:'Error al guardar.');}finally{setSaving(false);}
 };
 const input=(key:string,label:string,type='text')=><label key={key} className={styles.field}>{label}<input type={type} value={form[key]||''} disabled={saving} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>;
 return <dialog ref={dialog} className={styles.drawer} aria-labelledby="contract-panel-title" onCancel={e=>{e.preventDefault();close();}} onClick={e=>{if(e.target===dialog.current){const r=dialog.current.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)close();}}}>
  <div className={styles.drawerTop}><span className={styles.status}>{contract.estado}</span><div><button aria-label="Contrato anterior" disabled={!canPrevious||dirty||saving} onClick={()=>onNavigate(-1)}><ChevronUp size={19}/></button><button aria-label="Contrato siguiente" disabled={!canNext||dirty||saving} onClick={()=>onNavigate(1)}><ChevronDown size={19}/></button><button aria-label="Cerrar contrato" disabled={saving} onClick={close}><X size={20}/></button></div></div>
  <div className={styles.drawerBody}><p className={styles.drawerNumber}>{contract.numero_contrato}</p><h2 id="contract-panel-title">{contract.cliente_nombre}</h2><p className={styles.drawerSubtitle}>{selected?.label||'Contrato de vestido'} · {contract.sede}</p>
  <section className={styles.detailSection}><span>Cuándo</span><strong>{selected?new Date(selected.date+'T12:00:00').toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}):'Sin fecha asignada'}</strong><p>{selected?.time||'Sin hora asignada'} · Hora de Colombia</p></section>
  <details className={styles.clientDetails} open><summary>Cliente y contrato <ChevronDown size={16}/></summary><div><strong>{contract.cliente_nombre}</strong><p>{contract.quinceanera_name}</p><p>{contract.cliente_whatsapp||'Sin WhatsApp'}</p><p>{contract.cliente_email||'Sin correo'}</p><p>{contract.cliente_direccion}</p><hr/><p>Factura: {contract.numero_factura||'Sin asignar'}</p><p>Referencia del vestido: {contract.referencia_vestido||'Ver referencias en contrato'}</p><p>Valor: {Number(contract.valor_total||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})}</p><p>Saldo: {Number(contract.saldo||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0})}</p></div></details>
  {!editing&&<Link className={styles.depositAccess} href={`/dashboard/devoluciones-depositos?contratoId=${encodeURIComponent(contract.id)}`}><span><strong>Recibir o devolver depósito</strong><small>Gestionar depósitos de este contrato</small></span><ArrowUpRight size={20}/></Link>}
  {!editing&&hasPrexv(contract)&&<section className={styles.detailSection}><h3>Servicios PRE-XV</h3><strong>{prexvSummary(contract)}</strong>{includedPrexv(contract).map(service=><p key={service.id}>{service.label}: {contract[service.name]||'Sin asignar'} · {contract[service.confirmed]?'Confirmado':service.confirmation+' pendiente'}</p>)}</section>}
  {!editing&&contract.bloqueo_especial_referencia&&contract.bloqueo_especial_fecha&&<section className={styles.detailSection}><h3>Bloqueo fechas especiales</h3><strong>Referencia: {contract.bloqueo_especial_referencia}</strong><p>Fecha por bloquear: {new Date(contract.bloqueo_especial_fecha+'T12:00:00').toLocaleDateString('es-CO')}</p></section>}
  
  {editing?<form id="contract-edit" onInvalid={()=>setMessage('Revisa los campos marcados: la fecha de sesión PRE-XV es obligatoria y las fechas y horas deben estar completas.')} onSubmit={e=>{e.preventDefault();void save();}}><h3>Editar datos del cliente</h3>{contactFields.filter(k=>k!=='observaciones_vestido').map(k=>input(k,labels[k],k==='cliente_email'?'email':'text'))}<PreXvFields baseline={snapshot} value={prexv} onChange={patch=>setPrexv(prev=>({...prev,...patch}))} confirmations disabled={saving}/><h3>Fechas del contrato</h3>{milestoneTypes.filter(t=>editableDateFields.includes(t.field)&&!(prexv.prexv_componentes!=null&&['fecha_fotografia','fecha_maquillaje'].includes(t.field))&&!(t.field==='fecha_pre_xv'&&prexv.prexv_componentes?.length)).map(t=>input(t.field,t.label,timestampFields.includes(t.field)?'datetime-local':'date'))}<label className={styles.field}>Observaciones del vestido<textarea value={form.observaciones_vestido} disabled={saving} onChange={e=>setForm({...form,observaciones_vestido:e.target.value})}/></label></form>:<><h3>Fechas del contrato</h3><div className={styles.timeline}>{events.map(e=><div key={e.id} className={e.field===field?styles.selectedMilestone:''}><span>{e.label}</span><strong>{new Date(e.date+'T12:00:00').toLocaleDateString('es-CO')}{e.time?` · ${e.time}`:''}</strong></div>)}</div>{contract.observaciones_vestido&&<section className={styles.detailSection}><span>Observaciones</span><p>{contract.observaciones_vestido}</p></section>}</>}
  </div>{message&&<p role="status" className={styles.saveMessage}>{message}</p>}<footer className={styles.drawerFooter}>{editing?<><button disabled={saving} onClick={()=>{if(!dirty||window.confirm('¿Descartar los cambios?')){setForm(initial);setEditing(false);setMessage('');}}}>Cancelar</button><button className={styles.primary} type="submit" form="contract-edit" disabled={saving||!dirty}>{saving?'Guardando…':'Guardar cambios'}</button></>:<><Link href={`/dashboard?contratoId=${encodeURIComponent(contract.id)}`}>Contrato completo <ArrowUpRight size={16}/></Link><button className={styles.primary} onClick={()=>{setForm(initial);setPrexv(snapshot);setEditing(true);setMessage('');}}><Pencil size={15}/> Editar contrato</button></>}</footer>
 </dialog>;
}

