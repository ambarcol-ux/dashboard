'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';
import {toExcelCsv} from '@/lib/inventory';

type Row={id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;estado:string|null;sede:string|null;clasificacion:string|null;categoria:string|null;precio:number|null;creado:string;veces:number;veces_90d:number;proximos:number;ultimo:string|null;dias_sin_alquiler:number;foto:boolean};
type Filtro='nunca'|'nuevos'|'quietos'|'pocas'|'estrellas'|'todos';
const FILTROS:[Filtro,string][]=[['nunca','Nunca alquilados'],['nuevos','Nuevos sin alquilar (<60 días)'],['quietos','Quietos +90 días'],['pocas','Pocas veces (1-2)'],['estrellas','Más alquilados (5+)'],['todos','Todos']];
const nunca=(r:Row)=>r.veces===0&&r.proximos===0&&r.dias_sin_alquiler>=60;
const quieto=(r:Row)=>r.veces>0&&r.proximos===0&&r.dias_sin_alquiler>90;
const pocas=(r:Row)=>r.veces>=1&&r.veces<=2;
const estrella=(r:Row)=>r.veces>=5;
// Registered in the ERP less than 60 days ago and not rented yet: too new to call it «never rented».
const diasEnErp=(r:Row)=>Math.floor((Date.now()-Date.parse(r.creado+'T12:00:00-05:00'))/86400000);
const nuevo=(r:Row)=>r.veces===0&&r.proximos===0&&diasEnErp(r)<60;
const money=(n:number|null)=>n?`$${Math.round(n/1000).toLocaleString('es-CO')} mil`:'—';

/** Suggestion for one dress, from its rotation, photo and the demand of its type in other stores. */
function sugerencia(r:Row,mejorSede:Map<string,string>){
 const otra=r.clasificacion?mejorSede.get(r.clasificacion):undefined;
 const s:string[]=[];
 if(!r.foto)s.push('Tómale foto: sin foto no sale en el catálogo ni la IA lo ofrece.');
 if(nunca(r)||quieto(r)){
  if(otra&&otra!==r.sede)s.push(`Trasládalo a ${otra}, donde ${r.clasificacion} se alquila más.`);
  s.push('Destácalo en redes o en una promoción; si sigue quieto, revisa el precio o considera venderlo.');
 }
 if(estrella(r))s.push('Muy pedido: revisa su desgaste y considera comprar uno similar.');
 return s;
}

/** Inventory › Rotación: how many times each dress was rented according to contracts, which ones do not move and what to do. */
export default function InventoryRotation(){
 const [rows,setRows]=useState<Row[]|null>(null),[error,setError]=useState(''),[filtro,setFiltro]=useState<Filtro>('nunca'),[sede,setSede]=useState(''),[q,setQ]=useState('');
 useEffect(()=>{let vivo=true;void supabase.rpc('rotacion_vestidos').then(({data,error:e})=>{if(!vivo)return;if(e)setError(e.message);else setRows((data||[]) as Row[]);});return()=>{vivo=false;};},[]);
 const lista=useMemo(()=>rows||[],[rows]);
 // Demand per store and type: rentals per dress. Used to suggest transfers from stores where a type does not move.
 const demanda=useMemo(()=>{
  const m=new Map<string,{sede:string;clasificacion:string;n:number;alq:number;quietos:number}>();
  for(const r of lista){if(!r.sede||!r.clasificacion)continue;const k=r.sede+'|'+r.clasificacion;const d:{sede:string;clasificacion:string;n:number;alq:number;quietos:number}=m.get(k)||{sede:r.sede,clasificacion:r.clasificacion,n:0,alq:0,quietos:0};d.n++;d.alq+=r.veces;if(nunca(r)||quieto(r))d.quietos++;m.set(k,d);}
  return [...m.values()].filter(d=>d.n>=5).map(d=>({...d,ratio:d.alq/d.n}));
 },[lista]);
 const mejorSede=useMemo(()=>{const m=new Map<string,string>();for(const d of demanda){const cur=demanda.find(x=>x.clasificacion===d.clasificacion&&x.sede===m.get(d.clasificacion));if(!cur||d.ratio>cur.ratio)m.set(d.clasificacion,d.sede);}return m;},[demanda]);
 const traslados=useMemo(()=>{
  const out:string[]=[];
  for(const [cl,top] of mejorSede){const alta=demanda.find(d=>d.clasificacion===cl&&d.sede===top)!;
   for(const d of demanda.filter(x=>x.clasificacion===cl&&x.sede!==top&&x.quietos>0&&alta.ratio>=Math.max(1,x.ratio*2)))
    out.push(`${cl}: en ${d.sede} cada vestido se alquila ${d.ratio.toFixed(1)} veces y en ${top} ${alta.ratio.toFixed(1)}. Traslada a ${top} hasta ${Math.min(d.quietos,Math.ceil(d.n/4))} de los ${d.quietos} que no se mueven en ${d.sede}.`);}
  return out;
 },[demanda,mejorSede]);
 const sedes=[...new Set(lista.map(r=>r.sede).filter(Boolean))].sort() as string[];
 const base=lista.filter(r=>(!sede||r.sede===sede)&&(!q||`${r.codigo} ${r.nombre||''} ${r.color||''}`.toLowerCase().includes(q.toLowerCase())));
 const cuenta={nunca:base.filter(nunca).length,nuevos:base.filter(nuevo).length,quietos:base.filter(quieto).length,pocas:base.filter(pocas).length,estrellas:base.filter(estrella).length,todos:base.length};
 const visibles=base.filter(filtro==='nunca'?nunca:filtro==='nuevos'?nuevo:filtro==='quietos'?quieto:filtro==='pocas'?pocas:filtro==='estrellas'?estrella:()=>true)
  .sort((a,b)=>filtro==='estrellas'||filtro==='todos'?b.veces-a.veces:b.dias_sin_alquiler-a.dias_sin_alquiler);
 const sinFoto=base.filter(r=>!r.foto).length;
 // Excel download of the whole filtered list (not only the 200 shown), same CSV format as «Por estado».
 const descargar=()=>{
  const csv=toExcelCsv(['Código','Nombre','Talla','Color','Sede','Tipo','Categoría','Estado','Ingresado al ERP','Días en el ERP','Precio','Veces alquilado','Últimos 90 días','Próximos','Último alquiler','Días sin alquilar','Foto','Sugerencia'],
   visibles.map(r=>[r.codigo,r.nombre,r.talla,r.color,r.sede,r.clasificacion||'Sin tipo',r.categoria,r.estado,r.creado,diasEnErp(r),r.precio,r.veces,r.veces_90d,r.proximos,r.ultimo||'Nunca',r.dias_sin_alquiler,r.foto?'Sí':'No',sugerencia(r,mejorSede).join(' ')]));
  const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  const nombre=[FILTROS.find(f=>f[0]===filtro)?.[1],sede||'todas las sedes',q].filter(Boolean).join(' ');
  const a=document.createElement('a');a.href=url;a.download=`rotacion-${nombre.replace(/[^\p{L}\p{N}]+/gu,'-').toLowerCase()}.csv`;a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 if(error)return <p className="text-red-600 font-bold">No se pudo cargar la rotación: {error}</p>;
 if(!rows)return <p className="text-gray-400 font-bold">Calculando rotación…</p>;
 return <div className="space-y-6 text-gray-800">
  <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
   <div><h2 className="text-xl font-black text-gray-900">Rotación de vestidos</h2>
    <p className="text-sm text-gray-500">Veces que se alquiló cada vestido según los contratos (vestido principal y adicionales; sin anulados, cancelados ni borradores). Los contratos se registran en el ERP desde abril de 2026. «Ingresado» es la fecha en que el vestido se registró en el ERP (los de abril son la carga inicial); los de menos de 60 días salen como nuevos y no cuentan como «nunca alquilados».</p></div>
   <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
    {([['nunca','Nunca alquilados','text-red-600'],['nuevos','Nuevos sin alquilar','text-sky-600'],['quietos','Quietos +90 días','text-amber-600'],['pocas','Pocas veces (1-2)','text-gray-900'],['estrellas','Más alquilados (5+)','text-emerald-600']] as const).map(([k,l,c])=>
     <button key={k} type="button" onClick={()=>setFiltro(k)} className={`text-left rounded-2xl border p-4 ${filtro===k?'border-rose-300 bg-rose-50':'border-gray-100'}`}><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">{l}</p><p className={`text-3xl font-black ${c}`}>{cuenta[k]}</p><p className="text-xs font-bold text-gray-500">de {base.length} vestidos</p></button>)}
    <div className="rounded-2xl border border-gray-100 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Sin foto</p><p className="text-3xl font-black text-gray-900">{sinFoto}</p><p className="text-xs font-bold text-gray-500">no salen en el catálogo</p></div>
   </div>
  </div>
  {!!traslados.length&&<div className="rounded-[2rem] border border-violet-200 bg-violet-50 p-6 space-y-2"><h3 className="font-black text-violet-900">💡 Sugerencias de traslado</h3>{traslados.map(t=><p key={t} className="text-sm font-bold text-violet-900">• {t}</p>)}</div>}
  <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-4">
   <div className="flex flex-wrap gap-2 items-center">
    <select value={filtro} onChange={e=>setFiltro(e.target.value as Filtro)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold">{FILTROS.map(([k,l])=><option key={k} value={k}>{l} ({cuenta[k]})</option>)}</select>
    <select value={sede} onChange={e=>setSede(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"><option value="">Todas las sedes</option>{sedes.map(s=><option key={s}>{s}</option>)}</select>
    <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar código, nombre o color" className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[12rem]"/>
    <button type="button" onClick={descargar} disabled={!visibles.length} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">Descargar Excel ({visibles.length})</button>
   </div>
   <div className="overflow-x-auto rounded-2xl border border-gray-100"><table className="w-full text-sm">
    <thead className="bg-gray-50"><tr className="text-left text-[10px] uppercase tracking-widest text-gray-500"><th className="py-3 px-4 sticky left-0 z-10 bg-gray-50">Vestido</th><th className="py-3 px-3">Sede</th><th className="py-3 px-3 whitespace-nowrap">Ingresado</th><th className="py-3 px-3">Tipo</th><th className="py-3 px-3 text-right">Veces</th><th className="py-3 px-3 text-right">Últ. 90 días</th><th className="py-3 px-3 text-right">Próximos</th><th className="py-3 px-3">Último alquiler</th><th className="py-3 px-3 text-right">Días sin alquilar</th><th className="py-3 px-3">Precio</th><th className="py-3 px-4 min-w-[16rem]">Sugerencia</th></tr></thead>
    <tbody>{visibles.slice(0,200).map(r=>{const s=sugerencia(r,mejorSede);return <tr key={r.id} className="border-t border-gray-100 align-top">
     <td className="py-3 px-4 sticky left-0 z-10 bg-white shadow-[2px_0_4px_rgba(0,0,0,0.04)]"><p className="font-black text-gray-900">{r.codigo}</p><p className="text-xs text-gray-500">{[r.nombre,r.talla&&`T. ${r.talla}`,r.color].filter(Boolean).join(' · ')}</p></td>
     <td className="py-3 px-3">{r.sede||'—'}</td><td className="py-3 px-3 whitespace-nowrap">{r.creado}<p className={`text-xs font-bold ${diasEnErp(r)<60?'text-sky-600':'text-gray-500'}`}>{diasEnErp(r)<60?`Nuevo · ${diasEnErp(r)} días`:`${diasEnErp(r)} días`}</p></td><td className="py-3 px-3">{r.clasificacion||'Sin tipo'}{r.categoria?<p className="text-xs text-gray-500">{r.categoria}</p>:null}</td>
     <td className="py-3 px-3 text-right font-black">{r.veces}</td><td className="py-3 px-3 text-right">{r.veces_90d}</td><td className="py-3 px-3 text-right">{r.proximos}</td>
     <td className="py-3 px-3 whitespace-nowrap">{r.ultimo||'Nunca'}</td><td className={`py-3 px-3 text-right font-bold ${r.dias_sin_alquiler>90?'text-red-600':''}`}>{r.dias_sin_alquiler}</td>
     <td className="py-3 px-3 whitespace-nowrap">{money(r.precio)}</td><td className="py-3 px-4 text-xs text-gray-600">{s.length?s.map(x=><p key={x}>• {x}</p>):'—'}</td></tr>;})}</tbody>
   </table></div>
   {visibles.length>200&&<p className="text-xs text-gray-400">Se muestran 200 de {visibles.length}. Filtra por sede o busca para ver el resto.</p>}
  </div>
 </div>;
}
