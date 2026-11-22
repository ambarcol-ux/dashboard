'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Linea={sede_id:string|null;sede:string;grupo:'ingreso'|'gasto'|'dato';concepto:string;valor:number;costo:'fijo'|'variable'|null};
type Sede={sede:string;sede_id:string|null;ingresos:Linea[];gastos:Linea[];ti:number;tg:number;fijos:number;variables:number;contratos:number;valorContratos:number;inventario:number};
type Traza={id:string;sede:string;numero:string;fecha:string;cliente:string|null;valor:number;saldo:number;pagado_erp:number;facturado_siigo:number|null;cobrado_siigo:number;sin_rastro:number};
const cop=(n:number)=>`${n<0?'−':''}$${Math.round(Math.abs(n)).toLocaleString('es-CO')}`;
const pct=(u:number,i:number)=>i>0?`${Math.round(u/i*100)}%`:'—';

/** Finanzas › Gastos › Estado de resultados: income, expenses and profit per store for the chosen period (public.estado_resultados). */
export default function EstadoResultados({desde,hasta,finanzas=false}:{desde:string;hasta:string;finanzas?:boolean}){
 const [rows,setRows]=useState<Linea[]|null>(null),[error,setError]=useState(''),[abierta,setAbierta]=useState<string|null>(null),[fuente,setFuente]=useState<'erp'|'siigo'>('erp');
 useEffect(()=>{let live=true;void supabase.rpc(fuente==='siigo'?'estado_resultados_siigo':'estado_resultados',{p_desde:desde,p_hasta:hasta}).then(({data,error:e})=>{if(!live)return;if(e){setError(e.message);setRows([]);}else{setError('');setRows((data||[]) as Linea[]);}});return()=>{live=false;};},[desde,hasta,fuente]);
 const sedes=useMemo(()=>{const m=new Map<string,Sede>();for(const l of rows||[]){const s=m.get(l.sede)||{sede:l.sede,sede_id:l.sede_id,ingresos:[],gastos:[],ti:0,tg:0,fijos:0,variables:0,contratos:0,valorContratos:0,inventario:0};
  const v=Number(l.valor);if(l.grupo==='dato'){if(l.concepto==='contratos')s.contratos+=v;else if(l.concepto==='inventario')s.inventario+=v;else s.valorContratos+=v;}
  else if(l.grupo==='ingreso'){s.ingresos.push(l);s.ti+=v;}else{s.gastos.push(l);s.tg+=v;if(l.costo==='variable')s.variables+=v;else s.fijos+=v;}m.set(l.sede,s);}return [...m.values()];},[rows]);
 const ti=sedes.reduce((a,s)=>a+s.ti,0),tg=sedes.reduce((a,s)=>a+s.tg,0);
 if(rows===null)return <p className="text-sm text-gray-400">Cargando…</p>;
 return <div className="space-y-4">
  {finanzas&&<div className="flex gap-2 items-center text-xs font-bold text-gray-600">Fuente:{(['erp','siigo'] as const).map(f=><button key={f} type="button" onClick={()=>{setRows(null);setFuente(f);}} className={`px-3 py-1.5 rounded-xl ${fuente===f?'bg-gray-900 text-white':'border bg-white'}`}>{f==='erp'?'ERP (caja y gastos)':'Siigo (facturas y compras)'}</button>)}</div>}
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}
  <div className="grid sm:grid-cols-3 gap-3">
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Ingresos</p><p className="text-2xl font-black text-emerald-700">{cop(ti)}</p></div>
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Gastos</p><p className="text-2xl font-black text-red-600">{cop(tg)}</p></div>
   <div className="bg-white rounded-2xl border p-4"><p className="text-xs font-bold text-gray-500">Utilidad</p><p className={`text-2xl font-black ${ti-tg<0?'text-red-600':'text-gray-900'}`}>{cop(ti-tg)}</p><p className="text-xs text-gray-400">Margen {pct(ti-tg,ti)}</p></div>
  </div>
  <div className="bg-white rounded-2xl border p-4 overflow-x-auto">
   <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Sede</th><th className="text-right">Ingresos</th><th className="text-right">Gastos</th><th className="text-right">Utilidad</th><th className="text-right">Margen</th></tr></thead>
    <tbody>{sedes.map(s=><tr key={s.sede} className="border-t cursor-pointer hover:bg-gray-50" onClick={()=>setAbierta(abierta===s.sede?null:s.sede)}>
     <td className="py-2 font-bold">{s.sede} <span className="text-xs text-gray-400">{abierta===s.sede?'▲':'▼'}</span></td><td className="text-right text-emerald-700">{cop(s.ti)}</td><td className="text-right text-red-600">{cop(s.tg)}</td>
     <td className={`text-right font-black ${s.ti-s.tg<0?'text-red-600':''}`}>{cop(s.ti-s.tg)}</td><td className="text-right">{pct(s.ti-s.tg,s.ti)}</td></tr>)}
     {!sedes.length&&<tr><td colSpan={5} className="py-3 text-gray-400">Sin movimientos en el periodo.</td></tr>}</tbody></table>
  </div>
  {sedes.filter(s=>s.sede===abierta).map(s=><div key={s.sede} className="bg-white rounded-2xl border p-4 grid sm:grid-cols-2 gap-6">
   <div><p className="text-xs font-black text-emerald-700 mb-1">Ingresos · {s.sede}</p>{s.ingresos.length?s.ingresos.map(l=><p key={l.concepto} className="text-sm flex justify-between border-b py-1"><span>{l.concepto}</span><b>{cop(Number(l.valor))}</b></p>):<p className="text-sm text-gray-400">—</p>}</div>
   <div><p className="text-xs font-black text-red-600 mb-1">Gastos · {s.sede}</p>{s.gastos.length?s.gastos.map(l=><p key={l.concepto} className="text-sm flex justify-between border-b py-1"><span>{l.concepto} <span className="text-[10px] font-bold text-gray-400 uppercase">{l.costo}</span></span><b>{cop(Number(l.valor))}</b></p>):<p className="text-sm text-amber-700 font-bold">No hay gastos registrados: la utilidad sale inflada.</p>}</div>
  </div>)}
  {fuente==='siigo'&&sedes.some(s=>s.inventario>0)&&<p className="text-xs text-gray-500">Compra de vestidos (inventario, no es gasto): {sedes.filter(s=>s.inventario>0).map(s=>`${s.sede} ${cop(s.inventario)}`).join(' · ')}</p>}
  <Equilibrio sedes={sedes.filter(s=>s.sede_id)}/>
  {fuente==='siigo'&&<TrazaVentas desde={desde} hasta={hasta}/>}
  <p className="text-xs text-gray-500">Toca una sede para ver el detalle. Ingresos: pagos de contratos, ventas y demás ingresos de caja, más lo retenido de depósitos por daños (sin depósitos en garantía, base de caja ni dinero entre sedes o socios). Gastos: egresos de caja, gastos registrados, pagos fijos y pagos a proveedores (sin devoluciones de depósito, consignaciones al banco ni retiros de utilidades). Es lo registrado en el ERP: si una sede no carga sus gastos, su utilidad sale más alta de lo real.</p>
 </div>;
}

/** Break-even per store: fixed costs ÷ contribution margin (1 − variable costs ÷ income); contracts needed = break-even ÷ average ticket. */
function Equilibrio({sedes}:{sedes:Sede[]}){
 if(!sedes.length)return null;
 return <div className="bg-white rounded-2xl border p-4 overflow-x-auto space-y-2">
  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Punto de equilibrio</p>
  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Sede</th><th className="text-right">Gastos fijos</th><th className="text-right">Costos variables</th><th className="text-right">Equilibrio</th><th className="text-right">Ingresos</th><th className="text-right">Resultado</th><th className="text-right">Contratos hechos / necesarios</th></tr></thead>
   <tbody>{sedes.map(s=>{const margen=s.ti>0?1-s.variables/s.ti:0,pe=margen>0?s.fijos/margen:null,ticket=s.contratos?s.valorContratos/s.contratos:0,dif=pe==null?null:s.ti-pe;
    return <tr key={s.sede} className="border-t"><td className="py-2 font-bold">{s.sede}</td><td className="text-right">{cop(s.fijos)}</td><td className="text-right">{cop(s.variables)} <span className="text-xs text-gray-400">{s.ti>0?`${Math.round(s.variables/s.ti*100)}%`:''}</span></td>
     <td className="text-right font-black">{s.fijos<=0?<span className="text-amber-700 text-xs font-bold">Sin gastos fijos registrados</span>:pe==null?'—':cop(pe)}</td><td className="text-right">{cop(s.ti)}</td>
     <td className={`text-right font-bold ${dif!=null&&dif<0?'text-red-600':'text-emerald-700'}`}>{s.fijos<=0||dif==null?'—':dif>=0?`Supera por ${cop(dif)}`:`Faltan ${cop(-dif)}`}</td>
     <td className="text-right">{s.contratos} / {s.fijos>0&&pe!=null&&ticket>0?Math.ceil(pe/ticket):'—'}{ticket>0&&<span className="block text-xs text-gray-400">ticket {cop(ticket)}</span>}</td></tr>;})}</tbody></table>
  <p className="text-xs text-gray-500">Equilibrio = lo que la sede debe recibir en el periodo para cubrir sus gastos fijos, después de los costos variables. Fijos: nómina, arriendo, servicios, pagos fijos y gastos operativos. Variables: insumos, proveedores, arreglos, transporte, fotografía, lavandería y comisiones. Contratos necesarios = equilibrio ÷ valor promedio de los contratos hechos en el periodo. Solo usa lo registrado: si faltan gastos fijos, el equilibrio sale más bajo de lo real.</p>
 </div>;
}

/** Trazabilidad de ventas (ERP vs Siigo): per store, what was sold, paid in the ERP, invoiced and collected in Siigo, and what has no trace. */
function TrazaVentas({desde,hasta}:{desde:string;hasta:string}){
 const [rows,setRows]=useState<Traza[]|null>(null),[sede,setSede]=useState<string|null>(null);
 useEffect(()=>{let live=true;void supabase.rpc('traza_ventas',{p_desde:desde,p_hasta:hasta}).then(({data})=>{if(live)setRows((data||[]) as Traza[]);});return()=>{live=false;};},[desde,hasta]);
 if(!rows)return null;
 const porSede=[...rows.reduce((m,r)=>{const x=m.get(r.sede)||{sede:r.sede,n:0,valor:0,erp:0,fact:0,cobrado:0,sinFactura:0,sinRastro:0,nRastro:0};
  x.n++;x.valor+=Number(r.valor);x.erp+=Number(r.pagado_erp);x.fact+=Number(r.facturado_siigo||0);x.cobrado+=Number(r.cobrado_siigo);if(r.facturado_siigo==null)x.sinFactura++;
  if(Number(r.sin_rastro)>0){x.sinRastro+=Number(r.sin_rastro);x.nRastro++;}m.set(r.sede,x);return m;},new Map<string,{sede:string;n:number;valor:number;erp:number;fact:number;cobrado:number;sinFactura:number;sinRastro:number;nRastro:number}>()).values()];
 const lista=rows.filter(r=>r.sede===sede&&Number(r.sin_rastro)>0);
 return <div className="bg-white rounded-2xl border p-4 overflow-x-auto space-y-2">
  <p className="text-xs font-black text-gray-500 uppercase tracking-widest">Trazabilidad de ventas (ERP vs Siigo)</p>
  <table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Sede</th><th className="text-right">Contratos</th><th className="text-right">Vendido</th><th className="text-right">Abonos ERP</th><th className="text-right">Facturado Siigo</th><th className="text-right">Cobrado Siigo</th><th className="text-right">Sin factura</th><th className="text-right">Sin rastro</th></tr></thead>
   <tbody>{porSede.map(x=><tr key={x.sede} className="border-t cursor-pointer hover:bg-gray-50" onClick={()=>setSede(sede===x.sede?null:x.sede)}><td className="py-2 font-bold">{x.sede} <span className="text-xs text-gray-400">{sede===x.sede?'▲':'▼'}</span></td><td className="text-right">{x.n}</td><td className="text-right">{cop(x.valor)}</td><td className="text-right">{cop(x.erp)}</td><td className="text-right">{cop(x.fact)}</td><td className="text-right">{cop(x.cobrado)}</td><td className="text-right">{x.sinFactura}</td>
    <td className={`text-right font-black ${x.sinRastro>0?'text-red-600':''}`}>{cop(x.sinRastro)}<span className="block text-xs font-normal text-gray-400">{x.nRastro} contratos</span></td></tr>)}</tbody></table>
  {sede&&<div className="space-y-1">{lista.length?lista.map(r=><a key={r.id} href={`/dashboard?contratoId=${r.id}`} className="block text-sm border-b py-1 hover:bg-gray-50"><b>{r.numero}</b> · {r.fecha} · {r.cliente||'—'} · valor {cop(Number(r.valor))} · abonos ERP {cop(Number(r.pagado_erp))} · Siigo {r.facturado_siigo==null?'sin factura':`facturado ${cop(Number(r.facturado_siigo))}, cobrado ${cop(Number(r.cobrado_siigo))}`} · <b className="text-red-600">sin rastro {cop(Number(r.sin_rastro))}</b></a>):<p className="text-sm text-gray-400">Sin contratos sin rastro.</p>}</div>}
  <p className="text-xs text-gray-500">Sin rastro = valor del contrato que no está pendiente (saldo) ni respaldado por un abono en el ERP o un cobro en Siigo (pago en la factura o recibo de caja). Es dinero que debió entrar y no aparece en ningún registro: contabilidad lo revisa contrato por contrato. Datos de Siigo traídos el 22/11/2026.</p>
 </div>;
}
