'use client';
import {useEffect,useMemo,useState} from 'react';
import {Handshake} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import AllyContractText from '@/components/AllyContractText';
import {supabase} from '@/lib/supabase';
import {CASH_RECEIPT_TYPES} from '@/lib/cash';
import type {ContractSection} from '@/lib/ally-contract-text';
import {AllyMeasures,AllyShipments,AllyStats,MeasureSettings} from '@/components/allies/AllyOps';
import {CLIENT_STATES,clientId,type AllyClient} from '@/lib/ally-clients';
import {ALLY_STATUS,allyLinks,onlyDigits,type AllyType,type DirectAlly} from '@/lib/direct-allies';
import styles from '@/app/dashboard/caja/caja.module.css';

type Tab='perfiles'|'clientas'|'medidas'|'envios'|'estadisticas'|'config';
const ACCOUNT_TYPES=['Ahorros','Corriente','Nequi / Daviplata','Otra'];
const errText=(e:unknown,fallback:string)=>e&&typeof e==='object'&&'message' in e?String((e as {message:string}).message):fallback;
const chip=(cls:string,label:string)=><span className={`inline-block px-3 py-1 rounded-full border text-xs font-bold ${cls}`}>{label}</span>;

export default function DirectAlliesPage(){
 return <SupplierShell activePage="aliados_directos" crumb="Red de aliados" title="Aliados Directos" icon={<Handshake/>}
  description="Perfil de cada aliado, su contrato firmado una sola vez y su cuenta bancaria. El aliado no recibe comisiones.">
  {profile=><DirectAllies profile={profile}/>}
 </SupplierShell>;
}

function DirectAllies({profile}:{profile:ShellProfile}){
 const isAdmin=profile.rol==='admin',gestion=isAdmin||profile.rol==='contabilidad';
 const [tab,setTab]=useState<Tab>('perfiles');
 const [allies,setAllies]=useState<DirectAlly[]>([]),[types,setTypes]=useState<AllyType[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[version,setVersion]=useState(0),[loaded,setLoaded]=useState(false);
 const [editing,setEditing]=useState<DirectAlly|'nuevo'|null>(null),[detailId,setDetailId]=useState<string|null>(null),[q,setQ]=useState('');
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const [a,t,s]=await Promise.all([supabase.rpc('aliados_resumen'),supabase.from('tipos_aliado').select('id,nombre,activo').order('nombre'),supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre')]);
   if(!live)return;
   setLoaded(true);
   if(a.error){setError(a.error.message);return;}
   setAllies((a.data||[]) as DirectAlly[]);setTypes((t.data||[]) as AllyType[]);setSedes(s.data||[]);
  })();
  return()=>{live=false;};
 },[version]);
 const reload=(msg?:string)=>{if(msg)setNotice(msg);setVersion(v=>v+1);};
 const detail=detailId?allies.find(a=>a.id===detailId)||null:null;
 const text=q.trim().toLowerCase();
 const list=allies.filter(a=>!text||`${a.nombre} ${a.cedula} ${a.tipo}`.toLowerCase().includes(text));
 const cambios=allies.filter(a=>a.cambio_pendiente).length,sinValidar=allies.filter(a=>a.numero_cuenta&&!a.cuenta_validada).length;

 return <>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.tabs}>
   {([['perfiles','Perfiles'],['clientas','Clientas'],['medidas','Medidas'],['envios','Envíos'],['estadisticas','Estadísticas'],...(isAdmin?[['config','Configuración']]:[])] as [Tab,string][]).map(([k,l])=><button key={k} className={`${styles.tab} ${tab===k?styles.tabActive:''}`} onClick={()=>setTab(k)}>{l}</button>)}
  </div>
  {isAdmin&&allies.some(a=>a.estado==='pendiente')&&<p className={styles.banner+' '+styles.open}>{allies.filter(a=>a.estado==='pendiente').length} aliado(s) firmaron y esperan aprobación. Ábrelos para aprobar o rechazar.</p>}
  {gestion&&(cambios>0||sinValidar>0)&&<p className={styles.banner+' '+styles.open}>{cambios>0&&`${cambios} cambio(s) de cuenta bancaria esperan aprobación de Contabilidad. `}{sinValidar>0&&`${sinValidar} cuenta(s) sin validar.`}</p>}

  {tab==='perfiles'&&<section className={styles.card}>
   <div className={styles.toolbar} style={{marginBottom:12}}>
    <label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Nombre, cédula o tipo"/></label>
    <div className={styles.actions} style={{marginLeft:'auto'}}><button className={styles.button} onClick={()=>void navigator.clipboard.writeText(allyLinks(window.location.origin,'').vincular+(!isAdmin&&profile.sede_id?`?sede=${profile.sede_id}`:'')).then(()=>setNotice('Enlace de vinculación copiado. Compártelo con los aliados.'),()=>setError('No se pudo copiar el enlace.'))}>Copiar enlace</button>{isAdmin&&<button className={`${styles.button} ${styles.primary}`} onClick={()=>setEditing('nuevo')}>Nuevo aliado</button>}</div>
   </div>
   <div className={styles.tableScroll}><table className={styles.table}>
    <thead><tr><th>Aliado</th><th>Tipo</th><th>Sede</th><th>Cuenta</th><th>Contrato</th><th>Estado</th></tr></thead>
    <tbody>{list.map(a=><tr key={a.id} onClick={()=>setDetailId(a.id)} style={{cursor:'pointer'}}>
     <td><b>{a.nombre}</b><small>{a.codigo?`${a.codigo} · `:''}C.C. {a.cedula} · {a.celular}</small></td><td>{a.tipo}</td><td>{a.sede||'—'}</td>
     <td>{a.cuenta_mascara?<>{a.banco} · {a.cuenta_mascara}<small>{a.cuenta_validada?'Validada por Contabilidad':'Sin validar'}{a.cambio_pendiente?' · cambio pendiente':''}</small></>:'Sin cuenta'}</td>
     <td>{a.firma?<>Firmado<small>{new Date(a.firma.fecha).toLocaleDateString('es-CO')}</small></>:'Sin firmar'}</td>
     <td>{chip(ALLY_STATUS[a.estado].cls,ALLY_STATUS[a.estado].label)}</td></tr>)}</tbody>
   </table></div>
   {!list.length&&<p className={styles.empty}>{loaded?(isAdmin?'Aún no hay aliados. Crea el primero con «Nuevo aliado».':'No hay aliados para tu sede.'):'Cargando…'}</p>}
  </section>}

  {tab==='clientas'&&<AllyClients allies={allies}/>}
  {tab==='medidas'&&<AllyMeasures/>}
  {tab==='envios'&&<AllyShipments/>}
  {tab==='estadisticas'&&<AllyStats/>}
  {tab==='config'&&isAdmin&&<AllySettings types={types} onSaved={reload}/>}
  {editing&&<AllyForm ally={editing==='nuevo'?null:editing} types={types} sedes={sedes} onClose={()=>setEditing(null)} onSaved={msg=>{setEditing(null);reload(msg);}}/>}
  {detail&&<AllyDetail ally={detail} isAdmin={isAdmin} gestion={gestion} onClose={()=>setDetailId(null)} onEdit={()=>{setEditing(detail);setDetailId(null);}} onChanged={reload}/>}
 </>;
}

/** Create or edit a profile (Administrator). A new bank account for an existing ally waits for Contabilidad. */
function AllyForm({ally,types,sedes,onClose,onSaved}:{ally:DirectAlly|null;types:AllyType[];sedes:{id:string;nombre:string}[];onClose:()=>void;onSaved:(msg:string)=>void}){
 const [f,setF]=useState({nombre_completo:ally?.nombre||'',cedula:ally?.cedula||'',celular:ally?.celular||'',correo:ally?.correo||'',direccion:ally?.direccion||'',tipo_aliado_id:String(ally?.tipo_aliado_id||''),sede_principal:ally?.sede_principal||'',
  banco:ally?.banco||'',tipo_cuenta:ally?.tipo_cuenta||'',numero_cuenta:ally?.numero_cuenta||'',titular_cuenta:ally?.titular_cuenta||'',estado:ally?.estado||'pendiente_firma'});
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[cert,setCert]=useState<File|null>(null);
 const set=(k:keyof typeof f)=>(e:{target:{value:string}})=>setF({...f,[k]:e.target.value});
 const save=async()=>{
  setError('');
  if(f.nombre_completo.trim().length<3||onlyDigits(f.cedula).length<5||onlyDigits(f.celular).length<7||!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.correo.trim())||f.direccion.trim().length<5||!f.tipo_aliado_id)return setError('Completa nombre, cédula, celular, correo, dirección y tipo de aliado.');
  if(f.numero_cuenta&&(!f.banco||!f.tipo_cuenta||!f.titular_cuenta))return setError('Completa banco, tipo y titular de la cuenta.');
  const bankChanged=!!ally?.numero_cuenta&&(f.numero_cuenta!==ally.numero_cuenta||f.banco!==ally.banco||f.tipo_cuenta!==ally.tipo_cuenta||f.titular_cuenta!==ally.titular_cuenta);
  if(bankChanged&&!cert)return setError('Adjunta la certificación bancaria de la nueva cuenta.');
  setBusy(true);
  let certificacion_path='';
  try{if(cert&&ally)certificacion_path=await uploadAllyFile(ally.id,'certificacion',cert);}catch(x){setBusy(false);return setError(errText(x,'No se pudo subir la certificación.'));}
  const {error:e}=await supabase.rpc('guardar_aliado',{p_id:ally?.id||null,p_datos:{...f,cedula:onlyDigits(f.cedula),certificacion_path}});
  setBusy(false);
  if(e)return setError(/aliados_cedula_unica|Ya existe/.test(e.message)?'Ya existe un aliado con esa cédula.':/check constraint/.test(e.message)?'Revisa el formato de cédula, celular y correo.':e.message);
  onSaved(ally?(bankChanged?'Perfil guardado. El cambio de cuenta bancaria queda pendiente hasta que Contabilidad lo apruebe.':'Perfil guardado.'):'Aliado creado en estado «Pendiente de firma». Envíale el contrato desde su perfil.');
 };
 return <div className={styles.overlay} onClick={onClose}><div className={styles.dialog} onClick={e=>e.stopPropagation()} style={{maxWidth:720}}>
  <h2>{ally?'Editar aliado':'Nuevo aliado'}</h2>
  <div className={styles.form}>
   <label>Nombre completo<input value={f.nombre_completo} maxLength={140} onChange={set('nombre_completo')}/></label>
   <div className={styles.row}><label>Cédula<input inputMode="numeric" value={f.cedula} onChange={set('cedula')}/></label><label>Celular<input inputMode="tel" value={f.celular} onChange={set('celular')}/></label></div>
   <label>Correo electrónico<input type="email" value={f.correo} onChange={set('correo')}/></label>
   <label>Dirección<input value={f.direccion} maxLength={200} onChange={set('direccion')}/></label>
   <div className={styles.row}><label>Tipo de aliado<select value={f.tipo_aliado_id} onChange={set('tipo_aliado_id')}><option value="">Selecciona…</option>{types.filter(t=>t.activo||String(t.id)===f.tipo_aliado_id).map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
    <label>Sede principal<select value={f.sede_principal} onChange={set('sede_principal')}><option value="">Sin sede</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label></div>
   <p className={styles.help}><b>Cuenta bancaria</b>{ally?.numero_cuenta?' · un cambio queda pendiente hasta que Contabilidad lo apruebe':''}</p>
   <div className={styles.row}><label>Banco<input value={f.banco} onChange={set('banco')}/></label><label>Tipo de cuenta<select value={f.tipo_cuenta} onChange={set('tipo_cuenta')}><option value="">Selecciona…</option>{ACCOUNT_TYPES.map(t=><option key={t}>{t}</option>)}</select></label></div>
   <div className={styles.row}><label>Número de cuenta<input value={f.numero_cuenta} onChange={set('numero_cuenta')}/></label><label>Titular<input value={f.titular_cuenta} onChange={set('titular_cuenta')}/></label></div>
   {ally&&<label>Certificación bancaria{ally.numero_cuenta?' (obligatoria si cambias la cuenta)':''}<input type="file" accept="application/pdf,image/*" onChange={e=>setCert(e.target.files?.[0]||null)}/></label>}
   {ally&&['activo','inactivo'].includes(ally.estado)&&<label>Estado<select value={f.estado} onChange={set('estado')}><option value="activo">Activo</option><option value="inactivo">Inactivo</option></select></label>}
  </div>
  {error&&<p role="alert" className={styles.error} style={{marginTop:10}}>{error}</p>}
  <div className={styles.actions} style={{marginTop:14}}><button className={styles.button} onClick={onClose} disabled={busy}>Cancelar</button><button className={`${styles.button} ${styles.primary}`} onClick={()=>void save()} disabled={busy}>{busy?'Guardando…':'Guardar'}</button></div>
 </div></div>;
}

async function uploadAllyFile(allyId:string,kind:'certificacion'|'comprobante',file:File){
 const ext=CASH_RECEIPT_TYPES[file.type];
 if(!ext||file.size>10*1024*1024)throw Error('Adjunta un PDF, JPG, PNG o WebP de hasta 10 MB.');
 const path=`${allyId}/${kind}/${crypto.randomUUID()}.${ext}`;
 const {error}=await supabase.storage.from('aliados_documentos').upload(path,file,{upsert:false});
 if(error)throw Error('No se pudo subir el archivo: '+error.message);
 return path;
}
async function openAllyFile(path:string){
 const {data,error}=await supabase.storage.from('aliados_documentos').createSignedUrl(path,300);
 if(error||!data)throw Error('No se pudo abrir el archivo.');
 window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

/** Profile, bank account, signed contract and change history of one ally. */
function AllyDetail({ally,isAdmin,gestion,onClose,onEdit,onChanged}:{ally:DirectAlly;isAdmin:boolean;gestion:boolean;onClose:()=>void;onEdit:()=>void;onChanged:(msg?:string)=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[contract,setContract]=useState<{texto:ContractSection[];firma_base64:string}|null>(null);
 const [history,setHistory]=useState<{id:number;campo:string;valor_anterior:string|null;valor_nuevo:string|null;fecha_hora:string}[]>([]),[version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const [h]=await Promise.all([gestion?supabase.from('historial_aliado').select('id,campo,valor_anterior,valor_nuevo,fecha_hora').eq('aliado_id',ally.id).order('fecha_hora',{ascending:false}).limit(20):Promise.resolve({data:[]})]);
   if(!live)return;
   setHistory((h.data||[]) as typeof history);
  })();
  return()=>{live=false;};
 },[ally.id,gestion,version]);
 const run=async(fn:()=>Promise<void>,msg:string)=>{setBusy(true);setError('');try{await fn();onChanged(msg);setVersion(v=>v+1);}catch(e){setError(errText(e,'No se pudo completar la acción.'));}finally{setBusy(false);}};
 const sendLink=()=>run(async()=>{
  const {data:s}=await supabase.auth.getSession();
  const r=await fetch('/api/aliados/contrato/enlace',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${s.session?.access_token||''}`},body:JSON.stringify({tipo:'directo',aliado_id:ally.id})});
  const d=await r.json();if(!r.ok)throw Error(d.error||'No se pudo generar el enlace.');
  try{await navigator.clipboard.writeText(d.link);}catch{}
  const phone=onlyDigits(ally.celular);
  const msg=`Hola, ${ally.nombre}. Para activarte como aliado de Ámbar Couture revisa tus datos y firma el contrato de aliado aquí (una sola vez): ${d.link}`;
  if(phone&&window.confirm(`Enlace copiado (vence en ${d.dias} días).\n\n¿Abrir WhatsApp para enviárselo?`))window.open(`https://wa.me/${phone.length===10?'57'+phone:phone}?text=${encodeURIComponent(msg)}`,'_blank','noopener,noreferrer');
 },'Enlace de firma generado y copiado.');
 const validate=(file?:File)=>run(async()=>{const path=file?await uploadAllyFile(ally.id,'certificacion',file):'';const {error:e}=await supabase.rpc('validar_cuenta_aliado',{p_aliado:ally.id,p_certificacion:path});if(e)throw e;},'Cuenta bancaria validada.');
 const resolve=(ok:boolean)=>run(async()=>{const {error:e}=await supabase.rpc('resolver_cambio_cuenta',{p_id:ally.cambio_pendiente!.id,p_aprobar:ok});if(e)throw e;},ok?'Cambio de cuenta aprobado. Valida la nueva cuenta.':'Cambio de cuenta rechazado.');
 const viewContract=async()=>{const {data,error:e}=await supabase.from('contratos_aliado').select('texto,firma_base64').eq('aliado_id',ally.id).maybeSingle();if(e||!data)setError('No se pudo abrir el contrato firmado.');else setContract(data as typeof contract);};
 const printContract=()=>{const w=window.open('','_blank');if(!w||!contract)return;const esc=(s:string)=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Contrato de aliado · ${esc(ally.nombre)}</title><body style="font-family:Arial;max-width:760px;margin:24px auto;font-size:13px;line-height:1.5">${contract.texto.map(s=>`<h3>${esc(s.titulo)}</h3>${s.parrafos.map(p=>`<p>${esc(p)}</p>`).join('')}${s.lista?`<ul>${s.lista.map(l=>`<li>${esc(l)}</li>`).join('')}</ul>`:''}`).join('')}<p><b>Firma de EL ALIADO</b><br><img src="${contract.firma_base64}" style="max-height:110px"></p><p style="color:#666">Firmado digitalmente el ${ally.firma?new Date(ally.firma.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'}):''} · Código de verificación ${ally.firma?.codigo||''}</p></body>`);w.document.close();w.print();};
 // Personal links of an Active ally (token), to copy and share.
 const copyLink=async(k:'disponibilidad'|'clientas')=>{const {data,error:e}=await supabase.from('aliados').select('token').eq('id',ally.id).maybeSingle();if(e||!data)return setError('No se pudo obtener el enlace.');
  const link=allyLinks(window.location.origin,data.token)[k];try{await navigator.clipboard.writeText(link);onChanged('Enlace copiado: '+link);}catch{window.prompt('Copia el enlace:',link);}};
 const decide=(body:Record<string,unknown>)=>run(async()=>{
  const {data:ss}=await supabase.auth.getSession();
  const r=await fetch('/api/aliados/aprobacion',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${ss.session?.access_token||''}`},body:JSON.stringify({id:ally.id,...body})}),d=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(d.error||'No se pudo completar la acción.');
  if(!d.correo)throw Error(`${d.estado==='activo'?`Aprobado con código ${d.codigo}`:'Rechazado'}, pero no se pudo enviar el correo.`);
 },body.accion==='reenviar'?'Enlaces reenviados al correo del aliado.':body.aprobar?'Aliado aprobado. Le enviamos su código y enlaces por correo.':'Aliado rechazado. Le enviamos el aviso por correo.');
 const cuenta=useMemo(()=>gestion?ally.numero_cuenta:ally.cuenta_mascara,[gestion,ally]);
 return <div className={styles.overlay} onClick={onClose}><div className={styles.dialog} onClick={e=>e.stopPropagation()} style={{maxWidth:900,maxHeight:'92vh',overflowY:'auto'}}>
  <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start'}}><div><h2>{ally.nombre}</h2><p className={styles.help}>{ally.tipo} · {ally.sede||'Sin sede'} · C.C. {ally.cedula}</p></div>{chip(ALLY_STATUS[ally.estado].cls,ALLY_STATUS[ally.estado].label)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))',gap:12,margin:'14px 0'}}>
   <div className={styles.card}><b>Datos</b><p className={styles.help}>{ally.celular}<br/>{ally.correo}<br/>{ally.direccion}</p>{isAdmin&&<div className={styles.actions}><button className={styles.button} onClick={onEdit}>Editar perfil</button></div>}</div>
   <div className={styles.card}><b>Cuenta bancaria</b>{ally.numero_cuenta||ally.cuenta_mascara?<p className={styles.help}>Banco: {ally.banco}<br/>Tipo: {ally.tipo_cuenta}<br/>Número: {cuenta}<br/>Titular: {ally.titular_cuenta}</p>:<p className={styles.help}>Sin cuenta registrada.</p>}
    <p>{ally.cuenta_validada?chip('bg-emerald-50 text-emerald-700 border-emerald-300','Validada por Contabilidad'):chip('bg-amber-50 text-amber-700 border-amber-300','Sin validar')}</p>
    {gestion&&ally.certificacion_path&&<button className={styles.button} onClick={()=>void openAllyFile(ally.certificacion_path!).catch(e=>setError(errText(e,'')))}>Ver certificación</button>}
    {gestion&&ally.numero_cuenta&&!ally.cuenta_validada&&<label className={styles.help} style={{display:'block',marginTop:8}}>Validar con certificación bancaria<input type="file" accept="application/pdf,image/*" disabled={busy} onChange={e=>{const file=e.target.files?.[0];if(file)void validate(file);e.target.value='';}}/></label>}
    {ally.cambio_pendiente&&<div className={styles.banner+' '+styles.open} style={{marginTop:8}}>Cambio pendiente: {ally.cambio_pendiente.banco} · {ally.cambio_pendiente.tipo_cuenta} · {ally.cambio_pendiente.numero_cuenta} · {ally.cambio_pendiente.titular_cuenta}
     {gestion&&<div className={styles.actions} style={{marginTop:6}}><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void resolve(true)}>Aprobar</button><button className={styles.button} disabled={busy} onClick={()=>void resolve(false)}>Rechazar</button></div>}</div>}
   </div>
   <div className={styles.card}><b>Contrato de aliado</b>{ally.firma?<><p>{chip('bg-emerald-50 text-emerald-700 border-emerald-300','Firmado')}</p><p className={styles.help}>Firmado el {new Date(ally.firma.fecha).toLocaleDateString('es-CO')} · versión {ally.firma.version}<br/>Código {ally.firma.codigo}</p>{gestion&&<button className={styles.button} onClick={()=>void viewContract()}>Ver contrato firmado</button>}</>
    :<><p className={styles.help}>Pendiente de firma. Mientras no firme, no aparece en los contratos de clientes.</p>{isAdmin&&<button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void sendLink()}>Enviar contrato para firma</button>}</>}</div>
  </div>
  <div className={styles.card} style={{marginBottom:12}}><b>Vinculación</b>
   <p className={styles.help}>{ally.codigo?<>Código <b>{ally.codigo}</b> · </>:''}{ally.origen==='enlace'?'Llegó por el enlace público':'Creado en el ERP'}
    {ally.acuerdo_version&&<><br/>Acuerdo firmado: versión {ally.acuerdo_version}</>}
    {ally.datos_autorizados_at&&<><br/>Autorizó tratamiento de datos el {new Date(ally.datos_autorizados_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · texto {ally.datos_texto_version}</>}
    {ally.estado==='rechazado'&&<><br/>Rechazado{ally.motivo_rechazo?`: ${ally.motivo_rechazo}`:''}</>}</p>
   <div className={styles.actions}>
    {gestion&&ally.acuerdo_pdf_path&&<button className={styles.button} onClick={()=>void openAllyFile(ally.acuerdo_pdf_path!).catch(e=>setError(errText(e,'')))}>PDF firmado</button>}
    {gestion&&ally.cambio_pendiente?.certificacion_path&&<button className={styles.button} onClick={()=>void openAllyFile(ally.cambio_pendiente!.certificacion_path!).catch(e=>setError(errText(e,'')))}>Certificación de la nueva cuenta</button>}
    {isAdmin&&ally.estado==='pendiente'&&<><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void decide({aprobar:true})}>Aprobar</button><button className={styles.button} disabled={busy} onClick={()=>{const motivo=window.prompt('Motivo del rechazo (se envía al aliado, opcional):');if(motivo!==null)void decide({aprobar:false,motivo});}}>Rechazar</button></>}
    {isAdmin&&ally.estado==='activo'&&ally.codigo&&<button className={styles.button} disabled={busy} onClick={()=>void decide({accion:'reenviar'})}>Reenviar enlaces</button>}
    {isAdmin&&ally.estado==='activo'&&(['disponibilidad','clientas'] as const).map(k=><button key={k} className={styles.button} onClick={()=>void copyLink(k)}>Copiar enlace de {k==='clientas'?'registro de clientas':'disponibilidad'}</button>)}
   </div></div>
  {gestion&&history.length>0&&<><h3 style={{fontWeight:900,margin:'14px 0 6px'}}>Historial de cambios</h3><ul className={styles.help}>{history.map(h=><li key={h.id}>{new Date(h.fecha_hora).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · {h.campo}: {h.valor_anterior??'—'} → {h.valor_nuevo??'—'}</li>)}</ul></>}
  <div className={styles.actions} style={{marginTop:14}}><button className={styles.button} onClick={onClose}>Cerrar</button></div>
  {contract&&<div className={styles.overlay} onClick={()=>setContract(null)}><div className={styles.dialog} onClick={e=>e.stopPropagation()} style={{maxWidth:800,maxHeight:'90vh',overflowY:'auto'}}>
   <h2>Contrato de aliado · {ally.nombre}</h2><p className={styles.help}>Código de verificación {ally.firma?.codigo}</p>
   <AllyContractText sections={contract.texto}/>
   <p className={styles.help} style={{marginTop:12}}>Firma de EL ALIADO</p><img src={contract.firma_base64} alt="Firma del aliado" style={{maxHeight:110}}/>
   <div className={styles.actions} style={{marginTop:12}}><button className={styles.button} onClick={printContract}>Imprimir / guardar PDF</button><button className={styles.button} onClick={()=>setContract(null)}>Cerrar</button></div>
  </div></div>}
 </div></div>;
}

/** Catalog of ally types (Administrator). */
function AllySettings({types,onSaved}:{types:AllyType[];onSaved:(msg?:string)=>void}){
 const [nuevo,setNuevo]=useState(''),[error,setError]=useState('');
 const addType=async()=>{if(nuevo.trim().length<2)return;const {error:e}=await supabase.from('tipos_aliado').insert({nombre:nuevo.trim()});if(e)setError(e.message);else{setNuevo('');onSaved('Tipo de aliado agregado.');}};
 const toggle=async(t:AllyType)=>{const {error:e}=await supabase.from('tipos_aliado').update({activo:!t.activo}).eq('id',t.id);if(e)setError(e.message);else onSaved();};
 return <div style={{display:'grid',gap:16,gridTemplateColumns:'repeat(auto-fit,minmax(320px,1fr))'}}>
  <AgreementVersions/>
  <MeasureSettings/>
  <section className={styles.card}><h3 style={{fontWeight:900}}>Tipos de aliado</h3>
   <ul className={styles.alertList} style={{padding:0}}>{types.map(t=><li key={t.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{opacity:t.activo?1:.5}}>{t.nombre}</span><button className={styles.button} onClick={()=>void toggle(t)}>{t.activo?'Desactivar':'Activar'}</button></li>)}</ul>
   <div className={styles.toolbar} style={{marginTop:10}}><label>Nuevo tipo<input value={nuevo} maxLength={60} onChange={e=>setNuevo(e.target.value)}/></label><div className={styles.actions}><button className={styles.button} onClick={()=>void addType()}>Agregar</button></div></div></section>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
 </div>;
}

type Agreement={version:number;archivo_nombre:string;secciones:ContractSection[];nota:string;subido_por_nombre:string|null;subido_en:string};
const authHeader=async()=>{const {data}=await supabase.auth.getSession();return {Authorization:`Bearer ${data.session?.access_token||''}`};};
/** Contrato de vinculación: Word versions of the agreement (never deleted; the latest is the one allies sign). */
function AgreementVersions(){
 const [rows,setRows]=useState<Agreement[]|null>(null),[file,setFile]=useState<File|null>(null),[nota,setNota]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;
  void supabase.from('acuerdos_aliado').select('version,archivo_nombre,secciones,nota,subido_por_nombre,subido_en').order('version',{ascending:false}).then(({data,error:e})=>{if(!live)return;if(e)setError(e.message);setRows((data||[]) as Agreement[]);});
  return()=>{live=false;};
 },[version]);
 const upload=async()=>{
  if(!file)return setError('Elige el Word (.docx) del acuerdo.');
  setBusy(true);setError('');setNotice('');
  try{const form=new FormData();form.append('archivo',file);form.append('nota',nota);
   const r=await fetch('/api/aliados/acuerdo',{method:'POST',headers:await authHeader(),body:form}),d=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(d.error||'No se pudo subir el acuerdo.');
   setFile(null);setNota('');setNotice(`Versión ${d.version} guardada. Es la que firmarán los aliados desde ahora.`);setVersion(v=>v+1);
  }catch(e){setError(errText(e,'No se pudo subir el acuerdo.'));}finally{setBusy(false);}
 };
 const word=async(v:number)=>{const r=await fetch(`/api/aliados/acuerdo?version=${v}`,{headers:await authHeader()}),d=await r.json().catch(()=>({}));if(!r.ok)setError(d.error||'No se pudo descargar.');else window.location.href=d.url;};
 const pdf=(a:Agreement)=>{const w=window.open('','_blank');if(!w)return;const esc=(t:string)=>t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]!));
  w.document.write(`<!doctype html><meta charset="utf-8"><title>Acuerdo de aliado v${a.version}</title><body style="font-family:Arial;max-width:760px;margin:24px auto;font-size:13px;line-height:1.5">${a.secciones.map(x=>`${x.titulo?`<h3>${esc(x.titulo)}</h3>`:''}${x.parrafos.map(p=>`<p>${esc(p)}</p>`).join('')}`).join('')}</body>`);w.document.close();w.print();};
 return <section className={styles.card} style={{gridColumn:'1/-1'}}><h3 style={{fontWeight:900}}>Contrato de vinculación</h3>
  <p className={styles.help}>Sube el acuerdo en Word. Escribe en el Word <b>{'{nombre}'}</b>, <b>{'{cédula}'}</b>, <b>{'{tipo}'}</b> y <b>{'{fecha}'}</b> donde van los datos del aliado: se llenan solos al firmar. Cada versión queda guardada; la más reciente es la vigente.</p>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  <div className={styles.toolbar} style={{margin:'10px 0'}}>
   <label>Acuerdo (.docx)<input type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>setFile(e.target.files?.[0]||null)}/></label>
   <label style={{flex:1}}>Nota de la versión<input value={nota} maxLength={500} onChange={e=>setNota(e.target.value)} placeholder="Ej.: cambio en la cláusula de entregas"/></label>
   <div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} disabled={busy||!file} onClick={()=>void upload()}>{busy?'Subiendo…':'Subir acuerdo'}</button></div>
  </div>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Versión</th><th>Fecha</th><th>Usuario</th><th>Nota</th><th></th></tr></thead>
   <tbody>{(rows||[]).map((a,i)=><tr key={a.version}><td><b>v{a.version}</b>{i===0&&<small>Vigente</small>}</td><td>{new Date(a.subido_en).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td><td>{a.subido_por_nombre||'—'}</td><td>{a.nota||'—'}<small>{a.archivo_nombre}</small></td>
    <td><div className={styles.actions}><button className={styles.button} onClick={()=>void word(a.version)}>Word</button><button className={styles.button} onClick={()=>pdf(a)}>PDF</button></div></td></tr>)}</tbody></table></div>
  {rows&&!rows.length&&<p className={styles.empty}>Aún no has subido el acuerdo. Mientras tanto se firma el texto que trae el sistema.</p>}
 </section>;
}

/** Clients registered by each ally (public form): data, authorizations and state. */
function AllyClients({allies}:{allies:DirectAlly[]}){
 const [rows,setRows]=useState<AllyClient[]|null>(null),[q,setQ]=useState(''),[error,setError]=useState(''),[version,setVersion]=useState(0);
 useEffect(()=>{
  let live=true;
  void supabase.from('aliado_clientas').select('*').order('creado_en',{ascending:false}).then(({data,error:e})=>{if(!live)return;if(e)setError(e.message);setRows((data||[]) as AllyClient[]);});
  return()=>{live=false;};
 },[version]);
 const name=(id:string)=>allies.find(a=>a.id===id)?.nombre||'—';
 const change=async(r:AllyClient,estado:string)=>{const {error:e}=await supabase.rpc('estado_clienta_aliado',{p_id:r.id,p_estado:estado});if(e)setError(e.message);else setVersion(v=>v+1);};
 const text=q.trim().toLowerCase();
 const list=(rows||[]).filter(r=>!text||`${clientId(r.numero)} ${r.clienta_nombre} ${r.clienta_documento} ${r.rep_nombre||''} ${name(r.aliado_id)}`.toLowerCase().includes(text));
 return <section className={styles.card}>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.toolbar} style={{marginBottom:12}}><label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="ID, nombre, documento o aliado"/></label></div>
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>ID</th><th>Clienta</th><th>Evento</th><th>Contacto</th><th>Aliado</th><th>Autorizaciones</th><th>Estado</th></tr></thead>
   <tbody>{list.map(r=><tr key={r.id}><td><b>{clientId(r.numero)}</b><small>{new Date(r.creado_en).toLocaleDateString('es-CO')}</small></td>
    <td>{r.clienta_nombre}<small>{r.clienta_menor?'T.I.':'C.C.'} {r.clienta_documento}</small></td>
    <td>{r.tipo_evento==='XV'?'XV años':'Gala'} · {r.categoria}<small>{r.fecha_evento.split('-').reverse().join('/')}</small></td>
    <td>{r.rep_nombre?<>{r.rep_nombre} ({r.rep_parentesco})<small>{r.rep_celular} · {r.rep_correo}</small></>:<>{r.clienta_celular}<small>{r.clienta_correo}</small></>}</td>
    <td>{name(r.aliado_id)}</td>
    <td><small>Datos {new Date(r.autoriza_datos_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}<br/>Imagen: {r.uso_imagen?'Sí':'No'} · Publicidad: {r.publicidad?'Sí':'No'}</small></td>
    <td><select translate="no" value={r.estado} onChange={e=>void change(r,e.target.value)}>{CLIENT_STATES.map(x=><option key={x}>{x}</option>)}</select></td></tr>)}</tbody>
  </table></div>
  {rows&&!list.length&&<p className={styles.empty}>Aún no hay clientas registradas por aliados.</p>}
 </section>;
}
