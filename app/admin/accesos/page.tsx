'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {ShieldCheck} from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import {useVerifiedAccess} from '@/components/VerifiedAccessProvider';
import {supabase} from '@/lib/supabase';
import {isAdminProfile,isSupplier} from '@/lib/role-access';
import {isAccounting} from '@/lib/role-access';
import {PANELS,canReceiveGrants,panelAccess,panelById,rolePanelAccess,type PanelOverride,type PanelOverrides} from '@/lib/panel-access';
import {resetPermissions} from '@/lib/use-permissions';
import {resetPanelOverrides} from '@/lib/use-panel-overrides';
import styles from '@/app/dashboard/caja/caja.module.css';
import {PersonTeamCard} from '@/components/TeamCards';
import {PeopleTab,ReviewTab,UnifiedHistory} from '@/components/TeamAdmin';

type Person={id:string;nombre:string|null;email:string|null;rol:string|null;rol_id?:string|null;estado_ficha?:string|null;sede_id:string|null;activo:boolean|null;extra?:string[]};
/** Base role plus the extra roles assigned in Roles y permisos (asesora_lider, franquiciado…). */
const rolesOf=(p:Person)=>[...new Set([String(p.rol||'').toLowerCase(),...(p.extra||[])].filter(Boolean))];
const rolTexto=(p:Person)=>rolesOf(p).join(' + ')||'sin rol';
type Choice='defecto'|PanelOverride;
type LogRow={id:number;usuario_id:string;panel:string;estado_anterior:string|null;estado_nuevo:string;cambiado_por:string|null;cambiado_at:string};
const CHOICE_LABEL:Record<Choice,string>={defecto:'Según su rol',permitido:'Permitir',bloqueado:'Quitar'};
const name=(p?:Person|null)=>p?(p.nombre||p.email||'Sin nombre'):'—';
type Permission={codigo:string;modulo:string;accion:string;descripcion:string;solo_admin:boolean;orden:number};
type Role={id:string;nombre:string;descripcion:string;sistema:boolean;ve_todas_sedes?:boolean};
type RoleData={permisos:Permission[];roles:Role[];rolePerms:Record<string,string[]>;userRoles:Record<string,string[]>};
/** Same rule as private.permisos_usuario: profile role + assigned roles; administrators have everything. */
function permsOf(person:Person,data:RoleData){
 const base=String(person.rol||'').trim().toLowerCase();
 if(base==='admin'||data.userRoles[person.id]?.includes('admin'))return data.permisos.map(p=>p.codigo);
 const adminOnly=new Set(data.permisos.filter(p=>p.solo_admin).map(p=>p.codigo));
 return [...new Set([base,...(data.userRoles[person.id]||[])].flatMap(r=>data.rolePerms[r]||[]))].filter(c=>!adminOnly.has(c));
}

export default function AccessPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="accesos"/><main translate="no" className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard" className={styles.back}>Recursos humanos / Equipo y accesos</Link><h1><ShieldCheck/> Equipo y accesos</h1>
   <p>Una ficha por persona: usuario, ficha de asesora, rol, sede y paneles. Elige qué paneles ve cada usuario. Sin cambios, cada quien tiene el acceso de su rol; «Quitar» oculta el panel y bloquea su dirección.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:!profile?<p role="status" className={styles.empty}>Validando acceso…</p>
   :!isAdminProfile(profile)?<p role="alert" className={styles.error}>Esta pantalla es solo para administración.</p>:<AccessManager selfId={String(profile.id)}/>}
 </main></div>;
}

function AccessManager({selfId}:{selfId:string}){
 const [people,setPeople]=useState<Person[]>([]),[sedes,setSedes]=useState<Record<string,string>>({}),[saved,setSaved]=useState<Record<string,PanelOverrides>>({}),[log,setLog]=useState<LogRow[]>([]);
 const [tab,setTab]=useState<'personas'|'revision'|'usuario'|'panel'|'roles'|'historial'>('personas');
 const [userSedes,setUserSedes]=useState<Record<string,string[]>>({}),[teamLog,setTeamLog]=useState<{id:number;usuario_id:string|null;tipo:string;detalle:Record<string,unknown>;hecho_por:string|null;fecha:string}[]>([]);
 const [roleData,setRoleData]=useState<RoleData>({permisos:[],roles:[],rolePerms:{},userRoles:{}}),[roleLog,setRoleLog]=useState<{id:number;tipo:string;objetivo:string;detalle:Record<string,unknown>;usuario:string|null;fecha_hora:string}[]>([]);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  try{
   const [p,s,a,l,pe,ro,rp,ur,rl,us,eb]=await Promise.all([
    supabase.from('profiles').select('id,nombre,email,rol,rol_id,estado_ficha,sede_id,activo').order('nombre'),
    supabase.from('sedes').select('id,nombre'),
    supabase.from('accesos_paneles').select('usuario_id,panel,estado'),
    supabase.from('accesos_paneles_bitacora').select('*').order('cambiado_at',{ascending:false}).limit(100),
    supabase.from('permisos').select('*').order('orden'),
    supabase.from('roles').select('*').order('nombre'),
    supabase.from('roles_permisos').select('rol_id,permiso').eq('activo',true),
    supabase.from('usuarios_roles').select('usuario_id,rol_id').eq('activo',true),
    supabase.from('roles_bitacora').select('*').order('fecha_hora',{ascending:false}).limit(50),
    supabase.from('usuario_sedes').select('usuario_id,sede_id').eq('activo',true),
    supabase.from('equipo_bitacora').select('*').order('fecha',{ascending:false}).limit(100),
   ]);
   const failed=[p,s,a,l,pe,ro,rp,ur,rl,us,eb].find(r=>r.error);if(failed?.error)throw failed.error;
   const group=(rows:{[k:string]:string}[]|null,key:string,val:string)=>{const out:Record<string,string[]>={};for(const r of rows||[])(out[r[key]]||=[]).push(r[val]);return out;};
   setRoleData({permisos:(pe.data||[]) as Permission[],roles:(ro.data||[]) as Role[],rolePerms:group(rp.data,'rol_id','permiso'),userRoles:group(ur.data,'usuario_id','rol_id')});
   setRoleLog((rl.data||[]) as typeof roleLog);setUserSedes(group(us.data,'usuario_id','sede_id'));setTeamLog((eb.data||[]) as typeof teamLog);
   const map:Record<string,PanelOverrides>={};
   for(const r of a.data||[])if(r.estado==='permitido'||r.estado==='bloqueado')(map[r.usuario_id]||={})[r.panel]=r.estado;
   const extra=group(ur.data,'usuario_id','rol_id');
   setPeople(((p.data||[]) as Person[]).map(x=>({...x,extra:extra[x.id]||[]})));setSedes(Object.fromEntries((s.data||[]).map(x=>[x.id,x.nombre])));setSaved(map);setLog((l.data||[]) as LogRow[]);setError('');
  }catch(e){setError(e&&typeof e==='object'&&'message' in e?String((e as {message:unknown}).message):'No se pudieron cargar los accesos.');}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{void load();},[load]);

 const save=async(changes:{usuario:string;cambios:{panel:string;estado:Choice}[]}[])=>{
  setError('');setNotice('');
  try{
   for(const c of changes){if(!c.cambios.length)continue;const {error}=await supabase.rpc('guardar_accesos_panel',{p_usuario:c.usuario,p_cambios:c.cambios});if(error)throw error;}
   if(changes.some(c=>c.usuario===selfId))resetPanelOverrides();
   setNotice('Accesos guardados. Se aplican en la próxima página que abra cada usuario.');await load();return true;
  }catch(e){setError(e&&typeof e==='object'&&'message' in e?String((e as {message:unknown}).message):'No se pudieron guardar los cambios.');return false;}
 };

 return <>
  <div className={styles.tabs}>{([['personas','Personas'],['revision',`Revisión (${people.filter(p=>p.estado_ficha!=='confirmada'&&String(p.rol).toLowerCase()!=='proveedor').length})`],['usuario','Paneles por usuario'],['panel','Por panel'],['roles','Configuración · Roles y permisos'],['historial','Configuración · Historial']] as const).map(([id,l])=><button key={id} className={`${styles.tab} ${tab===id?styles.tabActive:''}`} onClick={()=>{setTab(id);setNotice('');}}>{l}</button>)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {loading?<p className={styles.empty}>Cargando…</p>
   :tab==='usuario'?<ByUser people={people} sedes={sedes} saved={saved} onSave={save} roleData={roleData} onRolesSaved={async msg=>{setNotice(msg);resetPermissions();await load();}} onError={setError} onTeamChanged={load}/>
   :tab==='personas'?<PeopleTab people={people} sedes={sedes} roles={roleData.roles} userSedes={userSedes} reload={load} onError={setError} onNotice={setNotice}/>
   :tab==='revision'?<ReviewTab ctx={{people,sedes,roles:roleData.roles,userSedes,reload:load,onError:setError,onNotice:setNotice}} rolePerms={roleData.rolePerms} userRoles={roleData.userRoles} saved={saved} permisos={roleData.permisos}/>
   :tab==='panel'?<ByPanel people={people} sedes={sedes} saved={saved} onSave={save} roleData={roleData}/>
   :tab==='roles'?<RolesManager data={roleData} onSaved={async msg=>{setNotice(msg);resetPermissions();await load();}} onError={setError}/>
   :<UnifiedHistory people={people} roles={roleData.roles} panelLog={log} roleLog={roleLog} teamLog={teamLog}/>}
 </>;
}

function choiceOf(saved:PanelOverrides|undefined,panel:string):Choice{return saved?.[panel]||'defecto';}
function allowedChoices(panelId:string,person:Person):Choice[]{
 const panel=panelById(panelId)!;
 if(panelId==='accesos')return ['defecto'];
 return panel.grantable&&canReceiveGrants(person)?['defecto','permitido','bloqueado']:['defecto','bloqueado'];
}
function Result({on}:{on:boolean}){return <span className={`${styles.badge} ${on?styles.badgeIn:styles.badgeOut}`}>{on?'Tiene acceso':'Sin acceso'}</span>;}

function ByUser({people,sedes,saved,onSave,roleData,onRolesSaved,onError,onTeamChanged}:{onTeamChanged:()=>Promise<void>;people:Person[];sedes:Record<string,string>;saved:Record<string,PanelOverrides>;onSave:(c:{usuario:string;cambios:{panel:string;estado:Choice}[]}[])=>Promise<boolean>;roleData:RoleData;onRolesSaved:(msg:string)=>Promise<void>;onError:(m:string)=>void}){
 const [q,setQ]=useState(''),[rol,setRol]=useState(''),[selected,setSelected]=useState(''),[draft,setDraft]=useState<Record<string,Choice>>({}),[busy,setBusy]=useState(false);
 const roles=useMemo(()=>[...new Set(people.flatMap(rolesOf))].sort(),[people]);
 const list=people.filter(p=>(!rol||rolesOf(p).includes(rol))&&`${p.nombre||''} ${p.email||''}`.toLowerCase().includes(q.trim().toLowerCase()));
 const person=people.find(p=>p.id===selected);
 const current=(panel:string)=>draft[panel]??choiceOf(saved[selected],panel);
 const effective:PanelOverrides=Object.fromEntries(PANELS.map(p=>[p.id,current(p.id)]).filter(([,c])=>c!=='defecto')) as PanelOverrides;
 const pending=Object.entries(draft).filter(([panel,c])=>c!==choiceOf(saved[selected],panel));
 const pick=(id:string)=>{setSelected(id);setDraft({});};
 const blocks=[...new Set(PANELS.map(p=>p.block))];
 return <div className={styles.grid2} style={{gridTemplateColumns:'minmax(240px,320px) 1fr'}}>
  <section className={styles.card}>
   <div className={styles.form} style={{marginBottom:10}}>
    <input placeholder="Buscar por nombre o correo" value={q} onChange={e=>setQ(e.target.value)}/>
    <select value={rol} onChange={e=>setRol(e.target.value)}><option value="">Todos los roles</option>{roles.map(r=><option key={r}>{r}</option>)}</select>
   </div>
   <div style={{maxHeight:560,overflowY:'auto'}}>{list.map(p=>{const n=Object.keys(saved[p.id]||{}).length;return <button key={p.id} onClick={()=>pick(p.id)} className={styles.button}
    style={{display:'block',width:'100%',textAlign:'left',marginBottom:6,background:p.id===selected?'#fff1f2':undefined,borderColor:p.id===selected?'#fda4af':undefined,opacity:p.activo===false?.6:1}}>
    <b>{name(p)}</b>{n>0&&<span className={`${styles.badge} ${styles.badgeWarn}`} style={{marginLeft:6}}>{n} cambio{n===1?'':'s'}</span>}
    <span className={styles.help} style={{display:'block'}}>{rolTexto(p)}{p.sede_id?` · ${sedes[p.sede_id]||'sede desconocida'}`:String(p.rol).toLowerCase()==='admin'?' · Todas las sedes':''}{p.activo===false?' · inactivo':''}</span></button>;})}</div>
  </section>
  <section className={styles.card}>
   {!person?<p className={styles.empty}>Elige un usuario para ver y cambiar sus paneles.</p>
    :isSupplier(person.rol)?<p className={styles.empty}>{name(person)} es proveedor: solo entra a su portal de proveedor y no ve paneles del ERP.</p>:<>
    <h2>{name(person)}</h2><p>{person.email} · rol {rolTexto(person)}{person.sede_id?` · ${sedes[person.sede_id]||''}`:''}{isAccounting(person.rol)&&' · Contabilidad: por defecto solo Depósitos y Caja; los paneles que le permitas los verá en solo lectura de contratos.'}</p>
    <PersonTeamCard key={`t-${person.id}`} person={person} sedes={sedes} onChanged={onTeamChanged} onError={onError}/>
    <UserRoles key={person.id} person={person} data={roleData} onSaved={onRolesSaved} onError={onError}/>
    <div className={styles.tableScroll}><table className={styles.table}>
     <thead><tr><th>Panel</th><th>Por su rol</th><th>Acceso</th><th>Queda</th></tr></thead>
     <tbody>{blocks.map(b=>[<tr key={b}><td colSpan={4} style={{background:'#f8fafc',fontWeight:800,fontSize:11,letterSpacing:'.05em',color:'#64748b'}}>{b}</td></tr>,
      ...PANELS.filter(p=>p.block===b).map(p=>{const choices=allowedChoices(p.id,person);return <tr key={p.id}>
       <td><b>{p.label}</b>{!p.grantable&&p.id!=='accesos'&&<small>Exclusivo de administración: solo se puede quitar</small>}{p.id==='accesos'&&<small>Siempre para administradores</small>}</td>
       <td>{rolePanelAccess(p.id,person,permsOf(person,roleData))?'Sí':'No'}</td>
       <td><select value={current(p.id)} disabled={choices.length===1} onChange={e=>setDraft({...draft,[p.id]:e.target.value as Choice})}>{choices.map(c=><option key={c} value={c}>{CHOICE_LABEL[c]}</option>)}</select></td>
       <td><Result on={panelAccess(p.id,person,effective,permsOf(person,roleData))}/></td></tr>;})])}</tbody>
    </table></div>
    <div className={styles.actions} style={{marginTop:14}}>
     <button className={`${styles.button} ${styles.primary}`} disabled={busy||!pending.length} onClick={async()=>{setBusy(true);if(await onSave([{usuario:person.id,cambios:pending.map(([panel,estado])=>({panel,estado}))}]))setDraft({});setBusy(false);}}>{busy?'Guardando…':`Guardar ${pending.length||''} cambio${pending.length===1?'':'s'}`}</button>
     <button className={styles.button} disabled={busy} onClick={()=>setDraft(Object.fromEntries(PANELS.map(p=>[p.id,'defecto' as Choice])))}>Volver todo a «según su rol»</button>
     {pending.length>0&&<button className={styles.button} disabled={busy} onClick={()=>setDraft({})}>Descartar</button>}
    </div>
   </>}
  </section>
 </div>;
}

function ByPanel({people,sedes,saved,onSave,roleData}:{people:Person[];sedes:Record<string,string>;saved:Record<string,PanelOverrides>;onSave:(c:{usuario:string;cambios:{panel:string;estado:Choice}[]}[])=>Promise<boolean>;roleData:RoleData}){
 const [panelId,setPanelId]=useState('calendario'),[draft,setDraft]=useState<Record<string,Choice>>({}),[busy,setBusy]=useState(false),[onlyActive,setOnlyActive]=useState(true);
 const panel=panelById(panelId)!;
 const list=people.filter(p=>!isSupplier(p.rol)&&(!onlyActive||p.activo!==false));
 const current=(id:string)=>draft[id]??choiceOf(saved[id],panelId);
 const pending=Object.entries(draft).filter(([id,c])=>c!==choiceOf(saved[id],panelId));
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:14}}>
   <label>Panel<select value={panelId} onChange={e=>{setPanelId(e.target.value);setDraft({});}}>{PANELS.map(p=><option key={p.id} value={p.id}>{p.block} · {p.label}</option>)}</select></label>
   <label className={styles.check} style={{alignSelf:'end'}}><input type="checkbox" checked={onlyActive} onChange={e=>setOnlyActive(e.target.checked)}/>Solo usuarios activos</label>
  </div>
  {!panel.grantable&&<p className={styles.help}>Este panel es exclusivo de administración: a los demás usuarios no se les puede agregar, solo quitárselo a administradores.</p>}
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Usuario</th><th>Rol</th><th>Sede</th><th>Por su rol</th><th>Acceso</th><th>Queda</th></tr></thead>
   <tbody>{list.map(p=>{const choices=allowedChoices(panelId,p),c=current(p.id),ov:PanelOverrides={...saved[p.id]};if(c==='defecto')delete ov[panelId];else ov[panelId]=c;return <tr key={p.id}>
    <td><b>{name(p)}</b><small>{p.email}</small></td><td>{rolTexto(p)}</td><td>{p.sede_id?sedes[p.sede_id]||'—':'—'}</td><td>{rolePanelAccess(panelId,p,permsOf(p,roleData))?'Sí':'No'}</td>
    <td><select value={c} disabled={choices.length===1} onChange={e=>setDraft({...draft,[p.id]:e.target.value as Choice})}>{choices.map(x=><option key={x} value={x}>{CHOICE_LABEL[x]}</option>)}</select></td>
    <td><Result on={panelAccess(panelId,p,ov,permsOf(p,roleData))}/></td></tr>;})}</tbody>
  </table></div>
  <div className={styles.actions} style={{marginTop:14}}>
   <button className={`${styles.button} ${styles.primary}`} disabled={busy||!pending.length} onClick={async()=>{setBusy(true);if(await onSave(pending.map(([usuario,estado])=>({usuario,cambios:[{panel:panelId,estado}]}))))setDraft({});setBusy(false);}}>{busy?'Guardando…':`Guardar ${pending.length||''} cambio${pending.length===1?'':'s'}`}</button>
   {pending.length>0&&<button className={styles.button} disabled={busy} onClick={()=>setDraft({})}>Descartar</button>}
  </div>
 </section>;
}

function History({log,people}:{log:LogRow[];people:Person[]}){
 const who=(id:string|null)=>name(people.find(p=>p.id===id));
 return <section className={styles.card}><h2>Últimos cambios</h2><p>Quién cambió qué acceso y cuándo.</p>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Usuario</th><th>Panel</th><th>Cambio</th><th>Hecho por</th></tr></thead>
   <tbody>{log.map(l=><tr key={l.id}><td>{new Date(l.cambiado_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td><td>{who(l.usuario_id)}</td><td>{panelById(l.panel)?.label||l.panel}</td>
    <td>{CHOICE_LABEL[(l.estado_anterior||'defecto') as Choice]} → <b>{CHOICE_LABEL[l.estado_nuevo as Choice]}</b></td><td>{who(l.cambiado_por)}</td></tr>)}</tbody></table></div>
  {!log.length&&<p className={styles.empty}>Aún no hay cambios.</p>}
 </section>;
}

/** Extra roles of a user (their permissions add up to those of their base role). */
function UserRoles({person,data,onSaved,onError}:{person:Person;data:RoleData;onSaved:(msg:string)=>Promise<void>;onError:(m:string)=>void}){
 const base=String(person.rol||'').trim().toLowerCase();
 const [sel,setSel]=useState<string[]>(data.userRoles[person.id]||[]),[busy,setBusy]=useState(false);
 const options=data.roles.filter(r=>r.id!=='admin'&&r.id!==base);
 const changed=JSON.stringify([...sel].sort())!==JSON.stringify([...(data.userRoles[person.id]||[])].sort());
 if(base==='admin')return <p className={styles.help} style={{margin:'8px 0 12px'}}>Rol Administrador: tiene todos los permisos.</p>;
 return <div className={styles.card} style={{margin:'8px 0 14px',background:'#f8fafc'}}>
  <b>Roles</b> <span className={styles.help}>· rol base: {data.roles.find(r=>r.id===base)?.nombre||base||'sin rol'} · se suman los permisos de todos sus roles</span>
  <div style={{display:'flex',flexWrap:'wrap',gap:12,margin:'8px 0'}}>{options.map(r=><label key={r.id} className={styles.check}><input type="checkbox" checked={sel.includes(r.id)} onChange={e=>setSel(e.target.checked?[...sel,r.id]:sel.filter(x=>x!==r.id))}/>{r.nombre}</label>)}</div>
  {changed&&<div className={styles.actions}><button className={`${styles.button} ${styles.primary}`} disabled={busy} onClick={async()=>{setBusy(true);const {error}=await supabase.rpc('guardar_roles_usuario',{p_usuario:person.id,p_roles:sel});setBusy(false);if(error)onError(error.message);else await onSaved(`Roles de ${name(person)} guardados. Se aplican al recargar la página.`);}}>{busy?'Guardando…':'Guardar roles'}</button><button className={styles.button} onClick={()=>setSel(data.userRoles[person.id]||[])}>Descartar</button></div>}
 </div>;
}

/** Catalog of every permission of every module; the Administrator marks them on any role. */
function RolesManager({data,onSaved,onError}:{data:RoleData;onSaved:(msg:string)=>Promise<void>;onError:(m:string)=>void}){
 const [roleId,setRoleId]=useState(data.roles.find(r=>r.id==='asesora_lider')?.id||data.roles[0]?.id||''),[draft,setDraft]=useState<string[]|null>(null),[busy,setBusy]=useState(false),[nuevo,setNuevo]=useState('');
 const role=data.roles.find(r=>r.id===roleId),isAdminRole=roleId==='admin';
 const current=draft??(isAdminRole?data.permisos.map(p=>p.codigo):data.rolePerms[roleId]||[]);
 const modules=[...new Set(data.permisos.map(p=>p.modulo))];
 const toggle=(c:string,on:boolean)=>setDraft(on?[...new Set([...current,c])]:current.filter(x=>x!==c));
 const save=async()=>{setBusy(true);const {error}=await supabase.rpc('guardar_permisos_rol',{p_rol:roleId,p_permisos:current});setBusy(false);if(error)onError(error.message);else{setDraft(null);await onSaved(`Permisos del rol ${role?.nombre} guardados. Cada usuario los recibe al recargar la página.`);}};
 const create=async()=>{const id=nuevo.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z]+/g,'_').replace(/^_|_$/g,'');if(id.length<3)return onError('Escribe el nombre del rol.');setBusy(true);const {error}=await supabase.rpc('crear_rol',{p_id:id,p_nombre:nuevo.trim(),p_descripcion:''});setBusy(false);if(error)onError(error.message);else{setNuevo('');setRoleId(id);setDraft([]);await onSaved(`Rol ${nuevo.trim()} creado. Márcale sus permisos y guarda.`);}};
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:12}}>
   <label>Rol<select value={roleId} onChange={e=>{setRoleId(e.target.value);setDraft(null);}}>{data.roles.map(r=><option key={r.id} value={r.id}>{r.nombre}</option>)}</select></label>
   <label>Nuevo rol<input value={nuevo} maxLength={40} onChange={e=>setNuevo(e.target.value)} placeholder="Ej.: Coordinadora"/></label>
   <div className={styles.actions} style={{alignSelf:'end'}}><button className={styles.button} disabled={busy} onClick={()=>void create()}>Crear rol</button></div>
   <label className={styles.check} style={{alignSelf:'end'}}><input type="checkbox" disabled={busy||isAdminRole} checked={isAdminRole||!!role?.ve_todas_sedes} onChange={async e=>{setBusy(true);const {error}=await supabase.rpc('guardar_rol_sedes',{p_rol:roleId,p_ve:e.target.checked});setBusy(false);if(error)onError(error.message);else await onSaved(`Rol ${role?.nombre}: ${e.target.checked?'ve todas las sedes':'solo sus sedes'}.`);}}/>Ve todas las sedes</label>
  </div>
  {role&&<p className={styles.help} style={{marginBottom:10}}>{role.descripcion}{isAdminRole?' El Administrador siempre tiene todos los permisos.':''}</p>}
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Permiso</th><th>Detalle</th><th style={{width:90}}>Activo</th></tr></thead>
   <tbody>{modules.map(m=>[<tr key={m}><td colSpan={3} style={{background:'#f8fafc',fontWeight:800,fontSize:11,letterSpacing:'.05em',color:'#64748b'}}>{m.toUpperCase()}</td></tr>,
    ...data.permisos.filter(p=>p.modulo===m).map(p=><tr key={p.codigo}><td><b>{p.accion}</b><small>{p.codigo}</small></td><td className={styles.help}>{p.solo_admin?'Solo el rol Administrador (para dárselo a alguien, asígnale el rol Administrador en Gestión de equipo). ':''}{p.descripcion}</td>
     <td><input type="checkbox" aria-label={p.accion} disabled={isAdminRole||p.solo_admin} checked={isAdminRole||current.includes(p.codigo)} onChange={e=>toggle(p.codigo,e.target.checked)}/></td></tr>)])}</tbody></table></div>
  {!isAdminRole&&<div className={styles.actions} style={{marginTop:14}}><button className={`${styles.button} ${styles.primary}`} disabled={busy||draft===null} onClick={()=>void save()}>{busy?'Guardando…':'Guardar permisos del rol'}</button>{draft!==null&&<button className={styles.button} onClick={()=>setDraft(null)}>Descartar</button>}</div>}
 </section>;
}

function RoleHistory({log,people,roles}:{log:{id:number;tipo:string;objetivo:string;detalle:Record<string,unknown>;usuario:string|null;fecha_hora:string}[];people:Person[];roles:Role[]}){
 const who=(id:string|null)=>name(people.find(p=>p.id===id));
 const list=(v:unknown)=>Array.isArray(v)&&v.length?v.join(', '):'—';
 return <section className={styles.card} style={{marginTop:16}}><h2>Cambios de roles y permisos</h2>
  <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Fecha</th><th>Qué</th><th>Detalle</th><th>Hecho por</th></tr></thead>
   <tbody>{log.map(l=><tr key={l.id}><td>{new Date(l.fecha_hora).toLocaleString('es-CO',{timeZone:'America/Bogota'})}</td>
    <td>{l.tipo==='permisos_rol'?`Permisos del rol ${roles.find(r=>r.id===l.objetivo)?.nombre||l.objetivo}`:l.tipo==='crear_rol'?`Nuevo rol ${roles.find(r=>r.id===l.objetivo)?.nombre||l.objetivo}`:`Roles de ${who(l.objetivo)}`}</td>
    <td className={styles.help}>{l.tipo==='permisos_rol'?`+ ${list(l.detalle.agregados)} · − ${list(l.detalle.quitados)}`:l.tipo==='roles_usuario'?`${list(l.detalle.antes)} → ${list(l.detalle.despues)}`:''}</td><td>{who(l.usuario)}</td></tr>)}</tbody></table></div>
  {!log.length&&<p className={styles.empty}>Aún no hay cambios de roles.</p>}
 </section>;
}
