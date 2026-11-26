'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {driveId,type DriveDoc} from '@/lib/drive-docs';
import {FolderOpen,Upload,Link2,Settings2,Plus,History,Archive,ExternalLink,Search,Pencil} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import styles from '@/app/dashboard/caja/caja.module.css';

type Area={id:string;nombre:string;padre_id:string|null;orden:number;ver_roles:string[];editar_roles:string[];activo:boolean;ia_lee:boolean|null};
const IA_ESTADO:Record<string,[string,string]>={ok:['🤖 La IA ya lo leyó','#047857'],sin_contenido:['🤖 Sin datos para clientas','#64748b'],error:['🤖 La IA no pudo leerlo','#b91c1c']};
/** Asks the AI to read a just-saved document (it also reads pending ones every morning). */
async function leerConIA(archivo_id:string){try{const {data}=await supabase.auth.getSession();await fetch('/api/documentos/ia',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({archivo_id})});}catch{/* read tomorrow */}}
type Doc={id:string;area_id:string;nombre:string;descripcion:string|null;sede_id:string|null;ruta:string|null;enlace:string|null;tipo:string|null;tamano:number|null;version:number;vence:string|null;updated_at:string};
type Version={id:number;version:number;ruta:string|null;enlace:string|null;tipo?:string|null;tamano?:number|null;created_at:string};
/** Only documents: programs and shortcuts (.exe, .lnk…) are not accepted. */
const ACEPTA='.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif,.heic,.mp4,.mov,.mp3,.m4a,.zip';
const PROGRAMA=/\.(exe|msi|bat|cmd|com|lnk|url|scr|vbs|js|ps1|dll|apk|jar|app|dmg)$/i;
/** Uploads a file as the new version of a document (a link becomes a file; the earlier version stays in «Versiones»). */
async function versionConArchivo(doc:Doc,file:File){
 revisarArchivo(file);
 if(file.size>50*1024*1024)throw Error(`«${file.name}» pesa más de 50 MB.`);
 const path=`${doc.area_id}/${crypto.randomUUID()}-${limpio(file.name)}`;
 const {error:e}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(e)throw Error(`No se pudo subir «${file.name}»: ${e.message}`);
 const {data:vs}=await supabase.from('doc_versiones').select('version').eq('archivo_id',doc.id).order('version',{ascending:false}).limit(1);
 const v=Math.max(doc.version,Number(vs?.[0]?.version)||0)+1;
 const {error:e2}=await supabase.from('doc_archivos').update({ruta:path,enlace:null,tipo:file.type||null,tamano:file.size,version:v,updated_at:new Date().toISOString()}).eq('id',doc.id);if(e2)throw Error(e2.message);
 await supabase.from('doc_versiones').insert({archivo_id:doc.id,version:v,ruta:path,tipo:file.type||null,tamano:file.size});
}
/** Creates a new document in an area from a file, with the given details. */
async function documentoConArchivo(area_id:string,file:File,extra:{descripcion:string|null;sede_id:string|null;vence:string|null}){
 revisarArchivo(file);
 if(file.size>50*1024*1024)throw Error(`«${file.name}» pesa más de 50 MB.`);
 const ruta=`${area_id}/${crypto.randomUUID()}-${limpio(file.name)}`;
 const {error:e}=await supabase.storage.from(BUCKET).upload(ruta,file,{contentType:file.type||undefined});if(e)throw Error(`No se pudo subir «${file.name}»: ${e.message}`);
 const base=file.name.replace(/\.[^.]+$/,'').trim();
 const {data,error:e2}=await supabase.from('doc_archivos').insert({area_id,nombre:(base.length<2?`${base} doc`:base).slice(0,160),...extra,ruta,tipo:file.type||null,tamano:file.size}).select('id').single();
 if(e2)throw Error(/row-level|policy/i.test(e2.message)?'No tienes permiso para subir archivos en esta área.':e2.message);
 await supabase.from('doc_versiones').insert({archivo_id:data.id,version:1,ruta,tipo:file.type||null,tamano:file.size});
 return data.id as string;
}
const esDriveArchivo=(u:string)=>/(docs|drive)\.google\.com\/(document|spreadsheets|presentation|file)\/d\//.test(u);
const esDriveCarpeta=(u:string)=>/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//.test(u);
const revisarArchivo=(f:File)=>{if(PROGRAMA.test(f.name))throw Error(`«${f.name}» es un programa o un acceso directo, no un documento. Si el archivo está en Google Drive, usa «Subir documento › Desde Google Drive».`);};
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
 const [vista,setVista]=useState<{nombre:string;url:string;descarga:string;clase:'img'|'pdf'|'video'|'docx'|'frame'|'otro'}|null>(null);
 const [sel,setSel]=useState(''),[q,setQ]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(''),[modo,setModo]=useState<''|'areas'|'subir'>('');
 const [versiones,setVersiones]=useState<{doc:Doc;lista:Version[];puede:boolean}|null>(null),[editando,setEditando]=useState<Doc|null>(null),[ia,setIa]=useState<Record<string,{estado:string;version:number}>>({});
 // ?area=<id>&doc=<id>: opened from a «Comunicados» alert: the folder opens selected and the document in the viewer.
 useEffect(()=>{const a=new URLSearchParams(window.location.search).get('area');if(a)setSel(a);},[]);
 const load=useCallback(async()=>{
  const [a,d,s,r]=await Promise.all([
   supabase.from('doc_areas').select('*').order('orden').order('nombre'),
   supabase.from('doc_archivos').select('id,area_id,nombre,descripcion,sede_id,ruta,enlace,tipo,tamano,version,vence,updated_at').eq('archivado',false).order('nombre'),
   supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),
   supabase.from('roles').select('id,nombre').order('nombre'),
  ]);
  if(a.error||d.error){setError((a.error||d.error)!.message);return;}
  setAreas((a.data||[]) as Area[]);setDocs((d.data||[]) as Doc[]);setSedes(s.data||[]);setRoles(r.data||[]);
  if(admin){const {data:x}=await supabase.from('doc_ia_resumenes').select('archivo_id,estado,version');setIa(Object.fromEntries(((x||[]) as {archivo_id:string;estado:string;version:number}[]).map(v=>[v.archivo_id,v])));}
 },[admin]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 // Effective «AI reads»: the closest area in the chain with a value.
 const iaLee=(id:string):boolean=>{const a=areas.find(x=>x.id===id);return !a?false:a.ia_lee!==null&&a.ia_lee!==undefined?a.ia_lee:a.padre_id?iaLee(a.padre_id):false;};
 const activas=areas.filter(a=>a.activo||admin);
 const raiz=activas.filter(a=>!a.padre_id),hijas=(id:string)=>activas.filter(a=>a.padre_id===id);
 const area=areas.find(a=>a.id===sel)||null;
 const ruta=(a:Area|null):Area[]=>a?[...ruta(areas.find(x=>x.id===a.padre_id)||null),a]:[];
 const puedeSubir=!!area&&(admin||ruta(area).some(a=>a.editar_roles.includes(profile.rol)));
 const docParam=useRef<string|null>(null);
 useEffect(()=>{docParam.current=new URLSearchParams(window.location.search).get('doc');},[]);
 useEffect(()=>{const id=docParam.current;const d=id?docs.find(x=>x.id===id):null;if(d){docParam.current=null;void abrir(d);}},[docs]); // eslint-disable-line react-hooks/exhaustive-deps
 const lista=useMemo(()=>{const t=q.trim().toLowerCase();
  return docs.filter(d=>t?`${d.nombre} ${d.descripcion||''}`.toLowerCase().includes(t):d.area_id===sel);},[docs,q,sel]);
 const porVencer=docs.filter(d=>d.vence&&diasPara(d.vence)<=30);
 const run=async(name:string,fn:()=>Promise<void>)=>{setBusy(name);setError('');setNotice('');try{await fn();}catch(e){const m=e instanceof Error?e.message:String((e as {message?:string})?.message||'');setError(/row-level|policy/i.test(m)?'No tienes permiso para hacer esto en esta área.':m||'No se pudo completar.');}finally{setBusy('');}};
 // Opening a document shows it in a pop-up viewer (Word, PDF, images, videos, Google Drive links); other types offer «Descargar».
 const abrir=(d:{ruta:string|null;enlace:string|null;tipo?:string|null;nombre?:string})=>run('abrir',async()=>{
  const nombre=d.nombre||'Documento';
  if(d.enlace&&!d.ruta){const e=d.enlace,id=driveId(e);
   const previa=/docs\.google\.com\/(document|spreadsheets|presentation)\/d\//.test(e)?e.replace(/\/(edit|view|pub)[^/]*$/,'').replace(/[?#].*$/,'')+'/preview'
    :id&&/drive\.google\.com\/(file|open)/.test(e)?`https://drive.google.com/file/d/${id}/preview`:null;
   if(previa)setVista({nombre,url:previa,descarga:e,clase:'frame'});else window.open(e,'_blank','noopener');return;}
  const {data,error:e}=await supabase.storage.from(BUCKET).createSignedUrl(String(d.ruta),600);
  if(e||!data?.signedUrl)throw Error('No se pudo abrir el archivo.');
  const t=(d.tipo||'').toLowerCase(),ext=String(d.ruta).toLowerCase().split('.').pop()||'';
  const clase=t.startsWith('image/')||['png','jpg','jpeg','gif','webp'].includes(ext)?'img':t==='application/pdf'||ext==='pdf'?'pdf':t.startsWith('video/')||['mp4','webm','mov'].includes(ext)?'video'
   :t.includes('wordprocessingml')||ext==='docx'?'docx':t.startsWith('text/')||ext==='txt'?'frame':'otro';
  setVista({nombre,url:data.signedUrl,descarga:data.signedUrl,clase});});
 const verVersiones=(doc:Doc)=>run('ver',async()=>{const {data}=await supabase.from('doc_versiones').select('id,version,ruta,enlace,tipo,tamano,created_at').eq('archivo_id',doc.id).order('version',{ascending:false});setVersiones({doc,lista:(data||[]) as Version[],puede:admin||ruta(areas.find(a=>a.id===doc.area_id)||null).some(a=>a.editar_roles.includes(profile.rol))});});
 // Restores an earlier version as a new one (the history keeps all of them).
 const restaurar=(doc:Doc,v:Version)=>run('restaurar',async()=>{
  const n=Math.max(doc.version,...(versiones?.lista||[]).map(x=>x.version))+1;
  const {error:e}=await supabase.from('doc_archivos').update({ruta:v.ruta,enlace:v.enlace,tipo:v.tipo??null,tamano:v.tamano??null,version:n,updated_at:new Date().toISOString()}).eq('id',doc.id);if(e)throw e;
  await supabase.from('doc_versiones').insert({archivo_id:doc.id,version:n,ruta:v.ruta,enlace:v.enlace,tipo:v.tipo??null,tamano:v.tamano??null});
  setVersiones(null);setNotice(`Listo: «${doc.nombre}» volvió a la versión ${v.version} (ahora es la v${n}).`);await load();
  if(v.ruta&&iaLee(doc.area_id))void leerConIA(doc.id).then(()=>load());});
 const archivar=(doc:Doc)=>{if(!window.confirm(`¿Archivar «${doc.nombre}»? Deja de verse en la lista (no se borra).`))return;
  void run('archivar',async()=>{const {error:e}=await supabase.from('doc_archivos').update({archivado:true,updated_at:new Date().toISOString()}).eq('id',doc.id);if(e)throw e;setNotice('Archivado.');await load();});};
 const nuevaVersion=(doc:Doc,file:File)=>run('version',async()=>{
  revisarArchivo(file);
  const path=`${doc.area_id}/${crypto.randomUUID()}-${limpio(file.name)}`;
  const {error:e}=await supabase.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined});if(e)throw Error(`No se pudo subir: ${e.message}`);
  const v=doc.version+1;
  const {error:e2}=await supabase.from('doc_archivos').update({ruta:path,enlace:null,tipo:file.type||null,tamano:file.size,version:v,updated_at:new Date().toISOString()}).eq('id',doc.id);if(e2)throw e2;
  await supabase.from('doc_versiones').insert({archivo_id:doc.id,version:v,ruta:path,tipo:file.type||null,tamano:file.size});
  setNotice(`Versión ${v} subida. Las anteriores quedan en «Versiones».${iaLee(doc.area_id)?' La IA la está leyendo.':''}`);await load();
  if(iaLee(doc.area_id))void leerConIA(doc.id).then(()=>load());});

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
      <td><button type="button" onClick={()=>abrir({...d,nombre:d.nombre})} style={{border:0,background:'none',padding:0,textAlign:'left',cursor:'pointer',fontWeight:700,color:'#be123c'}}>{d.enlace&&!d.ruta?<Link2 size={13} style={{display:'inline',verticalAlign:'-2px'}}/>:null} {d.nombre}</button>
       {d.descripcion&&<small style={{display:'block',color:'#64748b'}}>{d.descripcion}</small>}
       {admin&&iaLee(d.area_id)&&d.ruta&&<small style={{display:'block',color:ia[d.id]?.version===d.version?IA_ESTADO[ia[d.id].estado]?.[1]:'#b45309'}}>{ia[d.id]?.version===d.version?IA_ESTADO[ia[d.id].estado]?.[0]:'🤖 Pendiente: la IA lo lee en unos minutos o mañana temprano'}</small>}
       <small style={{color:'#94a3b8'}}>{q.trim()?`${ruta(areas.find(a=>a.id===d.area_id)||null).map(a=>a.nombre).join(' › ')} · `:''}Actualizado {fecha(d.updated_at)}{d.tamano?` · ${peso(d.tamano)}`:''}</small></td>
      <td>{d.sede_id?sedes.find(s=>s.id===d.sede_id)?.nombre||'—':'Todas'}</td>
      <td><button type="button" className={styles.button} disabled={!!busy} onClick={()=>verVersiones(d)}><History size={13} style={{display:'inline',verticalAlign:'-2px'}}/> v{d.version}</button></td>
      <td>{d.vence?<span className={styles.badge} style={dias!==null&&dias<=30?{background:'#fee2e2',color:'#b91c1c'}:undefined}>{fecha(d.vence)}{dias!==null&&dias<0?' · vencido':''}</span>:'—'}</td>
      <td><div style={{display:'flex',gap:4,flexWrap:'nowrap',alignItems:'center',justifyContent:'flex-end'}}>
       <button type="button" className={styles.button} disabled={!!busy} onClick={()=>abrir({...d,nombre:d.nombre})} title="Abrir"><ExternalLink size={13}/></button>
       {editable&&<button type="button" className={styles.button} disabled={!!busy} onClick={()=>setEditando(d)} title="Editar nombre, sede o vencimiento"><Pencil size={13}/></button>}
       {editable&&<label className={styles.button} title={d.ruta?'Subir nueva versión':'Cambiar el enlace por un archivo'} style={{cursor:'pointer',display:'inline-flex',alignItems:'center',margin:0}}><Upload size={13}/><input type="file" hidden accept={ACEPTA} onChange={e=>{const f=e.target.files?.[0];if(f)void nuevaVersion(d,f);e.target.value='';}}/></label>}
       {editable&&<button type="button" className={styles.button} disabled={!!busy} onClick={()=>archivar(d)} title="Archivar"><Archive size={13}/></button>}
      </div></td></tr>;})}
    </tbody></table></div>}
   </section>
  </div>
  {modo==='subir'&&area&&<Subir area={area} sedes={sedes} onClose={()=>setModo('')} onDone={async(ids)=>{setModo('');setNotice(`${ids&&ids.length>1?`${ids.length} documentos guardados`:'Documento guardado'}.${iaLee(area.id)&&ids?.length?' La IA los está leyendo para usarlos con las clientas.':''}`);await load();
   if(ids?.length&&iaLee(area.id))void (async()=>{for(const id of ids.slice(0,10))await leerConIA(id);await load();})();}}/>}
  {editando&&<Editar doc={editando} sedes={sedes} onClose={()=>setEditando(null)} onDone={async(ids)=>{const a=editando.area_id;setEditando(null);setNotice(ids?.length?`Cambios guardados: ${ids.length} archivo${ids.length>1?'s':''} subido${ids.length>1?'s':''}.`:'Cambios guardados.');await load();
   if(ids?.length&&iaLee(a))void (async()=>{for(const id of ids.slice(0,10))await leerConIA(id);await load();})();}}/>}
  {modo==='areas'&&admin&&<AdminAreas areas={areas} roles={roles} onClose={()=>setModo('')} onChange={load}/>}
  {vista&&<Visor vista={vista} onClose={()=>setVista(null)}/>}
  {versiones&&<div role="dialog" aria-label="Versiones" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'grid',placeItems:'center',zIndex:50,padding:16}} onClick={()=>setVersiones(null)}>
   <div className={styles.card} style={{maxWidth:480,width:'100%',display:'grid',gap:8}} onClick={e=>e.stopPropagation()}>
    <h2 style={{margin:0}}>Versiones de «{versiones.doc.nombre}»</h2>
    {versiones.lista.map(v=><div key={v.id} style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><b>v{v.version}</b><span style={{flex:1}}>{fecha(v.created_at)}{v.enlace&&!v.ruta?' · enlace':''}</span><button type="button" className={styles.button} onClick={()=>abrir({...v,nombre:`${versiones.doc.nombre} · v${v.version}`})}>Abrir</button>
     {versiones.puede&&v.version!==versiones.doc.version&&<button type="button" className={styles.button} disabled={!!busy} onClick={()=>restaurar(versiones.doc,v)}>Volver a esta versión</button>}</div>)}
    {versiones.puede&&<p className={styles.help}>«Volver a esta versión» crea una versión nueva igual a la elegida; ninguna versión se borra.</p>}
    <button type="button" className={styles.button} onClick={()=>setVersiones(null)}>Cerrar</button>
   </div></div>}
 </div>;
}

/** Edit a document's details: name, description, store, expiry and, for links, the address. Same permission as uploading in its area. */
function Editar({doc,sedes,onClose,onDone}:{doc:Doc;sedes:{id:string;nombre:string}[];onClose:()=>void;onDone:(ids?:string[])=>Promise<void>}){
 const soloEnlace=!!doc.enlace&&!doc.ruta;
 const [archivos,setArchivos]=useState<File[]>([]),[progreso,setProgreso]=useState('');
 const [f,setF]=useState({nombre:doc.nombre,descripcion:doc.descripcion||'',sede_id:doc.sede_id||'',vence:doc.vence||'',enlace:doc.enlace||''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const faltan=[f.nombre.trim().length<2&&'el nombre',soloEnlace&&!/^https?:\/\//.test(f.enlace.trim())&&'el enlace (debe empezar por https://)'].filter(Boolean) as string[];
 const save=async()=>{setBusy(true);setError('');try{
  const {error:e}=await supabase.from('doc_archivos').update({nombre:f.nombre.trim(),descripcion:f.descripcion.trim()||null,sede_id:f.sede_id||null,vence:f.vence||null,...(soloEnlace?{enlace:f.enlace.trim()}:{}),updated_at:new Date().toISOString()}).eq('id',doc.id);
  if(e)throw Error(/row-level|policy/i.test(e.message)?'No tienes permiso para editar documentos de esta área.':e.message);
  // Files chosen: the first replaces this document (new version), the rest become new documents with the same details.
  const ids:string[]=[];
  if(archivos.length){
   setProgreso(`Subiendo 1 de ${archivos.length}…`);await versionConArchivo(doc,archivos[0]);ids.push(doc.id);
   for(const [i,file] of archivos.slice(1).entries()){setProgreso(`Subiendo ${i+2} de ${archivos.length}…`);ids.push(await documentoConArchivo(doc.area_id,file,{descripcion:f.descripcion.trim()||null,sede_id:f.sede_id||null,vence:f.vence||null}));}
  }
  await onDone(ids);
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);setProgreso('');}};
 // Google Drive link of one file: brought into the ERP as this document's file.
 const traerDeDrive=async()=>{setBusy(true);setError('');try{
  const {data}=await supabase.auth.getSession();
  const r=await fetch('/api/documentos/drive',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify({accion:'reemplazar',archivo_id:doc.id,enlace:f.enlace.trim()})});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo traer el archivo de Drive.');
  await onDone([doc.id]);
 }catch(e){setError(e instanceof Error?e.message:'No se pudo traer el archivo.');}finally{setBusy(false);}};
 const input={width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10,boxSizing:'border-box' as const};
 return <div role="dialog" aria-label="Editar documento" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'grid',placeItems:'center',zIndex:50,padding:16}} onClick={onClose}>
  <div className={styles.card} style={{maxWidth:520,width:'100%',display:'grid',gap:10}} onClick={e=>e.stopPropagation()}>
   <h2 style={{margin:0}}>Editar «{doc.nombre}»</h2>
   <label>Nombre<input style={input} value={f.nombre} onChange={e=>setF({...f,nombre:e.target.value})}/></label>
   <label>Descripción (opcional)<input style={input} value={f.descripcion} onChange={e=>setF({...f,descripcion:e.target.value})}/></label>
   {soloEnlace&&<label>Enlace<input style={input} value={f.enlace} onChange={e=>setF({...f,enlace:e.target.value})} placeholder="https://…"/></label>}
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
    <label>Sede<select style={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value})}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <VenceInput value={f.vence} onChange={v=>setF({...f,vence:v})}/>
   </div>
   <div style={{border:'1px dashed #e2e8f0',borderRadius:12,padding:10,display:'grid',gap:6}}>
    <strong style={{fontSize:13}}>{soloEnlace?'Cambiar el enlace por archivo(s)':'Reemplazar el archivo'}</strong>
    {soloEnlace&&esDriveArchivo(f.enlace)&&<button type="button" className={styles.button} disabled={busy} onClick={()=>void traerDeDrive()}>Traer este archivo desde Google Drive</button>}
    {soloEnlace&&esDriveCarpeta(f.enlace)&&<small className={styles.help}>Este enlace es una carpeta de Drive: para traer sus archivos usa «Subir documento › Desde Google Drive» y luego archiva este documento.</small>}
    <input type="file" multiple accept={ACEPTA} onChange={e=>setArchivos([...(e.target.files||[])])} style={input}/>
    <small className={styles.help}>{archivos.length>1?`El primero (${archivos[0].name}) reemplaza este documento y los otros ${archivos.length-1} quedan como documentos nuevos con la misma sede y vencimiento.`:soloEnlace?'El archivo reemplaza el enlace (el enlace queda guardado en «Versiones»). Puedes elegir varios: el primero reemplaza este documento y los demás quedan como documentos nuevos.':'La versión anterior queda guardada en «Versiones». Puedes elegir varios: los demás quedan como documentos nuevos.'}</small>
   </div>
   {progreso&&<p className={styles.help}>{progreso}</p>}
   {faltan.length>0&&<p className={styles.help}>Para guardar falta: {faltan.join(' y ')}.</p>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button type="button" className={styles.button} onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy||faltan.length>0} onClick={()=>void save()}>{busy?'Guardando…':'Guardar cambios'}</button></div>
  </div></div>;
}

/** Upload one or several files, save a link (videos), or import files from a shared Google Drive folder. */
function Subir({area,sedes,onClose,onDone}:{area:Area;sedes:{id:string;nombre:string}[];onClose:()=>void;onDone:(ids?:string[])=>Promise<void>}){
 const [f,setF]=useState({nombre:'',descripcion:'',sede_id:'',vence:'',enlace:'',carpeta:''}),[files,setFiles]=useState<File[]>([]),[modo,setModo]=useState<'archivo'|'enlace'|'drive'>('archivo'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[progreso,setProgreso]=useState('');
 const [drive,setDrive]=useState<DriveDoc[]|null>(null),[marcados,setMarcados]=useState<Set<string>>(new Set());
 const varios=modo==='archivo'&&files.length>1;
 const faltan=(modo==='enlace'?[f.nombre.trim().length<2&&'el nombre',!/^https?:\/\//.test(f.enlace.trim())&&'el enlace (debe empezar por https://)']
  :modo==='archivo'?[!files.length&&'el archivo',!varios&&files.length===1&&f.nombre.trim().length<2&&'el nombre']:[!drive&&'buscar los archivos de la carpeta',drive&&!marcados.size&&'elegir al menos un archivo']).filter(Boolean) as string[];
 const api=async(body:Record<string,unknown>)=>{const {data}=await supabase.auth.getSession();const r=await fetch('/api/documentos/drive',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session?.access_token||''}`},body:JSON.stringify(body)});
  const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'No se pudo completar.');return d;};
 const buscar=async()=>{setBusy(true);setError('');try{const d=await api({accion:'listar',carpeta:f.carpeta}) as {archivos:DriveDoc[]};setDrive(d.archivos);setMarcados(new Set(d.archivos.map(x=>x.id)));if(!d.archivos.length)setError('La carpeta no tiene archivos que se puedan importar.');}catch(e){setError(e instanceof Error?e.message:'Error');}finally{setBusy(false);}};
 const uno=async(file:File,nombre:string)=>{
  revisarArchivo(file);
  if(file.size>50*1024*1024)throw Error(`«${file.name}» pesa más de 50 MB. Súbelo a Drive o YouTube y guarda el enlace.`);
  const ruta=`${area.id}/${crypto.randomUUID()}-${limpio(file.name)}`;
  const {error:e}=await supabase.storage.from(BUCKET).upload(ruta,file,{contentType:file.type||undefined});if(e)throw Error(`No se pudo subir «${file.name}»: ${e.message}`);
  const {data,error:e2}=await supabase.from('doc_archivos').insert({area_id:area.id,nombre:nombre.slice(0,160),descripcion:f.descripcion.trim()||null,sede_id:f.sede_id||null,vence:f.vence||null,ruta,tipo:file.type||null,tamano:file.size}).select('id').single();
  if(e2)throw Error(/row-level|policy/i.test(e2.message)?'No tienes permiso para subir archivos en esta área.':e2.message);
  await supabase.from('doc_versiones').insert({archivo_id:data.id,version:1,ruta,tipo:file.type||null,tamano:file.size});
  return data.id as string;
 };
 const save=async()=>{setBusy(true);setError('');try{
  if(modo==='enlace'){
   const {data,error:e}=await supabase.from('doc_archivos').insert({area_id:area.id,nombre:f.nombre.trim(),descripcion:f.descripcion.trim()||null,sede_id:f.sede_id||null,vence:f.vence||null,enlace:f.enlace.trim()}).select('id').single();
   if(e)throw Error(/row-level|policy/i.test(e.message)?'No tienes permiso para subir archivos en esta área.':e.message);
   await supabase.from('doc_versiones').insert({archivo_id:data.id,version:1,enlace:f.enlace.trim()});await onDone();return;
  }
  const ids:string[]=[];
  if(modo==='archivo'){
   for(const [i,file] of files.entries()){setProgreso(`Subiendo ${i+1} de ${files.length}…`);
    const base=file.name.replace(/\.[^.]+$/,'').trim();ids.push(await uno(file,varios?(base.length<2?`${base} doc`:base):f.nombre.trim()));}
  }else{
   const lista=(drive||[]).filter(x=>marcados.has(x.id)),fallos:string[]=[];
   for(let i=0;i<lista.length;i+=4){setProgreso(`Importando de Drive ${Math.min(i+4,lista.length)} de ${lista.length}…`);
    const d=await api({accion:'importar',area_id:area.id,archivos:lista.slice(i,i+4),sede_id:f.sede_id||null,vence:f.vence||null,descripcion:f.descripcion}) as {resultados:{nombre:string;ok:boolean;mensaje:string;id?:string}[]};
    for(const r of d.resultados){if(r.id)ids.push(r.id);if(!r.ok)fallos.push(`${r.nombre}: ${r.mensaje}`);}}
   if(fallos.length){setError(`Se importaron ${ids.length}. No se pudieron: ${fallos.slice(0,5).join(' · ')}`);await onDone(ids);return;}
  }
  await onDone(ids);
 }catch(e){setError(e instanceof Error?e.message:'No se pudo guardar.');}finally{setBusy(false);setProgreso('');}};
 const input={width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10,boxSizing:'border-box' as const};
 const boton=(m:typeof modo,icon:React.ReactNode,t:string)=><button type="button" className={`${styles.button} ${modo===m?styles.primary:''}`} onClick={()=>{setModo(m);setError('');}}>{icon} {t}</button>;
 return <div role="dialog" aria-label="Subir documento" style={{position:'fixed',inset:0,background:'rgba(15,23,42,.45)',display:'grid',placeItems:'center',zIndex:50,padding:16}} onClick={onClose}>
  <div className={styles.card} style={{maxWidth:560,width:'100%',maxHeight:'90vh',overflowY:'auto',display:'grid',gap:10}} onClick={e=>e.stopPropagation()}>
   <h2 style={{margin:0}}>Subir a «{area.nombre}»</h2>
   <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>{boton('archivo',<Upload size={13} style={{display:'inline',verticalAlign:'-2px'}}/>,'Archivos')}{boton('drive',<FolderOpen size={13} style={{display:'inline',verticalAlign:'-2px'}}/>,'Desde Google Drive')}{boton('enlace',<Link2 size={13} style={{display:'inline',verticalAlign:'-2px'}}/>,'Enlace (videos)')}</div>
   {modo==='enlace'&&<label>Enlace<input style={input} value={f.enlace} onChange={e=>setF({...f,enlace:e.target.value})} placeholder="https://…"/></label>}
   {modo==='archivo'&&<label>Archivos (puedes elegir varios a la vez · PDF, Word, Excel, imágenes, presentaciones · máx. 50 MB c/u)<input style={input} type="file" multiple accept={ACEPTA} onChange={e=>{const x=[...(e.target.files||[])];setFiles(x);if(x.length===1&&!f.nombre)setF({...f,nombre:x[0].name.replace(/\.[^.]+$/,'')});}}/></label>}
   {modo==='drive'&&<div style={{display:'grid',gap:6}}>
    <label>Link de la carpeta de Google Drive<input style={input} value={f.carpeta} onChange={e=>{setF({...f,carpeta:e.target.value});setDrive(null);}} placeholder="https://drive.google.com/drive/folders/…"/></label>
    <small className={styles.help}>En Drive comparte la carpeta como «Cualquier persona con el enlace» (lector). Se copian los archivos al ERP (los videos quedan por fuera: guárdalos como enlace). Los Documentos, Hojas y Presentaciones de Google se guardan como PDF o Excel.</small>
    <button type="button" className={styles.button} disabled={busy||!f.carpeta.trim()} onClick={()=>void buscar()}>{busy&&!drive?'Buscando…':'Buscar archivos'}</button>
    {drive&&drive.length>0&&<div style={{border:'1px solid #e2e8f0',borderRadius:10,padding:8,maxHeight:220,overflowY:'auto',display:'grid',gap:4}}>
     <label style={{fontWeight:700}}><input type="checkbox" checked={marcados.size===drive.length} onChange={()=>setMarcados(marcados.size===drive.length?new Set():new Set(drive.map(x=>x.id)))}/> Todos ({drive.length})</label>
     {drive.map(x=><label key={x.id} style={{fontSize:13}}><input type="checkbox" checked={marcados.has(x.id)} onChange={()=>{const n=new Set(marcados);if(n.has(x.id))n.delete(x.id);else n.add(x.id);setMarcados(n);}}/> {x.carpeta?`${x.carpeta} / `:''}{x.nombre}</label>)}
    </div>}
   </div>}
   {(modo==='enlace'||(modo==='archivo'&&!varios))&&<label>Nombre<input style={input} value={f.nombre} onChange={e=>setF({...f,nombre:e.target.value})}/></label>}
   {(varios||modo==='drive')&&<p className={styles.help}>Cada archivo queda como un documento con su propio nombre; la descripción, la sede y el vencimiento se aplican a todos.</p>}
   <label>Descripción (opcional)<input style={input} value={f.descripcion} onChange={e=>setF({...f,descripcion:e.target.value})}/></label>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
    <label>Sede<select style={input} value={f.sede_id} onChange={e=>setF({...f,sede_id:e.target.value})}><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    <VenceInput value={f.vence} onChange={v=>setF({...f,vence:v})}/>
   </div>
   {faltan.length>0&&<p className={styles.help}>Para guardar falta: {faltan.join(' y ')}.</p>}
   {progreso&&<p className={styles.help}>{progreso}</p>}
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}><button type="button" className={styles.button} onClick={onClose} disabled={busy}>Cancelar</button><button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy||faltan.length>0} onClick={()=>void save()}>{busy?'Guardando…':modo==='drive'?`Importar ${marcados.size||''}`:varios?`Subir ${files.length} archivos`:'Guardar'}</button></div>
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
   <p className={styles.help}>Cambia nombres, crea subáreas y decide quién ve y quién sube en cada una. Si no marcas a nadie en «Ven», la ven todos los perfiles con acceso al módulo; administración siempre ve y sube todo. Una subárea respeta también las restricciones de su área principal. «La IA lee»: la IA de WhatsApp usa los documentos vigentes de esa área (planes, precios, promociones) para atender a las clientas; déjalo en «No» para información interna.</p>
   {error&&<p role="alert" className={styles.error}>{error}</p>}
   <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'end'}}>
    <label style={{flex:1,minWidth:180}}>Nueva área o subárea<input value={nueva.nombre} onChange={e=>setNueva({...nueva,nombre:e.target.value})} placeholder="Ej.: Campañas 2027" style={{width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10,boxSizing:'border-box'}}/></label>
    <label>Dentro de<select value={nueva.padre_id} onChange={e=>setNueva({...nueva,padre_id:e.target.value})} style={{padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10}}><option value="">(área principal)</option>{ordenadas.map(a=><option key={a.id} value={a.id}>{nombreRuta(a)}</option>)}</select></label>
    <button type="button" className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void crear()}><Plus size={13} style={{display:'inline',verticalAlign:'-2px'}}/> Crear</button>
   </div>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Área</th><th>Dentro de</th><th>Orden</th><th>Ven</th><th>Suben archivos</th><th title="La IA de WhatsApp usa sus documentos para atender clientas">La IA lee</th><th>Activa</th></tr></thead><tbody>
    {ordenadas.map(a=><tr key={a.id} style={{opacity:a.activo?1:.55}}>
     <td><input defaultValue={a.nombre} onBlur={e=>{const v=e.target.value.trim();if(v&&v!==a.nombre)void save(a.id,{nombre:v});}} style={{padding:'6px 8px',border:'1px solid #e2e8f0',borderRadius:8,minWidth:150}}/></td>
     <td><select value={a.padre_id||''} disabled={busy} onChange={e=>void save(a.id,{padre_id:e.target.value||null})} style={{padding:'6px',border:'1px solid #e2e8f0',borderRadius:8}}><option value="">(principal)</option>{ordenadas.filter(x=>x.id!==a.id&&!desc(a.id).includes(x.id)).map(x=><option key={x.id} value={x.id}>{nombreRuta(x)}</option>)}</select></td>
     <td><input type="number" defaultValue={a.orden} onBlur={e=>{const v=Number(e.target.value);if(Number.isFinite(v)&&v!==a.orden)void save(a.id,{orden:v});}} style={{width:60,padding:'6px',border:'1px solid #e2e8f0',borderRadius:8}}/></td>
     <td>{otros.map(r=><label key={r.id} style={{display:'block',fontSize:12,whiteSpace:'nowrap'}}><input type="checkbox" disabled={busy} checked={a.ver_roles.includes(r.id)} onChange={()=>void save(a.id,{ver_roles:toggle(a.ver_roles.filter(x=>x!=='admin'),r.id).length?toggle(a.ver_roles.filter(x=>x!=='admin'),r.id):a.ver_roles.includes('admin')||a.ver_roles.length===1?['admin']:[]})}/> {r.nombre}</label>)}
      <label style={{display:'block',fontSize:12}}><input type="checkbox" disabled={busy} checked={a.ver_roles.length===0} onChange={()=>void save(a.id,{ver_roles:a.ver_roles.length?[]:['admin']})}/> <b>Todos</b></label></td>
     <td>{otros.map(r=><label key={r.id} style={{display:'block',fontSize:12,whiteSpace:'nowrap'}}><input type="checkbox" disabled={busy} checked={a.editar_roles.includes(r.id)} onChange={()=>void save(a.id,{editar_roles:toggle(a.editar_roles,r.id)})}/> {r.nombre}</label>)}</td>
     <td><select value={a.ia_lee===null||a.ia_lee===undefined?'':a.ia_lee?'si':'no'} disabled={busy} onChange={e=>void save(a.id,{ia_lee:e.target.value===''?null:e.target.value==='si'})} style={{padding:'6px',border:'1px solid #e2e8f0',borderRadius:8}}>
      <option value="">{a.padre_id?'Igual que su área':'No'}</option><option value="si">Sí</option><option value="no">No</option></select></td>
     <td><input type="checkbox" disabled={busy} checked={a.activo} onChange={()=>void save(a.id,{activo:!a.activo})} aria-label="Activa"/></td>
    </tr>)}
   </tbody></table></div>
   <button type="button" className={styles.button} onClick={onClose}>Listo</button>
  </div></div>;
}

/** Expiry date of a document, or «Nunca» (no expiry: the date is cleared). */
function VenceInput({value,onChange}:{value:string;onChange:(v:string)=>void}){
 const [nunca,setNunca]=useState(false);
 return <label>Vence (opcional)<span style={{display:'flex',gap:8,alignItems:'center'}}>
  <input style={{width:'100%',padding:'8px 10px',border:'1px solid #e2e8f0',borderRadius:10,boxSizing:'border-box',flex:1}} type="date" value={value} disabled={nunca} onChange={e=>onChange(e.target.value)}/>
  <span style={{display:'flex',gap:4,alignItems:'center',whiteSpace:'nowrap',fontSize:13}}><input type="checkbox" checked={nunca} onChange={e=>{setNunca(e.target.checked);if(e.target.checked)onChange('');}}/>Nunca</span>
 </span></label>;
}

/** Pop-up viewer of a document: the team reads it in the ERP instead of downloading it. */
function Visor({vista,onClose}:{vista:{nombre:string;url:string;descarga:string;clase:string};onClose:()=>void}){
 const ref=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 useEffect(()=>{if(vista.clase!=='docx')return;let live=true;void (async()=>{try{
  const r=await fetch(vista.url);const buf=await r.arrayBuffer();const {renderDocx}=await import('@/lib/docx-view');if(live&&ref.current)await renderDocx(buf,ref.current);
 }catch(e){if(live)setError(e instanceof Error?e.message:'No se pudo mostrar el documento.');}})();return()=>{live=false;};},[vista]);
 const caja={width:'100%',height:'72vh',border:'1px solid #e2e8f0',borderRadius:12,background:'#fff'};
 return <div role="dialog" aria-label={vista.nombre} style={{position:'fixed',inset:0,background:'rgba(15,23,42,.55)',display:'grid',placeItems:'center',zIndex:60,padding:12}} onClick={onClose}>
  <div style={{background:'#f8fafc',borderRadius:16,padding:14,width:'min(960px,100%)',display:'grid',gap:10}} onClick={e=>e.stopPropagation()}>
   <div style={{display:'flex',gap:8,alignItems:'center'}}><h2 style={{margin:0,flex:1,fontSize:16,fontWeight:900}}>{vista.nombre}</h2>
    <a href={vista.descarga} target="_blank" rel="noopener noreferrer" style={{fontSize:13,fontWeight:700,color:'#be123c'}}>Descargar</a>
    <button type="button" onClick={onClose} style={{border:'1px solid #e2e8f0',background:'#fff',borderRadius:10,padding:'6px 12px',fontWeight:700,cursor:'pointer'}}>Cerrar</button></div>
   {vista.clase==='img'?<div style={{...caja,overflow:'auto',display:'grid',placeItems:'center'}}><img src={vista.url} alt={vista.nombre} style={{maxWidth:'100%'}}/></div>
   :vista.clase==='video'?<video src={vista.url} controls style={caja}/>
   :vista.clase==='pdf'||vista.clase==='frame'?<iframe src={vista.url} title={vista.nombre} style={caja}/>
   :vista.clase==='docx'?<div style={{...caja,overflow:'auto',padding:'24px 28px',boxSizing:'border-box',fontSize:14,lineHeight:1.5,color:'#0f172a'}}>{error?<p role="alert">{error}</p>:null}<div ref={ref}><p style={{color:'#64748b'}}>Cargando documento…</p></div></div>
   :<div style={{...caja,display:'grid',placeItems:'center',height:'auto',padding:24,textAlign:'center'}}><p>Este tipo de archivo (Excel, PowerPoint u otro) no se puede ver aquí. Toca <b>Descargar</b> para abrirlo.</p></div>}
  </div>
 </div>;
}
