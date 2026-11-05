'use client';
import {useEffect,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';
import {useCobrosUrgentes} from '@/components/CobrosAlert';

type Server={caja_abonos:number;caja_sin_cerrar:number;caja_diferencias:number;pagos_sin_soporte:number;traslados_por_aprobar:number;prestamos_vencidos:number;
 mantenimiento_demorado:number;agenda_hoy:number;estrene_riesgo:number;proveedores_por_pagar:number;agenda_manana:number;ventas_sin_factura:number;incoherentes:{numero:string;sede:string|null;problema:string}[]};
type Tile={key:string;label:string;count:number;color:string;panel:string;href?:string;onClick?:()=>void;active?:boolean};

/** Inicio: one strip with every pending item, each with its own color; tap to go to the module. Only items with something pending show. */
export default function DashboardAlerts({canSee,pendingDeposits,entregas,borradores,prexv,filtroAlerta,onAlerta,onPrexv}:{
 canSee:(panel:string)=>boolean;pendingDeposits:number|null;entregas:number;borradores:number;prexv:number;
 filtroAlerta:string;onAlerta:(f:string)=>void;onPrexv:()=>void}){
 const [data,setData]=useState<Server|null>(null),[seg,setSeg]=useState<{hoy:number;vencidos:number}|null>(null),[fuera,setFuera]=useState(0),[ver,setVer]=useState(false);
 const cobros=useCobrosUrgentes(canSee('cobros'));
 useEffect(()=>{
  let live=true,last=0;
  const load=async()=>{
   if(document.visibilityState!=='visible'||Date.now()-last<55000)return;last=Date.now();
   const [a,s,f]=await Promise.all([supabase.rpc('alertas_inicio'),supabase.rpc('seguimientos_resumen'),
    supabase.rpc('vestidos_fuera_activos',{},{count:'exact',head:true}).eq('semaforo','ALERTA')]);
   if(!live)return;
   if(!a.error&&a.data)setData(a.data as Server);
   if(!s.error&&s.data)setSeg({hoy:Number(s.data.hoy)||0,vencidos:Number(s.data.vencidos)||0});
   if(!f.error)setFuera(f.count||0);
  };
  void load();const t=setInterval(()=>void load(),60000);window.addEventListener('focus',load);
  return()=>{live=false;clearInterval(t);window.removeEventListener('focus',load);};
 },[]);
 const d=data,toggle=(f:string)=>onAlerta(filtroAlerta===f?'ninguna':f);
 const tiles:Tile[]=[
  {key:'dep',label:'Depósitos por devolver',count:pendingDeposits||0,color:'bg-rose-50 border-rose-200 text-rose-700',panel:'depositos',href:'/dashboard/devoluciones-depositos#pendientes'},
  {key:'cob',label:cobros?.tres?`Saldos por cobrar (7 días) · ${cobros.tres} urgentes`:'Saldos por cobrar (7 días)',count:cobros?.total||0,color:'bg-amber-50 border-amber-200 text-amber-800',panel:'cobros',href:'/dashboard/cuentas-por-cobrar'},
  {key:'seg',label:`Seguimientos · ${seg?.hoy||0} hoy · ${seg?.vencidos||0} vencidos`,count:(seg?.hoy||0)+(seg?.vencidos||0),color:'bg-yellow-50 border-yellow-300 text-yellow-800',panel:'primeras-citas',href:'/dashboard/primeras-citas'},
  {key:'hoy',label:'Agenda de hoy (citas, pruebas, entregas)',count:d?.agenda_hoy||0,color:'bg-sky-50 border-sky-200 text-sky-800',panel:'calendario',href:'/dashboard/calendario'},
  {key:'man',label:'Agenda de mañana',count:d?.agenda_manana||0,color:'bg-cyan-50 border-cyan-200 text-cyan-800',panel:'calendario',href:'/dashboard/calendario'},
  {key:'ent',label:'Entregas sin registrar (fecha pasada)',count:entregas,color:'bg-red-50 border-red-200 text-red-700',panel:'dashboard',onClick:()=>toggle('entregas_omitidas'),active:filtroAlerta==='entregas_omitidas'},
  {key:'bor',label:'Borradores sin firmar (+48 h)',count:borradores,color:'bg-orange-50 border-orange-200 text-orange-700',panel:'dashboard',onClick:()=>toggle('borradores_sin_firmar'),active:filtroAlerta==='borradores_sin_firmar'},
  {key:'fue',label:'Vestidos fuera de tienda en alerta',count:fuera,color:'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700',panel:'dashboard',href:'#vestidos-fuera'},
  {key:'pxv',label:'Pre-XV incompletos',count:prexv,color:'bg-violet-50 border-violet-200 text-violet-700',panel:'dashboard',onClick:onPrexv},
  {key:'abo',label:'Abonos sin pasar a caja',count:d?.caja_abonos||0,color:'bg-emerald-50 border-emerald-200 text-emerald-800',panel:'caja',href:'/dashboard/caja'},
  {key:'cie',label:'Días de caja sin cerrar',count:d?.caja_sin_cerrar||0,color:'bg-teal-50 border-teal-200 text-teal-800',panel:'caja',href:'/dashboard/caja'},
  {key:'dif',label:'Cierres con diferencia (30 días)',count:d?.caja_diferencias||0,color:'bg-lime-50 border-lime-300 text-lime-800',panel:'caja',href:'/dashboard/caja'},
  {key:'sop',label:'Abonos sin soporte (30 días)',count:d?.pagos_sin_soporte||0,color:'bg-stone-50 border-stone-300 text-stone-700',panel:'caja',href:'/dashboard/caja'},
  {key:'tra',label:'Traslados por aprobar',count:d?.traslados_por_aprobar||0,color:'bg-indigo-50 border-indigo-200 text-indigo-700',panel:'traslados',href:'/dashboard/traslados'},
  {key:'pre',label:'Préstamos de vestido vencidos',count:d?.prestamos_vencidos||0,color:'bg-purple-50 border-purple-200 text-purple-700',panel:'traslados',href:'/dashboard/traslados'},
  {key:'man7',label:'Mantenimiento demorado (+7 días)',count:d?.mantenimiento_demorado||0,color:'bg-blue-50 border-blue-200 text-blue-700',panel:'inventory',href:'/admin/inventory'},
  {key:'est',label:'Pedidos de estrene en riesgo (no alcanzan)',count:d?.estrene_riesgo||0,color:'bg-red-100 border-red-300 text-red-800',panel:'pedidos_estrene',href:'/dashboard/pedidos-estrene'},
  {key:'prov',label:'Servicios de proveedores por pagar',count:d?.proveedores_por_pagar||0,color:'bg-gray-50 border-gray-300 text-gray-700',panel:'proveedores-pagos',href:'/dashboard/proveedores/pagos'},
  {key:'ven',label:'Ventas de vestido sin factura',count:d?.ventas_sin_factura||0,color:'bg-pink-50 border-pink-200 text-pink-700',panel:'dashboard',href:'/dashboard/ventas'},
  {key:'inc',label:'Contratos con datos por revisar',count:d?.incoherentes.length||0,color:'bg-slate-50 border-slate-300 text-slate-700',panel:'cobros',onClick:()=>setVer(v=>!v),active:ver},
 ].filter(t=>t.count>0&&canSee(t.panel));
 if(!d&&!seg)return null;
 const cls=(t:Tile)=>`flex items-center gap-3 rounded-2xl border px-4 py-3 text-left transition hover:shadow-md ${t.color} ${t.active?'ring-2 ring-offset-1 ring-current':''}`;
 const body=(t:Tile)=><><span className="text-2xl font-black leading-none">{t.count}</span><span className="text-xs font-bold leading-tight">{t.label}</span></>;
 return <section aria-label="Alertas y pendientes" className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-3">Pendientes importantes · toca para ir al módulo</p>
  {tiles.length?<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
   {tiles.map(t=>t.href?<Link key={t.key} href={t.href} className={cls(t)}>{body(t)}</Link>:<button key={t.key} type="button" onClick={t.onClick} className={cls(t)}>{body(t)}</button>)}
  </div>:<p className="text-sm font-bold text-emerald-700">Todo al día ✅</p>}
  {ver&&d&&d.incoherentes.length>0&&<div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-200">
   <table className="w-full text-xs"><thead className="bg-slate-50 text-left text-slate-500"><tr><th className="p-2">Contrato</th><th className="p-2">Sede</th><th className="p-2">Qué revisar</th></tr></thead>
    <tbody>{d.incoherentes.map(r=><tr key={r.numero} className="border-t border-slate-100"><td className="p-2 font-bold">{r.numero}</td><td className="p-2">{r.sede||'—'}</td><td className="p-2">{r.problema}</td></tr>)}</tbody></table>
  </div>}
 </section>;
}
