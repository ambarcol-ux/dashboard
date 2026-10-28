'use client';
import {useCallback,useEffect,useState} from 'react';
import {ToggleLeft,ToggleRight} from 'lucide-react';
import {supabase} from '@/lib/supabase';
import {createUserAction} from '@/app/admin/users/actions';
import styles from '@/app/dashboard/caja/caja.module.css';

type Ficha={id:string;nombre_completo:string|null;nombre:string|null;sede_id:string|null;activo:boolean|null;profile_id:string|null};
type Person={id:string;nombre:string|null;email:string|null;rol?:string|null;sede_id:string|null;activo:boolean|null};
const BASE_ROLES=['asesora','admin','contabilidad'];
const fichaName=(f:Ficha)=>f.nombre_completo||f.nombre||'Sin nombre';

/** On = green switch to the right; off = grey switch to the left. */
export function Switch({on,onClick,title}:{on:boolean;onClick:()=>void;title:string}){
 return <button type="button" onClick={onClick} title={title} aria-pressed={on} style={{background:'none',border:0,cursor:'pointer',color:on?'#059669':'#9ca3af'}}>{on?<ToggleRight size={34}/>:<ToggleLeft size={34}/>}</button>;
}

function useFichas(){
 const [fichas,setFichas]=useState<Ficha[]>([]),[tick,setTick]=useState(0);
 useEffect(()=>{let live=true;void supabase.from('asesoras').select('id,nombre_completo,nombre,sede_id,activo,profile_id').order('nombre_completo').then(({data})=>{if(live)setFichas((data||[]) as Ficha[]);});return()=>{live=false;};},[tick]);
 const load=useCallback(async()=>setTick(t=>t+1),[]);
 return [fichas,load] as const;
}

/** Inside a user's card: their user status and their sales-advisor record (ficha de asesora). */
export function PersonTeamCard({person,sedes,onChanged,onError}:{person:Person;sedes:Record<string,string>;onChanged:()=>Promise<void>;onError:(m:string)=>void}){
 const [fichas,reload]=useFichas(),[link,setLink]=useState('');
 const mine=fichas.filter(f=>f.profile_id===person.id),free=fichas.filter(f=>!f.profile_id);
 const run=async(q:PromiseLike<{error:{message:string}|null}>)=>{const {error}=await q;if(error)onError(error.message);else{await reload();await onChanged();}};
 return <div className={styles.card} style={{margin:'12px 0',padding:12}}>
  <b>Equipo</b>
  <p style={{display:'flex',alignItems:'center',gap:8,margin:'6px 0'}}>Usuario del ERP: <Switch on={person.activo!==false} title="Activar o inactivar el usuario" onClick={()=>void run(supabase.from('profiles').update({activo:person.activo===false}).eq('id',person.id))}/>{person.activo===false?'Inactivo':'Activo'}</p>
  <p style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',margin:'6px 0'}}>Sede: <select value={person.sede_id||''} onChange={e=>void run(supabase.from('profiles').update({sede_id:e.target.value||null}).eq('id',person.id))}><option value="">Todas / sin sede</option>{Object.entries(sedes).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select>
   Rol base: <select value={String(person.rol||'').toLowerCase()} onChange={e=>void run(supabase.from('profiles').update({rol:e.target.value}).eq('id',person.id))}>{BASE_ROLES.map(r=><option key={r}>{r}</option>)}</select></p>
  {mine.length?mine.map(f=><p key={f.id} style={{display:'flex',alignItems:'center',gap:8,margin:'6px 0'}}>Ficha de asesora: <b>{fichaName(f)}</b> · {f.sede_id?sedes[f.sede_id]||'—':'—'}
   <Switch on={f.activo!==false} title="Activar o inactivar la ficha de asesora" onClick={()=>void run(supabase.from('asesoras').update({activo:f.activo===false}).eq('id',f.id))}/>{f.activo===false?'Inactiva':'Activa'}
   <button className={styles.button} onClick={()=>void run(supabase.from('asesoras').update({profile_id:null}).eq('id',f.id))}>Separar</button></p>)
   :<p className={styles.help}>No tiene ficha de asesora.</p>}
  <p style={{display:'flex',gap:8,alignItems:'center'}}><select value={link} onChange={e=>setLink(e.target.value)}><option value="">Unir una ficha sin usuario…</option>{free.map(f=><option key={f.id} value={f.id}>{fichaName(f)} · {f.sede_id?sedes[f.sede_id]||'':''}{f.activo===false?' · inactiva':''}</option>)}</select>
   <button className={styles.button} disabled={!link} onClick={()=>{void run(supabase.from('asesoras').update({profile_id:person.id}).eq('id',link));setLink('');}}>Unir</button></p>
 </div>;
}

/** Tab "Alta y fichas": new advisor record (with optional user) and records that still have no ERP user. */
export function TeamTab({people,sedes,onError,onNotice}:{people:Person[];sedes:Record<string,string>;onError:(m:string)=>void;onNotice:(m:string)=>void}){
 const [fichas,reload]=useFichas(),[form,setForm]=useState({nombre:'',sede_id:'',profile_id:'',email:'',password:'',rol:'asesora'}),[busy,setBusy]=useState(false);
 const add=async()=>{
  if(!form.nombre.trim()||!form.sede_id)return onError('Escribe el nombre y elige la sede.');
  setBusy(true);const n=form.nombre.trim();let profileId=form.profile_id||null;
  if(!profileId&&form.email.trim()){
   const res=await createUserAction({email:form.email.trim(),password:form.password,nombre:n,sede_id:form.sede_id,rol:form.rol});
   if(!res.success){setBusy(false);return onError(res.message||'No se pudo crear el usuario.');}
   profileId=res.user?.id||null;
  }
  const {error}=await supabase.from('asesoras').insert([{nombre:n,nombre_completo:n,sede_id:form.sede_id,profile_id:profileId}]);
  setBusy(false);if(error)return onError(error.message);
  setForm({nombre:'',sede_id:'',profile_id:'',email:'',password:'',rol:'asesora'});onNotice(profileId&&!form.profile_id?'Persona creada: ficha de asesora + usuario del ERP. Recarga para verla en «Por usuario».':'Ficha de asesora creada.');await reload();
 };
 const toggle=async(f:Ficha)=>{const {error}=await supabase.from('asesoras').update({activo:f.activo===false}).eq('id',f.id);if(error)onError(error.message);else await reload();};
 const free=fichas.filter(f=>!f.profile_id);
 return <section className={styles.card}>
  <h2>Alta de persona</h2>
  <p className={styles.help}>Crea la ficha de asesora (aparece en contratos y metas) y, si escribes correo y contraseña, también su usuario del ERP. Si ya tiene usuario, elígelo en vez de crear uno.</p>
  <div style={{display:'flex',gap:8,flexWrap:'wrap',margin:'8px 0 16px'}}>
   <input placeholder="Nombre completo" value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})}/>
   <select value={form.sede_id} onChange={e=>setForm({...form,sede_id:e.target.value})}><option value="">Sede…</option>{Object.entries(sedes).map(([id,n])=><option key={id} value={id}>{n}</option>)}</select>
   <select value={form.profile_id} onChange={e=>setForm({...form,profile_id:e.target.value})}><option value="">Usuario del ERP (opcional)…</option>{people.filter(p=>p.activo!==false).map(p=><option key={p.id} value={p.id}>{p.nombre||p.email}</option>)}</select>
   {!form.profile_id&&<><input type="email" placeholder="Correo (para crear usuario)" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
    <input type="password" placeholder="Contraseña (mín. 6)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
    <select value={form.rol} onChange={e=>setForm({...form,rol:e.target.value})}>{BASE_ROLES.map(r=><option key={r}>{r}</option>)}</select></>}
   <button className={styles.button} disabled={busy} onClick={()=>void add()}>{busy?'Creando…':'Crear persona'}</button>
  </div>
  <h2>Fichas de asesora sin usuario ({free.length})</h2>
  <table className={styles.table}><thead><tr><th>Nombre</th><th>Sede</th><th>Estado</th></tr></thead><tbody>
   {free.map(f=><tr key={f.id}><td>{fichaName(f)}</td><td>{f.sede_id?sedes[f.sede_id]||'—':'—'}</td><td><Switch on={f.activo!==false} title="Activar o inactivar" onClick={()=>void toggle(f)}/> {f.activo===false?'Inactiva':'Activa'}</td></tr>)}
  </tbody></table>
 </section>;
}
