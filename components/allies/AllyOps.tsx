'use client';
import {useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {MEASURE_STATES,measureAlerts,type MeasureField} from '@/lib/ally-measures';
import {CLIENT_STATES} from '@/lib/ally-clients';
import styles from '@/app/dashboard/caja/caja.module.css';

const errText=(e:unknown)=>e&&typeof e==='object'&&'message' in e?String((e as {message:string}).message):'No se pudo completar la acción.';
const api=async(body:Record<string,unknown>)=>{const {data}=await supabase.auth.getSession();const r=await fetch('/api/aliados/medidas',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify(body)});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d;};
const fecha=(d:string|null|undefined)=>d?d.slice(0,10).split('-').reverse().join('/'):'—';
const openFile=async(path:string)=>{const {data}=await supabase.storage.from('aliados_documentos').createSignedUrl(path,300);if(data)window.open(data.signedUrl,'_blank','noopener,noreferrer');};
function useLoad<T>(load:()=>PromiseLike<{data:unknown;error:{message:string}|null}>,version:number){
 const [rows,setRows]=useState<T|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void Promise.resolve(load()).then(({data,error:e})=>{if(!live)return;if(e)setError(e.message);setRows(data as T);});return()=>{live=false;};
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[version]);
 return [rows,error,setError] as const;
}

type MeasureRow={contrato_id:string;valores:Record<string,string>;estado:string;nota_correccion:string|null;confirmado_at:string|null;contratos:{numero_contrato:string;quinceanera_name:string|null;fecha_evento:string|null;categoria_aliado:string|null;aliado_datos:{nombre?:string}|null}};
/** Paso 7: review of virtual measures (Revisadas, Corrección solicitada with note, Aprobadas = locked; later edits go to history). */
export function AllyMeasures(){
 const [version,setVersion]=useState(0),[open,setOpen]=useState<string|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [rows,error,setError]=useLoad<MeasureRow[]>(()=>supabase.from('contrato_medidas').select('contrato_id,valores,estado,nota_correccion,confirmado_at,contratos(numero_contrato,quinceanera_name,fecha_evento,categoria_aliado,aliado_datos)').order('actualizado_en',{ascending:false}),version);
 const [fields]=useLoad<MeasureField[]>(()=>supabase.from('medidas_campos').select('*').eq('activo',true).order('orden'),0);
 const run=async(body:Record<string,unknown>,msg:string)=>{setBusy(true);setError('');setNotice('');try{const d=await api(body);setNotice(d.link&&!d.ok?`${msg} No se pudo enviar el correo; enlace: ${d.link}`:msg);setVersion(v=>v+1);}catch(e){setError(errText(e));}finally{setBusy(false);}};
 return <section className={styles.card}>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Contrato</th><th>Clienta</th><th>Aliado</th><th>Evento</th><th>Estado</th><th></th></tr></thead>
   <tbody>{(rows||[]).map(r=><MeasureRowView key={r.contrato_id} r={r} fields={fields||[]} open={open===r.contrato_id} busy={busy} onToggle={()=>setOpen(open===r.contrato_id?null:r.contrato_id)} run={run}/>)}</tbody></table></div>
  {rows&&!rows.length&&<p className={styles.empty}>Aún no hay medidas virtuales. Se crean al guardar un contrato en modo Aliado.</p>}
 </section>;
}
function MeasureRowView({r,fields,open,busy,onToggle,run}:{r:MeasureRow;fields:MeasureField[];open:boolean;busy:boolean;onToggle:()=>void;run:(b:Record<string,unknown>,m:string)=>Promise<void>}){
 const [vals,setVals]=useState(r.valores),[hist,setHist]=useState<{campo:string;anterior:string|null;nuevo:string|null;fecha:string}[]>([]);
 useEffect(()=>{if(!open)return;let live=true;void supabase.from('medidas_historial').select('campo,anterior,nuevo,fecha').eq('contrato_id',r.contrato_id).order('fecha',{ascending:false}).then(({data})=>{if(live)setHist(data||[]);});return()=>{live=false;};},[open,r.contrato_id]);
 const id=r.contrato_id,alerts=measureAlerts(fields,vals);
 return <><tr onClick={onToggle} style={{cursor:'pointer'}}><td><b>{r.contratos.numero_contrato}</b></td><td>{r.contratos.quinceanera_name}<small>{r.contratos.categoria_aliado}</small></td><td>{r.contratos.aliado_datos?.nombre}</td><td>{fecha(r.contratos.fecha_evento)}</td><td>{r.estado}{r.confirmado_at&&<small>Confirmadas {new Date(r.confirmado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</small>}</td><td>{open?'▲':'▼'}</td></tr>
  {open&&<tr><td colSpan={6}>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:8}}>{fields.map(f=><label key={f.id} className={styles.help}>{f.nombre} (cm)<input value={vals[f.nombre]||''} onChange={e=>setVals({...vals,[f.nombre]:e.target.value})}/></label>)}</div>
   {alerts.length>0&&<ul className={styles.help} style={{color:'#b45309'}}>{alerts.map(a=><li key={a}>⚠ {a}</li>)}</ul>}
   {r.nota_correccion&&<p className={styles.help}>Última corrección pedida: {r.nota_correccion}</p>}
   <div className={styles.actions} style={{marginTop:8}}>
    <button className={styles.button} disabled={busy} onClick={()=>void run({accion:'revisar',contrato_id:id,valores:vals},r.estado==='Aprobadas'?'Cambios guardados en el historial.':'Medidas guardadas.')}>Guardar cambios</button>
    {(['Revisadas','Aprobadas'] as const).map(s=><button key={s} className={styles.button} disabled={busy||r.estado===s} onClick={()=>void run({accion:'revisar',contrato_id:id,estado:s},`Medidas ${s.toLowerCase()}.`)}>{s==='Revisadas'?'Marcar revisadas':'Aprobar'}</button>)}
    <button className={styles.button} disabled={busy} onClick={()=>{const nota=window.prompt('¿Qué debe corregir el aliado? (se le envía por correo)');if(nota)void run({accion:'revisar',contrato_id:id,estado:'Corrección solicitada',nota},'Corrección solicitada y enviada al aliado.');}}>Pedir corrección</button>
    <button className={styles.button} disabled={busy} onClick={()=>void run({accion:'reenviar',contrato_id:id},'Enlace reenviado al aliado.')}>Reenviar enlace</button>
   </div>
   {hist.length>0&&<ul className={styles.help}>{hist.map((h,i)=><li key={i}>{new Date(h.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · {h.campo}: {h.anterior??'—'} → {h.nuevo??'—'}</li>)}</ul>}
  </td></tr>}</>;
}

type ShipRow={id:string;numero_contrato:string;quinceanera_name:string|null;saldo:number|null;fecha_evento:string|null;tipo_entrega:string|null;aliado_datos:{nombre?:string}|null;
 contrato_envios:{transportadora:string|null;guia_ida:string|null;guia_regreso:string|null;estado:string;fotos_salida:string[];fotos_regreso:string[]}|null};
/** Paso 8: shipments of Aliado contracts (guides, states, required photos; never Enviado with balance). */
export function AllyShipments(){
 const [version,setVersion]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
 const [rows,error,setError]=useLoad<ShipRow[]>(()=>supabase.from('contratos').select('id,numero_contrato,quinceanera_name,saldo,fecha_evento,tipo_entrega,aliado_datos,contrato_envios(transportadora,guia_ida,guia_regreso,estado,fotos_salida,fotos_regreso)').eq('tiene_aliado',true).not('estado','in','("anulado","cancelado","rechazado","borrador")').order('fecha_evento'),version);
 const save=async(id:string,datos:Record<string,unknown>,msg:string)=>{setBusy(true);setError('');setNotice('');const {error:e}=await supabase.rpc('guardar_envio',{p_contrato:id,p_datos:datos});setBusy(false);if(e)setError(e.message);else{setNotice(msg);setVersion(v=>v+1);}};
 const upload=async(id:string,kind:'fotos_salida'|'fotos_regreso',files:FileList)=>{
  setBusy(true);setError('');const paths:string[]=[];
  for(const f of Array.from(files)){if(!f.type.startsWith('image/')||f.size>10*1024*1024){setBusy(false);return setError('Sube fotos (JPG, PNG o WebP) de hasta 10 MB.');}
   const path=`envios/${id}/${kind==='fotos_salida'?'salida':'regreso'}-${crypto.randomUUID()}.${f.type.split('/')[1]||'jpg'}`;
   const {error:e}=await supabase.storage.from('aliados_documentos').upload(path,f);if(e){setBusy(false);return setError('No se pudo subir la foto: '+e.message);}paths.push(path);}
  setBusy(false);await save(id,{[kind]:paths},'Fotos guardadas en el contrato.');
 };
 return <section className={styles.card}>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Contrato</th><th>Saldo</th><th>Transportadora y guías</th><th>Fotos</th><th>Estado</th></tr></thead>
   <tbody>{(rows||[]).map(r=>{const e=r.contrato_envios;return <tr key={r.id}>
    <td><b>{r.numero_contrato}</b><small>{r.quinceanera_name} · {r.aliado_datos?.nombre} · evento {fecha(r.fecha_evento)} · {r.tipo_entrega}</small></td>
    <td>{Number(r.saldo)>0?<b style={{color:'#be123c'}}>{money(Number(r.saldo))}</b>:'Al día'}</td>
    <td><ShipFields e={e} disabled={busy} onSave={d=>void save(r.id,d,'Datos del envío guardados.')}/></td>
    <td><label className={styles.help}>Al salir ({e?.fotos_salida.length||0})<input type="file" accept="image/*" multiple disabled={busy} onChange={x=>{if(x.target.files?.length)void upload(r.id,'fotos_salida',x.target.files);x.target.value='';}}/></label>
     <label className={styles.help}>Al regresar ({e?.fotos_regreso.length||0})<input type="file" accept="image/*" multiple disabled={busy} onChange={x=>{if(x.target.files?.length)void upload(r.id,'fotos_regreso',x.target.files);x.target.value='';}}/></label>
     {[...(e?.fotos_salida||[]),...(e?.fotos_regreso||[])].map((p,i)=><button key={p} className={styles.button} onClick={()=>void openFile(p)}>Foto {i+1}</button>)}</td>
    <td><select value={e?.estado||'Pendiente'} disabled={busy} onChange={x=>void save(r.id,{estado:x.target.value},`Envío: ${x.target.value}.`)}>{['Pendiente','Enviado','Entregado','Devuelto','Recibido y revisado'].map(s=><option key={s} disabled={s==='Pendiente'}>{s}</option>)}</select></td></tr>;})}</tbody></table></div>
  {rows&&!rows.length&&<p className={styles.empty}>No hay contratos en modo Aliado.</p>}
 </section>;
}
function ShipFields({e,disabled,onSave}:{e:ShipRow['contrato_envios'];disabled:boolean;onSave:(d:Record<string,string>)=>void}){
 const [f,setF]=useState({transportadora:e?.transportadora||'',guia_ida:e?.guia_ida||'',guia_regreso:e?.guia_regreso||''});
 return <div style={{display:'grid',gap:4}}>{([['transportadora','Transportadora'],['guia_ida','Guía de ida'],['guia_regreso','Guía de regreso']] as const).map(([k,l])=><input key={k} placeholder={l} value={f[k]} onChange={x=>setF({...f,[k]:x.target.value})}/>)}
  <button className={styles.button} disabled={disabled} onClick={()=>onSave(f)}>Guardar</button></div>;
}

type Stats={estados:Record<string,number>;aliados:{id:string;nombre:string;codigo:string|null;estado:string;clientas:number;por_estado:Record<string,number>;contratos:number;facturado:number;descuentos:number;pagos_a_tiempo:number;eventos_pasados:number}[];consultas:{aliado:string;vestido:string|null;categoria:string|null;fecha:string;disponible:boolean;creado_en:string}[]};
/** Paso 10: summary by state, per ally (clients by state, conversion, billed, discounts), ranking and availability queries, by date range. */
export function AllyStats(){
 const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/Bogota'});
 const [desde,setDesde]=useState(`${today.slice(0,4)}-01-01`),[hasta,setHasta]=useState(today),[orden,setOrden]=useState<'clientas'|'conversion'|'a_tiempo'>('clientas'),[version,setVersion]=useState(0);
 const [data,error]=useLoad<Stats>(()=>supabase.rpc('aliados_estadisticas',{p_desde:desde,p_hasta:hasta}),version);
 const conv=(a:Stats['aliados'][number])=>a.clientas?Math.round(100*(a.por_estado['Contrató']||0)/a.clientas):0;
 const aTiempo=(a:Stats['aliados'][number])=>a.eventos_pasados?Math.round(100*a.pagos_a_tiempo/a.eventos_pasados):0;
 const list=[...(data?.aliados||[])].sort((x,y)=>orden==='clientas'?y.clientas-x.clientas:orden==='conversion'?conv(y)-conv(x):aTiempo(y)-aTiempo(x));
 return <>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.toolbar} style={{marginBottom:12}}><label>Desde<input type="date" value={desde} onChange={e=>setDesde(e.target.value)}/></label><label>Hasta<input type="date" value={hasta} onChange={e=>setHasta(e.target.value)}/></label>
   <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} onClick={()=>setVersion(v=>v+1)}>Aplicar</button></div></div>
  <div className={styles.stats} style={{marginBottom:16}}>{Object.entries(data?.estados||{}).map(([k,v])=><div key={k} className={styles.card}><small className={styles.help}>{k.replace('_',' ')}</small><p style={{fontSize:24,fontWeight:900}}>{v}</p></div>)}</div>
  <section className={styles.card} style={{marginBottom:16}}>
   <div className={styles.toolbar} style={{marginBottom:8}}><b>Por aliado y ranking</b><label>Ordenar por<select value={orden} onChange={e=>setOrden(e.target.value as typeof orden)}><option value="clientas">Clientas traídas</option><option value="conversion">Conversión</option><option value="a_tiempo">Pagos a tiempo</option></select></label></div>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>#</th><th>Aliado</th>{CLIENT_STATES.map(s=><th key={s} style={{textAlign:'right'}}>{s}</th>)}<th style={{textAlign:'right'}}>Conversión</th><th style={{textAlign:'right'}}>Facturado</th><th style={{textAlign:'right'}}>Descuentos</th><th style={{textAlign:'right'}}>Pagos a tiempo</th></tr></thead>
    <tbody>{list.map((a,i)=><tr key={a.id}><td>{i+1}</td><td><b>{a.nombre}</b><small>{a.codigo||'—'} · {a.estado} · {a.clientas} clientas</small></td>{CLIENT_STATES.map(s=><td key={s} style={{textAlign:'right'}}>{a.por_estado[s]||0}</td>)}
     <td style={{textAlign:'right'}}>{conv(a)}%</td><td style={{textAlign:'right'}}>{money(Number(a.facturado))}</td><td style={{textAlign:'right'}}>{money(Number(a.descuentos))}</td><td style={{textAlign:'right'}}>{a.eventos_pasados?`${aTiempo(a)}%`:'—'}</td></tr>)}</tbody></table></div>
   <p className={styles.help}>Conversión = contrataron / registradas. Pagos a tiempo = contratos con evento pasado y saldo en cero.</p>
  </section>
  <section className={styles.card}><b>Consultas de disponibilidad</b>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Cuándo</th><th>Aliado</th><th>Vestido o categoría</th><th>Fecha consultada</th><th>Resultado</th></tr></thead>
    <tbody>{(data?.consultas||[]).map((c,i)=><tr key={i}><td>{new Date(c.creado_en).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td><td>{c.aliado}</td><td>{c.vestido||c.categoria}</td><td>{fecha(c.fecha)}</td><td>{c.disponible?'Disponible':'No disponible'}</td></tr>)}</tbody></table></div>
  </section>
 </>;
}

/** Configuración (admin): fields of the store measures sheet with instruction, guide image and usual range; reminder days. */
export function MeasureSettings(){
 const [version,setVersion]=useState(0),[nuevo,setNuevo]=useState(''),[notice,setNotice]=useState('');
 const [rows,error,setError]=useLoad<MeasureField[]>(()=>supabase.from('medidas_campos').select('*').order('orden').order('id'),version);
 const [cfg]=useLoad<{dias_recordatorio_medidas:number}>(()=>supabase.from('aliados_config').select('dias_recordatorio_medidas').eq('id',1).maybeSingle(),version);
 const done=(e:{message:string}|null,msg:string)=>{if(e)setError(e.message);else{setNotice(msg);setVersion(v=>v+1);}};
 const update=async(f:MeasureField,patch:Partial<MeasureField>)=>{const {error:e}=await supabase.from('medidas_campos').update(patch).eq('id',f.id);done(e,'Campo guardado.');};
 const image=async(f:MeasureField,file:File)=>{const path=`medidas/${crypto.randomUUID()}.${file.type.split('/')[1]||'jpg'}`;const {error:e}=await supabase.storage.from('aliados_documentos').upload(path,file);if(e)return setError(e.message);await update(f,{imagen_path:path});};
 return <section className={styles.card} style={{gridColumn:'1/-1'}}><h3 style={{fontWeight:900}}>Ficha de medidas virtuales</h3>
  <p className={styles.help}>Escribe los mismos campos de la ficha de medidas de tienda (en cm). Cada uno lleva una instrucción corta de cómo medir y una imagen guía opcional. El rango usual solo genera alertas.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Orden</th><th>Campo</th><th>Instrucción</th><th>Mín.</th><th>Máx.</th><th>Imagen guía</th><th></th></tr></thead>
   <tbody>{(rows||[]).map(f=><tr key={f.id} style={{opacity:f.activo?1:.5}}>
    <td><input style={{width:50}} defaultValue={f.orden} onBlur={e=>Number(e.target.value)!==f.orden&&void update(f,{orden:Number(e.target.value)||0})}/></td>
    <td><input defaultValue={f.nombre} onBlur={e=>e.target.value.trim()!==f.nombre&&void update(f,{nombre:e.target.value.trim()})}/></td>
    <td><input defaultValue={f.instruccion} onBlur={e=>e.target.value!==f.instruccion&&void update(f,{instruccion:e.target.value})}/></td>
    <td><input style={{width:60}} defaultValue={f.minimo??''} onBlur={e=>void update(f,{minimo:e.target.value?Number(e.target.value):null})}/></td>
    <td><input style={{width:60}} defaultValue={f.maximo??''} onBlur={e=>void update(f,{maximo:e.target.value?Number(e.target.value):null})}/></td>
    <td>{f.imagen_path&&<button className={styles.button} onClick={()=>void openFile(f.imagen_path!)}>Ver</button>}<input type="file" accept="image/*" onChange={e=>{const x=e.target.files?.[0];if(x)void image(f,x);e.target.value='';}}/></td>
    <td><button className={styles.button} onClick={()=>void update(f,{activo:!f.activo})}>{f.activo?'Desactivar':'Activar'}</button></td></tr>)}</tbody></table></div>
  <div className={styles.toolbar} style={{marginTop:10}}><label>Nuevo campo<input value={nuevo} maxLength={60} onChange={e=>setNuevo(e.target.value)} placeholder="Ej.: Contorno de busto"/></label>
   <div className={styles.actions}><button className={styles.button} onClick={async()=>{if(nuevo.trim().length<2)return;const {error:e}=await supabase.from('medidas_campos').insert({nombre:nuevo.trim(),orden:(rows?.length||0)+1});setNuevo('');done(e,'Campo agregado.');}}>Agregar</button></div>
   {cfg&&<label>Recordatorio al aliado si faltan (días)<input type="number" min={1} max={365} defaultValue={cfg.dias_recordatorio_medidas} onBlur={async e=>{const {error:x}=await supabase.from('aliados_config').update({dias_recordatorio_medidas:Number(e.target.value)||30}).eq('id',1);done(x,'Días de recordatorio guardados.');}}/></label>}</div>
  <p className={styles.help}>Estados de las medidas: {MEASURE_STATES.join(', ')}.</p>
 </section>;
}
