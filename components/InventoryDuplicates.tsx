'use client';
import {useCallback,useEffect,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Ficha={id:string;codigo:string;nombre:string|null;talla:string|null;color:string|null;estado:string|null;sede:string|null;creado:string;foto:string|null;contratos:number;traslados:number;mantenimientos:number};
type Grupo={codigo:string;fichas:Ficha[]};
type Hecha={id:number;codigo:string;motivo:string;created_at:string;deshecho_at:string|null;movidos:{tabla:string;ids:unknown[]}[]};

/** Inventory › Duplicados: the same code in more than one store. Keep the real record (it receives all the history) or give a new code. */
export default function InventoryDuplicates(){
 const [grupos,setGrupos]=useState<Grupo[]|null>(null),[hechas,setHechas]=useState<Hecha[]>([]),[error,setError]=useState(''),[aviso,setAviso]=useState('');
 const [queda,setQueda]=useState<Record<string,string>>({}),[motivo,setMotivo]=useState<Record<string,string>>({}),[nuevo,setNuevo]=useState<Record<string,string>>({}),[busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const [{data,error:e},{data:h}]=await Promise.all([supabase.rpc('vestidos_duplicados'),supabase.from('vestidos_unificaciones').select('id,codigo,motivo,created_at,deshecho_at,movidos').order('id',{ascending:false}).limit(30)]);
  if(e){setError(e.message);return;}
  setError('');setGrupos((data||[]) as Grupo[]);setHechas((h||[]) as Hecha[]);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>{void load();},0);return()=>clearTimeout(t);},[load]);
 async function run(fn:()=>PromiseLike<{error:{message:string}|null}>,ok:string){
  if(busy)return;setBusy(true);setAviso('');setError('');
  const {error:e}=await fn();setBusy(false);
  if(e){setError(e.message);return;}
  setAviso(ok);await load();
 }
 const unificar=(g:Grupo)=>{
  const q=queda[g.codigo],m=(motivo[g.codigo]||'').trim();
  if(!q){setError(`Código ${g.codigo}: elige cuál ficha queda.`);return;}
  if(m.length<10){setError(`Código ${g.codigo}: explica el motivo (mínimo 10 caracteres).`);return;}
  const sobran=g.fichas.filter(f=>f.id!==q);
  if(!window.confirm(`¿Unificar el código ${g.codigo}? La ficha elegida recibe todo el historial de ${sobran.length} ficha(s) y esas se archivan. Se puede deshacer.`))return;
  void run(async()=>{for(const s of sobran){const r=await supabase.rpc('unificar_vestidos',{p_queda:q,p_sobra:s.id,p_motivo:m});if(r.error)return r;}return {error:null};},`Código ${g.codigo} unificado.`);
 };
 const cambiar=(f:Ficha)=>{
  const c=(nuevo[f.id]||'').trim();
  if(c.length<2){setError('Escribe el código nuevo.');return;}
  void run(()=>supabase.rpc('cambiar_codigo_vestido',{p_id:f.id,p_codigo:c,p_motivo:'Vestido distinto que compartía el código '+f.codigo}),`La ficha de ${f.sede||'—'} ahora tiene el código ${c}.`);
 };
 const deshacer=(h:Hecha)=>{if(window.confirm(`¿Deshacer la unificación del código ${h.codigo}? El historial vuelve a la ficha archivada y esta se reactiva.`))void run(()=>supabase.rpc('deshacer_unificacion_vestidos',{p_id:h.id}),`Unificación del código ${h.codigo} deshecha.`);};

 if(error&&!grupos)return <p className="text-red-600 font-bold">{error}</p>;
 if(!grupos)return <p className="text-gray-400 font-bold">Buscando códigos repetidos…</p>;
 return <div className="space-y-6 text-gray-800">
  <div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm">
   <h2 className="text-xl font-black text-gray-900">Códigos duplicados · {grupos.length}</h2>
   <p className="text-sm text-gray-500 mt-1">El código de un vestido es único en todas las sedes; si cambia de sede se mueve con <b>Traslados</b>. Para cada código repetido: si es el mismo vestido, elige la ficha que queda y <b>Unificar</b> (recibe contratos, traslados, mantenimientos y bitácora; la otra se archiva y se puede deshacer). Si son vestidos distintos, dale a uno un <b>código nuevo</b>.</p>
  </div>
  {error&&<p className="rounded-2xl bg-red-50 border border-red-200 p-4 text-sm font-bold text-red-700">{error}</p>}
  {aviso&&<p className="rounded-2xl bg-emerald-50 border border-emerald-200 p-4 text-sm font-bold text-emerald-800">✅ {aviso}</p>}
  {!grupos.length&&<p className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 font-bold text-emerald-800">No hay códigos repetidos. 🎉</p>}
  {grupos.map(g=><div key={g.codigo} className="bg-white p-6 rounded-[2rem] border border-amber-200 shadow-sm space-y-4">
   <h3 className="text-lg font-black text-gray-900">Código {g.codigo}</h3>
   <div className="grid md:grid-cols-2 gap-3">{g.fichas.map(f=><label key={f.id} className={`rounded-2xl border p-4 cursor-pointer flex gap-3 ${queda[g.codigo]===f.id?'border-emerald-400 bg-emerald-50':'border-gray-200'}`}>
    <input type="radio" name={`q-${g.codigo}`} checked={queda[g.codigo]===f.id} onChange={()=>setQueda({...queda,[g.codigo]:f.id})} className="mt-1"/>
    {f.foto?<img src={f.foto} alt="" className="w-16 h-20 object-cover rounded-lg"/>:<div className="w-16 h-20 rounded-lg bg-gray-100 text-[10px] text-gray-400 flex items-center justify-center text-center">Sin foto</div>}
    <div className="text-sm flex-1 min-w-0">
     <p className="font-black text-gray-900">{f.sede||'Sin sede'} · {f.estado||'—'}</p>
     <p className="text-gray-600">{[f.nombre,f.talla&&`T. ${f.talla}`,f.color].filter(Boolean).join(' · ')}</p>
     <p className="text-xs text-gray-500 mt-1">Creada {f.creado} · {f.contratos} contrato(s) · {f.traslados} traslado(s) · {f.mantenimientos} mantenimiento(s)</p>
     {queda[g.codigo]===f.id?<p className="text-xs font-black text-emerald-700 mt-1">Esta ficha queda</p>:
      <div className="flex gap-2 mt-2" onClick={e=>e.preventDefault()}><input value={nuevo[f.id]||''} onChange={e=>setNuevo({...nuevo,[f.id]:e.target.value})} placeholder="Código nuevo si es otro vestido" className="border border-gray-200 rounded-lg px-2 py-1 text-xs flex-1 min-w-0"/>
       <button type="button" disabled={busy} onClick={()=>cambiar(f)} className="px-2 py-1 rounded-lg border border-gray-300 text-xs font-bold disabled:opacity-50">Cambiar código</button></div>}
    </div></label>)}</div>
   <div className="flex flex-col sm:flex-row gap-2">
    <input value={motivo[g.codigo]||''} onChange={e=>setMotivo({...motivo,[g.codigo]:e.target.value})} placeholder="Motivo (ej.: se creó otra ficha al llegar a Bogotá en vez de trasladarlo)" className="border border-gray-200 rounded-xl px-3 py-2 text-sm flex-1"/>
    <button type="button" disabled={busy||!queda[g.codigo]} onClick={()=>unificar(g)} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase tracking-widest disabled:opacity-50">Unificar</button>
   </div>
  </div>)}
  {!!hechas.length&&<div className="bg-white p-6 rounded-[2rem] border border-gray-100 shadow-sm space-y-2">
   <h3 className="font-black text-gray-900">Unificaciones hechas</h3>
   {hechas.map(h=><div key={h.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-2 text-sm">
    <p><b>{h.codigo}</b> · {new Date(h.created_at).toLocaleString('es-CO',{timeZone:'America/Bogota'})} · {h.motivo} · {h.movidos.reduce((a,m)=>a+m.ids.length,0)} registros movidos{h.deshecho_at?' · deshecha':''}</p>
    {!h.deshecho_at&&<button type="button" disabled={busy} onClick={()=>deshacer(h)} className="px-3 py-1 rounded-lg border border-gray-300 text-xs font-bold disabled:opacity-50">Deshacer</button>}
   </div>)}
  </div>}
 </div>;
}
