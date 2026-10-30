'use client';
import {useEffect,useMemo,useState} from 'react';
import {CalendarClock,Download,History,Lock,Save,Settings2,Store,X} from 'lucide-react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';
import {saldoContrato,totalContrato} from '@/lib/saldo';
import {AGING,agingBucket,baseDailyGoal,overdueBalance,progress,receivablesCsv,todayGoal,type AgingBucket,type Receivable,type SiteGoal} from '@/lib/sales-goals';

const money=(v:unknown)=>new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(Number(v)||0);
const MONTHS=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
type Profile={rol?:string|null;sede_id?:string|null};
type Change={id:number;nombre_objetivo:string;mes:number;anio:number;valor_anterior:number|null;valor_nuevo:number|null;dias_anterior:number|null;dias_nuevo:number|null;accion:string;fecha_hora:string;usuario:string|null};

/** Metas y Ventas: cards per site, admin goal settings, receivables panel with 30/90/120-day alerts. */
export default function SalesGoals({mes,anio,profile}:{mes:number;anio:number;profile:Profile}){
 const rol=String(profile.rol||'').toLowerCase(),isAdmin=rol==='admin',seesAll=isAdmin||rol==='contabilidad',canExport=seesAll;
 const [goals,setGoals]=useState<SiteGoal[]>([]),[rows,setRows]=useState<Receivable[]>([]),[sede,setSede]=useState<string>(''),[loading,setLoading]=useState(true);
 const [filter,setFilter]=useState<AgingBucket|'todos'>('todos'),[detail,setDetail]=useState<Receivable|null>(null),[config,setConfig]=useState(false);
 const [version,setVersion]=useState(0);
 // Panel historial: period (month, range or year) and view by contract date or payment date.
 const pad=(x:number)=>String(x).padStart(2,'0');
 const [per,setPer]=useState<'mes'|'rango'|'anio'>('mes'),[pMes,setPMes]=useState(`${anio}-${pad(mes)}`),[pDesde,setPDesde]=useState(`${anio}-${pad(mes)}-01`),[pHasta,setPHasta]=useState(()=>new Date().toISOString().slice(0,10)),[pAnio,setPAnio]=useState(String(anio)),[verPor,setVerPor]=useState<'contratos'|'caja'>('contratos');
 useEffect(()=>{setPMes(`${anio}-${pad(mes)}`);setPAnio(String(anio));},[mes,anio]);
 const [desde,hasta]=per==='mes'?[`${pMes}-01`,new Date(Date.UTC(Number(pMes.slice(0,4)),Number(pMes.slice(5,7)),0)).toISOString().slice(0,10)]:per==='anio'?[`${pAnio}-01-01`,`${pAnio}-12-31`]:[pDesde,pHasta];
 useEffect(()=>{
  if(!desde||!hasta||hasta<desde){setRows([]);return;}let live=true;
  void supabase.rpc('historial_ventas_periodo',{p_desde:desde,p_hasta:hasta,p_sede:sede||null,p_modo:verPor}).then(({data,error})=>{
   if(!live)return;if(error){toast.error('No se pudo cargar el historial: '+error.message);return;}
   setRows(((data||[]) as (Receivable&{valor_total:number;total_arreglos:number;anticipo:number;abonos_periodo:number})[]).map(r=>({...r,valor:totalContrato(r),saldo:Math.max(0,saldoContrato(r)),recaudado:verPor==='caja'?Number(r.abonos_periodo)||0:Number(r.anticipo)||0})));
  });
  return()=>{live=false;};
 },[desde,hasta,sede,verPor,version]);
 const reload=()=>{setLoading(true);setVersion(v=>v+1);};
 useEffect(()=>{
  let live=true;
  void (async()=>{
   await supabase.rpc('asegurar_metas_mes',{p_mes:mes,p_anio:anio});
   const g=await supabase.rpc('metas_panel',{p_sede:null,p_mes:mes,p_anio:anio});
   if(!live)return;
   setLoading(false);
   if(g.error){toast.error('No se pudieron cargar las metas: '+g.error.message);return;}
   const list=(g.data||[]) as SiteGoal[];
   setGoals(list);
   if(!seesAll&&list[0])setSede(list[0].sede_id);
  })();
  return()=>{live=false;};
 },[mes,anio,seesAll,version]);

 const visible=sede?goals.filter(g=>g.sede_id===sede):goals;
 const sum=(k:keyof SiteGoal)=>visible.reduce((a,g)=>a+(Number(g[k])||0),0);
 const total:Pick<SiteGoal,'meta'|'vendido'|'vendido_hasta_ayer'|'dias_restantes'|'dias_operativos'>={meta:sum('meta'),vendido:sum('vendido'),vendido_hasta_ayer:sum('vendido_hasta_ayer'),dias_restantes:visible[0]?.dias_restantes??0,dias_operativos:visible[0]?.dias_operativos??0};
 const hoy=todayGoal(total),base=baseDailyGoal(total);
 const now=new Date(),current=now.getMonth()+1===mes&&now.getFullYear()===anio,past=anio<now.getFullYear()||(anio===now.getFullYear()&&mes<now.getMonth()+1);
 const siteRows=useMemo(()=>rows.filter(r=>!sede||r.sede_id===sede),[rows,sede]);
 const counts=useMemo(()=>siteRows.reduce((a,r)=>{a[agingBucket(r)]++;return a;},{al_dia:0,mas30:0,mas90:0,mas120:0,pagada:0} as Record<AgingBucket,number>),[siteRows]);
 const shown=filter==='todos'?siteRows:siteRows.filter(r=>agingBucket(r)===filter);
 const exportCsv=()=>{const url=URL.createObjectURL(new Blob([receivablesCsv(shown)],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`historial-${verPor}-${filter}-${sede?goals.find(g=>g.sede_id===sede)?.sede:'todas'}-${desde}_${hasta}.csv`;a.click();URL.revokeObjectURL(url);};
 const sedeName=sede?goals.find(g=>g.sede_id===sede)?.sede:'Todas las sedes';

 return <section className="space-y-6">
  <div className="flex flex-wrap items-center gap-3">
   {seesAll?<select value={sede} onChange={e=>setSede(e.target.value)} className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-bold text-gray-700 shadow-sm"><option value="">Todas las sedes</option>{goals.map(g=><option key={g.sede_id} value={g.sede_id}>{g.sede}</option>)}</select>
    :<span className="px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 flex items-center gap-2"><Lock className="w-4 h-4"/>Sede: {sedeName}</span>}
   <span className="text-sm font-bold text-gray-500">Período: {MONTHS[mes-1]} {anio}</span>
   {isAdmin&&<button onClick={()=>setConfig(c=>!c)} className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase text-gray-700 hover:bg-gray-50"><Settings2 className="w-4 h-4"/>{config?'Cerrar configuración':'Configuración de metas'}</button>}
  </div>

  {isAdmin&&config&&<GoalSettings key={`${mes}-${anio}-${goals.map(g=>`${g.meta}:${g.dias_operativos}`).join()}`} mes={mes} anio={anio} goals={goals} onSaved={reload}/>}

  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
   <Card title="Meta del mes" value={money(total.meta)} note={isAdmin?'Editable en Configuración de metas':'Solo lectura'}/>
   <Card title="Vendido del mes" value={money(total.vendido)} note={current?`Contratos del mes hasta hoy`:`${visible.reduce((a,g)=>a+g.contratos,0)} contratos`}/>
   <Card title="Cumplimiento" value={`${progress(total).toLocaleString('es-CO')} %`} note={total.meta&&total.vendido<total.meta?`Faltan ${money(total.meta-total.vendido)}`:'Meta cumplida'} bar={progress(total)}/>
   <Card highlight title="Meta de hoy" value={current&&hoy!==null?money(hoy):past?'Mes cerrado':base!==null?money(base):'—'} note={current?`Quedan ${total.dias_restantes} días operativos · base ${money(base)}`:past?'El mes ya terminó':`Meta diaria base (${total.dias_operativos} días)`}/>
  </div>
  <p className="text-xs text-gray-400 font-medium">Meta de hoy = (meta del mes − vendido hasta ayer) ÷ días operativos que faltan, incluido hoy. Días operativos: lunes a sábado sin festivos.</p>

  {!sede&&goals.length>1&&<div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-x-auto">
   <table className="w-full text-sm text-left"><thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-500"><tr><th className="px-5 py-3">Sede</th><th className="px-5 py-3 text-right">Meta</th><th className="px-5 py-3 text-right">Vendido</th><th className="px-5 py-3 text-right">Cumplimiento</th><th className="px-5 py-3 text-right">Meta diaria base</th><th className="px-5 py-3 text-right">Meta de hoy</th><th className="px-5 py-3 text-right">Recaudado del mes</th></tr></thead>
    <tbody className="divide-y divide-gray-50">{goals.map(g=><tr key={g.sede_id} className="hover:bg-rose-50/40 cursor-pointer" onClick={()=>setSede(g.sede_id)}>
     <td className="px-5 py-3 font-black text-gray-900"><Store className="w-4 h-4 inline mr-2 text-rose-400"/>{g.sede}{g.automatica&&<span className="ml-2 text-[9px] font-black uppercase text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">Automática</span>}</td>
     <td className="px-5 py-3 text-right">{money(g.meta)}</td><td className="px-5 py-3 text-right font-bold">{money(g.vendido)}</td><td className="px-5 py-3 text-right">{progress(g).toLocaleString('es-CO')} %</td>
     <td className="px-5 py-3 text-right">{money(baseDailyGoal(g))}</td><td className="px-5 py-3 text-right font-black text-rose-600">{current?money(todayGoal(g)):'—'}</td><td className="px-5 py-3 text-right text-gray-500">{money(g.recaudado_mes)}</td></tr>)}</tbody></table>
  </div>}

  <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
   <div className="flex flex-wrap items-center gap-2 justify-between"><h2 className="text-lg font-black text-gray-900">Panel historial · {sedeName} · {desde.split('-').reverse().join('/')} al {hasta.split('-').reverse().join('/')} · {verPor==='caja'?'Caja del período':'Contratos del período'}{filter!=='todos'?` · ${AGING[filter].label}`:''}</h2>{loading&&<span className="text-xs text-gray-400">Cargando…</span>}</div>
   <div className="flex flex-wrap items-end gap-2 text-xs font-bold text-gray-600">
    <label className="flex flex-col gap-1">Período<select value={per} onChange={e=>setPer(e.target.value as 'mes'|'rango'|'anio')} className="px-3 py-2 border border-gray-200 rounded-xl"><option value="mes">Mes</option><option value="rango">Rango</option><option value="anio">Año</option></select></label>
    {per==='mes'&&<label className="flex flex-col gap-1">Mes<input type="month" value={pMes} onChange={e=>e.target.value&&setPMes(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl"/></label>}
    {per==='rango'&&<><label className="flex flex-col gap-1">Desde<input type="date" value={pDesde} onChange={e=>setPDesde(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl"/></label><label className="flex flex-col gap-1">Hasta<input type="date" value={pHasta} onChange={e=>setPHasta(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl"/></label></>}
    {per==='anio'&&<label className="flex flex-col gap-1">Año<input type="number" min={2020} max={2100} value={pAnio} onChange={e=>setPAnio(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl w-24"/></label>}
    {seesAll&&<label className="flex flex-col gap-1">Sede<select value={sede} onChange={e=>setSede(e.target.value)} className="px-3 py-2 border border-gray-200 rounded-xl"><option value="">Todas las sedes</option>{goals.map(g=><option key={g.sede_id} value={g.sede_id}>{g.sede}</option>)}</select></label>}
    <label className="flex flex-col gap-1">Ver por<select value={verPor} onChange={e=>setVerPor(e.target.value as 'contratos'|'caja')} className="px-3 py-2 border border-gray-200 rounded-xl"><option value="contratos">Contratos del período (fecha del contrato)</option><option value="caja">Caja del período (fecha del abono)</option></select></label>
   </div>
   <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
    <Card title="Facturado" value={money(shown.reduce((a,r)=>a+r.valor,0))} note={`${shown.length} contratos`}/>
    <Card title="Recaudado" value={money(shown.reduce((a,r)=>a+r.recaudado,0))} note={verPor==='caja'?'Abonos con fecha en el período':'Abonos de los contratos del período'}/>
    <Card title="Pendiente" value={money(shown.reduce((a,r)=>a+r.saldo,0))} note="Saldo actual de estos contratos"/>
   </div>
   <div className="flex flex-wrap gap-2">
    <Chip active={filter==='todos'} onClick={()=>setFilter('todos')} cls="bg-sky-50 text-sky-700 border-sky-300">Todos {siteRows.length}</Chip>
    {(Object.keys(AGING) as AgingBucket[]).map(b=><Chip key={b} active={filter===b} onClick={()=>setFilter(b)} cls={AGING[b].cls}>{AGING[b].chip}: {counts[b]}</Chip>)}
    {canExport&&<button onClick={exportCsv} className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"><Download className="w-4 h-4"/>Exportar</button>}
   </div>
   <div className="overflow-x-auto"><table className="w-full text-sm text-left">
    <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-500"><tr><th className="px-4 py-3">Contrato</th>{!sede&&<th className="px-4 py-3">Sede</th>}<th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Factura / RC</th><th className="px-4 py-3 text-right">Valor</th><th className="px-4 py-3 text-right">Recaudado</th><th className="px-4 py-3 text-right">Saldo</th><th className="px-4 py-3 text-right">Días</th><th className="px-4 py-3">Estado</th></tr></thead>
    <tbody className="divide-y divide-gray-50">{shown.slice(0,300).map(r=>{const b=agingBucket(r);return <tr key={r.id} onClick={()=>setDetail(r)} className="hover:bg-rose-50/40 cursor-pointer">
     <td className="px-4 py-3"><b className="text-gray-900">{r.numero_contrato}</b><br/><span className="text-xs text-gray-400">{r.cliente}</span></td>{!sede&&<td className="px-4 py-3 text-gray-500">{r.sede||'—'}</td>}
     <td className="px-4 py-3 text-gray-600">{r.fecha.split('-').reverse().join('/')}</td><td className="px-4 py-3 text-gray-600">{r.factura||r.recibo||'—'}</td>
     <td className="px-4 py-3 text-right">{money(r.valor)}</td><td className="px-4 py-3 text-right">{money(r.recaudado)}</td><td className={`px-4 py-3 text-right ${r.saldo>0?'font-black text-gray-900':'text-gray-400'}`}>{money(r.saldo)}</td>
     <td className="px-4 py-3 text-right text-gray-600">{r.dias}</td><td className="px-4 py-3"><span className={`inline-block px-3 py-1 rounded-full border text-xs font-bold ${AGING[b].cls}`}>{AGING[b].label}</span></td></tr>;})}</tbody>
    <tfoot><tr className="font-black text-gray-900 border-t border-gray-100"><td className="px-4 py-3" colSpan={sede?3:4}>Totales</td><td className="px-4 py-3 text-right">{money(shown.reduce((a,r)=>a+r.valor,0))}</td><td className="px-4 py-3 text-right">{money(shown.reduce((a,r)=>a+r.recaudado,0))}</td><td className="px-4 py-3 text-right">{money(shown.reduce((a,r)=>a+r.saldo,0))}</td><td colSpan={2}/></tr></tfoot>
   </table></div>
   {!shown.length&&!loading&&<p className="text-center text-sm text-gray-400 py-6">No hay contratos en este grupo.</p>}
   {shown.length>300&&<p className="text-xs text-gray-400">Se muestran 300 de {shown.length}. Usa los filtros o exporta para ver todos.</p>}
   <p className="text-xs text-gray-500">Saldo vencido de más de 30 días: <b>{money(overdueBalance(siteRows))}</b> · Los días se cuentan desde la factura (o desde el contrato si no tiene). Clic en una fila para ver factura, recibos y abonos.</p>
  </div>
  {detail&&<ContractDetail row={detail} onClose={()=>setDetail(null)}/>}
 </section>;
}

function Card({title,value,note,bar,highlight}:{title:string;value:string;note:string;bar?:number;highlight?:boolean}){
 return <div className={`rounded-[1.5rem] p-6 border shadow-sm ${highlight?'bg-rose-50 border-rose-300':'bg-white border-gray-100'}`}>
  <p className={`text-[10px] font-black uppercase tracking-widest ${highlight?'text-rose-600':'text-gray-400'}`}>{title}</p>
  <p className="text-2xl font-black text-gray-900 tracking-tight mt-2">{value}</p>
  <p className="text-xs text-gray-500 font-medium mt-1">{note}</p>
  {bar!==undefined&&<div className="h-2 bg-gray-100 rounded-full mt-3 overflow-hidden"><div className="h-full bg-rose-500 rounded-full" style={{width:`${Math.min(100,bar)}%`}}/></div>}
 </div>;
}
function Chip({active,onClick,cls,children}:{active:boolean;onClick:()=>void;cls:string;children:React.ReactNode}){
 return <button onClick={onClick} className={`px-4 py-2 rounded-xl border text-xs font-bold ${cls} ${active?'ring-2 ring-offset-1 ring-gray-900/20 shadow':''}`}>{children}</button>;
}

/** Admin: monthly goal and operating days per site, copy to next month and change history. */
function GoalSettings({mes,anio,goals,onSaved}:{mes:number;anio:number;goals:SiteGoal[];onSaved:()=>void}){
 const [form,setForm]=useState<Record<string,{meta:string;dias:string}>>(()=>Object.fromEntries(goals.map(g=>[g.sede_id,{meta:g.meta?String(Math.round(g.meta)):'',dias:String(g.dias_operativos)}]))),[saving,setSaving]=useState(false),[changes,setChanges]=useState<Change[]>([]),[seen,setSeen]=useState(0);
 useEffect(()=>{
  let live=true;
  void (async()=>{
   const {data}=await supabase.from('historial_metas').select('id,nombre_objetivo,mes,anio,valor_anterior,valor_nuevo,dias_anterior,dias_nuevo,accion,fecha_hora,usuario').eq('tipo','sede').order('fecha_hora',{ascending:false}).limit(15);
   const ids=[...new Set((data||[]).map(c=>c.usuario).filter(Boolean))];
   const {data:people}=ids.length?await supabase.from('profiles').select('id,nombre,email').in('id',ids):{data:[]};
   const who=(id:string|null)=>{const p=people?.find(x=>x.id===id);return p?.nombre||p?.email||(id?'Usuario':'Sistema');};
   if(live)setChanges((data||[]).map(c=>({...c,usuario:who(c.usuario)})) as Change[]);
  })();
  return()=>{live=false;};
 },[seen]);
 const items=(m:number,a:number,source:'form'|'goals')=>goals.map(g=>({sede_id:g.sede_id,meta:source==='form'?form[g.sede_id]?.meta.replace(/\D/g,''):String(Math.round(g.meta||0)),dias_operativos:source==='form'&&form[g.sede_id]?.dias&&Number(form[g.sede_id].dias)!==g.dias_calculados?form[g.sede_id].dias:null})).filter(i=>Number(i.meta)>0).map(i=>({...i,mes:m,anio:a}));
 const save=async(next=false)=>{
  setSaving(true);
  const [m,a]=next?(mes===12?[1,anio+1]:[mes+1,anio]):[mes,anio];
  const {error}=await supabase.rpc('guardar_metas_sede',{p_mes:m,p_anio:a,p_items:next?items(m,a,'goals').map(i=>({...i,dias_operativos:null})):items(m,a,'form')});
  setSaving(false);
  if(error)return toast.error(error.message);
  toast.success(next?`Metas copiadas a ${MONTHS[m-1]} ${a}`:'Metas guardadas');setSeen(v=>v+1);onSaved();
 };
 return <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm p-6 space-y-4">
  <h2 className="text-lg font-black text-gray-900 flex items-center gap-2"><CalendarClock className="w-5 h-5 text-rose-500"/>Configuración de metas · {MONTHS[mes-1]} {anio}</h2>
  <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-500"><tr><th className="px-4 py-3">Sede</th><th className="px-4 py-3">Meta mensual</th><th className="px-4 py-3">Días operativos</th><th className="px-4 py-3 text-right">Meta diaria base</th><th className="px-4 py-3">Estado</th></tr></thead>
   <tbody className="divide-y divide-gray-50">{goals.map(g=>{const f=form[g.sede_id]||{meta:'',dias:''};const meta=Number(f.meta.replace(/\D/g,''))||0,dias=Number(f.dias)||g.dias_calculados;return <tr key={g.sede_id}>
    <td className="px-4 py-3 font-black text-gray-900">{g.sede}</td>
    <td className="px-4 py-3"><input inputMode="numeric" value={meta?new Intl.NumberFormat('es-CO').format(meta):''} placeholder="Por definir" onChange={e=>setForm({...form,[g.sede_id]:{...f,meta:e.target.value.replace(/\D/g,'')}})} className="w-40 px-3 py-2 border border-gray-200 rounded-xl font-bold"/></td>
    <td className="px-4 py-3"><input type="number" min={1} max={31} value={f.dias} onChange={e=>setForm({...form,[g.sede_id]:{...f,dias:e.target.value}})} className="w-20 px-3 py-2 border border-gray-200 rounded-xl font-bold"/><span className="text-[10px] text-gray-400 ml-2">calculado: {g.dias_calculados}</span></td>
    <td className="px-4 py-3 text-right font-bold">{meta?money(Math.round(meta/dias)):'Sin meta'}</td>
    <td className="px-4 py-3">{!meta?<span className="px-3 py-1 rounded-full border text-xs font-bold bg-amber-50 text-amber-700 border-amber-300">Pendiente</span>:g.automatica?<span className="px-3 py-1 rounded-full border text-xs font-bold bg-amber-50 text-amber-700 border-amber-300" title="Copiada automáticamente del mes anterior">Automática</span>:<span className="px-3 py-1 rounded-full border text-xs font-bold bg-emerald-50 text-emerald-700 border-emerald-300">Activa</span>}</td></tr>;})}</tbody></table></div>
  {goals.some(g=>g.automatica)&&<p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">Hay metas creadas automáticamente (copiadas del mes anterior). Revísalas y guarda para confirmarlas.</p>}
  <div className="flex flex-wrap gap-3 justify-between">
   <button disabled={saving} onClick={()=>void save(true)} className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-50">Copiar metas al siguiente mes</button>
   <button disabled={saving} onClick={()=>void save(false)} className="px-5 py-2.5 rounded-xl bg-gray-900 text-white text-sm font-black flex items-center gap-2 disabled:opacity-50"><Save className="w-4 h-4"/>{saving?'Guardando…':'Guardar cambios'}</button>
  </div>
  <div>
   <p className="text-xs font-black uppercase tracking-widest text-gray-400 flex items-center gap-2 mb-2"><History className="w-4 h-4"/>Historial de cambios de metas</p>
   {changes.length?<ul className="text-xs text-gray-600 space-y-1">{changes.map(c=><li key={c.id}>{new Date(c.fecha_hora).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · <b>{c.usuario}</b> · {c.nombre_objetivo} {MONTHS[c.mes-1]} {c.anio}: {c.accion==='insert'||c.accion==='creada automáticamente'?`${c.accion==='insert'?'creada':'creada automáticamente'} en ${money(c.valor_nuevo)}`:c.accion==='delete'?`eliminada (${money(c.valor_anterior)})`:`${money(c.valor_anterior)} → ${money(c.valor_nuevo)}${c.dias_anterior!==c.dias_nuevo?` · días ${c.dias_anterior??'auto'} → ${c.dias_nuevo??'auto'}`:''}`}</li>)}</ul>:<p className="text-xs text-gray-400">Aún no hay cambios registrados.</p>}
  </div>
 </div>;
}

/** Read-only contract summary with invoice, cash receipts and payments. */
function ContractDetail({row,onClose}:{row:Receivable;onClose:()=>void}){
 const [pagos,setPagos]=useState<{id:string;valor_pagado:number;medio_pago:string|null;numero_recibo:string|null;fecha_pago:string}[]|null>(null);
 useEffect(()=>{void supabase.from('pagos').select('id,valor_pagado,medio_pago,numero_recibo,fecha_pago').eq('contrato_id',row.id).order('fecha_pago').then(({data})=>setPagos(data||[]));},[row.id]);
 const b=agingBucket(row);
 return <div className="fixed inset-0 z-50 bg-gray-900/40 flex justify-end" onClick={onClose}>
  <aside className="w-full max-w-md h-full bg-white p-6 overflow-y-auto shadow-2xl" onClick={e=>e.stopPropagation()}>
   <div className="flex justify-between items-start mb-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-rose-500">{row.sede}</p><h3 className="text-xl font-black text-gray-900">{row.numero_contrato}</h3><p className="text-sm text-gray-500">{row.cliente}</p></div><button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5"/></button></div>
   <span className={`inline-block px-3 py-1 rounded-full border text-xs font-bold ${AGING[b].cls}`}>{AGING[b].label} · {row.dias} días</span>
   <dl className="grid grid-cols-2 gap-3 mt-5 text-sm">
    <div><dt className="text-[10px] font-black uppercase text-gray-400">Fecha</dt><dd className="font-bold">{row.fecha.split('-').reverse().join('/')}</dd></div>
    <div><dt className="text-[10px] font-black uppercase text-gray-400">Factura</dt><dd className="font-bold">{row.factura||'Sin factura'}</dd></div>
    <div><dt className="text-[10px] font-black uppercase text-gray-400">Valor</dt><dd className="font-bold">{money(row.valor)}</dd></div>
    <div><dt className="text-[10px] font-black uppercase text-gray-400">Recaudado</dt><dd className="font-bold">{money(row.recaudado)}</dd></div>
    <div className="col-span-2"><dt className="text-[10px] font-black uppercase text-gray-400">Saldo pendiente</dt><dd className="text-2xl font-black text-gray-900">{money(row.saldo)}</dd></div>
   </dl>
   <h4 className="mt-6 mb-2 text-xs font-black uppercase tracking-widest text-gray-500">Recibos de caja y abonos</h4>
   {pagos===null?<p className="text-sm text-gray-400">Cargando…</p>:pagos.length?<ul className="divide-y divide-gray-100 text-sm">{pagos.map(p=><li key={p.id} className="py-2 flex justify-between"><span>{new Date(p.fecha_pago).toLocaleDateString('es-CO',{timeZone:'UTC'})} · {p.medio_pago||'—'}{p.numero_recibo?` · RC ${p.numero_recibo}`:''}</span><b>{money(p.valor_pagado)}</b></li>)}</ul>:<p className="text-sm text-gray-400">Sin abonos registrados.</p>}
  </aside>
 </div>;
}
