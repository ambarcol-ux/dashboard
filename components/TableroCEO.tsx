'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Sede={id:string;nombre:string;efectivo:number;bancos:number;depositos:number;plan_ahorro:number;socios:number;por_cobrar:number;por_cobrar_vencido:number;asegurado:number;contratos_futuros:number;
 vendido:number;vendido_ant:number;contratos_mes:number;citas_mes:number;entro:number;salio:number;salio_ant:number;fijos_mes:number;fijos_pendientes:number;vestidos:number};
type Data={hoy:string;dia_mes:number;dias_mes:number;proveedores_por_pagar:number|null;sedes:Sede[]};
const KEYS:(keyof Sede)[]=['efectivo','bancos','depositos','plan_ahorro','socios','por_cobrar','por_cobrar_vencido','asegurado','contratos_futuros','vendido','vendido_ant','contratos_mes','citas_mes','entro','salio','salio_ant','fijos_mes','fijos_pendientes','vestidos'];
const cop=(v:number)=>`${v<0?'-':''}$${Math.abs(Math.round(v)).toLocaleString('es-CO')}`;
const pct=(a:number,b:number)=>b>0?Math.round(a/b*100):0;

function Card({titulo,valor,nota,tono='gray'}:{titulo:string;valor:string;nota?:string;tono?:'gray'|'green'|'red'|'amber'}){
 return <div className={`rounded-2xl border p-4 ${tono==='green'?'bg-emerald-50 border-emerald-100':tono==='red'?'bg-rose-50 border-rose-100':tono==='amber'?'bg-amber-50 border-amber-100':'bg-white border-gray-100'}`}>
  <p className="text-[11px] font-black uppercase tracking-wider text-gray-500">{titulo}</p><p className="text-2xl font-black text-gray-900 mt-1">{valor}</p>{nota&&<p className="text-xs text-gray-500 mt-1">{nota}</p>}</div>;
}

/** Ámbar Exitoso · Tablero CEO (Reportes y Estadísticas): where the money is, what the company has and owes, the month and where it goes. */
export default function TableroCEO(){
 const [data,setData]=useState<Data|null>(null),[sede,setSede]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const {data:d,error:e}=await supabase.rpc('tablero_ceo',{p_sede:null});if(e)setError(e.message);else{setError('');setData(d as Data);}},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);const i=setInterval(()=>void load(),5*60000);return()=>{clearTimeout(t);clearInterval(i);};},[load]);
 const s=useMemo(()=>{
  if(!data)return null;
  const rows=data.sedes.filter(x=>!sede||x.id===sede);
  const t=Object.fromEntries(KEYS.map(k=>[k,rows.reduce((a,x)=>a+Number(x[k]||0),0)])) as Record<keyof Sede,number>;
  return {t,rows};
 },[data,sede]);
 if(error)return <p role="alert" className="text-sm font-bold text-rose-700 bg-rose-50 rounded-2xl p-4">{error}</p>;
 if(!data||!s)return <p className="text-sm text-gray-400">Cargando tablero…</p>;
 const {t,rows}=s,avance=data.dia_mes/data.dias_mes,prov=sede?0:Number(data.proveedores_por_pagar||0);
 const plata=t.efectivo+t.bancos,ajena=t.depositos+t.plan_ahorro+t.socios,libre=plata-ajena;
 const tienes=plata+t.por_cobrar,debes=ajena+prov+t.fijos_pendientes;
 const proyeccion=avance>0?t.vendido/avance:0,ganancia=t.vendido-t.salio,equilibrio=Math.max(t.salio_ant,t.salio+t.fijos_pendientes);
 const meses=t.salio_ant>0?libre/t.salio_ant:null;
 const semaforo=(x:Sede)=>{const p=x.vendido/(avance||1),g=x.vendido-x.salio;return x.vendido_ant>0&&p>=x.vendido_ant*0.95&&g>0?'🟢':g<0||(x.vendido_ant>0&&p<x.vendido_ant*0.7)?'🔴':'🟡';};
 return <div className="space-y-6">
  <div className="flex flex-wrap items-center justify-between gap-3">
   <div><h2 className="text-2xl font-black text-gray-900">Tablero CEO</h2><p className="text-xs text-gray-500">En tiempo real desde el ERP · día {data.dia_mes} de {data.dias_mes} del mes · se actualiza cada 5 minutos</p></div>
   <select className="border rounded-xl px-3 py-2 text-sm font-bold bg-white" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Todas las sedes</option>{data.sedes.map(x=><option key={x.id} value={x.id}>{x.nombre}</option>)}</select>
  </div>

  <section><h3 className="font-black text-gray-800 mb-2">1. Dónde está la plata</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
   <Card titulo="Efectivo en cajas" valor={cop(t.efectivo)} nota="Contado en el último cierre"/>
   <Card titulo="Bancos" valor={cop(t.bancos)} nota="Según los movimientos del ERP"/>
   <Card titulo="No es tuya todavía" valor={cop(ajena)} nota={`Depósitos ${cop(t.depositos)} · Plan Ahorro ${cop(t.plan_ahorro)} · Socios ${cop(t.socios)}`} tono="amber"/>
   <Card titulo="Plata libre" valor={cop(libre)} nota={meses!==null?`Alcanza para ${meses.toFixed(1)} meses de gastos sin vender nada`:undefined} tono={libre>=0?'green':'red'}/>
  </div></section>

  <section><h3 className="font-black text-gray-800 mb-2">2. Lo que tienes y lo que debes</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
   <Card titulo="Tienes" valor={cop(tienes)} nota={`Plata ${cop(plata)} + te deben ${cop(t.por_cobrar)}`}/>
   <Card titulo="Debes" valor={cop(debes)} nota={`Devolver/usar ${cop(ajena)}${prov?` · proveedores ${cop(prov)}`:''} · pagos fijos del mes ${cop(t.fijos_pendientes)}`}/>
   <Card titulo="Lo que vale la operación" valor={cop(tienes-debes)} nota="Tienes menos debes (sin contar el inventario)" tono={tienes-debes>=0?'green':'red'}/>
   <Card titulo="Te deben vencido" valor={cop(t.por_cobrar_vencido)} nota="Saldos de eventos que ya pasaron" tono={t.por_cobrar_vencido>0?'red':'gray'}/>
  </div></section>

  <section><h3 className="font-black text-gray-800 mb-2">3. Cómo va el mes</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
   <Card titulo="Vendido" valor={cop(t.vendido)} nota={`Mes pasado completo: ${cop(t.vendido_ant)} · ${t.contratos_mes} contratos`}/>
   <Card titulo="Entró / salió de caja" valor={`${cop(t.entro)} / ${cop(t.salio)}`} nota="Sin depósitos, traslados ni préstamos"/>
   <Card titulo="Ganancia del mes (aprox.)" valor={cop(ganancia)} nota="Vendido menos lo que salió" tono={ganancia>=0?'green':'red'}/>
   <Card titulo="Punto de equilibrio" valor={`${pct(t.vendido,equilibrio)} %`} nota={`Necesitas vender ${cop(equilibrio)} para cubrir los gastos del mes`} tono={t.vendido>=equilibrio?'green':'amber'}/>
  </div></section>

  <section><h3 className="font-black text-gray-800 mb-2">4. Para dónde vas</h3><div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
   <Card titulo="Proyección de ventas del mes" valor={cop(proyeccion)} nota={t.vendido_ant>0?`${pct(proyeccion,t.vendido_ant)} % del mes pasado`:undefined} tono={proyeccion>=t.vendido_ant?'green':'amber'}/>
   <Card titulo="Plata asegurada" valor={cop(t.asegurado)} nota={`Saldos por cobrar de ${t.contratos_futuros} contratos con evento futuro`}/>
   <Card titulo="Citas → contratos" valor={`${t.citas_mes} → ${t.contratos_mes}`} nota={`${pct(t.contratos_mes,t.citas_mes)} % de conversión este mes (meta 40 %)`} tono={pct(t.contratos_mes,t.citas_mes)>=40?'green':'amber'}/>
   <Card titulo="Vestidos activos" valor={String(t.vestidos)} nota="Inventario disponible para alquilar o vender"/>
  </div></section>

  {!sede&&<section><h3 className="font-black text-gray-800 mb-2">5. Semáforo por sede</h3><div className="overflow-x-auto bg-white rounded-2xl border"><table className="w-full text-sm">
   <thead><tr className="text-left text-[11px] uppercase text-gray-500"><th className="p-3"></th><th className="p-3">Sede</th><th className="p-3">Vendido</th><th className="p-3">Proyección</th><th className="p-3">Mes pasado</th><th className="p-3">Ganancia aprox.</th><th className="p-3">Te deben vencido</th><th className="p-3">Citas → contratos</th></tr></thead>
   <tbody>{rows.map(x=><tr key={x.id} className="border-t"><td className="p-3 text-lg">{semaforo(x)}</td><td className="p-3 font-black">{x.nombre}</td><td className="p-3">{cop(x.vendido)}</td><td className="p-3">{cop(x.vendido/(avance||1))}</td>
    <td className="p-3 text-gray-500">{cop(x.vendido_ant)}</td><td className={`p-3 font-bold ${x.vendido-x.salio>=0?'text-emerald-700':'text-rose-700'}`}>{cop(x.vendido-x.salio)}</td><td className="p-3">{cop(x.por_cobrar_vencido)}</td><td className="p-3">{x.citas_mes} → {x.contratos_mes} ({pct(x.contratos_mes,x.citas_mes)} %)</td></tr>)}</tbody>
  </table></div><p className="text-[11px] text-gray-500 mt-2">🟢 vende al ritmo del mes pasado o más y gana · 🟡 se está quedando atrás · 🔴 pierde plata o va por debajo del 70 % del mes pasado.</p></section>}

  <p className="text-[11px] text-gray-500">Cifras del ERP en tiempo real. Bancos y ganancia son aproximados mientras todas las sedes registren cada movimiento en Cierres de caja; el valor del inventario se sumará cuando cada vestido tenga su costo. Siigo confirma lo contable.</p>
 </div>;
}
