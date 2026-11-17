'use client';
import ConfigSelect from '@/components/ConfigSelect';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {parseCashAmount} from '@/lib/cash';
import {errorText,nextCode} from '@/lib/suppliers';
import styles from '@/app/dashboard/caja/caja.module.css';

type Component={id?:string;servicio:string;cantidad:number};
type Pkg={id:string;codigo:string;sede_id:string;nombre:string;precio_cliente:number;comision_empleada:number;activo:boolean;paquete_componentes:Component[]};

/** Ámbar packages per site: price, employee commission and which services they include (the supplier is chosen on the contract). */
export default function SupplierPackages({sedes}:{sedes:{id:string;nombre:string}[]}){
 const [rows,setRows]=useState<Pkg[]>([]),[error,setError]=useState(''),[editing,setEditing]=useState<Pkg|'new'|null>(null),[sede,setSede]=useState('');
 const load=useCallback(async()=>{
  try{
   const {data,error}=await supabase.from('paquetes_ambar').select('id,codigo,sede_id,nombre,precio_cliente,comision_empleada,activo,paquete_componentes(id,servicio,cantidad)').order('codigo');
   if(error)throw error;
   setRows(data as Pkg[]);setError('');
  }catch(e){setError(errorText(e,'No se pudieron cargar los paquetes.'));}
 },[]);
 useEffect(()=>{void load();},[load]);
 const toggle=async(p:Pkg)=>{const {error}=await supabase.from('paquetes_ambar').update({activo:!p.activo}).eq('id',p.id);if(error)setError(error.message);else void load();};
 const list=rows.filter(r=>!sede||r.sede_id===sede);
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:14,justifyContent:'space-between'}}>
   <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <button className={`${styles.button} ${styles.primary}`} onClick={()=>setEditing('new')}>Nuevo paquete</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Código</th><th>Paquete</th><th>Sede</th><th>Incluye</th><th>Precio cliente</th><th>Comisión</th><th>Estado</th><th></th></tr></thead>
   <tbody>{list.map(p=><tr key={p.id} className={p.activo?'':styles.annulled}>
    <td>{p.codigo}</td><td><b>{p.nombre}</b></td><td>{sedes.find(s=>s.id===p.sede_id)?.nombre||'—'}</td>
    <td>{p.paquete_componentes.map(c=>`${c.cantidad>1?c.cantidad+'× ':''}${c.servicio}`).join(', ')||'—'}</td>
    <td>{money(p.precio_cliente)}</td><td>{money(p.comision_empleada)}</td><td>{p.activo?'Activo':'Inactivo'}</td>
    <td><div className={styles.actions}><button onClick={()=>setEditing(p)}>Editar</button><button onClick={()=>void toggle(p)}>{p.activo?'Desactivar':'Activar'}</button></div></td></tr>)}</tbody>
  </table></div>
  {!list.length&&<p className={styles.empty}>No hay paquetes{sede?' en esta sede':''}.</p>}
  {editing&&<PackageForm pkg={editing==='new'?null:editing} sedes={sedes} codes={rows.map(r=>r.codigo)} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);void load();}}/>}
 </section>;
}

function PackageForm({pkg,sedes,codes,onClose,onSaved}:{pkg:Pkg|null;sedes:{id:string;nombre:string}[];codes:string[];onClose:()=>void;onSaved:()=>void}){
 const [form,setForm]=useState({codigo:pkg?.codigo||nextCode('K',codes),nombre:pkg?.nombre||'',sede_id:pkg?.sede_id||'',precio:pkg?String(pkg.precio_cliente):'',comision:pkg?String(pkg.comision_empleada):'0'});
 const [parts,setParts]=useState<Component[]>(pkg?.paquete_componentes.map(c=>({...c}))||[]);
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{
  setError('');
  const precio=form.precio.trim()==='0'?0:parseCashAmount(form.precio),comision=form.comision.trim()==='0'?0:parseCashAmount(form.comision);
  if(form.nombre.trim().length<2||!form.sede_id)return setError('Escribe el nombre y elige la sede.');
  if(precio===null||comision===null)return setError('Revisa el precio y la comisión.');
  const clean=parts.filter(p=>p.servicio);
  if(new Set(clean.map(p=>p.servicio)).size!==clean.length)return setError('Cada servicio va una sola vez; usa la cantidad.');
  setBusy(true);
  try{
   const values={codigo:form.codigo.trim().toUpperCase(),nombre:form.nombre.trim(),sede_id:form.sede_id,precio_cliente:precio,comision_empleada:comision};
   const saved=pkg?await supabase.from('paquetes_ambar').update(values).eq('id',pkg.id).select('id').single():await supabase.from('paquetes_ambar').insert(values).select('id').single();
   if(saved.error)throw saved.error.code==='23505'?Error('Ese código ya existe.'):saved.error;
   // Components are never removed: an existing service updates its quantity, a new one is added.
   for(const p of clean){
    const existing=pkg?.paquete_componentes.find(c=>c.servicio===p.servicio);
    const r=existing?.id?await supabase.from('paquete_componentes').update({cantidad:p.cantidad}).eq('id',existing.id):await supabase.from('paquete_componentes').insert({paquete_id:saved.data.id,servicio:p.servicio,cantidad:p.cantidad});
    if(r.error)throw r.error;
   }
   const removed=(pkg?.paquete_componentes||[]).filter(c=>!clean.some(p=>p.servicio===c.servicio));
   if(removed.length)throw Error(`Guardado. Para quitar ${removed.map(r=>r.servicio).join(', ')} desactiva este paquete y crea uno nuevo: los componentes no se borran.`);
   onSaved();
  }catch(e){setError(errorText(e,'No se pudo guardar el paquete.'));setBusy(false);}
 };
 return <div className={styles.overlay} onClick={()=>!busy&&onClose()}><div className={styles.dialog} onClick={e=>e.stopPropagation()}>
  <h2>{pkg?'Editar paquete':'Nuevo paquete Ámbar'}</h2>
  <div className={styles.form}>
   <div className={styles.row}><label>Código<input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value.toUpperCase()})}/></label>
    <label>Sede<select value={form.sede_id} onChange={e=>setForm({...form,sede_id:e.target.value})}><option value="">Selecciona…</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label></div>
   <label>Nombre<input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Vestido premium + sesión"/></label>
   <div className={styles.row}><label>Precio al cliente<input inputMode="decimal" value={form.precio} onChange={e=>setForm({...form,precio:e.target.value})}/></label>
    <label>Comisión empleada<input inputMode="decimal" value={form.comision} onChange={e=>setForm({...form,comision:e.target.value})}/></label></div>
   <div><p className={styles.help}>Servicios que incluye (el proveedor se elige al asignarlo al contrato)</p>
    {parts.map((p,i)=><div key={i} className={styles.row} style={{marginBottom:6}}>
     <ConfigSelect lista="prov_tipos_servicio" value={p.servicio} placeholder="Servicio…" editable={false} onChange={v=>setParts(parts.map((x,j)=>j===i?{...x,servicio:v}:x))}/>
     <input type="number" min={1} max={50} value={p.cantidad} onChange={e=>setParts(parts.map((x,j)=>j===i?{...x,cantidad:Math.max(1,Math.min(50,Number(e.target.value)||1))}:x))}/>
    </div>)}
    <button className={styles.button} onClick={()=>setParts([...parts,{servicio:'',cantidad:1}])}>+ Agregar servicio</button></div>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div className={styles.actions}><button className={styles.button} onClick={onClose} disabled={busy}>Cerrar</button><button className={`${styles.button} ${styles.primary}`} onClick={save} disabled={busy}>{busy?'Guardando…':'Guardar'}</button></div>
  </div>
 </div></div>;
}
