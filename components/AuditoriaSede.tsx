'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';

/** Ámbar Exitoso · auditoría mensual por sede (Manuales › Manual Ámbar): what the ERP cannot see — the store, the service and a sample
 *  of contracts, cash and dresses — checked once a month. Closed, it is worth 10 points of the Puntaje Ámbar for 45 days. */
export const AUDITORIA:{grupo:string;items:{id:string;texto:string}[]}[]=[
 {grupo:'Tienda y presentación',items:[{id:'fachada',texto:'Fachada, letrero y vitrina limpios y ordenados'},{id:'probadores',texto:'Probadores limpios, con espejo, buena luz y ganchos'},{id:'exhibicion',texto:'Vestidos colgados por categoría y con su código visible'},{id:'presentacion',texto:'Equipo con buena presentación personal'}]},
 {grupo:'Atención (protocolos 1 y 2)',items:[{id:'saludo',texto:'La clienta es saludada en menos de 1 minuto al llegar'},{id:'primera_cita',texto:'La primera cita sigue el protocolo (revisar 3 fichas: resultado y origen registrados)'},{id:'chats',texto:'Sin chats «Atender persona» pendientes del día anterior'}]},
 {grupo:'Contratos (protocolo 3) · muestra de 5 del mes',items:[{id:'contratos_completos',texto:'Cédula, celular y correo completos'},{id:'contratos_firma',texto:'Firmados en el ERP'},{id:'contratos_soportes',texto:'Cada abono con su soporte'},{id:'contratos_saldo',texto:'Ningún vestido entregado con saldo'}]},
 {grupo:'Caja (protocolo 7)',items:[{id:'caja_efectivo',texto:'El efectivo físico coincide con el último cierre'},{id:'caja_soportes',texto:'Soportes de los gastos archivados'},{id:'caja_semana',texto:'Caja cerrada todos los días de la última semana'}]},
 {grupo:'Inventario (protocolo 8) · muestra de 10 vestidos',items:[{id:'inv_codigo',texto:'Código y sede coinciden con el ERP'},{id:'inv_estado',texto:'Estado coincide (disponible, alquilado, mantenimiento)'},{id:'inv_danos',texto:'Vestidos dañados registrados en el ERP'},{id:'inv_fotos',texto:'Fotos actualizadas'}]},
 {grupo:'Entregas y devoluciones (protocolos 5 y 6)',items:[{id:'dep_al_dia',texto:'Depósitos devueltos dentro de 8 días'},{id:'devueltos',texto:'Vestidos devueltos revisados y enviados a lavandería/arreglo en el ERP'}]},
 {grupo:'Marca y crecimiento (protocolo 9)',items:[{id:'precios',texto:'Precios y promociones vigentes iguales a los del ERP'},{id:'resenas',texto:'Se piden reseñas a las clientas felices'},{id:'aliados',texto:'Al menos un aliado nuevo contactado en el mes'}]},
];
const TOTAL=AUDITORIA.reduce((a,g)=>a+g.items.length,0);
type Resp=Record<string,{ok?:boolean;nota?:string}>;
type Aud={id:string;sede_id:string;sede:string;periodo:string;respuestas:Resp;resultado:number|null;notas:string|null;estado:string;auditor:string|null;cerrada_at:string|null};
const mesActual=()=>`${new Date(Date.now()-5*3600000).toISOString().slice(0,7)}-01`;

export default function AuditoriaSede(){
 const [sedes,setSedes]=useState<{id:string;nombre:string}[]>([]),[sede,setSede]=useState(''),[mes,setMes]=useState(mesActual());
 const [lista,setLista]=useState<Aud[]>([]),[resp,setResp]=useState<Resp>({}),[notas,setNotas]=useState(''),[busy,setBusy]=useState(false),[msg,setMsg]=useState(''),[error,setError]=useState('');
 const load=useCallback(async()=>{const [{data:s},{data:l}]=await Promise.all([supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre'),supabase.rpc('auditorias_sede_listar',{p_sede:null})]);
  setSedes(s||[]);setLista((l||[]) as Aud[]);},[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const actual=useMemo(()=>lista.find(a=>a.sede_id===sede&&a.periodo===mes),[lista,sede,mes]);
 useEffect(()=>{const t=setTimeout(()=>{setResp(actual?.respuestas||{});setNotas(actual?.notas||'');setMsg('');setError('');},0);return()=>clearTimeout(t);},[actual,sede,mes]);
 const si=Object.values(resp).filter(r=>r.ok===true).length,respondidas=Object.values(resp).filter(r=>typeof r.ok==='boolean').length;
 const set=(id:string,v:{ok?:boolean;nota?:string})=>setResp(r=>({...r,[id]:{...r[id],...v}}));
 const guardar=async(cerrar:boolean)=>{
  if(!sede)return setError('Elige la sede.');
  if(cerrar&&!confirm(`¿Cerrar la auditoría con ${Math.round(si/TOTAL*100)} %? Contará 10 puntos del Puntaje Ámbar.`))return;
  setBusy(true);setError('');setMsg('');
  const {error:e}=await supabase.rpc('auditoria_sede_guardar',{p_sede:sede,p_periodo:mes,p_respuestas:resp,p_notas:notas,p_cerrar:cerrar,p_total_items:TOTAL});
  setBusy(false);if(e)setError(e.message);else{setMsg(cerrar?'Auditoría cerrada.':'Borrador guardado.');await load();}
 };
 const cerrada=actual?.estado==='cerrada';
 return <div className="mb-8 space-y-4">
  <div className="flex flex-wrap gap-3 items-end">
   <label className="text-xs font-bold text-gray-600">Sede<select className="mt-1 block border rounded-xl px-3 py-2 text-sm bg-white" value={sede} onChange={e=>setSede(e.target.value)}><option value="">Elige la sede</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
   <label className="text-xs font-bold text-gray-600">Mes<input type="month" className="mt-1 block border rounded-xl px-3 py-2 text-sm bg-white" value={mes.slice(0,7)} onChange={e=>setMes(`${e.target.value}-01`)}/></label>
   {sede&&<p className="text-sm font-black text-indigo-900">{respondidas}/{TOTAL} respondidos · cumple {TOTAL?Math.round(si/TOTAL*100):0} %{cerrada?' · 🔒 cerrada':''}</p>}
  </div>
  {sede&&<>
   {AUDITORIA.map(g=><div key={g.grupo} className="bg-white rounded-2xl border p-4"><p className="font-black text-gray-900 mb-2">{g.grupo}</p>
    {g.items.map(it=>{const r=resp[it.id]||{};return <div key={it.id} className="py-2 border-b last:border-0 space-y-1">
     <div className="flex flex-wrap items-center gap-2"><span className="flex-1 min-w-[200px] text-sm text-gray-800">{it.texto}</span>
      <button type="button" disabled={cerrada} onClick={()=>set(it.id,{ok:true})} className={`px-3 py-1 rounded-lg text-xs font-black border ${r.ok===true?'bg-emerald-600 text-white border-emerald-600':'text-emerald-700'}`}>Cumple</button>
      <button type="button" disabled={cerrada} onClick={()=>set(it.id,{ok:false})} className={`px-3 py-1 rounded-lg text-xs font-black border ${r.ok===false?'bg-rose-600 text-white border-rose-600':'text-rose-700'}`}>No cumple</button></div>
     {r.ok===false&&<input disabled={cerrada} className="w-full border rounded-lg px-2 py-1 text-xs" placeholder="Qué se encontró y qué se debe corregir" value={r.nota||''} onChange={e=>set(it.id,{nota:e.target.value})}/>}
    </div>;})}</div>)}
   <label className="block text-xs font-bold text-gray-600">Conclusiones y compromisos<textarea disabled={cerrada} className="mt-1 w-full border rounded-xl p-2 text-sm" rows={3} value={notas} onChange={e=>setNotas(e.target.value)}/></label>
   {error&&<p role="alert" className="text-sm font-bold text-rose-700">{error}</p>}{msg&&<p role="status" className="text-sm font-bold text-emerald-700">{msg}</p>}
   {!cerrada&&<div className="flex gap-2"><button type="button" disabled={busy} onClick={()=>void guardar(false)} className="px-4 py-2 rounded-xl border text-sm font-black">Guardar borrador</button>
    <button type="button" disabled={busy||respondidas<TOTAL} onClick={()=>void guardar(true)} className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-black disabled:opacity-50">Cerrar auditoría</button></div>}
  </>}
  {lista.length>0&&<div className="bg-white rounded-2xl border p-4"><p className="font-black text-gray-900 mb-2">Auditorías realizadas</p>
   {lista.slice(0,24).map(a=><button type="button" key={a.id} onClick={()=>{setSede(a.sede_id);setMes(a.periodo);}} className="w-full text-left flex flex-wrap gap-2 text-sm py-1 border-b last:border-0">
    <b>{a.sede}</b><span>{a.periodo.slice(0,7)}</span><span className={`font-black ${Number(a.resultado)>=85?'text-emerald-700':Number(a.resultado)>=70?'text-amber-700':'text-rose-700'}`}>{a.resultado??0} %</span><span className="text-gray-500">{a.estado==='cerrada'?'🔒 cerrada':'borrador'}{a.auditor?` · ${a.auditor}`:''}</span></button>)}</div>}
 </div>;
}
