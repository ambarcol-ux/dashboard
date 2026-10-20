'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Truck,KeyRound} from 'lucide-react';
import SupplierShell,{openSupplierFile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {parseCashAmount} from '@/lib/cash';
import {bogotaDay} from '@/lib/contract-calendar';
import {DOC_TYPES,SERVICE_TYPES,bogotaDateTime,defaultVisibility,errorText,isLossTariff,nextCode,normalizePhone,supplierFilePath,sumMoney,tariffMargin,type Supplier,type Tariff} from '@/lib/suppliers';
import styles from '@/app/dashboard/caja/caja.module.css';

type Sede={id:string;nombre:string};
type Service={id:string;servicio:string;fecha_servicio:string;estado:string;estado_pago:string;valor_empresa:number;valor_cliente:number;recurso:string|null;contratos:{numero_contrato:string;cliente_nombre:string}|null};
type Payment={id:string;fecha_pago:string;valor_total:number;medio_pago:string;referencia:string|null;comprobante_path:string|null;anulado_at:string|null;motivo_anulacion:string|null};
type Doc={id:string;tipo:string;titulo:string;archivo_path:string;visibilidad:string;visible_proveedor:boolean;vence_el:string|null;activo:boolean;subido_en:string};
type Tab='datos'|'tarifas'|'servicios'|'pagos'|'documentos';

export default function SupplierFilePage(){
 const {id}=useParams<{id:string}>();
 return <SupplierShell activePage="proveedores" backHref="/dashboard/proveedores" crumb="Proveedores / Ficha" title="Ficha del proveedor" icon={<Truck/>} adminOnly
  description="Datos, sedes, tarifas, servicios asignados, pagos y documentos del proveedor.">
  {()=><SupplierFile id={id}/>}
 </SupplierShell>;
}

function SupplierFile({id}:{id:string}){
 const [tab,setTab]=useState<Tab>('datos');
 const [supplier,setSupplier]=useState<Supplier|null>(null),[sedes,setSedes]=useState<Sede[]>([]),[mySedes,setMySedes]=useState<string[]>([]);
 const [tariffs,setTariffs]=useState<Tariff[]>([]),[allTariffCodes,setAllTariffCodes]=useState<string[]>([]),[services,setServices]=useState<Service[]>([]),[payments,setPayments]=useState<Payment[]>([]),[docs,setDocs]=useState<Doc[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[password,setPassword]=useState('');

 const load=useCallback(async()=>{
  try{
  const [s,allSedes,ps,t,codes,sv,pg,d]=await Promise.all([
   supabase.from('proveedores').select('*').eq('id',id).maybeSingle(),
   supabase.from('sedes').select('id,nombre').order('nombre'),
   supabase.from('proveedor_sedes').select('sede_id').eq('proveedor_id',id).eq('activa',true),
   supabase.from('proveedor_tarifas').select('*').eq('proveedor_id',id).order('activa',{ascending:false}).order('codigo'),
   supabase.from('proveedor_tarifas').select('codigo'),
   supabase.from('contrato_servicios').select('id,servicio,fecha_servicio,estado,estado_pago,valor_empresa,valor_cliente,recurso,contratos(numero_contrato,cliente_nombre)').eq('proveedor_id',id).order('fecha_servicio',{ascending:false}).limit(300),
   supabase.from('pagos_proveedor').select('id,fecha_pago,valor_total,medio_pago,referencia,comprobante_path,anulado_at,motivo_anulacion').eq('proveedor_id',id).order('fecha_pago',{ascending:false}),
   supabase.from('documentos_proveedor').select('id,tipo,titulo,archivo_path,visibilidad,visible_proveedor,vence_el,activo,subido_en').eq('proveedor_id',id).order('subido_en',{ascending:false}),
  ]);
  const failed=[s,allSedes,ps,t,codes,sv,pg,d].find(r=>r.error);
  if(failed?.error)throw failed.error;
  if(!s.data)throw Error('Proveedor no encontrado.');
  setSupplier(s.data as Supplier);setSedes(allSedes.data||[]);setMySedes((ps.data||[]).map(r=>r.sede_id));
  setTariffs((t.data||[]) as Tariff[]);setAllTariffCodes((codes.data||[]).map(r=>r.codigo));setServices((sv.data||[]) as unknown as Service[]);setPayments((pg.data||[]) as Payment[]);setDocs((d.data||[]) as Doc[]);setError('');
  }catch(e){setError(errorText(e,'No se pudo cargar el proveedor.'));}
 },[id]);
 useEffect(()=>{void load();},[load]);
 const done=(message:string)=>{setNotice(message);void load();};

 const createUser=async()=>{
  setError('');setNotice('');
  if(!supplier?.correo)return setError('Primero guarda el correo del proveedor en la pestaña Datos.');
  if(!confirm(`¿Crear el acceso al portal para ${supplier.nombre} con el correo ${supplier.correo}?`))return;
  const {data:{session}}=await supabase.auth.getSession();
  const res=await fetch('/api/proveedores/usuario',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({proveedor_id:id})});
  const body=await res.json().catch(()=>({}));
  if(!res.ok)return setError(body.error||'No se pudo crear el usuario.');
  setPassword(body.password);done('Usuario creado.');
 };

 if(!supplier)return error?<p role="alert" className={styles.error}>{error}</p>:<p className={styles.empty}>Cargando proveedor…</p>;
 const year=String(new Date().getFullYear());
 const active=services.filter(s=>s.estado!=='Cancelado');
 const pending=sumMoney(services.filter(s=>s.estado_pago==='Pendiente').map(s=>s.valor_empresa));
 const paidYear=sumMoney(payments.filter(p=>!p.anulado_at&&p.fecha_pago.startsWith(year)).map(p=>p.valor_total));
 return <>
  <section className={styles.card}>
   <div className={styles.actions} style={{justifyContent:'space-between'}}>
    <div><h2>{supplier.codigo} · {supplier.nombre}</h2><p className={styles.help}>{supplier.tipo_servicio} · {mySedes.map(s=>sedes.find(x=>x.id===s)?.nombre).join(', ')||'Sin sede'} · {supplier.celular||'Sin celular'} · <span className={`${styles.badge} ${supplier.estado==='Activo'?styles.badgeIn:styles.badgeWarn}`}>{supplier.estado}</span></p></div>
    {supplier.usuario_id?<span className={`${styles.badge} ${styles.badgeIn}`}>Tiene acceso al portal</span>
     :<button className={`${styles.button} ${styles.primary}`} onClick={createUser}><KeyRound size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Crear usuario</button>}
   </div>
   {password&&<p className={styles.notice}>Acceso creado. Comparte con el proveedor: usuario <b>{supplier.correo}</b>, contraseña temporal <b>{password}</b>. Entra por /login y puede cambiarla con «¿Olvidaste tu contraseña?». Esta contraseña no se volverá a mostrar.</p>}
  </section>
  <div className={styles.stats}>
   <div><span>Servicios asignados</span><strong>{active.length}</strong></div>
   <div><span>Pendiente por pagar</span><strong className={styles.out}>{money(pending)}</strong></div>
   <div><span>Pagado en {year}</span><strong className={styles.in}>{money(paidYear)}</strong></div>
  </div>
  <div className={styles.tabs}>{(['datos','tarifas','servicios','pagos','documentos'] as Tab[]).map(t=><button key={t} className={`${styles.tab} ${tab===t?styles.tabActive:''}`} onClick={()=>{setTab(t);setNotice('');}}>{t[0].toUpperCase()+t.slice(1)}</button>)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {tab==='datos'&&<DataTab supplier={supplier} sedes={sedes} mySedes={mySedes} onDone={done} onError={setError}/>}
  {tab==='tarifas'&&<TariffsTab supplierId={id} tariffs={tariffs} codes={allTariffCodes} sedes={sedes} mySedes={mySedes} defaultService={supplier.tipo_servicio} onDone={done} onError={setError}/>}
  {tab==='servicios'&&<section className={styles.card}><div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Fecha</th><th>Contrato</th><th>Servicio</th><th>Valor empresa</th><th>Valor cliente</th><th>Estado</th><th>Pago</th></tr></thead>
   <tbody>{services.map(s=><tr key={s.id} className={s.estado==='Cancelado'?styles.annulled:''}><td>{bogotaDateTime(s.fecha_servicio)}</td><td>{s.contratos?.numero_contrato}<small>{s.contratos?.cliente_nombre}</small></td>
    <td>{s.servicio}{s.recurso&&<small>{s.recurso}</small>}</td><td>{money(s.valor_empresa)}</td><td>{money(s.valor_cliente)}</td><td>{s.estado}</td><td>{s.estado_pago}</td></tr>)}</tbody>
  </table></div>{!services.length&&<p className={styles.empty}>Aún no tiene servicios asignados.</p>}</section>}
  {tab==='pagos'&&<section className={styles.card}>
   <p><Link href={`/dashboard/proveedores/pagos?proveedor=${id}`} className={styles.back}>Registrar un pago →</Link></p>
   <div className={styles.tableScroll}><table className={styles.table}>
    <thead><tr><th>Fecha</th><th>Valor</th><th>Medio</th><th>Referencia</th><th>Comprobante</th><th>Estado</th></tr></thead>
    <tbody>{payments.map(p=><tr key={p.id} className={p.anulado_at?styles.annulled:''}><td>{p.fecha_pago}</td><td>{money(p.valor_total)}</td><td>{p.medio_pago}</td><td>{p.referencia||'—'}</td>
     <td>{p.comprobante_path?<button className={styles.button} onClick={()=>void openSupplierFile('comprobantes_proveedores',p.comprobante_path!).catch(e=>setError(errorText(e,'')))}>Ver</button>:'—'}</td>
     <td>{p.anulado_at?`Anulado: ${p.motivo_anulacion||''}`:'Vigente'}</td></tr>)}</tbody>
   </table></div>{!payments.length&&<p className={styles.empty}>Sin pagos registrados.</p>}</section>}
  {tab==='documentos'&&<DocumentsTab supplierId={id} docs={docs} onDone={done} onError={setError}/>}
 </>;
}

function DataTab({supplier,sedes,mySedes,onDone,onError}:{supplier:Supplier;sedes:Sede[];mySedes:string[];onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [f,setF]=useState({nombre:supplier.nombre,tipo_servicio:supplier.tipo_servicio,celular:supplier.celular||'',celular_2:supplier.celular_2||'',correo:supplier.correo||'',documento:supplier.documento||'',
  banco:supplier.banco||'',tipo_cuenta:supplier.tipo_cuenta||'',numero_cuenta:supplier.numero_cuenta||'',estado:supplier.estado,notas:supplier.notas||''});
 const [selected,setSelected]=useState(mySedes),[busy,setBusy]=useState(false);
 const set=(k:keyof typeof f)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 const save=async()=>{
  const celular=normalizePhone(f.celular),celular_2=normalizePhone(f.celular_2);
  if(celular===undefined||celular_2===undefined)return onError('Los celulares deben tener 10 dígitos.');
  if(!selected.length)return onError('Elige al menos una sede.');
  setBusy(true);
  const {error}=await supabase.from('proveedores').update({nombre:f.nombre.trim(),tipo_servicio:f.tipo_servicio,celular,celular_2,correo:f.correo.trim()||null,documento:f.documento.trim()||null,
   banco:f.banco.trim()||null,tipo_cuenta:f.tipo_cuenta.trim()||null,numero_cuenta:f.numero_cuenta.trim()||null,estado:f.estado,notas:f.notas.trim()||null}).eq('id',supplier.id);
  const sedesResult=error?null:await supabase.rpc('guardar_sedes_proveedor',{p_proveedor:supplier.id,p_sedes:selected});
  setBusy(false);
  if(error||sedesResult?.error)return onError((error||sedesResult?.error)!.message);
  onDone('Datos guardados.');
 };
 return <section className={styles.card}><div className={styles.form}>
  <div className={styles.row}><label>Nombre<input value={f.nombre} onChange={set('nombre')}/></label>
   <label>Tipo de servicio<select value={f.tipo_servicio} onChange={set('tipo_servicio')}>{[...new Set([...SERVICE_TYPES,f.tipo_servicio])].map(t=><option key={t}>{t}</option>)}</select></label></div>
  <div className={styles.row}><label>Celular<input inputMode="numeric" value={f.celular} onChange={set('celular')}/></label><label>Celular 2<input inputMode="numeric" value={f.celular_2} onChange={set('celular_2')}/></label></div>
  <div className={styles.row}><label>Correo (para su usuario)<input type="email" value={f.correo} onChange={set('correo')}/></label><label>Cédula o NIT<input value={f.documento} onChange={set('documento')}/></label></div>
  <div className={styles.row}><label>Banco<input value={f.banco} onChange={set('banco')}/></label><label>Tipo de cuenta<input value={f.tipo_cuenta} onChange={set('tipo_cuenta')} placeholder="Ahorros / Corriente"/></label></div>
  <div className={styles.row}><label>Número de cuenta<input value={f.numero_cuenta} onChange={set('numero_cuenta')}/></label>
   <label>Estado<select value={f.estado} onChange={set('estado')}><option>Activo</option><option>Inactivo</option></select></label></div>
  <div><p className={styles.help}>Sedes donde trabaja</p><div className={styles.actions}>{sedes.map(s=><label key={s.id} className={styles.check}><input type="checkbox" checked={selected.includes(s.id)} onChange={e=>setSelected(e.target.checked?[...selected,s.id]:selected.filter(x=>x!==s.id))}/>{s.nombre}</label>)}</div></div>
  <label>Notas<textarea rows={3} value={f.notas} onChange={set('notas')}/></label>
  <p className={styles.help}>Un proveedor nunca se borra: se marca Inactivo y deja de aparecer en el catálogo.</p>
  <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} onClick={save} disabled={busy}>{busy?'Guardando…':'Guardar datos'}</button></div>
 </div></section>;
}

const emptyTariff={sede_id:'',servicio:'',descripcion:'',recurso:'',valor_empresa:'',valor_cliente:'',adicional_valor:'',adicional_detalle:'',adicional_opcional:''};
function TariffsTab({supplierId,tariffs,codes,sedes,mySedes,defaultService,onDone,onError}:{supplierId:string;tariffs:Tariff[];codes:string[];sedes:Sede[];mySedes:string[];defaultService:string;onDone:(m:string)=>void;onError:(m:string)=>void}){
 const today=bogotaDay(new Date().toISOString())!;
 const [form,setForm]=useState<typeof emptyTariff|null>(null),[replacing,setReplacing]=useState<Tariff|null>(null),[busy,setBusy]=useState(false);
 const sedeName=(id:string)=>sedes.find(s=>s.id===id)?.nombre||'—';
 const startNew=()=>{setReplacing(null);setForm({...emptyTariff,sede_id:mySedes[0]||'',servicio:defaultService});};
 const startReplace=(t:Tariff)=>{setReplacing(t);setForm({sede_id:t.sede_id,servicio:t.servicio,descripcion:t.descripcion,recurso:t.recurso||'',valor_empresa:String(t.valor_empresa),valor_cliente:String(t.valor_cliente),
  adicional_valor:String(t.adicional_valor||''),adicional_detalle:t.adicional_detalle||'',adicional_opcional:t.adicional_opcional||''});};
 const amount=(v:string)=>v.trim()===''||v.trim()==='0'?0:parseCashAmount(v);
 const save=async()=>{
  if(!form)return;
  const ve=amount(form.valor_empresa),vc=amount(form.valor_cliente),va=amount(form.adicional_valor);
  if(!form.sede_id||!form.servicio)return onError('Elige la sede y el servicio.');
  if(ve===null||vc===null||va===null||!form.valor_empresa.trim()||!form.valor_cliente.trim())return onError('Revisa los valores.');
  const values={valor_cliente:vc,valor_empresa:ve,adicional_valor:va};
  if(isLossTariff(values)&&!confirm(`Alerta: el precio al cliente (${money(vc)}) es menor que el costo (${money(ve+va)}). Margen ${money(tariffMargin(values))}. ¿Guardar de todos modos?`))return;
  setBusy(true);
  try{
   if(replacing){ // Price change: close the current tariff and open a new one from today.
    const {error}=await supabase.from('proveedor_tarifas').update({activa:false,vigente_hasta:today<replacing.vigente_desde?replacing.vigente_desde:today}).eq('id',replacing.id);
    if(error)throw error;
   }
   const {error}=await supabase.from('proveedor_tarifas').insert({codigo:nextCode('T',codes),proveedor_id:supplierId,sede_id:form.sede_id,servicio:form.servicio,descripcion:form.descripcion.trim(),recurso:form.recurso.trim()||null,
    ...values,adicional_detalle:form.adicional_detalle.trim()||null,adicional_opcional:form.adicional_opcional.trim()||null,vigente_desde:today});
   if(error)throw error;
   setForm(null);setReplacing(null);onDone(replacing?'Tarifa reemplazada: la anterior quedó cerrada y los contratos ya asignados no cambian.':'Tarifa creada.');
  }catch(e){onError(errorText(e,'No se pudo guardar la tarifa.'));}
  finally{setBusy(false);}
 };
 const toggle=async(t:Tariff)=>{const {error}=await supabase.from('proveedor_tarifas').update({activa:!t.activa}).eq('id',t.id);if(error)onError(error.message);else onDone(t.activa?'Tarifa desactivada.':'Tarifa activada.');};
 const set=(k:keyof typeof emptyTariff)=>(e:{target:{value:string}})=>form&&setForm({...form,[k]:e.target.value});
 return <section className={styles.card}>
  <div className={styles.actions} style={{marginBottom:12}}><button className={`${styles.button} ${styles.primary}`} onClick={startNew}>Nueva tarifa</button></div>
  {form&&<div className={styles.form} style={{marginBottom:18,borderBottom:'1px solid #e2e8f0',paddingBottom:18}}>
   <h2>{replacing?`Cambio de precio de ${replacing.codigo}`:'Nueva tarifa'}</h2>
   <div className={styles.row}><label>Sede<select value={form.sede_id} onChange={set('sede_id')}><option value="">Selecciona…</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <label>Servicio<select value={form.servicio} onChange={set('servicio')}><option value="">Selecciona…</option>{[...new Set([...SERVICE_TYPES,form.servicio].filter(Boolean))].map(t=><option key={t}>{t}</option>)}</select></label></div>
   <label>Descripción del paquete<textarea rows={2} value={form.descripcion} onChange={set('descripcion')} placeholder="Sesión 2 horas, 30 fotos + 15 impresas"/></label>
   <label>Recurso (caballo o lugar, opcional)<input value={form.recurso} onChange={set('recurso')}/></label>
   <div className={styles.row}><label>Valor a empresa (se le paga al proveedor)<input inputMode="decimal" value={form.valor_empresa} onChange={set('valor_empresa')}/></label>
    <label>Valor al cliente<input inputMode="decimal" value={form.valor_cliente} onChange={set('valor_cliente')}/></label></div>
   <div className={styles.row}><label>Adicional obligatorio (valor)<input inputMode="decimal" value={form.adicional_valor} onChange={set('adicional_valor')}/></label>
    <label>Detalle del adicional<input value={form.adicional_detalle} onChange={set('adicional_detalle')} placeholder="Transporte del fotógrafo"/></label></div>
   <label>Adicional opcional<input value={form.adicional_opcional} onChange={set('adicional_opcional')} placeholder="Domicilio $160.000"/></label>
   <div className={styles.actions}><button className={styles.button} onClick={()=>{setForm(null);setReplacing(null);}} disabled={busy}>Cancelar</button><button className={`${styles.button} ${styles.primary}`} onClick={save} disabled={busy}>{busy?'Guardando…':'Guardar tarifa'}</button></div>
  </div>}
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Código</th><th>Sede</th><th>Servicio</th><th>Valor empresa</th><th>Valor cliente</th><th>Adicional</th><th>Margen</th><th>Vigencia</th><th></th></tr></thead>
   <tbody>{tariffs.map(t=>{const m=tariffMargin(t);return <tr key={t.id} className={t.activa?'':styles.annulled}>
    <td>{t.codigo}</td><td>{sedeName(t.sede_id)}</td><td>{t.servicio}<small>{t.descripcion}{t.recurso?` · ${t.recurso}`:''}</small></td>
    <td>{money(t.valor_empresa)}</td><td>{money(t.valor_cliente)}</td><td>{t.adicional_valor?money(t.adicional_valor):'—'}<small>{t.adicional_detalle||''}</small></td>
    <td className={m<0?styles.out:styles.in}>{money(m)}{m<0&&<small>⚠ Precio menor que el costo</small>}</td>
    <td>{t.vigente_desde}{t.vigente_hasta?` → ${t.vigente_hasta}`:' → vigente'}</td>
    <td><div className={styles.actions}>{t.activa&&<button onClick={()=>startReplace(t)}>Cambiar precio</button>}<button onClick={()=>void toggle(t)}>{t.activa?'Desactivar':'Activar'}</button></div></td></tr>;})}</tbody>
  </table></div>
  {!tariffs.length&&<p className={styles.empty}>Sin tarifas. Las asesoras solo ven proveedores con tarifas activas en la sede del contrato.</p>}
 </section>;
}

function DocumentsTab({supplierId,docs,onDone,onError}:{supplierId:string;docs:Doc[];onDone:(m:string)=>void;onError:(m:string)=>void}){
 const [f,setF]=useState({tipo:'Condiciones',titulo:'',visibilidad:'Asesora',visible_proveedor:false,vence_el:''});
 const [file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false),[key,setKey]=useState(0);
 const upload=async()=>{
  if(!file||f.titulo.trim().length<2)return onError('Elige el archivo y escribe el título.');
  if(file.size>15*1024*1024)return onError('El archivo supera 15 MB.');
  setBusy(true);
  try{
   const path=supplierFilePath(supplierId,file.type);
   const up=await supabase.storage.from('documentos_proveedores').upload(path,file,{contentType:file.type});
   if(up.error)throw up.error;
   const {error}=await supabase.from('documentos_proveedor').insert({proveedor_id:supplierId,tipo:f.tipo,titulo:f.titulo.trim(),archivo_path:path,visibilidad:f.visibilidad,visible_proveedor:f.visible_proveedor,vence_el:f.vence_el||null});
   if(error)throw error;
   setF({tipo:'Condiciones',titulo:'',visibilidad:'Asesora',visible_proveedor:false,vence_el:''});setFile(null);setKey(k=>k+1);onDone('Documento subido.');
  }catch(e){onError(errorText(e,'No se pudo subir el documento.'));}
  finally{setBusy(false);}
 };
 const update=async(d:Doc,values:Partial<Doc>,message:string)=>{const {error}=await supabase.from('documentos_proveedor').update(values).eq('id',d.id);if(error)onError(error.message);else onDone(message);};
 return <section className={styles.card}>
  <div className={styles.form} style={{marginBottom:18}}>
   <div className={styles.row}><label>Tipo<select value={f.tipo} onChange={e=>setF({...f,tipo:e.target.value,visibilidad:defaultVisibility(e.target.value)})}>{DOC_TYPES.map(t=><option key={t}>{t}</option>)}</select></label>
    <label>Título<input value={f.titulo} onChange={e=>setF({...f,titulo:e.target.value})} placeholder="Condiciones 2026"/></label></div>
   <div className={styles.row}><label>Visibilidad<select value={f.visibilidad} disabled={defaultVisibility(f.tipo)==='Interno'} onChange={e=>setF({...f,visibilidad:e.target.value})}><option value="Asesora">Asesora (asesoras y administración)</option><option value="Interno">Interno (solo administración)</option></select></label>
    <label>Vence el (opcional)<input type="date" value={f.vence_el} onChange={e=>setF({...f,vence_el:e.target.value})}/></label></div>
   <label className={styles.check}><input type="checkbox" checked={f.visible_proveedor} onChange={e=>setF({...f,visible_proveedor:e.target.checked})}/>El proveedor lo ve en su portal</label>
   <label>Archivo (PDF o imagen)<input key={key} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} onClick={upload} disabled={busy}>{busy?'Subiendo…':'Subir documento'}</button></div>
  </div>
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Tipo</th><th>Título</th><th>Visibilidad</th><th>Portal</th><th>Vence</th><th></th></tr></thead>
   <tbody>{docs.map(d=><tr key={d.id} className={d.activo?'':styles.annulled}><td>{d.tipo}</td><td>{d.titulo}</td><td>{d.visibilidad}</td><td>{d.visible_proveedor?'Sí':'No'}</td><td>{d.vence_el||'—'}</td>
    <td><div className={styles.actions}><button onClick={()=>void openSupplierFile('documentos_proveedores',d.archivo_path).catch(e=>onError(errorText(e,'')))}>Ver</button>
     <button onClick={()=>void update(d,{visible_proveedor:!d.visible_proveedor},'Visibilidad del portal actualizada.')}>{d.visible_proveedor?'Ocultar al proveedor':'Mostrar al proveedor'}</button>
     <button onClick={()=>void update(d,{activo:!d.activo},d.activo?'Documento retirado.':'Documento restaurado.')}>{d.activo?'Retirar':'Restaurar'}</button></div></td></tr>)}</tbody>
  </table></div>
  {!docs.length&&<p className={styles.empty}>Sin documentos.</p>}
 </section>;
}
