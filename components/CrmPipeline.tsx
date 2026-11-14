'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import Link from 'next/link';
import {supabase} from '@/lib/supabase';

type Lead={clave:string;etapa:Etapa;nombre:string;telefono:string|null;canal:string;anuncio:boolean;sede_id:string|null;sede:string|null;conv_id:string|null;cita_id:string|null;codigo:string|null;
 origen:string|null;modalidad:string|null;fecha_cita:string|null;hora:string|null;fecha_evento:string|null;tipo_vestido:string|null;asesora:string|null;tipo_seguimiento:string|null;
 seguimiento:{enviadas:number;total:number;ultima:string|null;proxima:string|null}|null;contrato:{numero:string|null;estado:string|null;saldo:number|null}|null;cierre:string|null;dias:number;alerta:string|null};
type Etapa='interesada'|'agendada'|'asistio'|'seguimiento'|'contrato'|'cerrada';
const ETAPAS:{id:Etapa;titulo:string;color:string;ayuda:string}[]=[
 {id:'interesada',titulo:'Interesada',color:'#0ea5e9',ayuda:'Escribió por WhatsApp, Instagram o Messenger y aún no tiene cita'},
 {id:'agendada',titulo:'Cita agendada',color:'#8b5cf6',ayuda:'Tiene primera cita próxima'},
 {id:'asistio',titulo:'Asistió',color:'#f59e0b',ayuda:'Llegó (QR, videollamada o WhatsApp) y falta registrar el resultado'},
 {id:'seguimiento',titulo:'En seguimiento',color:'#e11d48',ayuda:'No alquiló o no asistió: plan de seguimiento automático'},
 {id:'contrato',titulo:'Contrato',color:'#059669',ayuda:'Alquiló (últimos 30 días)'},
 {id:'cerrada',titulo:'Cerrada',color:'#64748b',ayuda:'Desistió, alquiló en otro lugar o pasó su evento (últimos 15 días)'},
];
const fecha=(d:string|null)=>d?new Date(d+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'}):'';
const money=(n:number|null)=>n?`$${Math.round(n).toLocaleString('es-CO')}`:'';
const CANAL:Record<string,string>={whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Messenger',messenger:'Messenger'};
const SEG:Record<string,string>={asistida:'asistió, no alquiló',no_asistida:'no asistió',vitrina:'vitrina'};

/** Detail line of each card, from the data of its stage. */
function detalle(l:Lead){
 if(l.etapa==='agendada'||l.etapa==='asistio')return `Cita ${fecha(l.fecha_cita)} ${l.hora||''} · ${l.origen==='vitrina'?'vitrina':l.modalidad==='virtual'?'virtual':'presencial'}${l.codigo?` · ${l.codigo}`:''}`;
 if(l.etapa==='seguimiento'){const s=l.seguimiento;return `Seguimiento ${s?.enviadas||0}/${s?.total||0}${l.tipo_seguimiento?` · ${SEG[l.tipo_seguimiento]||l.tipo_seguimiento}`:''}${s?.proxima?` · próximo ${fecha(s.proxima)}`:''}`;}
 if(l.etapa==='contrato')return l.contrato?`Contrato ${l.contrato.numero||''}${l.contrato.saldo?` · saldo ${money(l.contrato.saldo)}`:''}`:'Alquiló';
 if(l.etapa==='cerrada')return l.cierre||'Cerrada';
 return `${CANAL[l.canal]||l.canal}${l.anuncio?' · llegó por anuncio':''}`;
}

/** Ventas y CRM › Pipeline: every customer in her stage. The stage changes by itself with what the ERP records; each card says what to do. */
export default function CrmPipeline({admin,sedeId}:{admin:boolean;sedeId:string|null}){
 const [leads,setLeads]=useState<Lead[]|null>(null),[error,setError]=useState(''),[sede,setSede]=useState<string>(admin?'':sedeId||''),[sedes,setSedes]=useState<{id:string;nombre:string}[]>([]);
 const [q,setQ]=useState(''),[soloAlertas,setSoloAlertas]=useState(false),[tab,setTab]=useState<Etapa>('interesada'),[act,setAct]=useState('');
 const load=useCallback(async()=>{
  const {data,error:e}=await supabase.rpc('crm_pipeline',{p_sede:sede||null,p_dias:45});
  if(e){setError(e.message);return;}
  setError('');setLeads((data||[]) as Lead[]);setAct(new Date().toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit'}));
 },[sede]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);const i=setInterval(()=>void load(),60000);return()=>{clearTimeout(t);clearInterval(i);};},[load]);
 useEffect(()=>{void supabase.from('sedes').select('id,nombre').eq('activo',true).order('nombre').then(({data})=>setSedes((data||[]) as {id:string;nombre:string}[]));},[]);
 const filtrados=useMemo(()=>(leads||[]).filter(l=>(!soloAlertas||l.alerta)&&(!q||`${l.nombre} ${l.telefono||''} ${l.codigo||''} ${l.tipo_vestido||''}`.toLowerCase().includes(q.toLowerCase()))),[leads,q,soloAlertas]);
 const por=(e:Etapa)=>filtrados.filter(l=>l.etapa===e).sort((a,b)=>Number(!!b.alerta)-Number(!!a.alerta)||b.dias-a.dias);
 const total=(e:Etapa)=>(leads||[]).filter(l=>l.etapa===e).length;
 const alertas=(leads||[]).filter(l=>l.alerta).length;
 const tarjeta=(l:Lead)=><article key={l.clave} className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm text-gray-800 space-y-1">
  <div className="flex justify-between gap-2"><p className="font-black text-gray-900 text-sm leading-tight">{l.nombre}</p><span className="text-[10px] font-bold text-gray-400 whitespace-nowrap">{l.dias===0?'hoy':`${l.dias} d`}</span></div>
  <p className="text-[11px] text-gray-500">{[l.sede,l.tipo_vestido,l.fecha_evento&&`evento ${fecha(l.fecha_evento)}`].filter(Boolean).join(' · ')}</p>
  <p className="text-xs font-bold text-gray-700">{detalle(l)}</p>
  {l.asesora&&<p className="text-[11px] text-gray-400">Asesora: {l.asesora}</p>}
  {l.alerta&&<p className="text-[11px] font-black text-red-700 bg-red-50 rounded-lg px-2 py-1">⚠️ {l.alerta}</p>}
  <div className="flex gap-2 pt-1 text-[11px] font-black">
   {l.telefono&&<Link href={`/dashboard/whatsapp?tel=${l.telefono}`} className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700">Chat</Link>}
   {l.cita_id&&<Link href={`/dashboard/primeras-citas?abrir=${l.cita_id}${l.fecha_cita?`&dia=${l.fecha_cita}`:''}`} className="px-2 py-1 rounded-lg bg-rose-50 text-rose-700">Ficha</Link>}
  </div>
 </article>;
 if(error&&!leads)return <p className="text-red-600 font-bold">No se pudo cargar el pipeline: {error}</p>;
 return <div className="space-y-4">
  <div className="bg-white p-4 rounded-[1.5rem] border border-gray-100 shadow-sm flex flex-wrap gap-2 items-center">
   {admin&&<select value={sede} onChange={e=>setSede(e.target.value)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm font-bold"><option value="">Todas las sedes</option>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select>}
   <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar nombre, celular o código" className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1 min-w-[12rem]"/>
   <button type="button" onClick={()=>setSoloAlertas(v=>!v)} className={`px-3 py-2 rounded-xl text-xs font-black ${soloAlertas?'bg-red-600 text-white':'bg-red-50 text-red-700'}`}>⚠️ Por hacer · {alertas}</button>
   <button type="button" onClick={()=>void load()} className="px-3 py-2 rounded-xl text-xs font-black border border-gray-200">Actualizar</button>
   {act&&<span className="text-[11px] text-gray-400">Se actualiza solo · {act}</span>}
  </div>
  {!leads?<p className="text-gray-400 font-bold">Cargando pipeline…</p>:<>
   <div className="flex gap-2 overflow-x-auto pb-1">{ETAPAS.map((e,i)=>{const n=total(e.id),prev=i>0?total(ETAPAS[i-1].id):0;return <button key={e.id} type="button" onClick={()=>setTab(e.id)} title={e.ayuda}
    className={`shrink-0 rounded-2xl px-3 py-2 text-left border ${tab===e.id?'bg-white shadow border-gray-300':'bg-gray-50 border-transparent'}`}>
    <p className="text-[10px] font-black uppercase tracking-widest" style={{color:e.color}}>{e.titulo}</p><p className="text-xl font-black text-gray-900">{n}</p>
    {i>0&&i<5&&prev>0&&<p className="text-[10px] text-gray-400">{Math.round(n*100/(n+prev))} % avanza</p>}</button>;})}</div>
   {/* Phone: one stage at a time. Computer: all columns. */}
   <div className="lg:hidden space-y-2"><p className="text-xs text-gray-500">{ETAPAS.find(e=>e.id===tab)?.ayuda}</p>{por(tab).slice(0,150).map(tarjeta)}{!por(tab).length&&<p className="text-sm text-gray-400">Nada en esta etapa.</p>}</div>
   <div className="hidden lg:grid grid-cols-6 gap-3 items-start">{ETAPAS.map(e=><section key={e.id} className="rounded-[1.5rem] bg-gray-50 p-2 space-y-2 max-h-[75vh] overflow-y-auto">
    <h3 className="text-[11px] font-black uppercase tracking-widest px-1 sticky top-0 bg-gray-50 py-1" style={{color:e.color}}>{e.titulo} · {por(e.id).length}</h3>
    {por(e.id).slice(0,150).map(tarjeta)}</section>)}</div>
   <p className="text-xs text-gray-400">La etapa cambia sola con lo que registra el ERP: chats, citas, llegada por QR o videollamada, resultado, seguimientos automáticos, contratos y cierres. «Por hacer» muestra solo las tarjetas con algo pendiente. Se ven los chats de los últimos 45 días; las asesoras solo ven sus sedes.</p>
  </>}
 </div>;
}
