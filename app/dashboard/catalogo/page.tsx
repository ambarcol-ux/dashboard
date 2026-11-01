'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpen,Download,Link2} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {cop} from '@/lib/rental-price';
import {downloadCatalogPdf} from '@/lib/dress-catalog-pdf';
import styles from '@/app/dashboard/caja/caja.module.css';

type Dress={id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;precio_sugerido:number|null;estado:string|null;categoria:string|null;clasificacion_id:number|null;sede_actual_id:string|null;foto_frente:string|null;foto_espalda:string|null;foto_detalle:string|null;imagen_url:string|null};
const NO_CATALOGO=['vendido','de baja','dañado/baja'];

/** Catálogo de vestidos: what the store offers, by type and category, with photo and rental price (built on the inventory). */
export default function CatalogPage(){
 return <SupplierShell activePage="catalogo" crumb="Ventas y CRM / Catálogo" title="Catálogo de vestidos" icon={<BookOpen/>}
  description="Vestidos del inventario por tipo y categoría, con foto y precio de alquiler. Las fotos, precios y datos se editan en Inventario; las categorías en Configuración.">
  {profile=><Catalog profile={profile}/>}
 </SupplierShell>;
}

/** Card photo: front, else any loaded photo. */
const cover=(d:Dress)=>d.foto_frente||d.imagen_url||d.foto_espalda||d.foto_detalle||null;
const SLOTS=[['foto_frente','Frente'],['foto_espalda','Espalda'],['foto_detalle','Detalle']] as const;

function Catalog({profile}:{profile:ShellProfile}){
 const [open,setOpen]=useState<Dress|null>(null);
 const [rows,setRows]=useState<Dress[]>([]),[tipos,setTipos]=useState<{id:number;nombre:string}[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]);
 const [tipo,setTipo]=useState(''),[categoria,setCategoria]=useState(''),[sede,setSede]=useState(''),[q,setQ]=useState(''),[soloFoto,setSoloFoto]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void Promise.all([
  supabase.from('vestidos').select('id,codigo,nombre,talla,color,precio_sugerido,estado,categoria,clasificacion_id,sede_actual_id,foto_frente,foto_espalda,foto_detalle,imagen_url').eq('archivado',false).order('codigo'),
  supabase.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('orden'),supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre')]).then(([v,c,s])=>{
  if(v.error)setError('No se pudo cargar el catálogo.');
  setRows(((v.data||[]) as Dress[]).filter(d=>!NO_CATALOGO.includes(String(d.estado||'').toLowerCase())));setTipos(c.data||[]);setSedes(s.data||[]);});},[]);
 const tipoNombre=(id:number|null)=>tipos.find(t=>t.id===id)?.nombre||'Sin tipo';
 const text=q.trim().toLowerCase();
 const list=useMemo(()=>rows.filter(d=>(!tipo||String(d.clasificacion_id)===tipo)&&(!categoria||d.categoria===categoria)&&(!sede||d.sede_actual_id===sede)
  &&(!soloFoto||!!cover(d))&&(!text||`${d.codigo} ${d.nombre} ${d.color}`.toLowerCase().includes(text))),[rows,tipo,categoria,sede,soloFoto,text]);
 const categorias=[...new Set(rows.filter(d=>!tipo||String(d.clasificacion_id)===tipo).map(d=>d.categoria).filter(Boolean))].sort() as string[];
 const canEdit=profile.rol==='admin';
 // Public links of the current filter (tipo, categoría, sede): /c/[token], always up to date with the inventory.
 type PublicLink={token:string;titulo:string;activo:boolean;created_at:string;creado_por:string|null};
 const [links,setLinks]=useState<PublicLink[]>([]),[notice,setNotice]=useState('');
 const loadLinks=()=>supabase.from('catalogos_publicos').select('token,titulo,activo,created_at,creado_por').order('created_at',{ascending:false}).limit(50).then(({data})=>setLinks((data||[]) as PublicLink[]));
 useEffect(()=>{void loadLinks();},[]);
 const urlOf=(t:string)=>`${window.location.origin}/c/${t}`;
 const copy=async(t:string)=>{try{await navigator.clipboard.writeText(urlOf(t));setNotice('Link copiado.');}catch{setNotice(urlOf(t));}};
 const createLink=async()=>{
  const titulo=[tipo?tipoNombre(Number(tipo)):'Catálogo Ámbar Couture',categoria,sede?sedes.find(s=>s.id===sede)?.nombre:''].filter(Boolean).join(' · ');
  const {data,error:e}=await supabase.from('catalogos_publicos').insert({titulo,clasificacion_id:tipo?Number(tipo):null,categoria:categoria||null,sede_id:sede||null,creado_por:profile.id}).select('token').single();
  if(e||!data){setNotice('No se pudo crear el link.');return;}
  await copy(data.token);void loadLinks();
 };
 const toggle=async(l:PublicLink)=>{await supabase.from('catalogos_publicos').update({activo:!l.activo}).eq('token',l.token);void loadLinks();};
 const pdf=(modo:'una'|'tres'='una')=>{setBusy(true);void downloadCatalogPdf(list.map(d=>({codigo:d.codigo.trim(),nombre:d.nombre,tipo:tipoNombre(d.clasificacion_id),categoria:d.categoria,talla:d.talla,color:d.color,precio:d.precio_sugerido,foto:cover(d),fotos:[d.foto_frente||d.imagen_url,d.foto_espalda,d.foto_detalle]})),
  [tipo?tipoNombre(Number(tipo)):'Todos los tipos',categoria||'todas las categorías',sede?sedes.find(s=>s.id===sede)?.nombre:'todas las sedes'].join(' · '),modo).finally(()=>setBusy(false));};
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:14}}>
   <label>Tipo<select value={tipo} onChange={e=>{setTipo(e.target.value);setCategoria('');}}><option value="">Todos</option>{tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
   <label>Categoría<select value={categoria} onChange={e=>setCategoria(e.target.value)}><option value="">Todas</option>{categorias.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Código, nombre o color"/></label>
   <label><input type="checkbox" checked={soloFoto} onChange={e=>setSoloFoto(e.target.checked)}/> Solo con foto</label>
   <button type="button" disabled={busy||!list.length} onClick={()=>pdf()} className={styles.primary}><Download size={14}/> {busy?'Generando…':`Catálogo PDF (${list.length})`}</button>
   <button type="button" disabled={busy||!list.length} onClick={()=>pdf('tres')} className={styles.primary} title="Un vestido por fila con frente, espalda y detalle"><Download size={14}/> PDF con 3 fotos</button>
   <button type="button" onClick={()=>void createLink()} className={styles.primary} title="Crea un link público con este filtro (tipo, categoría y sede) y lo copia"><Link2 size={14}/> Copiar link público</button>
  </div>
  {notice&&<p role="status" style={{marginBottom:10,fontWeight:700,wordBreak:'break-all'}}>{notice}</p>}
  {links.length>0&&<details style={{marginBottom:14}}><summary style={{cursor:'pointer',fontWeight:800}}>Links públicos ({links.filter(l=>l.activo).length} activos)</summary>
   {links.map(l=><p key={l.token} style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center',margin:'6px 0',fontSize:13,opacity:l.activo?1:.5}}>
    <b>{l.titulo}</b> · {new Date(l.created_at).toLocaleDateString('es-CO')}
    {l.activo&&<button type="button" onClick={()=>void copy(l.token)}>Copiar</button>}
    {(canEdit||l.creado_por===profile.id)&&<button type="button" onClick={()=>void toggle(l)}>{l.activo?'Desactivar':'Activar'}</button>}</p>)}
  </details>}
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:14}}>
   {list.map(d=><article key={d.id} onClick={()=>setOpen(d)} style={{border:'1px solid #eee',borderRadius:16,overflow:'hidden',background:'#fff',cursor:'pointer'}}>
    <div style={{aspectRatio:'3/4',background:'#f6f6f6',display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa',fontSize:12}}>
     {cover(d)?<img src={cover(d)!} alt={d.nombre||d.codigo} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'Sin foto'}</div>
    <div style={{padding:10,fontSize:12,lineHeight:1.4}}>
     <b style={{fontSize:13}}>{d.codigo}</b><br/><span style={{color:'#be123c',fontWeight:700}}>{tipoNombre(d.clasificacion_id)}{d.categoria?` · ${d.categoria}`:''}</span>
     <br/>{d.nombre||'Sin descripción'}<br/>Talla {d.talla||'—'} · {d.color||'—'}<br/><b>{d.precio_sugerido?cop(d.precio_sugerido):'Sin precio'}</b> · {d.estado||'—'}
     {canEdit&&<><br/><Link href={`/admin/inventory?q=${encodeURIComponent(d.codigo.trim())}`} style={{color:'#be123c',fontWeight:700}}>Editar en inventario</Link></>}
    </div></article>)}
  </div>
  {!list.length&&!error&&<p className={styles.empty}>No hay vestidos con estos filtros.</p>}
 {open&&<div onClick={()=>setOpen(null)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,.6)',zIndex:60,display:'flex',alignItems:'center',justifyContent:'center',padding:16}}>
  <div onClick={e=>e.stopPropagation()} style={{background:'#fff',borderRadius:20,padding:16,maxWidth:900,width:'100%',maxHeight:'92vh',overflowY:'auto'}}>
   <div style={{display:'flex',justifyContent:'space-between',gap:8,alignItems:'start'}}><div><b style={{fontSize:18}}>{open.codigo}</b><br/><span style={{color:'#be123c',fontWeight:700}}>{tipoNombre(open.clasificacion_id)}{open.categoria?` · ${open.categoria}`:''}</span><br/>{open.nombre} · Talla {open.talla||'—'} · {open.color||'—'} · <b>{open.precio_sugerido?cop(open.precio_sugerido):'Sin precio'}</b></div>
    <button type="button" onClick={()=>setOpen(null)} className={styles.primary}>Cerrar</button></div>
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))',gap:12,marginTop:12}}>
    {SLOTS.map(([k,label])=>{const url=open[k]||(k==='foto_frente'?open.imagen_url:null);return <figure key={k} style={{margin:0}}>
     <div style={{aspectRatio:'3/4',background:'#f6f6f6',borderRadius:14,overflow:'hidden',display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa',fontSize:12}}>{url?<a href={url} target="_blank" rel="noopener noreferrer" style={{display:'block',width:'100%',height:'100%'}}><img src={url} alt={`${open.codigo} ${label}`} style={{width:'100%',height:'100%',objectFit:'cover'}}/></a>:'Sin foto'}</div>
     <figcaption style={{textAlign:'center',fontSize:12,fontWeight:700,marginTop:4}}>{label}</figcaption></figure>;})}
   </div>
   {canEdit&&<p style={{marginTop:10}}><Link href={`/admin/inventory?q=${encodeURIComponent(open.codigo.trim())}`} style={{color:'#be123c',fontWeight:700}}>Subir o cambiar fotos en inventario</Link></p>}
  </div></div>}
 </section>;
}
