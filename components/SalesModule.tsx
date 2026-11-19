'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';
import DressSaleDialog from '@/components/DressSaleDialog';
import styles from '@/app/dashboard/caja/caja.module.css';

type Dress={id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;precio_venta:number|null;sede_actual_id:string|null;estado:string|null;para_venta?:boolean|null};
/** Why a dress cannot be sold yet (null = it can), with what to do. */
const motivoNoVenta=(d:Dress)=>!d.para_venta?'No está marcado «Venta» en Inventario. Ábrelo, marca «Venta», revisa el precio y guarda.':['vendido','dañado/baja','de baja'].includes(String(d.estado||'').toLowerCase())?`No se puede vender: está ${String(d.estado).toLowerCase()}.`:!Number(d.precio_venta)?'No tiene precio de venta. Escríbelo en Inventario.':null;
type Sale={id:string;consecutivo:number;fecha:string;total:number;descuento:number;medio_pago:string;cliente_nombre:string;cliente_documento:string;numero_factura:string|null;codigo_siigo:string;siigo_estado?:string;estado:string;
 vestidos?:{codigo:string;nombre:string|null}|null;sedes?:{nombre:string}|null};
const money=(n:number)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(n)||0);
export const ventaNumero=(n:number)=>`VTA-${String(n).padStart(6,'0')}`;

/** Ventas de vestidos: new sale (dress marked for sale, cash), list of the month with its Siigo invoice number, receipt and cancellation. */
export default function SalesModule({isAdmin}:{isAdmin:boolean}){
 const router=useRouter();
 const [q,setQ]=useState(''),[buscado,setBuscado]=useState(''),[found,setFound]=useState<Dress[]>([]),[selling,setSelling]=useState<Dress|null>(null),[searching,setSearching]=useState(false);
 const [mes,setMes]=useState(()=>new Date().toISOString().slice(0,7)),[rows,setRows]=useState<Sale[]>([]),[loading,setLoading]=useState(true),[v,setV]=useState(0);
 useEffect(()=>{let live=true;
  const ini=`${mes}-01`,fin=new Date(Date.UTC(Number(mes.slice(0,4)),Number(mes.slice(5,7)),0)).toISOString().slice(0,10);
  void supabase.from('ventas_vestidos').select('id,consecutivo,fecha,total,descuento,medio_pago,cliente_nombre,cliente_documento,numero_factura,codigo_siigo,siigo_estado,estado,vestidos(codigo,nombre),sedes(nombre)')
   .gte('fecha',ini).lte('fecha',fin).order('consecutivo',{ascending:false}).then(({data,error})=>{if(!live)return;setLoading(false);if(error){toast.error(error.message);return;}setRows((data||[]) as unknown as Sale[]);});
  return()=>{live=false;};},[mes,v]);
 const [sedes,setSedes]=useState<Record<string,string>>({});
 useEffect(()=>{void supabase.from('sedes').select('id,nombre').then(({data})=>setSedes(Object.fromEntries((data||[]).map(x=>[String(x.id),String(x.nombre)]))));},[]);
 const buscar=useCallback(async()=>{const t=q.trim().toUpperCase();if(t.length<2)return;setSearching(true);
  // All matching dresses are listed; the ones that cannot be sold say why and what to do.
  const {data,error}=await supabase.from('vestidos').select('id,codigo,nombre,talla,color,precio_venta,sede_actual_id,estado,para_venta')
   .ilike('codigo',`%${t}%`).or('archivado.is.null,archivado.eq.false').limit(20);
  setSearching(false);if(error){toast.error(error.message);return;}
  setBuscado(t);setFound((data||[]) as unknown as Dress[]);},[q]);
 const factura=async(s:Sale)=>{const n=window.prompt(`Número de la factura electrónica de Siigo para ${ventaNumero(s.consecutivo)}`,s.numero_factura||'');if(n===null)return;
  const {error}=await supabase.rpc('venta_numero_factura',{p_id:s.id,p_numero:n});if(error)toast.error(error.message);else{toast.success('Número de factura guardado.');setV(x=>x+1);}};
 const anular=async(s:Sale)=>{const m=window.prompt(`Motivo para anular la venta ${ventaNumero(s.consecutivo)} (sale de la caja y el vestido vuelve a estar disponible)`);if(m===null)return;
  const {error}=await supabase.rpc('anular_venta_vestido',{p_id:s.id,p_motivo:m});if(error)toast.error(error.message);else{toast.success('Venta anulada.');setV(x=>x+1);}};
 const activas=rows.filter(r=>r.estado==='registrada'),total=activas.reduce((a,r)=>a+Number(r.total),0),sinFactura=activas.filter(r=>!r.numero_factura).length;
 return <>
  <section className={styles.card}><h2>Nueva venta</h2><p>Busca el vestido por su código. Si un vestido no está marcado «Venta» en Inventario, el ERP te dice qué hacer. La venta es de contado, entra a la caja del día y genera el comprobante.</p>
   <div className={styles.toolbar}><label>Código del vestido<input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void buscar();}} placeholder="Ej.: 1390"/></label>
    <button className={styles.primary} onClick={()=>void buscar()} disabled={searching||q.trim().length<2}>{searching?'Buscando…':'Buscar'}</button></div>
   {found.length>0&&<div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>Vestido</th><th>Sede</th><th>Estado</th><th>Precio de venta</th><th></th></tr></thead>
    <tbody>{found.map(d=><tr key={d.id}><td><strong>{d.codigo}</strong><br/><small>{d.nombre} · {d.talla} · {d.color}</small></td><td>{sedes[String(d.sede_actual_id)]||'—'}</td><td>{d.estado||'—'}</td><td>{d.precio_venta?money(d.precio_venta):'Sin precio'}</td>
     <td>{motivoNoVenta(d)?<><small style={{color:'#b45309',fontWeight:700,display:'block',maxWidth:260}}>{motivoNoVenta(d)}</small><Link className={styles.button} href={`/admin/inventory?q=${encodeURIComponent(d.codigo)}`}>Abrir en Inventario</Link></>:<button className={styles.primary} onClick={()=>setSelling(d)}>Vender</button>}</td></tr>)}</tbody></table></div>}
   {buscado&&!searching&&!found.length&&<p className={styles.empty}>No hay ningún vestido con el código «{buscado}» (o está archivado). Revisa el código en Inventario.</p>}
  </section>
  <section className={styles.card} style={{marginTop:18}}><h2>Ventas del mes</h2>
   <div className={styles.toolbar}><label>Mes<input type="month" value={mes} onChange={e=>{if(e.target.value){setLoading(true);setMes(e.target.value);}}}/></label></div>
   <div className={styles.stats}><div><span>Ventas</span><strong>{activas.length}</strong></div><div><span>Total vendido (entró a caja)</span><strong className={styles.in}>{money(total)}</strong></div><div><span>Sin factura de Siigo</span><strong className={sinFactura?styles.out:''}>{sinFactura}</strong></div></div>
   <div className={styles.tableScroll}><table className={styles.table}><thead><tr><th>N°</th><th>Fecha</th><th>Sede</th><th>Vestido</th><th>Cliente</th><th>Total</th><th>Factura Siigo</th><th></th></tr></thead>
    <tbody>{rows.map(s=><tr key={s.id} style={s.estado==='anulada'?{opacity:.55}:undefined}><td><strong>{ventaNumero(s.consecutivo)}</strong>{s.estado==='anulada'&&<><br/><small>Anulada</small></>}</td><td>{s.fecha}</td><td>{s.sedes?.nombre||'—'}</td>
     <td>{s.vestidos?.codigo}<br/><small>Siigo {s.codigo_siigo}</small></td><td>{s.cliente_nombre}<br/><small>{s.cliente_documento}</small></td><td>{money(s.total)}<br/><small>{s.medio_pago}{Number(s.descuento)?` · dto ${money(s.descuento)}`:''}</small></td>
     <td>{s.numero_factura||<span className={`${styles.badge}`}>{s.siigo_estado==='error'?'Error Siigo · se reintenta solo':'Pendiente'}</span>}</td>
     <td><div className={styles.actions}><Link className={styles.button} href={`/dashboard/ventas/${s.id}`}>Comprobante</Link>{s.estado==='registrada'&&<button onClick={()=>void factura(s)}>N° factura</button>}{isAdmin&&s.estado==='registrada'&&<button onClick={()=>void anular(s)}>Anular</button>}</div></td></tr>)}</tbody></table></div>
   {!rows.length&&<p className={styles.empty}>{loading?'Cargando…':'No hay ventas en este mes.'}</p>}
  </section>
  {selling&&<DressSaleDialog dress={selling} onClose={()=>setSelling(null)} onSaved={id=>{setSelling(null);setFound([]);setQ('');setV(x=>x+1);if(id)router.push(`/dashboard/ventas/${id}`);}}/>}
 </>;
}
