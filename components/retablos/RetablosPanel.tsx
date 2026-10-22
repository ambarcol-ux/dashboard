'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {RefreshCw} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {RETABLO_ESTADOS,RETABLO_TRANSICIONES,countByEstado,filterRetablos,type Retablo,type RetabloEstado,type RetabloFiltro,type RetabloHistorial,type RetabloPanel as PanelData,type RetabloTipo} from '@/lib/retablos';
import styles from '@/app/dashboard/caja/caja.module.css';

const money=(v:number|null|undefined)=>v==null?'—':new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v));
const fecha=(iso:string)=>new Date(iso).toLocaleDateString('es-CO',{timeZone:'America/Bogota'});
const Badge=({estado}:{estado:RetabloEstado})=><span className={styles.badge} style={{background:RETABLO_ESTADOS[estado].bg,color:RETABLO_ESTADOS[estado].fg}}>{RETABLO_ESTADOS[estado].label}</span>;
const EMPTY_FILTER:RetabloFiltro={q:'',estado:'',tipo:'',desde:'',hasta:'',asesora:''};

/** Retablos: panel general (contadores, tabla, filtros, estados, historial) y catálogo de tipos. */
export default function RetablosPanel(){
 const [tab,setTab]=useState<'panel'|'tipos'>('panel'),[data,setData]=useState<PanelData|null>(null),[tipos,setTipos]=useState<RetabloTipo[]>([]),[error,setError]=useState(''),[notice,setNotice]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const [p,t]=await Promise.all([supabase.rpc('retablos_panel'),supabase.rpc('retablo_tipos_lista',{p_todos:true})]);
   if(!live)return;
   if(p.error){setError(p.error.message);return;}
   setError('');setData(p.data as PanelData);setTipos((t.data||[]) as RetabloTipo[]);
  })();
  return()=>{live=false;};
 },[version]);
 const done=(m:string)=>{setNotice(m);setVersion(v=>v+1);};
 if(!data)return error?<p role="alert" className={styles.error}>{error}</p>:<p className={styles.empty}>Cargando retablos…</p>;
 return <>
  <div className={styles.tabs} role="tablist">
   <button role="tab" aria-selected={tab==='panel'} className={`${styles.tab} ${tab==='panel'?styles.tabActive:''}`} onClick={()=>setTab('panel')}>Panel</button>
   <button role="tab" aria-selected={tab==='tipos'} className={`${styles.tab} ${tab==='tipos'?styles.tabActive:''}`} onClick={()=>setTab('tipos')}>Tipos de retablo</button>
  </div>
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {tab==='panel'?<Panel data={data} tipos={tipos} onDone={done} onError={setError} onRefresh={()=>setVersion(v=>v+1)}/>:<Tipos tipos={tipos} canEdit={data.catalogo} showEmpresa={data.ve_empresa} onDone={done}/>}
 </>;
}

function Panel({data,tipos,onDone,onError,onRefresh}:{data:PanelData;tipos:RetabloTipo[];onDone:(m:string)=>void;onError:(m:string)=>void;onRefresh:()=>void}){
 const [f,setF]=useState<RetabloFiltro>(EMPTY_FILTER),[anulados,setAnulados]=useState(false),[historial,setHistorial]=useState<{r:Retablo;rows:RetabloHistorial[]}|null>(null);
 const visibles=useMemo(()=>data.retablos.filter(r=>anulados||r.estado!=='ANULADO'),[data.retablos,anulados]);
 const rows=filterRetablos(visibles,f),counts=countByEstado(data.retablos);
 const asesoras=[...new Set(data.retablos.map(r=>r.asesora).filter(Boolean))].sort() as string[];
 const set=(k:keyof RetabloFiltro,v:string)=>setF(x=>({...x,[k]:v}));
 const move=async(r:Retablo,to:RetabloEstado)=>{
  let nota='';
  if(to==='PENDIENTE'){const n=window.prompt('¿Qué hay que corregir? (vuelve a Pendiente)');if(n===null)return;nota=n;}
  else if(!window.confirm(`¿Pasar el retablo de ${r.cliente_nombre} a «${RETABLO_ESTADOS[to].label}»?${to==='ENTREGADO'?' Entregado es final: no se puede cambiar después.':''}`))return;
  const {error}=await supabase.rpc('cambiar_estado_retablo',{p_id:r.id,p_estado:to,p_nota:nota});
  if(error)onError(error.message);else onDone(`Retablo de ${r.cliente_nombre}: ${RETABLO_ESTADOS[to].label}.`);
 };
 const openHistory=async(r:Retablo)=>{const {data:h,error}=await supabase.rpc('retablo_historial_lista',{p_id:r.id});if(error)onError(error.message);else setHistorial({r,rows:(h||[]) as RetabloHistorial[]});};
 return <>
  <div className={styles.stats}>{(['PENDIENTE','PENDIENTE_RECOGER','ENTREGADO'] as RetabloEstado[]).map(e=>
   <button key={e} onClick={()=>set('estado',f.estado===e?'':e)} style={{textAlign:'left',background:RETABLO_ESTADOS[e].bg,border:f.estado===e?'2px solid #e11d48':'1px solid #e2e8f0',borderRadius:14,padding:14,cursor:'pointer'}}>
    <span style={{color:RETABLO_ESTADOS[e].fg,fontWeight:800,fontSize:12}}>{RETABLO_ESTADOS[e].label}</span><strong style={{display:'block',fontSize:26,color:RETABLO_ESTADOS[e].fg}}>{counts[e]}</strong>
   </button>)}</div>
  <section className={styles.card}>
   <div className={styles.toolbar} style={{marginBottom:12}}>
    <label>Buscar<input placeholder="Nombre, cédula, factura o contrato" value={f.q} onChange={e=>set('q',e.target.value)}/></label>
    <label>Estado<select value={f.estado} onChange={e=>set('estado',e.target.value)}><option value="">Todos</option>{(Object.keys(RETABLO_ESTADOS) as RetabloEstado[]).map(e=><option key={e} value={e}>{RETABLO_ESTADOS[e].label}</option>)}</select></label>
    <label>Tipo<select value={f.tipo} onChange={e=>set('tipo',e.target.value)}><option value="">Todos</option>{tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
    <label>Desde<input type="date" value={f.desde} onChange={e=>set('desde',e.target.value)}/></label>
    <label>Hasta<input type="date" value={f.hasta} onChange={e=>set('hasta',e.target.value)}/></label>
    {data.ve_todos&&<label>Asesora<select value={f.asesora} onChange={e=>set('asesora',e.target.value)}><option value="">Todas</option>{asesoras.map(a=><option key={a}>{a}</option>)}</select></label>}
    <label className={styles.check}><input type="checkbox" checked={anulados} onChange={e=>setAnulados(e.target.checked)}/> Ver anulados</label>
    <button className={styles.button} onClick={onRefresh}><RefreshCw size={13} style={{display:'inline'}}/> Actualizar</button>
    {(f.q||f.estado||f.tipo||f.desde||f.hasta||f.asesora)&&<button className={styles.button} onClick={()=>setF(EMPTY_FILTER)}>Limpiar filtros</button>}
   </div>
   {!data.ve_todos&&<p className={styles.help}>Ves los retablos de los contratos que tú registraste.</p>}
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Nombre</th><th>Cédula</th><th>Factura</th><th>Contrato</th><th>Tipo</th><th>Valor cliente</th>{data.ve_empresa&&<th>Valor empresa</th>}<th>Estado</th><th>Fecha</th><th>Acciones</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.id} className={r.estado==='ANULADO'?styles.annulled:''}>
     <td><strong>{r.cliente_nombre}</strong>{r.asesora&&<small>{r.asesora}{r.sede?` · ${r.sede}`:''}</small>}</td>
     <td>{r.cliente_cedula||'—'}</td><td>{r.numero_factura||'—'}</td>
     <td><Link href={`/dashboard?contratoId=${encodeURIComponent(r.contrato_id)}`}>{r.numero_contrato||'Ver'}</Link></td>
     <td>{r.tipo}</td><td>{money(r.valor_cliente)}</td>{data.ve_empresa&&<td>{money(r.valor_empresa)}</td>}
     <td><Badge estado={r.estado}/>{r.entregado_en&&<small>{fecha(r.entregado_en)}</small>}</td><td>{fecha(r.creado_en)}</td>
     <td><div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
      {data.puede_cambiar&&RETABLO_TRANSICIONES[r.estado].map(to=><button key={to} className={`${styles.button} ${to==='PENDIENTE'?'':styles.primary}`} onClick={()=>void move(r,to)}>{to==='PENDIENTE'?'Volver a Pendiente':to==='PENDIENTE_RECOGER'?'Listo para recoger':'Entregado'}</button>)}
      <button className={styles.button} onClick={()=>void openHistory(r)}>Historial</button>
     </div></td>
    </tr>)}</tbody></table></div>
   {!rows.length&&<p className={styles.empty}>{data.retablos.length?'Ningún retablo coincide con los filtros.':'Todavía no hay retablos. Se crean al guardar un contrato con «¿Incluye retablo? Sí».'}</p>}
  </section>
  {historial&&<div className={styles.overlay} role="dialog" aria-modal="true" onClick={e=>{if(e.target===e.currentTarget)setHistorial(null);}}><div className={styles.dialog}>
   <h2>Historial · {historial.r.cliente_nombre}</h2><p className={styles.help}>{historial.r.tipo} · contrato {historial.r.numero_contrato}</p>
   <ul className={styles.alertList} style={{padding:0}}>{historial.rows.map((h,i)=><li key={i}><strong>{h.estado_anterior?`${RETABLO_ESTADOS[h.estado_anterior as RetabloEstado]?.label||h.estado_anterior} → `:''}{RETABLO_ESTADOS[h.estado_nuevo as RetabloEstado]?.label||h.estado_nuevo}</strong> · {new Date(h.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · {h.usuario||'Sistema'}{h.nota&&<><br/>{h.nota}</>}</li>)}</ul>
   <div style={{display:'flex',justifyContent:'flex-end',marginTop:12}}><button className={styles.button} onClick={()=>setHistorial(null)}>Cerrar</button></div>
  </div></div>}
 </>;
}

const EMPTY_TIPO={id:'',nombre:'',ancho_cm:'',alto_cm:'',valor:'',valor_cliente:'',valor_empresa:'',activo:true};
function Tipos({tipos,canEdit,showEmpresa,onDone}:{tipos:RetabloTipo[];canEdit:boolean;showEmpresa:boolean;onDone:(m:string)=>void}){
 const [form,setForm]=useState<typeof EMPTY_TIPO|null>(null),[saving,setSaving]=useState(false),[error,setError]=useState('');
 const edit=(t:RetabloTipo)=>{setError('');setForm({id:t.id,nombre:t.nombre,ancho_cm:String(t.ancho_cm),alto_cm:String(t.alto_cm),valor:String(t.valor??''),valor_cliente:String(t.valor_cliente),valor_empresa:String(t.valor_empresa??''),activo:t.activo});};
 const num=(v:string)=>Number(String(v).replace(/[$\s.]/g,'').replace(',','.')),cm=(v:string)=>Number(String(v).trim().replace(',','.'));
 const save=async(f:typeof EMPTY_TIPO,activo=f.activo)=>{
  const datos={id:f.id||null,nombre:f.nombre.trim(),ancho_cm:cm(f.ancho_cm),alto_cm:cm(f.alto_cm),valor:num(f.valor),valor_cliente:num(f.valor_cliente),valor_empresa:num(f.valor_empresa),activo};
  if(datos.nombre.length<2){setError('Escribe el nombre del tipo.');return;}
  if([datos.ancho_cm,datos.alto_cm,datos.valor,datos.valor_cliente,datos.valor_empresa].some(v=>!Number.isFinite(v)||v<=0)){setError('La medida y los valores deben ser mayores que cero.');return;}
  setSaving(true);setError('');
  const {error:re}=await supabase.rpc('guardar_retablo_tipo',{p_datos:datos});
  setSaving(false);if(re){setError(re.message);return;}
  setForm(null);onDone(f.id?(activo===f.activo?'Tipo actualizado.':activo?'Tipo activado.':'Tipo desactivado: ya no aparece en el contrato.'):'Tipo creado.');
 };
 const toggle=(t:RetabloTipo)=>{const f={id:t.id,nombre:t.nombre,ancho_cm:String(t.ancho_cm),alto_cm:String(t.alto_cm),valor:String(t.valor??''),valor_cliente:String(t.valor_cliente),valor_empresa:String(t.valor_empresa??''),activo:t.activo};void save(f,!t.activo);};
 const field=(k:keyof typeof EMPTY_TIPO,label:string,mode:'text'|'decimal'='decimal')=><label>{label}<input inputMode={mode} value={String(form![k])} onChange={e=>setForm(x=>({...x!,[k]:e.target.value}))}/></label>;
 return <>
  <section className={styles.card}><h2>Tipos de retablo</h2><p>Los tipos activos aparecen en el contrato. Un tipo ya usado no se borra: se desactiva.</p>
   {canEdit&&!form&&<button className={`${styles.button} ${styles.primary}`} style={{marginBottom:12}} onClick={()=>{setError('');setForm(EMPTY_TIPO);}}>Nuevo tipo</button>}
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Tipo</th><th>Medida (cm)</th>{canEdit&&<th>Valor</th>}<th>Valor cliente</th>{showEmpresa&&<th>Valor empresa</th>}<th>Activo</th><th>Usos</th>{canEdit&&<th></th>}</tr></thead>
    <tbody>{tipos.map(t=><tr key={t.id} className={t.activo?'':styles.annulled}><td><strong>{t.nombre}</strong></td><td>{Number(t.ancho_cm)} × {Number(t.alto_cm)}</td>{canEdit&&<td>{money(t.valor)}</td>}<td>{money(t.valor_cliente)}</td>{showEmpresa&&<td>{money(t.valor_empresa)}</td>}
     <td>{t.activo?'Sí':'No'}</td><td>{t.usos}</td>
     {canEdit&&<td><div style={{display:'flex',gap:6}}><button className={styles.button} onClick={()=>edit(t)}>Editar</button><button className={`${styles.button} ${t.activo?styles.danger:''}`} disabled={saving} onClick={()=>toggle(t)}>{t.activo?'Desactivar':'Activar'}</button></div></td>}</tr>)}</tbody></table></div>
   {!tipos.length&&<p className={styles.empty}>No hay tipos creados.{canEdit?' Crea el primero con «Nuevo tipo».':''}</p>}
  </section>
  {form&&<section className={styles.card}><h2>{form.id?'Editar tipo':'Nuevo tipo'}</h2>
   <div className={styles.form}><fieldset disabled={saving} style={{border:0,padding:0,margin:0,display:'grid',gap:12}}>
    {field('nombre','Nombre (ej. Retablo 10x40)','text')}
    <div className={styles.row}>{field('ancho_cm','Ancho (cm)')}{field('alto_cm','Alto (cm)')}</div>
    <div className={styles.row}>{field('valor','Valor (costo base, COP)')}{field('valor_cliente','Valor cliente (COP)')}</div>
    {field('valor_empresa','Valor empresa (COP)')}
    {error&&<p role="alert" className={styles.error}>{error}</p>}
    <div style={{display:'flex',gap:8}}><button className={`${styles.button} ${styles.primary}`} onClick={()=>void save(form)}>{saving?'Guardando…':'Guardar'}</button><button className={styles.button} onClick={()=>setForm(null)}>Cancelar</button></div>
   </fieldset></div>
  </section>}
 </>;
}
