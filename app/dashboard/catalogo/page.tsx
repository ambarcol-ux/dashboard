'use client';
import {useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {BookOpen,Download} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';
import {cop} from '@/lib/rental-price';
import {downloadCatalogPdf} from '@/lib/dress-catalog-pdf';
import styles from '@/app/dashboard/caja/caja.module.css';

type Dress={id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;precio_sugerido:number|null;estado:string|null;categoria:string|null;clasificacion_id:number|null;sede_actual_id:string|null;foto_frente:string|null;imagen_url:string|null};
const NO_CATALOGO=['vendido','de baja','dañado/baja'];

/** Catálogo de vestidos: what the store offers, by type and category, with photo and rental price (built on the inventory). */
export default function CatalogPage(){
 return <SupplierShell activePage="catalogo" crumb="Ventas y CRM / Catálogo" title="Catálogo de vestidos" icon={<BookOpen/>}
  description="Vestidos del inventario por tipo y categoría, con foto y precio de alquiler. Las fotos, precios y datos se editan en Inventario; las categorías en Configuración.">
  {profile=><Catalog profile={profile}/>}
 </SupplierShell>;
}

function Catalog({profile}:{profile:ShellProfile}){
 const [rows,setRows]=useState<Dress[]>([]),[tipos,setTipos]=useState<{id:number;nombre:string}[]>([]),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]);
 const [tipo,setTipo]=useState(''),[categoria,setCategoria]=useState(''),[sede,setSede]=useState(''),[q,setQ]=useState(''),[soloFoto,setSoloFoto]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{void Promise.all([
  supabase.from('vestidos').select('id,codigo,nombre,talla,color,precio_sugerido,estado,categoria,clasificacion_id,sede_actual_id,foto_frente,imagen_url').eq('archivado',false).order('codigo'),
  supabase.from('clasificaciones_vestido').select('id,nombre').eq('activo',true).order('orden'),supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre')]).then(([v,c,s])=>{
  if(v.error)setError('No se pudo cargar el catálogo.');
  setRows(((v.data||[]) as Dress[]).filter(d=>!NO_CATALOGO.includes(String(d.estado||'').toLowerCase())));setTipos(c.data||[]);setSedes(s.data||[]);});},[]);
 const tipoNombre=(id:number|null)=>tipos.find(t=>t.id===id)?.nombre||'Sin tipo';
 const text=q.trim().toLowerCase();
 const list=useMemo(()=>rows.filter(d=>(!tipo||String(d.clasificacion_id)===tipo)&&(!categoria||d.categoria===categoria)&&(!sede||d.sede_actual_id===sede)
  &&(!soloFoto||!!(d.foto_frente||d.imagen_url))&&(!text||`${d.codigo} ${d.nombre} ${d.color}`.toLowerCase().includes(text))),[rows,tipo,categoria,sede,soloFoto,text]);
 const categorias=[...new Set(rows.filter(d=>!tipo||String(d.clasificacion_id)===tipo).map(d=>d.categoria).filter(Boolean))].sort() as string[];
 const canEdit=profile.rol==='admin';
 const pdf=()=>{setBusy(true);void downloadCatalogPdf(list.map(d=>({codigo:d.codigo.trim(),nombre:d.nombre,tipo:tipoNombre(d.clasificacion_id),categoria:d.categoria,talla:d.talla,color:d.color,precio:d.precio_sugerido,foto:d.foto_frente||d.imagen_url})),
  [tipo?tipoNombre(Number(tipo)):'Todos los tipos',categoria||'todas las categorías',sede?sedes.find(s=>s.id===sede)?.nombre:'todas las sedes'].join(' · ')).finally(()=>setBusy(false));};
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:14}}>
   <label>Tipo<select value={tipo} onChange={e=>{setTipo(e.target.value);setCategoria('');}}><option value="">Todos</option>{tipos.map(t=><option key={t.id} value={t.id}>{t.nombre}</option>)}</select></label>
   <label>Categoría<select value={categoria} onChange={e=>setCategoria(e.target.value)}><option value="">Todas</option>{categorias.map(c=><option key={c}>{c}</option>)}</select></label>
   <label>Sede<select value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Código, nombre o color"/></label>
   <label><input type="checkbox" checked={soloFoto} onChange={e=>setSoloFoto(e.target.checked)}/> Solo con foto</label>
   <button type="button" disabled={busy||!list.length} onClick={pdf} className={styles.primary}><Download size={14}/> {busy?'Generando…':`Catálogo PDF (${list.length})`}</button>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(170px,1fr))',gap:14}}>
   {list.map(d=><article key={d.id} style={{border:'1px solid #eee',borderRadius:16,overflow:'hidden',background:'#fff'}}>
    <div style={{aspectRatio:'3/4',background:'#f6f6f6',display:'flex',alignItems:'center',justifyContent:'center',color:'#aaa',fontSize:12}}>
     {d.foto_frente||d.imagen_url?<img src={(d.foto_frente||d.imagen_url)!} alt={d.nombre||d.codigo} loading="lazy" style={{width:'100%',height:'100%',objectFit:'cover'}}/>:'Sin foto'}</div>
    <div style={{padding:10,fontSize:12,lineHeight:1.4}}>
     <b style={{fontSize:13}}>{d.codigo}</b><br/><span style={{color:'#be123c',fontWeight:700}}>{tipoNombre(d.clasificacion_id)}{d.categoria?` · ${d.categoria}`:''}</span>
     <br/>{d.nombre||'Sin descripción'}<br/>Talla {d.talla||'—'} · {d.color||'—'}<br/><b>{d.precio_sugerido?cop(d.precio_sugerido):'Sin precio'}</b> · {d.estado||'—'}
     {canEdit&&<><br/><Link href={`/admin/inventory?q=${encodeURIComponent(d.codigo.trim())}`} style={{color:'#be123c',fontWeight:700}}>Editar en inventario</Link></>}
    </div></article>)}
  </div>
  {!list.length&&!error&&<p className={styles.empty}>No hay vestidos con estos filtros.</p>}
 </section>;
}
