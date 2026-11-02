'use client';
import {useEffect,useState} from 'react';
import {Mail} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {PROMO_FIELDS,promoBenefit,promoState,type Promotion} from '@/lib/promotions';
import styles from '@/app/dashboard/caja/caja.module.css';
import {MailAutomations,MailCampaigns,MailFunnel,MailRules} from '@/components/MailMarketing';

/** Ventas y CRM › Correo: promotions, automations, manual sends by segment, frequency rules and funnel. */
export default function MailPage(){
 return <SupplierShell activePage="correo" crumb="Ventas y CRM / Correo" title="Correo" icon={<Mail/>}
  description="Promociones, automatizaciones y envíos a personas con autorización comercial. Se envían por la conexión de Configuración › Integraciones.">
  {profile=><MailTabs profile={profile}/>}
 </SupplierShell>;
}

const TABS=[['promociones','Promociones'],['automatizaciones','Automatizaciones'],['envios','Envíos'],['reglas','Reglas'],['embudo','Embudo']] as const;
function MailTabs({profile}:{profile:ShellProfile}){
 const admin=profile.rol==='admin';
 const [tab,setTab]=useState<(typeof TABS)[number][0]>('promociones');
 return <>
  {admin&&<div className={styles.toolbar} style={{marginBottom:12}}>{TABS.map(([k,l])=><button key={k} type="button" className={tab===k?styles.primary:undefined} onClick={()=>setTab(k)}>{l}</button>)}</div>}
  {tab==='promociones'&&<Promotions profile={profile}/>}
  {admin&&tab!=='promociones'&&<section className={styles.card}>
   {tab==='automatizaciones'&&<MailAutomations canEdit={admin}/>}
   {tab==='envios'&&<MailCampaigns canEdit={admin}/>}
   {tab==='reglas'&&<MailRules canEdit={admin}/>}
   {tab==='embudo'&&<MailFunnel/>}
  </section>}
 </>;
}

type Form={id?:string;nombre:string;beneficio_tipo:Promotion['beneficio_tipo'];beneficio_valor:string;beneficio_detalle:string;desde:string;hasta:string;sede_ids:string[];clasificacion_ids:number[];categorias:string[];codigo:string;condiciones:string;activo:boolean};
const EMPTY:Form={nombre:'',beneficio_tipo:'porcentaje',beneficio_valor:'',beneficio_detalle:'',desde:'',hasta:'',sede_ids:[],clasificacion_ids:[],categorias:[],codigo:'',condiciones:'',activo:true};
const toggle=<T,>(list:T[],v:T)=>list.includes(v)?list.filter(x=>x!==v):[...list,v];

function Promotions({profile}:{profile:ShellProfile}){
 const canEdit=profile.rol==='admin';
 const [rows,setRows]=useState<Promotion[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[tipos,setTipos]=useState<{id:number;nombre:string}[]>([]),[cats,setCats]=useState<{clasificacion_id:number;nombre:string}[]>([]);
 const [form,setForm]=useState<Form|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const load=()=>supabase.from('promociones').select(PROMO_FIELDS).order('desde',{ascending:false}).then(({data,error:e})=>{if(e)setError('No se pudieron cargar las promociones.');setRows((data||[]) as Promotion[]);});
 useEffect(()=>{void load();void Promise.all([supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),supabase.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('orden'),supabase.from('categorias_vestido').select('clasificacion_id,nombre').eq('activo',true).order('orden')])
  .then(([s,c,k])=>{setSedes(s.data||[]);setTipos(c.data||[]);setCats(k.data||[]);});},[]);
 const name=(list:{id:string|number;nombre:string}[],ids:(string|number)[]|null)=>ids?.length?ids.map(i=>list.find(x=>x.id===i)?.nombre||'—').join(', '):'Todas';
 const edit=(p:Promotion)=>setForm({...p,beneficio_valor:String(p.beneficio_valor||''),sede_ids:p.sede_ids||[],clasificacion_ids:p.clasificacion_ids||[],categorias:p.categorias||[],codigo:p.codigo||''});
 const save=async()=>{if(!form)return;setBusy(true);setError('');
  const {id,...f}=form;
  const row={...f,nombre:f.nombre.trim(),beneficio_valor:f.beneficio_tipo==='incluido'?0:Number(f.beneficio_valor)||0,beneficio_detalle:f.beneficio_detalle.trim(),codigo:f.codigo.trim().toUpperCase()||null,condiciones:f.condiciones.trim(),
   sede_ids:f.sede_ids.length?f.sede_ids:null,clasificacion_ids:f.clasificacion_ids.length?f.clasificacion_ids:null,categorias:f.categorias.length?f.categorias:null,updated_at:new Date().toISOString()};
  const {error:e}=id?await supabase.from('promociones').update(row).eq('id',id):await supabase.from('promociones').insert(row);
  setBusy(false);
  if(e){setError(e.code==='23505'?'Ese código ya existe.':'Revisa los datos: nombre, beneficio, vigencia y código (letras, números o guiones).');return;}
  setForm(null);void load();};
 const catOptions=cats.filter(c=>!form?.clasificacion_ids.length||form.clasificacion_ids.includes(c.clasificacion_id)).map(c=>c.nombre);
 return <section className={styles.card}>
  {canEdit&&!form&&<button type="button" className={styles.primary} onClick={()=>setForm(EMPTY)} style={{marginBottom:14}}>+ Nueva promoción</button>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {form&&<fieldset disabled={busy} style={{display:'grid',gap:10,marginBottom:18,border:'1px solid #eee',borderRadius:14,padding:14}}>
   <label>Nombre<input value={form.nombre} maxLength={120} onChange={e=>setForm({...form,nombre:e.target.value})}/></label>
   <div className={styles.toolbar}>
    <label>Beneficio<select value={form.beneficio_tipo} onChange={e=>setForm({...form,beneficio_tipo:e.target.value as Form['beneficio_tipo']})}><option value="porcentaje">Porcentaje</option><option value="valor">Valor fijo</option><option value="incluido">Incluido</option></select></label>
    {form.beneficio_tipo!=='incluido'?<label>{form.beneficio_tipo==='porcentaje'?'Porcentaje (%)':'Valor (COP)'}<input type="number" min={1} max={form.beneficio_tipo==='porcentaje'?100:undefined} value={form.beneficio_valor} onChange={e=>setForm({...form,beneficio_valor:e.target.value})}/></label>
     :<label>Qué incluye<input value={form.beneficio_detalle} maxLength={300} onChange={e=>setForm({...form,beneficio_detalle:e.target.value})}/></label>}
    <label>Desde<input type="date" value={form.desde} onChange={e=>setForm({...form,desde:e.target.value})}/></label>
    <label>Hasta<input type="date" value={form.hasta} min={form.desde} onChange={e=>setForm({...form,hasta:e.target.value})}/></label>
    <label>Código (opcional)<input value={form.codigo} maxLength={30} onChange={e=>setForm({...form,codigo:e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g,'')})}/></label>
   </div>
   <p style={{fontSize:12}}><b>Sedes</b> (ninguna = todas): {sedes.map(s=><label key={s.id} style={{marginRight:10}}><input type="checkbox" checked={form.sede_ids.includes(s.id)} onChange={()=>setForm({...form,sede_ids:toggle(form.sede_ids,s.id)})}/> {s.nombre}</label>)}</p>
   <p style={{fontSize:12}}><b>Tipos</b> (ninguno = todos): {tipos.map(t=><label key={t.id} style={{marginRight:10}}><input type="checkbox" checked={form.clasificacion_ids.includes(t.id)} onChange={()=>setForm({...form,clasificacion_ids:toggle(form.clasificacion_ids,t.id),categorias:[]})}/> {t.nombre}</label>)}</p>
   <p style={{fontSize:12}}><b>Categorías</b> (ninguna = todas): {[...new Set(catOptions)].map(c=><label key={c} style={{marginRight:10}}><input type="checkbox" checked={form.categorias.includes(c)} onChange={()=>setForm({...form,categorias:toggle(form.categorias,c)})}/> {c}</label>)}</p>
   <label>Condiciones<textarea value={form.condiciones} maxLength={2000} onChange={e=>setForm({...form,condiciones:e.target.value})}/></label>
   <label><input type="checkbox" checked={form.activo} onChange={e=>setForm({...form,activo:e.target.checked})}/> Activa (desmarca para pausarla)</label>
   <div className={styles.toolbar}><button type="button" onClick={()=>setForm(null)}>Cancelar</button>
    <button type="button" className={styles.primary} disabled={form.nombre.trim().length<2||!form.desde||!form.hasta||form.hasta<form.desde||(form.beneficio_tipo==='incluido'?form.beneficio_detalle.trim().length<2:!(Number(form.beneficio_valor)>0))} onClick={()=>void save()}>Guardar</button></div>
  </fieldset>}
  <div style={{display:'grid',gap:10}}>
   {rows.map(p=><article key={p.id} style={{border:'1px solid #eee',borderRadius:14,padding:12,fontSize:13,lineHeight:1.5}}>
    <b style={{fontSize:15}}>{p.nombre}</b> · <b style={{color:promoState(p)==='Vigente'?'#047857':'#6b7280'}}>{promoState(p)}</b>{p.codigo?` · Código ${p.codigo}`:''}
    <br/>{promoBenefit(p)} · {p.desde.split('-').reverse().join('/')} al {p.hasta.split('-').reverse().join('/')}
    <br/>Sedes: {name(sedes,p.sede_ids)} · Tipos: {name(tipos,p.clasificacion_ids)} · Categorías: {p.categorias?.join(', ')||'Todas'}
    {p.condiciones&&<><br/><span style={{color:'#555'}}>{p.condiciones}</span></>}
    {canEdit&&<><br/><button type="button" onClick={()=>edit(p)}>Editar</button></>}
   </article>)}
  </div>
  {!rows.length&&!error&&<p className={styles.empty}>No hay promociones.</p>}
 </section>;
}
