'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {Truck,Plus,RefreshCw} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import SupplierPackages from '@/components/suppliers/SupplierPackages';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {bogotaDay} from '@/lib/contract-calendar';
import {SERVICE_TYPES,bogotaDateTime,errorText,nextCode,normalizePhone,sumMoney,type SupplierSummary} from '@/lib/suppliers';
import styles from '@/app/dashboard/caja/caja.module.css';

type Alerts={documentos_por_vencer:{proveedor_id:string;proveedor:string;titulo:string;vence_el:string}[];
 servicios_sin_cerrar:{id:string;proveedor_id:string;proveedor:string;servicio:string;fecha_servicio:string;estado:string;numero_contrato:string}[];
 pagos_atrasados:{id:string;proveedor_id:string;proveedor:string;servicio:string;valor_empresa:number;realizado_at:string}[]};
type Sede={id:string;nombre:string};

export default function SuppliersPage(){
 return <SupplierShell activePage="proveedores" crumb="Proveedores" title="Proveedores" icon={<Truck/>} adminOnly
  description="Catálogo único de proveedores por sede: tarifas, servicios asignados a contratos, pagos y documentos.">
  {()=><SuppliersAdmin/>}
 </SupplierShell>;
}

function SuppliersAdmin(){
 const router=useRouter();
 const today=bogotaDay(new Date().toISOString())!;
 const [tab,setTab]=useState<'proveedores'|'paquetes'>('proveedores');
 const [rows,setRows]=useState<SupplierSummary[]>([]),[alerts,setAlerts]=useState<Alerts|null>(null),[sedes,setSedes]=useState<Sede[]>([]);
 const [mes,setMes]=useState(today.slice(0,7)),[sede,setSede]=useState(''),[servicio,setServicio]=useState(''),[estado,setEstado]=useState('Activo'),[q,setQ]=useState('');
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[creating,setCreating]=useState(false);

 const load=useCallback(async()=>{
  try{
   const [summary,sites]=await Promise.all([supabase.rpc('proveedores_resumen',{p_mes:`${mes}-01`}),supabase.from('sedes').select('id,nombre').order('nombre')]);
   if(summary.error)throw summary.error;
   setRows(summary.data.proveedores||[]);setAlerts(summary.data.alertas);setSedes(sites.data||[]);setError('');
  }catch(e){setError(errorText(e,'No se pudo cargar la lista de proveedores.'));}
  finally{setLoading(false);}
 },[mes]);
 useEffect(()=>{void load();},[load]);

 const types=useMemo(()=>[...new Set([...SERVICE_TYPES,...rows.map(r=>r.tipo_servicio)])].sort(),[rows]);
 const text=q.trim().toLowerCase(),digits=q.replace(/\D/g,'');
 const list=rows.filter(r=>(!sede||r.sedes.includes(sede))&&(!servicio||r.tipo_servicio===servicio)&&(!estado||r.estado===estado)
  &&(!text||r.nombre.toLowerCase().includes(text)||r.codigo.toLowerCase().includes(text)||(digits.length>=3&&(r.celular||'').includes(digits))));
 const sedeName=(id:string)=>sedes.find(s=>s.id===id)?.nombre||'—';
 const alertCount=alerts?alerts.documentos_por_vencer.length+alerts.servicios_sin_cerrar.length+alerts.pagos_atrasados.length:0;

 return <>
  <div className={styles.tabs}>
   <button className={`${styles.tab} ${tab==='proveedores'?styles.tabActive:''}`} onClick={()=>setTab('proveedores')}>Proveedores</button>
   <button className={`${styles.tab} ${tab==='paquetes'?styles.tabActive:''}`} onClick={()=>setTab('paquetes')}>Paquetes Ámbar</button>
   <Link className={styles.tab} href="/dashboard/proveedores/pagos">Pagos a proveedores →</Link>
   <Link className={styles.tab} href="/dashboard/proveedores/catalogo">Catálogo de asesoras →</Link>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {tab==='paquetes'?<SupplierPackages sedes={sedes}/>:<>
   {alertCount>0&&alerts&&<section className={styles.card}>
    <h2>Alertas ({alertCount})</h2>
    <ul className={styles.alertList}>
     {alerts.servicios_sin_cerrar.map(a=><li key={'s'+a.id}><b>{a.proveedor}</b>: {a.servicio} del contrato {a.numero_contrato} ({bogotaDateTime(a.fecha_servicio)}) sigue en {a.estado}. Márcalo Realizado o Cancelado.</li>)}
     {alerts.pagos_atrasados.map(a=><li key={'p'+a.id}><b>{a.proveedor}</b>: {a.servicio} realizado hace más de 15 días sigue pendiente de pago ({money(a.valor_empresa)}).</li>)}
     {alerts.documentos_por_vencer.map((a,i)=><li key={'d'+i}><b>{a.proveedor}</b>: el documento «{a.titulo}» vence el {a.vence_el}.</li>)}
    </ul>
   </section>}
   <div className={styles.stats}>
    <div><span>Proveedores activos</span><strong>{rows.filter(r=>r.estado==='Activo').length}</strong></div>
    <div><span>Servicios en {mes}</span><strong>{rows.reduce((t,r)=>t+Number(r.servicios_mes||0),0)}</strong></div>
    <div><span>Por pagar</span><strong className={styles.out}>{money(sumMoney(rows.map(r=>r.por_pagar)))}</strong></div>
   </div>
   <section className={styles.card}>
    <div className={styles.toolbar} style={{marginBottom:14}}>
     <label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nombre, código o celular"/></label>
     <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
     <label>Servicio<select value={servicio} onChange={e=>setServicio(e.target.value)}><option value="">Todos</option>{types.map(t=><option key={t}>{t}</option>)}</select></label>
     <label>Estado<select value={estado} onChange={e=>setEstado(e.target.value)}><option value="">Todos</option><option>Activo</option><option>Inactivo</option></select></label>
     <label>Mes<input type="month" value={mes} onChange={e=>{if(e.target.value){setLoading(true);setMes(e.target.value);}}}/></label>
     <div className={styles.actions}>
      <button className={styles.button} onClick={()=>{setLoading(true);void load();}} disabled={loading}><RefreshCw size={14} style={{display:'inline',verticalAlign:'-2px'}}/> {loading?'Cargando…':'Actualizar'}</button>
      <button className={`${styles.button} ${styles.primary}`} onClick={()=>setCreating(true)}><Plus size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Nuevo proveedor</button>
     </div>
    </div>
    <div className={styles.tableScroll}><table className={styles.table}>
     <thead><tr><th>Código</th><th>Proveedor</th><th>Servicio</th><th>Sedes</th><th>Celular</th><th>Servicios del mes</th><th>Por pagar</th><th>Estado</th></tr></thead>
     <tbody>{list.map(r=><tr key={r.id} className={styles.clickable} onClick={()=>router.push(`/dashboard/proveedores/${r.id}`)}>
      <td>{r.codigo}</td><td><b>{r.nombre}</b>{r.tiene_usuario&&<small>Con acceso al portal</small>}</td><td>{r.tipo_servicio}</td>
      <td>{r.sedes.map(sedeName).join(', ')||'—'}</td><td>{r.celular||'—'}</td><td>{r.servicios_mes}</td>
      <td className={Number(r.por_pagar)>0?styles.out:''}>{money(r.por_pagar)}</td>
      <td><span className={`${styles.badge} ${r.estado==='Activo'?styles.badgeIn:styles.badgeWarn}`}>{r.estado}</span></td></tr>)}</tbody>
    </table></div>
    {!list.length&&!loading&&<p className={styles.empty}>{rows.length?'Ningún proveedor coincide con los filtros.':'Aún no hay proveedores. Crea el primero o carga el Excel de proveedores.'}</p>}
   </section>
  </>}
  {creating&&<NewSupplier sedes={sedes} codes={rows.map(r=>r.codigo)} onClose={()=>setCreating(false)} onCreated={id=>router.push(`/dashboard/proveedores/${id}`)}/>}
 </>;
}

function NewSupplier({sedes,codes,onClose,onCreated}:{sedes:Sede[];codes:string[];onClose:()=>void;onCreated:(id:string)=>void}){
 const [form,setForm]=useState({codigo:nextCode('P',codes),nombre:'',tipo_servicio:'',celular:'',correo:''});
 const [selected,setSelected]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const save=async()=>{
  setError('');
  const celular=normalizePhone(form.celular);
  if(form.nombre.trim().length<2||!form.tipo_servicio)return setError('Escribe el nombre y el tipo de servicio.');
  if(celular===undefined)return setError('El celular debe tener 10 dígitos.');
  if(!selected.length)return setError('Elige al menos una sede.');
  setBusy(true);
  try{
   const {data,error}=await supabase.from('proveedores').insert({codigo:form.codigo.trim().toUpperCase(),nombre:form.nombre.trim(),tipo_servicio:form.tipo_servicio,celular,correo:form.correo.trim()||null}).select('id').single();
   if(error)throw error.code==='23505'?Error('Ese código ya existe.'):error;
   const sedesResult=await supabase.rpc('guardar_sedes_proveedor',{p_proveedor:data.id,p_sedes:selected});
   if(sedesResult.error)throw sedesResult.error;
   onCreated(data.id);
  }catch(e){setError(errorText(e,'No se pudo crear el proveedor.'));setBusy(false);}
 };
 return <div className={styles.overlay} onClick={()=>!busy&&onClose()}><div className={styles.dialog} onClick={e=>e.stopPropagation()}>
  <h2>Nuevo proveedor</h2>
  <div className={styles.form}>
   <div className={styles.row}><label>Código<input value={form.codigo} onChange={e=>setForm({...form,codigo:e.target.value.toUpperCase()})}/></label>
    <label>Tipo de servicio<select value={form.tipo_servicio} onChange={e=>setForm({...form,tipo_servicio:e.target.value})}><option value="">Selecciona…</option>{SERVICE_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
   <label>Nombre (persona, empresa o lugar)<input value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/></label>
   <div className={styles.row}><label>Celular<input inputMode="numeric" value={form.celular} onChange={e=>setForm({...form,celular:e.target.value})} placeholder="3001234567"/></label>
    <label>Correo<input type="email" value={form.correo} onChange={e=>setForm({...form,correo:e.target.value})}/></label></div>
   <div><p className={styles.help}>Sedes donde trabaja</p><div className={styles.actions}>{sedes.map(s=><label key={s.id} className={styles.check}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(x=>x!==s.id))}/>{s.nombre}</label>)}</div></div>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div className={styles.actions}><button className={styles.button} onClick={onClose} disabled={busy}>Cancelar</button><button className={`${styles.button} ${styles.primary}`} onClick={save} disabled={busy}>{busy?'Guardando…':'Crear proveedor'}</button></div>
  </div>
 </div></div>;
}
