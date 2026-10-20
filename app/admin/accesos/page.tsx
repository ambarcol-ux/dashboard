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
import {PANELS,canReceiveGrants,defaultPanelAccess,panelAccess,panelById,type PanelOverride,type PanelOverrides} from '@/lib/panel-access';
import {resetPanelOverrides} from '@/lib/use-panel-overrides';
import styles from '@/app/dashboard/caja/caja.module.css';

type Person={id:string;nombre:string|null;email:string|null;rol:string|null;sede_id:string|null;activo:boolean|null};
type Choice='defecto'|PanelOverride;
type LogRow={id:number;usuario_id:string;panel:string;estado_anterior:string|null;estado_nuevo:string;cambiado_por:string|null;cambiado_at:string};
const CHOICE_LABEL:Record<Choice,string>={defecto:'Según su rol',permitido:'Permitir',bloqueado:'Quitar'};
const name=(p?:Person|null)=>p?(p.nombre||p.email||'Sin nombre'):'—';

export default function AccessPage(){
 const readAccess=useVerifiedAccess(),router=useRouter();
 const [profile,setProfile]=useState<Record<string,unknown>|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void readAccess().then(({profile})=>{if(live)setProfile(profile);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'No pudimos validar tu acceso.');});return()=>{live=false;};},[readAccess]);
 const logout=async()=>{await supabase.auth.signOut();document.cookie='sb-access-token=; path=/; max-age=0';router.replace('/login');};
 return <div className={styles.shell}><Sidebar user={profile} handleLogout={logout} activePage="accesos"/><main className={styles.main}>
  <header className={styles.header}><div><Link href="/dashboard" className={styles.back}>Administración / Accesos por perfil</Link><h1><ShieldCheck/> Accesos por perfil</h1>
   <p>Elige qué paneles ve cada usuario. Sin cambios, cada quien tiene el acceso de su rol; «Quitar» oculta el panel y bloquea su dirección.</p></div></header>
  {error?<p role="alert" className={styles.error}>{error}</p>:!profile?<p role="status" className={styles.empty}>Validando acceso…</p>
   :!isAdminProfile(profile)?<p role="alert" className={styles.error}>Esta pantalla es solo para administración.</p>:<AccessManager selfId={String(profile.id)}/>}
 </main></div>;
}

function AccessManager({selfId}:{selfId:string}){
 const [people,setPeople]=useState<Person[]>([]),[sedes,setSedes]=useState<Record<string,string>>({}),[saved,setSaved]=useState<Record<string,PanelOverrides>>({}),[log,setLog]=useState<LogRow[]>([]);
 const [tab,setTab]=useState<'usuario'|'panel'|'historial'>('usuario');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(true);
 const load=useCallback(async()=>{
  try{
   const [p,s,a,l]=await Promise.all([
    supabase.from('profiles').select('id,nombre,email,rol,sede_id,activo').order('nombre'),
    supabase.from('sedes').select('id,nombre'),
    supabase.from('accesos_paneles').select('usuario_id,panel,estado'),
    supabase.from('accesos_paneles_bitacora').select('*').order('cambiado_at',{ascending:false}).limit(100),
   ]);
   const failed=[p,s,a,l].find(r=>r.error);if(failed?.error)throw failed.error;
   const map:Record<string,PanelOverrides>={};
   for(const r of a.data||[])if(r.estado==='permitido'||r.estado==='bloqueado')(map[r.usuario_id]||={})[r.panel]=r.estado;
   setPeople((p.data||[]) as Person[]);setSedes(Object.fromEntries((s.data||[]).map(x=>[x.id,x.nombre])));setSaved(map);setLog((l.data||[]) as LogRow[]);setError('');
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
  <div className={styles.tabs}>{([['usuario','Por usuario'],['panel','Por panel'],['historial','Historial de cambios']] as const).map(([id,l])=><button key={id} className={`${styles.tab} ${tab===id?styles.tabActive:''}`} onClick={()=>{setTab(id);setNotice('');}}>{l}</button>)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {notice&&<p role="status" className={styles.notice}>{notice}</p>}
  {loading?<p className={styles.empty}>Cargando…</p>
   :tab==='usuario'?<ByUser people={people} sedes={sedes} saved={saved} onSave={save}/>
   :tab==='panel'?<ByPanel people={people} sedes={sedes} saved={saved} onSave={save}/>
   :<History log={log} people={people}/>}
 </>;
}

function choiceOf(saved:PanelOverrides|undefined,panel:string):Choice{return saved?.[panel]||'defecto';}
function allowedChoices(panelId:string,person:Person):Choice[]{
 const panel=panelById(panelId)!;
 if(panelId==='accesos')return ['defecto'];
 return panel.grantable&&canReceiveGrants(person)?['defecto','permitido','bloqueado']:['defecto','bloqueado'];
}
function Result({on}:{on:boolean}){return <span className={`${styles.badge} ${on?styles.badgeIn:styles.badgeOut}`}>{on?'Tiene acceso':'Sin acceso'}</span>;}

function ByUser({people,sedes,saved,onSave}:{people:Person[];sedes:Record<string,string>;saved:Record<string,PanelOverrides>;onSave:(c:{usuario:string;cambios:{panel:string;estado:Choice}[]}[])=>Promise<boolean>}){
 const [q,setQ]=useState(''),[rol,setRol]=useState(''),[selected,setSelected]=useState(''),[draft,setDraft]=useState<Record<string,Choice>>({}),[busy,setBusy]=useState(false);
 const roles=useMemo(()=>[...new Set(people.map(p=>String(p.rol||'').toLowerCase()).filter(Boolean))].sort(),[people]);
 const list=people.filter(p=>(!rol||String(p.rol||'').toLowerCase()===rol)&&`${p.nombre||''} ${p.email||''}`.toLowerCase().includes(q.trim().toLowerCase()));
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
    <span className={styles.help} style={{display:'block'}}>{p.rol||'sin rol'}{p.sede_id?` · ${sedes[p.sede_id]||'sede desconocida'}`:''}{p.activo===false?' · inactivo':''}</span></button>;})}</div>
  </section>
  <section className={styles.card}>
   {!person?<p className={styles.empty}>Elige un usuario para ver y cambiar sus paneles.</p>
    :isSupplier(person.rol)?<p className={styles.empty}>{name(person)} es proveedor: solo entra a su portal de proveedor y no ve paneles del ERP.</p>:<>
    <h2>{name(person)}</h2><p>{person.email} · rol {person.rol||'sin rol'}{person.sede_id?` · ${sedes[person.sede_id]||''}`:''}{isAccounting(person.rol)&&' · Contabilidad: por defecto solo Depósitos y Caja; los paneles que le permitas los verá en solo lectura de contratos.'}</p>
    <div className={styles.tableScroll}><table className={styles.table}>
     <thead><tr><th>Panel</th><th>Por su rol</th><th>Acceso</th><th>Queda</th></tr></thead>
     <tbody>{blocks.map(b=>[<tr key={b}><td colSpan={4} style={{background:'#f8fafc',fontWeight:800,fontSize:11,letterSpacing:'.05em',color:'#64748b'}}>{b}</td></tr>,
      ...PANELS.filter(p=>p.block===b).map(p=>{const choices=allowedChoices(p.id,person);return <tr key={p.id}>
       <td><b>{p.label}</b>{!p.grantable&&p.id!=='accesos'&&<small>Exclusivo de administración: solo se puede quitar</small>}{p.id==='accesos'&&<small>Siempre para administradores</small>}</td>
       <td>{defaultPanelAccess(p.id,person)?'Sí':'No'}</td>
       <td><select value={current(p.id)} disabled={choices.length===1} onChange={e=>setDraft({...draft,[p.id]:e.target.value as Choice})}>{choices.map(c=><option key={c} value={c}>{CHOICE_LABEL[c]}</option>)}</select></td>
       <td><Result on={panelAccess(p.id,person,effective)}/></td></tr>;})])}</tbody>
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

function ByPanel({people,sedes,saved,onSave}:{people:Person[];sedes:Record<string,string>;saved:Record<string,PanelOverrides>;onSave:(c:{usuario:string;cambios:{panel:string;estado:Choice}[]}[])=>Promise<boolean>}){
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
    <td><b>{name(p)}</b><small>{p.email}</small></td><td>{p.rol||'—'}</td><td>{p.sede_id?sedes[p.sede_id]||'—':'—'}</td><td>{defaultPanelAccess(panelId,p)?'Sí':'No'}</td>
    <td><select value={c} disabled={choices.length===1} onChange={e=>setDraft({...draft,[p.id]:e.target.value as Choice})}>{choices.map(x=><option key={x} value={x}>{CHOICE_LABEL[x]}</option>)}</select></td>
    <td><Result on={panelAccess(panelId,p,ov)}/></td></tr>;})}</tbody>
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
