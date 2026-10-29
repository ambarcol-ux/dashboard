'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {createUserAction,resetPasswordAction} from '@/app/admin/users/actions';
import {Switch} from '@/components/TeamCards';
import {panelById,type PanelOverrides} from '@/lib/panel-access';
import styles from '@/app/dashboard/caja/caja.module.css';

export type TPerson={id:string;nombre:string|null;email:string|null;rol:string|null;rol_id?:string|null;estado_ficha?:string|null;sede_id:string|null;activo:boolean|null;extra?:string[]};
export type TRole={id:string;nombre:string;ve_todas_sedes?:boolean};
type Ficha={id:string;nombre_completo:string|null;sede_id:string|null;activo:boolean|null;profile_id:string|null;aparece_como_vendedora:boolean|null};
export type TeamCtx={people:TPerson[];sedes:Record<string,string>;roles:TRole[];userSedes:Record<string,string[]>;reload:()=>Promise<void>;onError:(m:string)=>void;onNotice:(m:string)=>void};

const nameOf=(p?:TPerson|null)=>p?.nombre||p?.email||'—';
const baseRol=(r:string)=>r==='admin'||r==='contabilidad'?r:'asesora';
const msg=(e:unknown)=>e&&typeof e==='object'&&'message' in e?String((e as {message:unknown}).message):'No se pudo guardar.';
/** Role a person works with today: confirmed = rol_id; pending = legacy base role and extra roles. */
export const rolActual=(p:TPerson)=>p.estado_ficha==='confirmada'?p.rol_id||'':p.rol_id||String(p.rol||'').toLowerCase();

function useFichas(){
 const [fichas,setFichas]=useState<Ficha[]>([]),[tick,setTick]=useState(0);
 useEffect(()=>{let live=true;void supabase.from('asesoras').select('id,nombre_completo,sede_id,activo,profile_id,aparece_como_vendedora').order('nombre_completo').then(({data})=>{if(live)setFichas((data||[]) as Ficha[]);});return()=>{live=false;};},[tick]);
 return [fichas,()=>setTick(t=>t+1)] as const;
}

function SedesPicker({sedes,value,onChange,all}:{sedes:Record<string,string>;value:string[];onChange:(v:string[])=>void;all:boolean}){
 if(all)return <p className={styles.help}>Este rol ve todas las sedes.</p>;
 return <div style={{display:'flex',flexWrap:'wrap',gap:12}}>{Object.entries(sedes).map(([id,n])=><label key={id} className={styles.check}><input type="checkbox" checked={value.includes(id)} onChange={e=>onChange(e.target.checked?[...value,id]:value.filter(x=>x!==id))}/>{n}</label>)}</div>;
}

/** Personas: list with filters, "Nueva persona", editable ficha and fichas without ERP user. */
export function PeopleTab(ctx:TeamCtx){
 const {people,sedes,roles,userSedes}=ctx;
 const [f,setF]=useState({rol:'',sede:'',activo:'activos'}),[sel,setSel]=useState<string|null>(null),[nuevo,setNuevo]=useState(false),[fichas,reloadFichas]=useFichas();
 const sedesOf=(p:TPerson)=>(userSedes[p.id]?.length?userSedes[p.id]:p.sede_id?[p.sede_id]:[]).filter(id=>id in sedes);
 const veTodas=(r:string)=>!!roles.find(x=>x.id===r)?.ve_todas_sedes;
 const list=people.filter(p=>String(p.rol).toLowerCase()!=='proveedor'&&(!f.rol||rolActual(p)===f.rol)&&(!f.sede||sedesOf(p).includes(f.sede)||veTodas(rolActual(p)))&&(f.activo==='todos'||(f.activo==='activos')===(p.activo!==false)));
 const person=people.find(p=>p.id===sel);
 const reload=async()=>{reloadFichas();await ctx.reload();};
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:12}}>
   <label>Rol<select value={f.rol} onChange={e=>setF({...f,rol:e.target.value})}><option value="">Todos</option>{roles.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
   <label>Sede<select value={f.sede} onChange={e=>setF({...f,sede:e.target.value})}><option value="">Todas</option>{Object.entries(sedes).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></label>
   <label>Estado<select value={f.activo} onChange={e=>setF({...f,activo:e.target.value})}><option value="activos">Activos</option><option value="inactivos">Inactivos</option><option value="todos">Todos</option></select></label>
   <div className={styles.actions} style={{alignSelf:'end'}}><button className={`${styles.button} ${styles.primary}`} onClick={()=>{setNuevo(true);setSel(null);}}>Nueva persona</button></div>
  </div>
  {nuevo&&<NewPerson ctx={ctx} onDone={async()=>{setNuevo(false);await reload();}}/>}
  {person&&<PersonEditor key={person.id} person={person} ctx={ctx} fichas={fichas} sedesActuales={sedesOf(person)} onDone={reload} onClose={()=>setSel(null)}/>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Persona</th><th>Rol</th><th>Sedes</th><th>Ficha</th><th>Estado</th></tr></thead>
   <tbody>{list.map(p=>{const r=rolActual(p);return <tr key={p.id} onClick={()=>{setSel(p.id);setNuevo(false);}} style={{cursor:'pointer',opacity:p.activo===false?.6:1}}>
    <td><b>{nameOf(p)}</b><small>{p.email}</small></td><td>{roles.find(x=>x.id===r)?.nombre||r||'—'}</td>
    <td>{veTodas(r)?'Todas':sedesOf(p).map(s=>sedes[s]||'—').join(', ')||'—'}</td>
    <td><span className={`${styles.badge} ${p.estado_ficha==='confirmada'?styles.badgeIn:styles.badgeWarn}`}>{p.estado_ficha==='confirmada'?'Confirmada':'Pendiente'}</span></td>
    <td>{p.activo===false?'Inactivo':'Activo'}{(()=>{const fi=fichas.find(x=>x.profile_id===p.id);return fi&&(fi.activo!==false)!==(p.activo!==false)?<small>ficha {fi.activo===false?'inactiva':'activa'}</small>:null;})()}</td></tr>;})}</tbody></table></div>
  {f.activo!=='activos'&&<FichasHistorial sedes={sedes}/>}
 </section>;
}

function PersonEditor({person,ctx,fichas,sedesActuales,onDone,onClose}:{person:TPerson;ctx:TeamCtx;fichas:Ficha[];sedesActuales:string[];onDone:()=>Promise<void>;onClose:()=>void}){
 const ficha=fichas.find(x=>x.profile_id===person.id);
 const [d,setD]=useState({nombre:person.nombre||'',rol_id:rolActual(person),sedes:sedesActuales,activo:person.activo!==false,vendedora:!!ficha?.aparece_como_vendedora}),[busy,setBusy]=useState(false),[clave,setClave]=useState(''),[link,setLink]=useState('');
 const all=!!ctx.roles.find(r=>r.id===d.rol_id)?.ve_todas_sedes;
 const save=async()=>{setBusy(true);const {error}=await supabase.rpc('guardar_persona',{p_usuario:person.id,p_datos:{nombre:d.nombre,rol_id:d.rol_id||undefined,sedes:all?[]:d.sedes,activo:d.activo,vendedora:d.vendedora}});setBusy(false);if(error)return ctx.onError(error.code==='23505'?'Ya existe una ficha con ese nombre':error.message);ctx.onNotice(`Ficha de ${d.nombre} guardada.${person.estado_ficha==='confirmada'?'':' Sigue pendiente hasta confirmarla en Revisión.'}`);await onDone();};
 const reset=async()=>{const r=await resetPasswordAction(person.id,clave);if(!r.success)return ctx.onError(r.message);setClave('');ctx.onNotice(`Clave temporal de ${d.nombre} restablecida.`);};
 const unir=async()=>{const {error}=await supabase.rpc('unir_ficha',{p_ficha:link,p_usuario:person.id});if(error)return ctx.onError(error.message);setLink('');await onDone();};
 return <div className={styles.card} style={{margin:'0 0 14px',background:'#f8fafc'}}>
  <div style={{display:'flex',justifyContent:'space-between'}}><h2>{nameOf(person)} <small className={styles.help}>{person.email} · ficha {person.estado_ficha==='confirmada'?'confirmada':'pendiente'}</small></h2><button className={styles.button} onClick={onClose}>Cerrar</button></div>
  <div className={styles.toolbar}>
   <label>Nombre<input value={d.nombre} onChange={e=>setD({...d,nombre:e.target.value})}/></label>
   <label>Rol<select value={d.rol_id} onChange={e=>setD({...d,rol_id:e.target.value})}><option value="">Elegir…</option>{ctx.roles.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
   <label className={styles.check} style={{alignSelf:'end'}}>Activo <Switch on={d.activo} title="Activo" onClick={()=>setD({...d,activo:!d.activo})}/></label>
   <label className={styles.check} style={{alignSelf:'end'}}><input type="checkbox" checked={d.vendedora} onChange={e=>setD({...d,vendedora:e.target.checked})}/>Aparece como vendedora</label>
  </div>
  <p className={styles.help} style={{margin:'8px 0 4px'}}>Sedes</p>
  <SedesPicker sedes={ctx.sedes} value={d.sedes} onChange={v=>setD({...d,sedes:v})} all={all}/>
  <p className={styles.help} style={{marginTop:8}}>Ficha de asesora: <b>{ficha?.nombre_completo||'sin ficha'}</b>
   <select value={link} onChange={e=>setLink(e.target.value)} style={{marginLeft:8}}><option value="">Unir otra ficha…</option>{fichas.filter(x=>!x.profile_id).map(x=><option key={x.id} value={x.id}>{x.nombre_completo}</option>)}</select>
   <button className={styles.button} disabled={!link} onClick={()=>void unir()}>Unir</button></p>
  <div className={styles.actions} style={{marginTop:10}}>
   <button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void save()}>{busy?'Guardando…':'Guardar ficha'}</button>
   <input type="password" autoComplete="new-password" placeholder="Clave temporal (mín. 6)" value={clave} onChange={e=>setClave(e.target.value)}/>
   <button className={styles.button} disabled={clave.length<6} onClick={()=>void reset()}>Restablecer clave</button>
  </div>
 </div>;
}

function NewPerson({ctx,onDone}:{ctx:TeamCtx;onDone:()=>Promise<void>}){
 const [d,setD]=useState({nombre:'',entra:true,email:'',clave:'',rol_id:'asesora',sedes:[] as string[],vendedora:true}),[busy,setBusy]=useState(false);
 const all=!!ctx.roles.find(r=>r.id===d.rol_id)?.ve_todas_sedes;
 const create=async()=>{
  if(d.nombre.trim().length<3)return ctx.onError('Escribe el nombre completo.');
  if(!all&&!d.sedes.length)return ctx.onError('Elige al menos una sede.');
  setBusy(true);
  try{
   if(d.entra){
    const r=await createUserAction({email:d.email.trim(),password:d.clave,nombre:d.nombre.trim(),sede_id:all?'':d.sedes[0],rol:baseRol(d.rol_id)});
    if(!r.success||!r.user?.id)throw Error(r.message||'No se pudo crear el usuario.');
    const {error}=await supabase.rpc('guardar_persona',{p_usuario:r.user.id,p_datos:{rol_id:d.rol_id,sedes:all?[]:d.sedes,vendedora:d.vendedora,estado:'confirmada'}});
    if(error)throw error;
   }else{
    const {error}=await supabase.from('asesoras').insert([{nombre:d.nombre.trim(),nombre_completo:d.nombre.trim(),sede_id:d.sedes[0]||null,aparece_como_vendedora:d.vendedora}]);
    if(error)throw error;
   }
   ctx.onNotice(`${d.nombre.trim()} creada${d.entra?' con usuario del ERP (ficha confirmada)':' sin usuario del ERP'}.`);await onDone();
  }catch(e){ctx.onError(msg(e));}finally{setBusy(false);}
 };
 return <div className={styles.card} style={{margin:'0 0 14px',background:'#fff7ed'}}>
  <h2>Nueva persona</h2>
  <p className={styles.help}>1. Datos · 2. Usuario del ERP · 3. Rol · 4. Sedes · 5. Vendedora. Nace confirmada.</p>
  <div className={styles.toolbar}>
   <label>1. Nombre completo<input value={d.nombre} onChange={e=>setD({...d,nombre:e.target.value})}/></label>
   {d.entra&&<><label>Correo<input type="email" autoComplete="off" value={d.email} onChange={e=>setD({...d,email:e.target.value})}/></label>
    <label>Clave temporal<input type="password" autoComplete="new-password" value={d.clave} onChange={e=>setD({...d,clave:e.target.value})}/></label></>}
   <label>3. Rol<select value={d.rol_id} onChange={e=>setD({...d,rol_id:e.target.value})}>{ctx.roles.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
   <label className={styles.check} style={{alignSelf:'end'}}><input type="checkbox" checked={d.vendedora} onChange={e=>setD({...d,vendedora:e.target.checked})}/>5. Aparece como vendedora</label>
  </div>
  <p className={styles.help} style={{margin:'8px 0 4px'}}>4. Sedes</p>
  <SedesPicker sedes={ctx.sedes} value={d.sedes} onChange={v=>setD({...d,sedes:v})} all={all}/>
  <div className={styles.actions} style={{marginTop:10}}><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void create()}>{busy?'Creando…':'Crear persona'}</button></div>
 </div>;
}

function FreeFichas({ctx,fichas,onDone}:{ctx:TeamCtx;fichas:Ficha[];onDone:()=>Promise<void>}){
 const free=fichas.filter(f=>!f.profile_id);
 const [crear,setCrear]=useState<string|null>(null);
 const upd=async(f:Ficha,patch:Partial<Ficha>)=>{const {error}=await supabase.from('asesoras').update(patch).eq('id',f.id);if(error)ctx.onError(error.code==='23505'?'Ya existe una ficha con ese nombre':error.message);else await onDone();};
 const unir=async(f:Ficha,u:string)=>{const {error}=await supabase.rpc('unir_ficha',{p_ficha:f.id,p_usuario:u});if(error)ctx.onError(error.message);else await onDone();};
 return <><h2 style={{marginTop:18}}>Fichas sin usuario del ERP ({free.length})</h2>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Nombre</th><th>Sede</th><th>Vendedora</th><th>Unir a usuario</th><th>Estado</th><th></th></tr></thead><tbody>
   {free.map(f=><tr key={f.id}><td><input defaultValue={f.nombre_completo||''} onBlur={e=>{const n=e.target.value.trim();if(n&&n!==f.nombre_completo)void upd(f,{nombre_completo:n});}}/></td>
    <td><select value={f.sede_id||''} onChange={e=>void upd(f,{sede_id:e.target.value||null})}><option value="">—</option>{Object.entries(ctx.sedes).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select></td>
    <td><input type="checkbox" checked={!!f.aparece_como_vendedora} onChange={e=>void upd(f,{aparece_como_vendedora:e.target.checked})}/></td>
    <td><select value="" onChange={e=>{if(e.target.value)void unir(f,e.target.value);}}><option value="">Elegir usuario…</option>{ctx.people.filter(p=>p.activo!==false).map(p=><option key={p.id} value={p.id}>{nameOf(p)}</option>)}</select></td>
    <td><Switch on={f.activo!==false} title="Activar o inactivar" onClick={()=>void upd(f,{activo:f.activo===false})}/></td>
    <td>{f.activo!==false&&<button className={styles.button} onClick={()=>setCrear(crear===f.id?null:f.id)}>Crear usuario</button>}</td></tr>)}
  </tbody></table></div>
  {crear&&(()=>{const f=free.find(x=>x.id===crear);return f?<CreateUserForFicha key={f.id} ficha={f} ctx={ctx} onDone={async()=>{setCrear(null);await onDone();}}/>:null;})()}</>;
}

/** Old fichas without user that still have contracts or other records: shown with Estado = Inactivos as history. */
function FichasHistorial({sedes}:{sedes:Record<string,string>}){
 const [rows,setRows]=useState<{id:string;nombre:string;sede_id:string|null;referencias:number}[]>([]);
 useEffect(()=>{let live=true;void supabase.rpc('fichas_historial').then(({data})=>{if(live)setRows((data||[]) as typeof rows);});return()=>{live=false;};},[]);
 if(!rows.length)return null;
 return <><h2 style={{marginTop:18}}>Historial · fichas anteriores ({rows.length})</h2>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Ficha</th><th>Sede</th><th>Registros</th><th>Estado</th></tr></thead>
   <tbody>{rows.map(f=><tr key={f.id} style={{opacity:.7}}><td>{f.nombre}</td><td>{f.sede_id?sedes[f.sede_id]||'—':'—'}</td><td>{f.referencias}</td><td>Historial</td></tr>)}</tbody></table></div></>;
}

/** Creates the ERP user of an existing ficha and links it to THAT ficha (no new ficha). */
function CreateUserForFicha({ficha,ctx,onDone}:{ficha:Ficha;ctx:TeamCtx;onDone:()=>Promise<void>}){
 const [d,setD]=useState({email:'',clave:'',rol_id:'asesora',sedes:ficha.sede_id&&ficha.sede_id in ctx.sedes?[ficha.sede_id]:[] as string[]}),[busy,setBusy]=useState(false);
 const all=!!ctx.roles.find(r=>r.id===d.rol_id)?.ve_todas_sedes;
 const create=async()=>{
  if(!all&&!d.sedes.length)return ctx.onError('Elige al menos una sede.');
  setBusy(true);
  try{
   const r=await createUserAction({email:d.email.trim(),password:d.clave,nombre:ficha.nombre_completo||'',sede_id:all?'':d.sedes[0],rol:baseRol(d.rol_id)});
   if(!r.success||!r.user?.id)throw Error(r.message||'No se pudo crear el usuario.');
   const u=await supabase.rpc('unir_ficha',{p_ficha:ficha.id,p_usuario:r.user.id});if(u.error)throw u.error;
   const g=await supabase.rpc('guardar_persona',{p_usuario:r.user.id,p_datos:{rol_id:d.rol_id,sedes:all?[]:d.sedes,estado:'confirmada'}});if(g.error)throw g.error;
   ctx.onNotice(`Usuario creado para ${ficha.nombre_completo} y unido a su ficha.`);await onDone();
  }catch(e){ctx.onError(msg(e));}finally{setBusy(false);}
 };
 return <div className={styles.card} style={{margin:'10px 0',background:'#fff7ed'}}>
  <h3 style={{margin:0}}>Crear usuario para {ficha.nombre_completo}</h3>
  <div className={styles.toolbar}>
   <label>Correo<input type="email" autoComplete="off" value={d.email} onChange={e=>setD({...d,email:e.target.value})}/></label>
   <label>Clave temporal<input type="password" autoComplete="new-password" value={d.clave} onChange={e=>setD({...d,clave:e.target.value})}/></label>
   <label>Rol<select value={d.rol_id} onChange={e=>setD({...d,rol_id:e.target.value})}>{ctx.roles.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
  </div>
  <SedesPicker sedes={ctx.sedes} value={d.sedes} onChange={v=>setD({...d,sedes:v})} all={all}/>
  <div className={styles.actions} style={{marginTop:8}}><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={()=>void create()}>{busy?'Creando…':'Crear usuario'}</button></div>
 </div>;
}

/** Revisión: one card per pending person to choose its single role, sedes and the fate of each permission outside the role. */
export function ReviewTab({ctx,rolePerms,userRoles,saved,permisos}:{ctx:TeamCtx;rolePerms:Record<string,string[]>;userRoles:Record<string,string[]>;saved:Record<string,PanelOverrides>;permisos:{codigo:string;accion:string;modulo:string}[]}){
 const pend=ctx.people.filter(p=>p.estado_ficha!=='confirmada'&&String(p.rol).toLowerCase()!=='proveedor');
 return <section className={styles.card}><h2>Revisión de fichas · {pend.length} pendiente{pend.length===1?'':'s'}</h2>
  <p className={styles.help}>Al confirmar, la persona queda solo con su rol, los permisos de ese rol y sus sedes. Los cambios individuales se pasan al rol o se quitan.</p>
  {pend.map(p=><ReviewCard key={p.id} p={p} ctx={ctx} rolePerms={rolePerms} extra={userRoles[p.id]||[]} overrides={saved[p.id]||{}} permisos={permisos}/>)}
  {!pend.length&&<p className={styles.empty}>Todas las fichas están confirmadas.</p>}
 </section>;
}

function ReviewCard({p,ctx,rolePerms,extra,overrides,permisos}:{p:TPerson;ctx:TeamCtx;rolePerms:Record<string,string[]>;extra:string[];overrides:PanelOverrides;permisos:{codigo:string;accion:string;modulo:string}[]}){
 const base=String(p.rol||'').toLowerCase(),legacy=[...new Set([base,...extra])];
 const elegir=legacy.includes('bodega')||extra.filter(r=>r!==base).length>1;
 const [rol,setRol]=useState(elegir?'':(p.rol_id||extra.find(r=>r!==base)||base));
 const [sedesSel,setSedesSel]=useState<string[]>((ctx.userSedes[p.id]?.length?ctx.userSedes[p.id]:p.sede_id?[p.sede_id]:[]).filter(id=>id in ctx.sedes));
 const [legacyPerms,setLegacyPerms]=useState<string[]>([]),[done,setDone]=useState<string[]>([]),[busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;void supabase.rpc('permisos_de',{p_usuario:p.id}).then(({data})=>{if(live)setLegacyPerms((data||[]) as string[]);});return()=>{live=false;};},[p.id]);
 const all=!!ctx.roles.find(r=>r.id===rol)?.ve_todas_sedes;
 const roleSet=useMemo(()=>new Set(rol==='admin'?permisos.map(x=>x.codigo):rolePerms[rol]||[]),[rol,rolePerms,permisos]);
 const fuera=legacyPerms.filter(c=>!roleSet.has(c)&&!done.includes(c));
 const ovr=Object.entries(overrides).filter(([k])=>!done.includes(`panel:${k}`));
 const label=(c:string)=>permisos.find(x=>x.codigo===c)?.accion||c;
 const run=async(fn:()=>PromiseLike<{error:{message:string}|null}>,key:string)=>{setBusy(true);const {error}=await fn();setBusy(false);if(error)ctx.onError(error.message);else setDone(d=>[...d,key]);};
 const quitarPanel=(panel:string)=>supabase.rpc('guardar_accesos_panel',{p_usuario:p.id,p_cambios:[{panel,estado:'defecto'}]});
 const confirmar=async()=>{setBusy(true);const {error}=await supabase.rpc('guardar_persona',{p_usuario:p.id,p_datos:{rol_id:rol,sedes:all?[]:sedesSel,estado:'confirmada'}});setBusy(false);if(error)return ctx.onError(error.message);ctx.onNotice(`Ficha de ${nameOf(p)} confirmada.`);await ctx.reload();};
 return <div className={styles.card} style={{margin:'12px 0',background:'#f8fafc',opacity:p.activo===false?.7:1}}>
  <h3 style={{margin:0}}>{nameOf(p)} <small className={styles.help}>{p.email}{p.activo===false?' · inactivo':''} · roles hoy: {legacy.join(' + ')||'—'}</small></h3>
  <div className={styles.toolbar} style={{marginTop:8}}>
   <label>Rol {elegir?'(elige uno)':'sugerido'}<select value={rol} onChange={e=>setRol(e.target.value)}><option value="">Elegir…</option>{ctx.roles.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
  </div>
  <p className={styles.help} style={{margin:'8px 0 4px'}}>Sedes</p>
  <SedesPicker sedes={ctx.sedes} value={sedesSel} onChange={setSedesSel} all={all}/>
  {(fuera.length>0||ovr.length>0)&&<><p className={styles.help} style={{margin:'10px 0 4px'}}>Permisos fuera de su rol</p>
   <table className={styles.table}><tbody>
    {fuera.map(c=><tr key={c}><td>{label(c)}<small>{c}</small></td><td style={{whiteSpace:'nowrap'}}>
     <button className={styles.button} disabled={busy||!rol||rol==='admin'} onClick={()=>void run(()=>supabase.rpc('pasar_permiso_a_rol',{p_rol:rol,p_permiso:c,p_agregar:true}),c)}>Pasar a todo el rol</button>{' '}
     <button className={styles.button} disabled={busy} onClick={()=>setDone(d=>[...d,c])}>Quitar</button></td></tr>)}
    {ovr.map(([panel,estado])=><tr key={panel}><td>Panel {panelById(panel)?.label||panel}: {estado==='permitido'?'permitido a mano':'quitado a mano'}</td><td style={{whiteSpace:'nowrap'}}>
     <button className={styles.button} disabled={busy||!rol||rol==='admin'} onClick={()=>void run(async()=>{const r=await supabase.rpc('pasar_permiso_a_rol',{p_rol:rol,p_permiso:`panel.${panel}`,p_agregar:estado==='permitido'});return r.error?r:quitarPanel(panel);},`panel:${panel}`)}>Pasar a todo el rol</button>{' '}
     <button className={styles.button} disabled={busy} onClick={()=>void run(()=>quitarPanel(panel),`panel:${panel}`)}>Quitar</button></td></tr>)}
   </tbody></table></>}
  <div className={styles.actions} style={{marginTop:10}}><button className={`${styles.button} ${styles.primary}`} disabled={busy||!rol||(!all&&!sedesSel.length)} onClick={()=>void confirmar()}>Confirmar</button>
   {(fuera.length+ovr.length)>0&&<span className={styles.help}>{fuera.length+ovr.length} permiso(s) sin decidir: al confirmar se quitan.</span>}</div>
 </div>;
}

type Row={fecha:string;que:string;persona:string;detalle:string;por:string};
/** One history: panel changes, role changes and team (ficha, rol, sedes, confirmación) changes. */
export function UnifiedHistory({people,roles,panelLog,roleLog,teamLog}:{people:TPerson[];roles:TRole[];
 panelLog:{id:number;usuario_id:string;panel:string;estado_anterior:string|null;estado_nuevo:string;cambiado_por:string|null;cambiado_at:string}[];
 roleLog:{id:number;tipo:string;objetivo:string;detalle:Record<string,unknown>;usuario:string|null;fecha_hora:string}[];
 teamLog:{id:number;usuario_id:string|null;tipo:string;detalle:Record<string,unknown>;hecho_por:string|null;fecha:string}[]}){
 const who=(id:string|null)=>nameOf(people.find(p=>p.id===id));
 const rn=(id:unknown)=>roles.find(r=>r.id===id)?.nombre||String(id||'—');
 const list=(v:unknown)=>Array.isArray(v)&&v.length?v.join(', '):'—';
 const rows:Row[]=[
  ...panelLog.map(l=>({fecha:l.cambiado_at,que:'Panel',persona:who(l.usuario_id),detalle:`${panelById(l.panel)?.label||l.panel}: ${l.estado_anterior||'defecto'} → ${l.estado_nuevo}`,por:who(l.cambiado_por)})),
  ...roleLog.map(l=>({fecha:l.fecha_hora,que:l.tipo==='permisos_rol'?'Permisos del rol':l.tipo==='crear_rol'?'Nuevo rol':l.tipo==='sedes_rol'?'Sedes del rol':'Roles de persona',
   persona:l.tipo==='roles_usuario'?who(l.objetivo):rn(l.objetivo),
   detalle:l.tipo==='permisos_rol'?`+ ${list(l.detalle.agregados)} · − ${list(l.detalle.quitados)}`:l.tipo==='sedes_rol'?(l.detalle.ve_todas_sedes?'Ve todas las sedes':'Solo sus sedes'):l.tipo==='roles_usuario'?`${list(l.detalle.antes)} → ${list(l.detalle.despues)}`:'',por:who(l.usuario)})),
  ...teamLog.map(l=>{const a=(l.detalle.antes||{}) as Record<string,unknown>,b=(l.detalle.despues||{}) as Record<string,unknown>;
   const cambios=['nombre','rol_id','activo','estado','sedes'].filter(k=>JSON.stringify(a[k])!==JSON.stringify(b[k])).map(k=>k==='rol_id'?`rol ${rn(a[k])} → ${rn(b[k])}`:k==='sedes'?'sedes':`${k} ${String(a[k]??'—')} → ${String(b[k]??'—')}`);
   return {fecha:l.fecha,que:l.tipo==='confirmacion'?'Confirmación':'Ficha',persona:who(l.usuario_id),detalle:l.detalle.unir_ficha?'Ficha de asesora unida':cambios.join(' · ')||'Sin cambios',por:who(l.hecho_por)};}),
 ].sort((x,y)=>y.fecha.localeCompare(x.fecha));
 return <section className={styles.card}><h2>Historial</h2><p className={styles.help}>Paneles, roles y permisos, fichas, sedes y confirmaciones.</p>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Qué</th><th>Persona / rol</th><th>Detalle</th><th>Hecho por</th></tr></thead>
   <tbody>{rows.map((r,i)=><tr key={i}><td>{new Date(r.fecha).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td><td>{r.que}</td><td>{r.persona}</td><td className={styles.help}>{r.detalle}</td><td>{r.por}</td></tr>)}</tbody></table></div>
  {!rows.length&&<p className={styles.empty}>Aún no hay cambios.</p>}
 </section>;
}
