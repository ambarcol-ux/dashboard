'use client';
import {useEffect,useMemo,useState} from 'react';
import {BookOpen} from 'lucide-react';
import SupplierShell,{type ShellProfile} from '@/components/suppliers/SupplierShell';
import SupplierConditions from '@/components/suppliers/SupplierConditions';
import {supabase} from '@/lib/supabase';
import {money} from '@/lib/deposits';
import {tariffMargin,type CatalogItem} from '@/lib/suppliers';
import styles from '@/app/dashboard/caja/caja.module.css';

export default function SupplierCatalogPage(){
 return <SupplierShell activePage="proveedores-catalogo" crumb="Proveedores / Catálogo" title="Catálogo de proveedores" icon={<BookOpen/>}
  description="Proveedores por sede y servicio con el precio al cliente. Para asignar uno, abre el contrato y usa «Proveedores del contrato».">
  {profile=><Catalog profile={profile}/>}
 </SupplierShell>;
}

function Catalog({profile}:{profile:ShellProfile}){
 const [sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sede,setSede]=useState(profile.sede_id||''),[servicio,setServicio]=useState(''),[q,setQ]=useState('');
 const [items,setItems]=useState<CatalogItem[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[conditions,setConditions]=useState<{id:string;nombre:string;descripcion?:string|null;servicio?:string;documentos?:boolean}|null>(null);
 useEffect(()=>{void supabase.from('sedes').select('id,nombre').order('nombre').then(({data})=>{setSedes(data||[]);if(!profile.sede_id&&data?.[0])setSede(data[0].id);});},[profile.sede_id]);
 useEffect(()=>{
  if(!sede)return;
  let live=true;
  void supabase.rpc('catalogo_proveedores',{p_sede:sede}).then(({data,error})=>{if(!live)return;setLoading(false);if(error)setError(error.message);else{setItems(data as CatalogItem[]);setError('');}});
  return()=>{live=false;};
 },[sede]);
 const types=useMemo(()=>[...new Set(items.map(i=>i.servicio))],[items]);
 const text=q.trim().toLowerCase();
 const list=items.filter(i=>(!servicio||i.servicio===servicio)&&(!text||`${i.proveedor} ${i.descripcion} ${i.recurso||''}`.toLowerCase().includes(text)));
 const isAdmin=profile.rol==='admin';
 return <section className={styles.card}>
  <div className={styles.toolbar} style={{marginBottom:14}}>
   <label>Sede<select value={sede} onChange={e=>{setLoading(true);setSede(e.target.value);}}>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label>Servicio<select value={servicio} onChange={e=>setServicio(e.target.value)}><option value="">Todos</option>{types.map(t=><option key={t}>{t}</option>)}</select></label>
   <label>Buscar<input value={q} onChange={e=>setQ(e.target.value)} placeholder="Proveedor, paquete o lugar"/></label>
  </div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  <div className={styles.tableScroll}><table className={styles.table}>
   <thead><tr><th>Servicio</th><th>Proveedor</th><th>Qué incluye y condiciones</th><th>Precio al cliente</th>{isAdmin&&<th>Costo / margen</th>}<th></th></tr></thead>
   <tbody>{list.map(i=><tr key={i.tarifa_id}>
    <td>{i.servicio}</td><td><b>{i.proveedor}</b>{i.celular&&<small>{i.celular}</small>}</td>
    <td style={{whiteSpace:'pre-line',maxWidth:420}}>{i.descripcion||'—'}{i.recurso&&<small>{i.recurso}</small>}{i.adicional_opcional&&<small>Opcional: {i.adicional_opcional}</small>}</td>
    <td><b>{money(i.valor_cliente)}</b></td>
    {isAdmin&&<td>{money(i.valor_empresa??0)}<small>Margen {money(tariffMargin({valor_cliente:i.valor_cliente,valor_empresa:i.valor_empresa??0,adicional_valor:i.adicional_valor??0}))}</small></td>}
    <td>{(i.tiene_condiciones||i.descripcion)&&<button className={styles.button} onClick={()=>setConditions({id:i.proveedor_id,nombre:i.proveedor,descripcion:i.descripcion,servicio:i.servicio,documentos:i.tiene_condiciones})}>Condiciones</button>}</td></tr>)}</tbody>
  </table></div>
  {!list.length&&<p className={styles.empty}>{loading?'Cargando catálogo…':'No hay tarifas activas para esta sede o filtro.'}</p>}
  {conditions&&<SupplierConditions supplier={conditions} onClose={()=>setConditions(null)}/>}
 </section>;
}
