'use client';
import {useEffect,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import {supabase} from '@/lib/supabase';
import {emptyConfig,loadModuleConfig,minChars} from '@/lib/module-config';
import {bogotaLocalToIso,nowBogotaLocal} from '@/lib/first-visits';
import styles from '@/app/agendar-primera-cita/visits.module.css';

type Duplicates={visitas:{id:string;nombre:string;fecha:string;hora:string;sede:string;estado:string;origen:string;vinculable:boolean;pendiente:boolean}[];contratos:{id:string;numero_contrato:string;nombre:string;sede:string|null;fecha_evento:string|null}[];aliados?:{id:string;nombre:string;aliado:string|null;contrato:boolean}[];aviso?:string|null};
type Props={profile:{id:string;sede_id:string|null};onClose:()=>void;onSaved:(message:string)=>void;alContratar?:boolean;onCreated?:(id:string)=>void};
const empty={nombre:'',telefono:'',documento:'',email:'',tipo_evento:'',fecha_evento:'',como_se_entero:'',resultado:'',motivo:''};
const digits=(v:string)=>v.replace(/\D/g,'');

/** "Nueva vitrina": a client who walked in without an appointment, saved as attended and outside booking slots. */
export default function FirstVisitWalkIn({profile,onClose,onSaved,alContratar=false,onCreated}:Props){
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null);
 const [f,setF]=useState(alContratar?{...empty,resultado:'Contrato pendiente'}:empty),[sede,setSede]=useState(profile.sede_id||''),[when,setWhen]=useState(()=>nowBogotaLocal()),[asesora,setAsesora]=useState(profile.id);
 const [sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[asesoras,setAsesoras]=useState<{id:string;nombre:string|null;email:string|null}[]>([]);
 const [dups,setDups]=useState<Duplicates|null>(null),[link,setLink]=useState(''),[asNew,setAsNew]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[cfg,setCfg]=useState(emptyConfig);
 useEffect(()=>{void loadModuleConfig('primeras_visitas','pv_').then(setCfg);},[]);
 const min=minChars(cfg);
 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  void supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>{setSedes(data||[]);if(!profile.sede_id&&data?.[0])setSede(s=>s||data[0].id);});
  void supabase.from('profiles').select('id,nombre,email').eq('activo',true).in('rol',['asesora','admin','Asesora','Admin']).order('nombre').then(({data})=>setAsesoras(data||[]));
 },[profile.sede_id]);
 // Duplicate check on phone, ID card or email against visits, contracts and ally clients.
 useEffect(()=>{
  const tel=digits(f.telefono),doc=digits(f.documento),mail=/^\S+@\S+\.\S+$/.test(f.email.trim())?f.email.trim():'';
  if(tel.length<10&&doc.length<5&&!mail)return;
  let live=true;
  const t=setTimeout(()=>{void supabase.rpc('duplicados_vitrina',{p_telefono:tel,p_documento:doc,p_email:mail}).then(({data})=>{if(live){setDups(data as Duplicates);setLink('');setAsNew(false);}});},400);
  return()=>{live=false;clearTimeout(t);};
 },[f.telefono,f.documento,f.email]);
 const set=(k:keyof typeof empty)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 const hasDups=!!dups&&(dups.visitas.length>0||dups.contratos.length>0||!!dups.aliados?.length);
 const close=()=>{if(!saving)onClose();};

 const save=async(createContract:boolean)=>{
  setError('');
  const fecha_hora=bogotaLocalToIso(when);
  if(f.nombre.trim().length<2)return setError('Escribe el nombre completo.');
  if(!/^\d{10,15}$/.test(digits(f.telefono)))return setError('Revisa el teléfono: entre 10 y 15 números.');
  if(!sede||!f.tipo_evento||!f.resultado||!fecha_hora||!asesora)return setError('Completa los campos obligatorios (*).');
  if(f.resultado==='No cerró'&&f.motivo.trim().length<min)return setError(`Para no hacer seguimiento escribe el motivo (mínimo ${min} caracteres).`);
  if(hasDups&&!link&&!asNew)return setError('El teléfono o la cédula ya existen: vincula el registro existente o elige «Continuar como vitrina nueva».');
  setSaving(true);
  const {data,error}=await supabase.rpc('registrar_vitrina',{p_datos:{...f,al_contratar:alContratar,telefono:digits(f.telefono),documento:digits(f.documento),sede_id:sede,fecha_hora,asesora_id:asesora,vincular_id:link||null,forzar:asNew,sin_seguimiento:f.resultado==='No cerró'}});
  setSaving(false);
  if(error)return setError(error.message.replace(/^DUPLICADO: /,''));
  if(onCreated){onCreated(String(data));return;}
  if(createContract){router.push(`/contratos/nuevo?primeraCita=${data}`);return;}
  onSaved(link?'Visita registrada sobre el registro existente.':'Vitrina registrada como atendida.');
 };

 return <dialog ref={dialog} className={styles.dialog} onCancel={e=>{e.preventDefault();close();}}>
  <h3>{alContratar?'Registrar vitrina':'Nueva vitrina'}</h3>
  <p className={styles.notice}>Clienta que llegó a la tienda sin cita. Se guarda como atendida y no consume cupos.</p>
  <form className={styles.form} onSubmit={e=>{e.preventDefault();void save(false);}}><fieldset disabled={saving}>
   <label>Nombre completo *<input value={f.nombre} maxLength={120} onChange={set('nombre')} required/></label>
   <div className={styles.grid2}>
    <label>Teléfono *<input inputMode="numeric" value={f.telefono} onChange={set('telefono')} placeholder="3001234567" required/></label>
    <label>Cédula<input inputMode="numeric" value={f.documento} onChange={set('documento')}/></label>
   </div>
   {hasDups&&dups&&<div className={styles.warn}>
    {dups.aviso&&<p><strong>{dups.aviso}</strong></p>}
    {dups.aliados?.map(a=><p key={a.id}><strong>Clienta de aliado{a.aliado?` (${a.aliado})`:''}</strong> · {a.nombre}{a.contrato?' · con contrato':''}</p>)}
    {dups.visitas.map(v=><div key={v.id}><p><strong>Este {digits(f.telefono).length>=10?'teléfono':'documento'} ya tiene {v.origen==='vitrina'?'una vitrina':'una cita'} registrada</strong><br/>{v.nombre} · {v.origen} {v.fecha} {v.hora} · {v.sede} · {v.estado}</p>
     {v.vinculable&&<label className={styles.check}><input type="radio" name="dup" checked={link===v.id} onChange={()=>{setLink(v.id);setAsNew(false);}}/>{v.pendiente?'Registrar la llegada sobre esa cita (llegó sin avisar)':'Vincular a ese registro'}</label>}</div>)}
    {dups.contratos.map(k=><p key={k.id}><strong>Ya tiene contrato {k.numero_contrato}</strong> · {k.nombre}{k.sede?` · ${k.sede}`:''}{k.fecha_evento?` · evento ${k.fecha_evento}`:''}</p>)}
    <label className={styles.check}><input type="radio" name="dup" checked={asNew} onChange={()=>{setAsNew(true);setLink('');}}/>Continuar como vitrina nueva</label>
   </div>}
   <div className={styles.grid2}>
    <label>Correo<input type="email" value={f.email} maxLength={160} onChange={set('email')}/></label>
    <label>Sede *<select value={sede} onChange={e=>setSede(e.target.value)} required disabled={!!link}><option value="">Selecciona…</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   </div>
   <div className={styles.grid2}>
    <label>Fecha y hora de la visita *<input type="datetime-local" value={when} max={nowBogotaLocal()} onChange={e=>setWhen(e.target.value)} required/></label>
    <label>Asesora que atiende *<select value={asesora} onChange={e=>setAsesora(e.target.value)} required>{!asesoras.some(a=>a.id===asesora)&&<option value={asesora}>Yo</option>}{asesoras.map(a=><option key={a.id} value={a.id}>{a.nombre||a.email}</option>)}</select></label>
   </div>
   <div className={styles.grid2}>
    <label>Tipo de evento *<select value={f.tipo_evento} onChange={set('tipo_evento')} required><option value="">Selecciona…</option>{(cfg.lists.pv_tipos_evento_vitrina||[]).map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Fecha del evento<input type="date" value={f.fecha_evento} onChange={set('fecha_evento')}/></label>
   </div>
   <label>Cómo se enteró<select value={f.como_se_entero} onChange={set('como_se_entero')}><option value="">Sin dato</option>{(cfg.lists.pv_como_se_entero||[]).map(t=><option key={t}>{t}</option>)}</select></label>
   {!alContratar&&<label>¿Alquiló? *<select required value={f.resultado==='Cerrado'?'si':f.resultado?'no':''} onChange={e=>setF({...f,resultado:e.target.value==='si'?'Cerrado':e.target.value==='no'?'En seguimiento':''})}><option value="">Elige…</option><option value="si">Alquiló</option><option value="no">No alquiló</option></select></label>}
   {!alContratar&&f.resultado&&f.resultado!=='Cerrado'&&<label><input type="checkbox" checked={f.resultado==='No cerró'} onChange={e=>setF({...f,resultado:e.target.checked?'No cerró':'En seguimiento'})}/> No hacer seguimiento (motivo de mínimo {min} caracteres)</label>}
   <label>{f.resultado==='No cerró'?'Motivo *':'Observaciones'}<textarea maxLength={1000} value={f.motivo} onChange={set('motivo')} required={f.resultado==='No cerró'} minLength={f.resultado==='No cerró'?min:undefined}/></label>
  </fieldset>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.actions} style={{marginTop:16,justifyContent:'flex-end'}}>
   <button type="button" onClick={close} disabled={saving}>Cancelar</button>
   {!alContratar&&<button type="button" onClick={()=>void save(true)} disabled={saving||f.resultado==='No cerró'} title={f.resultado==='No cerró'?'Una visita que no cerró no genera contrato':undefined}>Guardar y crear contrato</button>}
   <button type="submit" className={styles.primary} disabled={saving}>{saving?'Guardando…':alContratar?'Registrar y usar en el contrato':'Guardar vitrina'}</button>
  </div>
  </form>
 </dialog>;
}
