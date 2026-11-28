'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {collectPages} from '@/lib/collect-pages';
import {commercialRows,commercialMetrics,type HistoricCRM,type AnalysisVisit} from '@/lib/crm-analysis';
import styles from '@/app/agendar-primera-cita/visits.module.css';
import {FollowupAnalysis} from '@/components/FollowupSummary';
import {cop} from '@/lib/rental-price';
type PromoRow={nombre?:string;origen?:string;citas:number;contratos:number;valor:number;descuento:number};
export default function CommercialAnalysis(){
 const year=new Intl.DateTimeFormat('en',{year:'numeric',timeZone:'America/Bogota'}).format(new Date());
 const [from,setFrom]=useState(year+'-01-01'),[to,setTo]=useState(year+'-12-31'),[site,setSite]=useState(''),[advisor,setAdvisor]=useState(''),[origin,setOrigin]=useState('');
 const [archive,setArchive]=useState<HistoricCRM[]>([]),[visits,setVisits]=useState<AnalysisVisit[]>([]),[sites,setSites]=useState<Record<string,string>>({}),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const request=useRef(0);
 const [promo,setPromo]=useState<{promociones:PromoRow[];origenes:PromoRow[]}>({promociones:[],origenes:[]});
 const load=useCallback(async()=>{
  const id=++request.current;setLoading(true);setError('');
  if(!from||!to||to<from||(Date.parse(to)-Date.parse(from))/86400000>366){setLoading(false);setError('Selecciona un periodo de hasta un año.');return;}
  try{
   const [historical,native,locations,linked,promoData]=await Promise.all([
    collectPages<HistoricCRM>((a,b)=>supabase.from('crm_historico').select('id,hoja,fila,id_externo,sede_id,fecha,nombre,asesora,asistencia,alquilo,recuperada,motivo,incidencia').in('hoja',['CITAS','VITRINA']).order('id').range(a,b)),
    supabase.rpc('listar_primeras_citas',{p_desde:from,p_hasta:to}),
    supabase.from('sedes').select('id,nombre').eq('activo',true),
    collectPages<{crm_origen_id:string;fecha:string}>((a,b)=>supabase.from('primeras_citas').select('crm_origen_id,fecha').not('crm_origen_id','is',null).order('id').range(a,b)),
    supabase.rpc('analisis_promociones_origen',{p_desde:from,p_hasta:to}),
   ]);
   if(native.error||locations.error)throw Error('No se pudo consultar el análisis.');
   if(id===request.current){const dates=new Map(linked.map(c=>[c.crm_origen_id,c.fecha]));setArchive(historical.map(h=>dates.has(h.id)?{...h,fecha:dates.get(h.id)!}:h));setVisits(native.data||[]);setSites(Object.fromEntries((locations.data||[]).map(s=>[s.id,s.nombre])));setPromo(promoData.error||!promoData.data?{promociones:[],origenes:[]}:promoData.data);}
  }catch{if(id===request.current){setArchive([]);setVisits([]);setError('No se pudo cargar el análisis comercial. Intenta actualizar.');}}
  finally{if(id===request.current)setLoading(false);}
 },[from,to]);
 const cancel=useCallback(()=>{request.current+=1;},[]);
 useEffect(()=>{void load();return cancel;},[load,cancel]);
 const all=useMemo(()=>commercialRows(archive,visits,sites),[archive,visits,sites]);
 const selected=all.filter(r=>(!site||r.sede_id===site)&&(!advisor||r.asesora===advisor)&&(!origin||r.origen===origin));
 const visible=selected.filter(r=>r.fecha&&r.fecha>=from&&r.fecha<=to&&!r.incidencia),issues=selected.filter(r=>r.incidencia);
 const metrics=commercialMetrics(visible);
 const grouped=useMemo(()=>Array.from(new Set(visible.map(r=>r.sede))).sort().map(sede=>({sede,...commercialMetrics(visible.filter(r=>r.sede===sede))})),[visible]);
 // Month by month per store (same rows and rules as «Resultado por sede»), newest month first; the arrow compares with the month before.
 const meses=useMemo(()=>{const sedes=Array.from(new Set(visible.map(r=>r.sede))).sort(),ms=Array.from(new Set(visible.map(r=>String(r.fecha).slice(0,7)))).sort();
  const celda=(m:string,sede?:string)=>commercialMetrics(visible.filter(r=>String(r.fecha).slice(0,7)===m&&(!sede||r.sede===sede)));
  return {sedes,filas:ms.map((m,i)=>({mes:m,total:celda(m),antTotal:i?celda(ms[i-1]):null,porSede:sedes.map(sd=>({sede:sd,v:celda(m,sd),ant:i?celda(ms[i-1],sd):null}))})).reverse()};},[visible]);
 const flecha=(v:number,ant:number|undefined)=>ant===undefined?'':v>ant?' ▲':v<ant?' ▼':' =';
 const byOrigin=useMemo(()=>Array.from(new Set(visible.map(r=>r.origen+'\u0000'+r.sede))).sort().map(k=>{const [origen,sede]=k.split('\u0000');return {origen,sede,...commercialMetrics(visible.filter(r=>r.origen===origen&&r.sede===sede))};}),[visible]);
 return <main className="p-4 md:p-8"><section className={styles.panel}><div className={styles.heading}><div><h1 className="text-2xl font-bold">Análisis comercial</h1><p>Citas del ERP, citas importadas y visitas de vitrina.</p></div><div className={styles.actions}><Link href="/dashboard/primeras-citas">Volver a primeras visitas</Link><button onClick={()=>void load()} disabled={loading}>Actualizar</button></div></div>
 <div className={styles.controls}><label>Desde<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Hasta<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><label>Sede<select value={site} onChange={e=>setSite(e.target.value)}><option value="">Todas las disponibles</option>{Object.entries(sites).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Responsable<select value={advisor} onChange={e=>setAdvisor(e.target.value)}><option value="">Todas</option>{Array.from(new Set(all.map(r=>r.asesora))).sort().map(a=><option key={a}>{a}</option>)}</select></label><label>Origen<select value={origin} onChange={e=>setOrigin(e.target.value)}><option value="">Todos</option>{['Cita ERP','Cita importada','Vitrina'].map(o=><option key={o}>{o}</option>)}</select></label></div>
 <p className={styles.notice}>El alquiler declarado proviene de respuestas y gestión comercial. Los contratos confirmados se comprueban en el ERP. La conversión usa alquileres declarados entre personas atendidas. Las filas con datos por revisar quedan fuera de los indicadores.</p>
 {error?<p role="alert" className={styles.error}>{error}</p>:loading?<p role="status">Cargando análisis…</p>:<><div className={styles.stats}>{[['Registros',metrics.registros],['Atendidas',metrics.atendidas],['Alquiler declarado',metrics.alquileres],['Alquiler recuperado',metrics.recuperados],['Contratos confirmados',metrics.contratos],['Conversión comercial',metrics.conversion+'%']].map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
 <div className="overflow-x-auto"><table className="w-full text-left text-sm"><caption className="py-3 text-left font-bold">Resultado por sede · {from} al {to}</caption><thead><tr>{['Sede','Registros','Atendidas','Alquiler declarado','Contratos confirmados','Conversión'].map(h=><th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead><tbody>{grouped.map(g=><tr key={g.sede} className="border-t"><th scope="row" className="p-2">{g.sede}</th><td className="p-2">{g.registros}</td><td className="p-2">{g.atendidas}</td><td className="p-2">{g.alquileres}</td><td className="p-2">{g.contratos}</td><td className="p-2">{g.conversion}%</td></tr>)}</tbody></table></div>{!visible.length&&<p>No hay registros válidos para estos filtros.</p>}
 <div id="mes-a-mes" className="overflow-x-auto mt-6 scroll-mt-4"><table className="w-full text-left text-sm"><caption className="py-3 text-left font-bold">Mes a mes por sede · {from} al {to}<span className="block text-xs font-normal text-gray-500">Cada celda: conversión (alquilaron ÷ atendidas) · registros · atendidas · alquilaron. ▲▼ frente al mes anterior.</span></caption><thead><tr><th scope="col" className="p-2">Mes</th>{meses.sedes.map(sd=><th key={sd} scope="col" className="p-2">{sd}</th>)}<th scope="col" className="p-2">Total</th></tr></thead><tbody>{meses.filas.map(f=><tr key={f.mes} className="border-t align-top"><th scope="row" className="p-2 whitespace-nowrap">{new Date(f.mes+'-15T12:00:00').toLocaleDateString('es-CO',{month:'long',year:'numeric'})}</th>{[...f.porSede.map(x=>({k:x.sede,v:x.v,ant:x.ant})),{k:'total',v:f.total,ant:f.antTotal}].map(x=><td key={x.k} className={`p-2 ${x.k==='total'?'font-bold':''}`}><span className={x.ant&&x.v.conversion<x.ant.conversion?'text-rose-700':x.ant&&x.v.conversion>x.ant.conversion?'text-emerald-700':''}><b>{x.v.conversion}%</b>{flecha(x.v.conversion,x.ant?.conversion)}</span><span className="block text-xs text-gray-500">{x.v.registros} reg · {x.v.atendidas} at · {x.v.alquileres} alq{flecha(x.v.alquileres,x.ant?.alquileres)}</span></td>)}</tr>)}</tbody></table></div>
 <div className="overflow-x-auto mt-6"><table className="w-full text-left text-sm"><caption className="py-3 text-left font-bold">Resultado por origen y sede · {from} al {to}</caption><thead><tr>{['Origen','Sede','Recibidas','Atendidas','Cerradas','Contratos confirmados','Conversión'].map(h=><th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead><tbody>{byOrigin.map(g=><tr key={g.origen+g.sede} className="border-t"><th scope="row" className="p-2">{g.origen}</th><td className="p-2">{g.sede}</td><td className="p-2">{g.registros}</td><td className="p-2">{g.atendidas}</td><td className="p-2">{g.alquileres}</td><td className="p-2">{g.contratos}</td><td className="p-2">{g.conversion}%</td></tr>)}</tbody></table></div>
 {([['Promoción','promociones','nombre'],['Origen del enlace (o=)','origenes','origen']] as const).map(([title,key,field])=><div key={key} className="overflow-x-auto mt-6"><table className="w-full text-left text-sm"><caption className="py-3 text-left font-bold">Resultado por {title.toLowerCase()} · {from} al {to}</caption><thead><tr>{[title,'Citas','Contratos','Valor contratos','Descuento otorgado'].map(h=><th key={h} scope="col" className="p-2">{h}</th>)}</tr></thead><tbody>{promo[key].map(g=><tr key={g[field]} className="border-t"><th scope="row" className="p-2">{g[field]}</th><td className="p-2">{g.citas}</td><td className="p-2">{g.contratos}</td><td className="p-2">{cop(Number(g.valor))}</td><td className="p-2">{cop(Number(g.descuento))}</td></tr>)}</tbody></table>{!promo[key].length&&<p>Sin registros en el periodo.</p>}</div>)}
 <details className="mt-6"><summary className="cursor-pointer font-bold">Datos del histórico por revisar ({issues.length})</summary><p className={styles.notice}>Incluye registros sin fecha, aunque no puedan ubicarse en el periodo seleccionado. Todos conservan la fila y los datos originales.</p>{issues.map(r=><article key={r.id} className={styles.row}><div><strong>{r.nombre||'Registro sin nombre'}</strong><p>{r.sede} · {r.origen} · Fila {r.fila}</p><p>{r.incidencia}</p></div></article>)}</details>
 <details className="mt-6"><summary className="cursor-pointer font-bold">Motivos de no alquiler</summary>{Array.from(new Set(visible.filter(r=>!r.alquilo&&r.motivo).map(r=>r.motivo))).sort().map(m=><p key={m} className="py-1">{m}: {visible.filter(r=>!r.alquilo&&r.motivo===m).length}</p>)}</details></>}
 <FollowupAnalysis/></section></main>;
}
