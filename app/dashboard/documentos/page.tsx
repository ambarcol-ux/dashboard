'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {FolderOpen,Upload,Link2,Settings2,Plus,History,Archive,ExternalLink,Search} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

type Area={id:string;nombre:string;padre_id:string|null;orden:number;ver_roles:string[];editar_roles:string[];activo:boolean};
type Doc={id:string;area_id:string;nombre:string;descripcion:string|null;sede_id:string|null;ruta:string|null;enlace:string|null;tipo:string|null;tamano:number|null;version:number;vence:string|null;updated_at:string};
type Version={id:number;version:number;ruta:string|null;enlace:string|null;created_at:string};
const BUCKET='documentos_marca';
const fecha=(v:string)=>new Date(v).toLocaleDateString('es-CO',{timeZone:'America/Bogota',day:'numeric',month:'short',year:'numeric'});
const peso=(n:number|null)=>!n?'':n>1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;
const diasPara=(d:string)=>Math.ceil((Date.parse(d+'T23:59:59-05:00')-Date.now())/86400000);
const limpio=(n:string)=>n.normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^\w.-]+/g,'_').slice(-80);

/** Administración › Documentos de la marca: areas and sub-areas that administration edits here, with who sees and who uploads. */
export default function DocumentosPage(){
 return <SupplierShell activePage="documentos" crumb="Marca / Documentos" title="Documentos de la marca" icon={<FolderOpen/>}
  description="Archivos de cada área de trabajo de Ámbar Couture. Cada área decide quién la ve y quién sube archivos.">
  {p=><Documentos profile={p}/>}
 </SupplierShell>;
}

function Documentos({profile}:{profile:ShellProfile}){
 const admin=profile.rol==='admin';
 const [areas,setAreas]=useState<Area[]>([]),[docs,setDocs]=useState<Doc[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[roles,setRoles]=useState<{id:string;nombre:string}[]>([]);
 const [sel,setSel]=useState(''),[q,setQ]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[modo,setModo]=useState<''|'areas'|'subir'>('');
 const [versiones,setVersiones]=useState<{doc:Doc;lista:Version[]}|null>(null);
 const load=useCallback(async()=>{
  const [a,d,s,r]=await Promise.all([
   supabase.from('doc_areas').select('*').order('orden').order('nombre'),
   supabase.from('doc_archivos').select('id,area_id,nombre,descripcion,sede_id,ruta,enlace,tipo,tamano,version,vence,updated_at').eq('archivado',false).order('nombre'),
   supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),
   supabase.from('roles').select('id,nombre').order('nombre'),
  ]);
  if(a.error||d.error){setError((a.error||d.error)!.message);return;}
  setAreas((a.data||[]) as Area[]);setDocs((d.data||[]) as Doc[]);setSedes(s.data||[]);setRoles(r.data||[]);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const activas=areas.filter(a=>a.activo||admin);
 const raiz=activas.filter(a=>!a.padre_id),hijas=(id:string)=>activas.filter(a=>a.padre_id===id);
 const area=areas.find(a=>a.id===sel)||null;
 const ruta=(a:Area|null):Area[]=>a?[...ruta(areas.find(x=>x.id===a.padre_id)||null),a]:[];
 const puedeSubir=!!area&&(admin||ruta(area).some(a=>a.editar_roles.includes(profile.rol)));
 const lista=useMemo(()=>{const t=q.trim().toLowerCase();
  return docs.filter(d=>t?`${d.nombre} ${d.descripcion||''}`.toLowerCase().includes(t):d.area_id===sel);},[docs,q,sel]);
 const porVencer=docs.filter(d=>d.vence&&diasPara(d.vence)<=30);
 const run=async(name:string,fn:()=>Promise<void>)=>{setBusy(name);setError('');setNotice('');try{await fn();}catch(e){setError(e instanceof Error?e.message:'No se pudo completar.');}finally{setBusy('');}};
 const abrir=(d:{ruta:string|null;enlace:string|null})=>run('abrir',async()=>{
  if(d.enlace&&!d.ruta){window.open(d.enlace,'_blank','noopener');return;}
  const {data,error:e}=await supabase.storage.from(BUCKET).createSignedUrl(String(d.ruta),300);
  if(e||!data?.signedUrl)throw Error('No se pudo abrir el archivo.');window.open(data.signedUrl,'_blank','noopener');});
 const verVersiones=(doc:Doc)=>run('ver',async()=>{const {data}=await supabase.from('doc_versiones').select('id,version,ruta,enlace,created_at').eq('archivo_id',doc.id).order('version',{ascending:false});setVersiones({doc,lista:(data||[]) as Version[]});});
 const archivar=(doc:Doc)=>{if(!window.confirm(`¿Archivar «${doc.nombre}»? Deja de verse en la lista (no se borra).`))return;
  void run('archivar',async()=>{const {error:e}=await supabase.from('doc_archivos').update({archivado:true,updated_at:new Date().toISOString()}).eq('id',doc.id);if(e)throw e;setNotice('Archivado.');await load();});};
 const nuevaVersion=(doc:Doc,file:File)=>run('version',async()=>{
  const path=`${doc.area_id}/${crypto.randomUUID()}-${limpio(file.name)}`;
  const {error:e}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(e)throw Error(`No se pudo subir: ${e.message}`);
  const v=doc.version+1;
  const {error:e2}=await supabase.from('doc_archivos').update({ruta:path,enlace:null,tipo:file.type||null,tamano:file.size,version:v,updated_at:new Date().toISOString()}).eq('id',doc.id);if(e2)throw e2;
  await supabase.from('doc_versiones').insert({archivo_id:doc.id,version:v,ruta:path,tipo:file.type||null,tamano:file.size});
  setNotice(`Versión ${v} subida. Las anteriores quedan en «Versiones».`);await load();});

 const Rama=({a,nivel}:{a:Area;nivel:number})=><>
  <button type="button" onClick={()=>{setSel(a.id);setQ('');}} style={{display:'flex',gap:6,alignItems:'center',width:'100%',textAlign:'left',padding:'7px 10px',paddingLeft:10+nivel*16,borderRadius:10,border:0,background:sel===a.id?'#ffe4e6':'transparent',fontWeight:sel===a.id?800:500,opacity:a.activo?1:.5,cursor:'pointer'}}>
   <FolderOpen size={14}/><span style={{flex:1}}>{a.nombre}</span><small style={{color:'#94a3b8'}}>{docs.filter(d=>d.area_id===a.id).length||''}</small>
  </button>
  {hijas(a.id).map(h=><Rama key={h.id} a={h} nivel={nivel+1}/>)}
 </>;

 return <div style={{display:'grid',gap:12}}>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {porVencer.length>0&&<p role="alert" className={styles.error}>⏰ {porVencer.length} documento{porVencer.length>1?'s':''} vence{porVencer.length>1?'n':''} en 30 días o menos: {porVencer.map(d=>`${d.nombre} (${fecha(d.vence!)})`).join(' · ')}</p>}
  <div style={{display:'grid',gridTemplateColumns:'minmax(220px,280px) 1fr',gap:12,alignItems:'start'}} className="doc-grid">
   <style>{`@media (max-width:760px){.doc-grid{grid-template-columns:1fr!important}}`}</style>
   <section className={styles.card} style={{display:'grid',gap:4,padding:10}}>
    <label style={{display:'flex',gap:6,alignItems:'center',border:'1px solid #e2e8f0',borderRadius:10,padding:'6px 8px',marginBottom:6}}><Search size={14}/><input aria-label="Buscar documentos" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar en todas las áreas" style={{border:0,outline:'none',flex:1,minWidth:0}}/></label>
    {raiz.map(a=><Rama key={a.id} a={a} nivel={0}/>)}
    {!raiz.length&&<p className={styles.empty}>No tienes áreas disponibles.</p>}
    {admin&&<button type="button" className={styles.button} style={{marginTop:8}} onClick={()=>setModo('areas')}><Settings2 size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Administrar áreas</button>}
   </section>
   <section className={styles.card} style={{display:'grid',gap:10}}>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
     <h2 style={{margin:0,flex:1}}>{q.trim()?`Resultados para «${q.trim()}»`:area?ruta(area).map(a=>a.nombre).join(' › '):'Elige un área'}</h2>
     {!q.trim()&&puedeSubir&&<button type="button" className={`${styles.button} ${styles.primary}`} onClick={()=>setModo('subir')}><Upload size={14} style={{display:'inline',verticalAlign:'-2px'}}/> Subir documento</button>}
    </div>
    {area&&!q.trim()&&<p className={styles.help}>Ven esta área: {ruta(area).some(a=>a.ver_roles.length)?ruta(area).filter(a=>a.ver_roles.length).map(a=>a.ver_roles.map(r=>roles.find(x=>x.id===r)?.nombre||r).join(', ')).join(' y ')+' (y administración)':'todos los perfiles con acceso al módulo'}. Suben archivos: {[...new Set(ruta(area).flatMap(a=>a.editar_roles))].map(r=>roles.find(x=>x.id===r)?.nombre||r).join(', ')||'solo administración'}.</p>}
    {!lista.length?<p className={styles.empty}>{q.trim()?'No hay documentos con ese nombre.':area?'Esta área todavía no tiene documentos.':'Elige un área a la izquierda.'}</p>:
    <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Documento</th><th>Sede</th><th>Versión</th><th>Vence</th><th></th></tr></thead><tbody>
     {lista.map(d=>{const dias=d.vence?diasPara(d.vence):null,editable=admin||ruta(areas.find(a=>a.id===d.area_id)||null).some(a=>a.editar_roles.includes(profile.rol));
      return <tr key={d.id}>
      <td><button type="button" onClick={()=>abrir(d)} style={{border:0,background:'none',padding:0,textAlign:'left',cursor:'pointer',fontWeight:700,color:'#be123c'}}>{d.enlace&&!d.ruta?<Link2 size={13} style={{display:'inline',verticalAlign:'-2px'}}/>:null} {d.nombre}</button>
       {d.descripcion&&<small style={{display:'block',color:'#64748b'}}>{d.descripcion}</small>}
       <small style={{color:'#94a3b8'}}>{q.trim()?`${ruta(areas.find(a=>a.id===d.area_id)||null).map(a=>a.nombre).join(' › ')} · `:''}Actualizado {fecha(d.updated_at)}{d.tamano?` · ${peso(d.tamano)}`:''}</small></td>
      <td>{d.sede_id?sedes.find(s=>s.id===d.sede_id)?.nombre||'—':'Todas'}</td>
      <td><button type="button" className={styles.button} disabled={!!busy} onClick={()=>verVersiones(d)}><History size={13} style={{display:'inline',verticalAlign:'-2px'}}/> v{d.version}</button></td>
      <td>{d.vence?<span className={styles.badge} style={dias!==null&&dias<=30?{background:'#fee2e2',color:'#b91c1c'}:undefined}>{fecha(d.vence)}{dias!==null&&dias<0?' · vencido':''}</span>:'—'}</td>
      <td style={{whiteSpace:'nowrap'}}>
       <button type="button" className={styles.button} disabled={!!busy} onClick={()=>abrir(d)} title="Abrir"><ExternalLink size={13}/></button>
       {editable&&d.ruta&&<label className={styles.button} title="Subir nueva versión" style={{cursor:'pointer'}}><Upload size={13}/><input type="file" hidden onChange={e=>{const f=e.target.files?.[0];if(f)void nuevaVersion(d,f);e.target.value='';}}/></label>}
       {editable&&<button type="button" className={styles.button} disabled={!!busy} onClick={()=>archivar(d)} title="Archivar"><Archive size={13}/></button>}
      </td></tr>;})}
    </tbody></table></div>}
   </section>
  </div>
  {modo==='subir'&&area&&<Subir area={area} sedes={sedes} onClose={()=>setModo('')} onDone={async()=>{setModo('');setNotice('Documento guardado.');await load();}}/>}
  {modo==='areas'&&admin&&<AdminAreas areas={areas} roles={roles} onClose={()=>setModo('')} onChange={load}/>}
  {versiones&&<div role="dialog" aria-label="Versiones" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'grid',placeItems:'center',zIndex:50,padding:16}} onClick={()=>setVersiones(null)}>
   <div className={styles.card} style={{maxWidth:480,width:'100%',display:'grid',gap:8}} onClick={e=>e.stopPropagation()}>
    <h2 style={{margin:0}}>Versiones de «{versiones.doc.nombre}»</h2>
    {versiones.lista.map(v=><div key={v.id} style={{display:'flex',gap:8,alignItems:'center'}}><b>v{v.version}</b><span style={{flex:1}}>{fecha(v.created_at)}</span><button type="button" className={styles.button} onClick={()=>abrir(v)}>Abrir</button></div>)}
    <button type="button" className={styles.button} onClick={()=>setVersiones(null)}>Cerrar</button>
   </div></div>}
 </div>;
}

/** Upload a file (or save a link, for videos) to an area. */
function Subir({area,sedes,onClose,onDone}:{area:Area;sedes:{id:string;nombre:string}[];onClose:()=>void;onDone:()=>Promise<void>}){
 const [f,setF]=useState({nombre:'',descripcion:'',sede_id:'',vence:'',enlace:''}),[file,setFile]=useState<File|null>(null),[esEnlace,setEsEnlace]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const faltan=[f.nombre.trim().length<2&&'el nombre',esEnlace?!/^https?:\/\//.test(f.enlace.trim())&&'el enlace (debe empezar por https://)':!file&&'el archivo'].filter(Boolean) as string[];
 const save=async()=>{setBusy(true);setError('');try{
  let ruta:string|null=null;
  if(!esEnlace&&file){
   if(file.size>50*1024*1024)throw Error('El archivo pesa más de 50 MB. Súbelo a Drive o YouTube y guarda el enlace.');
   ruta=`${area.id}/${crypto.randomUUID()}-${limpio(file.name)}`;
   const {error:e}=await supabase.storage.from(BUCKET).upload(ruta,file,{contentType:file.type||undefined});if(e)throw Error(`No se pudo subir: ${e.message}`);
  }
  const {data,error:e}=await supabase.from('doc_archivos').insert({area_id:area.id,nombre:f.nombre.trim(),descripcion:f.descripcion.trim()||null,sede_id:f.sede_id||null,vence:f.vence||null,ruta,enlace:esEnlace?f.enlace.trim():null,tipo:file?.type||null,tamano:file?.size||null}).select('id').single();
  if(e)throw Error(/row-level|policy/i.test(e.message)?'No tienes permiso para subir archivos en esta área.':e.message);
  await supabase.from('doc_versiones').insert({archivo_id:data.id,version:1,ruta,enlace:esEnlace?f.enlace.trim():null,tipo:file?.type||null,tamano:file?.size||null});
  await onDone();
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);}};
 const input={width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10,boxSizing:'border-box' as const};
 return <div role="dialog" aria-label="Subir documento" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'grid',placeItems:'center',zIndex:50,padding:16}} onClick={onClose}>
  <div className={styles.card} style={{maxWidth:520,width:'100%',display:'grid',gap:10}} onClick={e=>e.stopPropagation()}>
   <h2 style={{margin:0}}>Subir a «{area.nombre}»</h2>
   <div style={{display:'flex',gap:8}}><button type="button" className={`${styles.button} ${!esEnlace?styles.primary:''}`} onClick={()=>setEsEnlace(false)}><Upload size={13} style={{display:'inline',verticalAlign:'-2px'}}/> Archivo</button><button type="button" className={`${styles.button} ${esEnlace?styles.primary:''}`} onClick={()=>setEsEnlace(true)}><Link2 size={13} style={{display:'inline',verticalAlign:'-2px'}}/> Enlace (videos, Drive)</button></div>
   {esEnlace?<label>Enlace<input style={input} value={f.enlace} onChange={e=>setF({...f,enlace:e.target.value})} placeholder="https://…"/></label>
    :<label>Archivo (PDF, Word, Excel, imágenes, presentaciones · máx. 50 MB)<input style={input} type="file" onChange={e=>{const x=e.target.files?.[0]||null;setFile(x);if(x&&!f.nombre)setF({...f,nombre:x.name.replace(/\.[^.]+$/,'')});}}/></label>}
   <label>Nombre<input style={input} value={f.nombre} onChange={e=>setF({...f,nombre:e.target.value})}/></label>
   <label>Descripción (opcional)<input style={input} value={f.descripcion} onChange={e=>setF({...f,descripcion:e.target.value})}/></label>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
    <label>Sede<select style={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value})}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <label>Vence (opcional)<input style={input} type="date" value={f.vence} onChange={e=>setF({...f,vence:e.target.value})}/></label>
   </div>
   {faltan.length>0&&<p className={styles.help}>Para guardar falta: {faltan.join(' y ')}.</p>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button type="button" className={styles.button} onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy||faltan.length>0} onClick={()=>void save()}>{busy?'Guardando…':'Guardar'}</button></div>
  </div></div>;
}

/** Administration edits areas and sub-areas: name, parent, order, who sees, who uploads, active. */
function AdminAreas({areas,roles,onClose,onChange}:{areas:Area[];roles:{id:string;nombre:string}[];onClose:()=>void;onChange:()=>Promise<void>}){
 const [error,setError]=useState(''),[busy,setBusy]=useState(false),[nueva,setNueva]=useState({nombre:'',padre_id:''});
 const otros=roles.filter(r=>r.id!=='admin');
 const desc=(id:string):string[]=>areas.filter(a=>a.padre_id===id).flatMap(a=>[a.id,...desc(a.id)]);
 const save=async(id:string,patch:Partial<Area>)=>{setBusy(true);setError('');const {error:e}=await supabase.from('doc_areas').update(patch).eq('id',id);setBusy(false);if(e)setError(e.message);else await onChange();};
 const crear=async()=>{if(nueva.nombre.trim().length<2){setError('Escribe el nombre del área (mínimo 2 letras).');return;}
  setBusy(true);setError('');const orden=Math.max(0,...areas.filter(a=>(a.padre_id||'')===nueva.padre_id).map(a=>a.orden))+1;
  const {error:e}=await supabase.from('doc_areas').insert({nombre:nueva.nombre.trim(),padre_id:nueva.padre_id||null,orden});setBusy(false);
  if(e)setError(e.message);else{setNueva({nombre:'',padre_id:''});await onChange();}};
 const nombreRuta=(a:Area):string=>{const p=areas.find(x=>x.id===a.padre_id);return p?`${nombreRuta(p)} › ${a.nombre}`:a.nombre;};
 const ordenadas=[...areas].sort((a,b)=>nombreRuta(a).localeCompare(nombreRuta(b),'es'));
 const toggle=(list:string[],r:string)=>list.includes(r)?list.filter(x=>x!==r):[...list,r];
 return <div role="dialog" aria-label="Administrar áreas" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'grid',placeItems:'center',zIndex:50,padding:16}} onClick={onClose}>
  <div className={styles.card} style={{maxWidth:900,width:'100%',maxHeight:'90vh',overflowY:'auto',display:'grid',gap:10}} onClick={e=>e.stopPropagation()}>
   <h2 style={{margin:0}}>Administrar áreas</h2>
   <p className={styles.help}>Cambia nombres, crea subáreas y decide quién ve y quién sube en cada una. Si no marcas a nadie en «Ven», la ven todos los perfiles con acceso al módulo; administración siempre ve y sube todo. Una subárea respeta también las restricciones de su área principal.</p>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
    <label style={{flex:1,minWidth:180}}>Nueva área o subárea<input value={nueva.nombre} onChange={e=>setNueva({...nueva,nombre:e.target.value})} placeholder="Ej.: Campañas 2027" style={{width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10,boxSizing:'border-box'}}/></label>
    <label>Dentro de<select value={nueva.padre_id} onChange={e=>setNueva({...nueva,padre_id:e.target.value})} style={{padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10}}><option value="">(área principal)</option>{ordenadas.map(a=><option key={a.id} value={a.id}>{nombreRuta(a)}</option>)}</select></label>
    <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void crear()}><Plus size={13} style={{display:'inline',verticalAlign:'-2px'}}/> Crear</button>
   </div>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Área</th><th>Dentro de</th><th>Orden</th><th>Ven</th><th>Suben archivos</th><th>Activa</th></tr></thead><tbody>
    {ordenadas.map(a=><tr key={a.id} style={{opacity:a.activo?1:.55}}>
     <td><input defaultValue={a.nombre} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==a.nombre)void save(a.id,{nombre:v});}} style={{padding:'6px 8px',border:'1px solid #e2e8f0',borderRadius:8,minWidth:150}}/></td>
     <td><select value={a.padre_id||''} disabled={busy} onChange={e=>void save(a.id,{padre_id:e.target.value||null})} style={{padding:'6px',border:'1px solid #e2e8f0',borderRadius:8}}><option value="">(principal)</option>{ordenadas.filter(x=>x.id!==a.id&&!desc(a.id).includes(x.id)).map(x=><option key={x.id} value={x.id}>{nombreRuta(x)}</option>)}</select></td>
     <td><input type="number" defaultValue={a.orden} onBlur={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v!==a.orden)void save(a.id,{orden:v});}} style={{width:60,padding:'6px',border:'1px solid #e2e8f0',borderRadius:8}}/></td>
     <td>{otros.map(r=><label key={r.id} style={{display:'block',fontSize:12,whiteSpace:'nowrap'}}><input type="checkbox" disabled={busy} checked={a.ver_roles.includes(r.id)} onChange={()=>void save(a.id,{ver_roles:toggle(a.ver_roles.filter(x=>x!=='admin'),r.id).length?toggle(a.ver_roles.filter(x=>x!=='admin'),r.id):a.ver_roles.includes('admin')||a.ver_roles.length===1?['admin']:[]})}/> {r.nombre}</label>)}
      <label style={{display:'block',fontSize:12}}><input type="checkbox" disabled={busy} checked={a.ver_roles.length===0} onChange={()=>void save(a.id,{ver_roles:a.ver_roles.length?[]:['admin']})}/> <b>Todos</b></label></td>
     <td>{otros.map(r=><label key={r.id} style={{display:'block',fontSize:12,whiteSpace:'nowrap'}}><input type="checkbox" disabled={busy} checked={a.editar_roles.includes(r.id)} onChange={()=>void save(a.id,{editar_roles:toggle(a.editar_roles,r.id)})}/> {r.nombre}</label>)}</td>
     <td><input type="checkbox" disabled={busy} checked={a.activo} onChange={()=>void save(a.id,{activo:!a.activo})} aria-label="Activa"/></td>
    </tr>)}
   </tbody></table></div>
   <button type="button" className={styles.button} onClick={onClose}>Listo</button>
  </div></div>;
}
