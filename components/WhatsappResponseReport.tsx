'use client';
import {useEffect,useMemo,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Fila={semana:string;tipo:string;plantilla:string;enviados:number;respondidos:number};
const TIPO:Record<string,string>={confirmacion:'Confirmación',recordatorio24:'Recordatorio 24 h',recordatorio2:'Recordatorio del día',post_cita:'¿Cómo te fue?',pregunta_alquiler:'¿Alquilaste?',pregunta_motivo:'Motivo',
 satisfaccion:'Satisfacción',satisfaccion_falla:'Qué mejorar',resena:'Reseña',reagendar:'Reagendar',confirmar_cancelacion:'¿Cancelamos?',recuperar:'No asistió'};

/** Primeras visitas › response rate of the automatic WhatsApp messages per type and template, by week (buttons vs. no buttons). */
export default function WhatsappResponseReport(){
 const [filas,setFilas]=useState<Fila[]|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void supabase.rpc('whatsapp_respuesta_por_tipo',{p_semanas:8}).then(({data,error:e})=>{if(!live)return;if(e)setError(e.message);else setFilas((data||[]) as Fila[]);});return()=>{live=false;};},[]);
 const semanas=useMemo(()=>[...new Set((filas||[]).map(f=>f.semana))].slice(0,4),[filas]);
 const tipos=useMemo(()=>{const m=new Map<string,Fila[]>();for(const f of filas||[])if(TIPO[f.tipo]){const k=`${f.tipo}|${f.plantilla}`;m.set(k,[...(m.get(k)||[]),f]);}return [...m.entries()];},[filas]);
 if(error)return null;
 return <details className="bg-white rounded-2xl border border-gray-100 p-4 mt-4">
  <summary className="cursor-pointer font-black text-gray-900">Respuesta a los mensajes automáticos de WhatsApp (últimas 4 semanas)</summary>
  {!filas?<p className="text-sm text-gray-400 mt-2">Cargando…</p>:!tipos.length?<p className="text-sm text-gray-500 mt-2">Aún no hay envíos con respuesta registrada.</p>:
  <div className="overflow-x-auto mt-3"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="p-2">Mensaje</th><th className="p-2">Cómo salió</th>
   {semanas.map(s=><th key={s} className="p-2 text-right whitespace-nowrap">Semana {new Date(s+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'})}</th>)}</tr></thead>
   <tbody>{tipos.map(([k,fs])=>{const [tipo,plantilla]=k.split('|');return <tr key={k} className="border-t border-gray-100">
    <td className="p-2 font-bold">{TIPO[tipo]}</td><td className="p-2 text-xs text-gray-500">{plantilla}</td>
    {semanas.map(s=>{const f=fs.find(x=>x.semana===s);const pct=f&&f.enviados?Math.round(100*f.respondidos/f.enviados):null;
     return <td key={s} className={`p-2 text-right whitespace-nowrap ${pct===null?'text-gray-300':pct>=50?'text-emerald-700 font-black':pct>=20?'text-amber-700 font-bold':'text-red-600 font-bold'}`}>{f?`${pct}% · ${f.respondidos}/${f.enviados}`:'—'}</td>;})}
   </tr>;})}</tbody></table>
   <p className="text-xs text-gray-500 mt-2">Porcentaje de mensajes enviados en los que la clienta tocó un botón. Se mide desde el 15 de noviembre de 2026.</p></div>}
 </details>;
}
