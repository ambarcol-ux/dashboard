'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '@/lib/supabase';

type Item={vestido_id:string;codigo:string;nombre:string|null;talla:string|null;estado:string|null;situacion:'esperado'|'afuera'|'sobrante';encontrado:boolean;sede_actual:string|null};
type Toma={id:string;estado:'abierta'|'cerrada';created_at:string;cerrada_at:string|null;nota:string|null};
const fecha=(d:string|null)=>d?new Date(d).toLocaleDateString('es-CO',{day:'numeric',month:'short',year:'numeric',timeZone:'America/Bogota'}):'';

/** Inventario › Toma física: the store counts its dresses by code; what was expected and not found is missing (Novedades contables). */
export default function InventoryCount({sedes}:{sedes:{id:string;nombre:string}[]}){
 const [sede,setSede]=useState(sedes[0]?.id||''),[toma,setToma]=useState<Toma|null>(null),[items,setItems]=useState<Item[]>([]),[codigo,setCodigo]=useState('');
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[nota,setNota]=useState('');
 const input=useRef<HTMLInputElement>(null);
 const load=useCallback(async()=>{if(!sede)return;const {data,error:e}=await supabase.rpc('toma_detalle',{p_sede:sede});if(e){setError(e.message);return;}
  const d=data as {toma:Toma|null;items:Item[]};setToma(d.toma);setItems(d.items||[]);},[sede]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const run=async(fn:()=>PromiseLike<{error:{message:string}|null}>,ok:string)=>{setBusy(true);setError('');const {error:e}=await fn();setBusy(false);if(e)setError(e.message);else{setNotice(ok);await load();}};
 const marcar=async(e:React.FormEvent)=>{e.preventDefault();if(!toma||!codigo.trim())return;setBusy(true);setError('');
  const {data,error:er}=await supabase.rpc('toma_marcar',{p_toma:toma.id,p_codigo:codigo.trim()});setBusy(false);
  if(er)setError(er.message);else{const r=data as {codigo:string;nombre:string|null;sobrante:boolean;ya_estaba:boolean};
   setNotice(r.ya_estaba?`${r.codigo} ya estaba marcado.`:r.sobrante?`${r.codigo} no es de esta sede: quedó como sobrante.`:`✓ ${r.codigo} ${r.nombre||''}`);setCodigo('');await load();}
  input.current?.focus();};
 const g=useMemo(()=>({faltan:items.filter(i=>i.situacion==='esperado'&&!i.encontrado),ok:items.filter(i=>i.situacion==='esperado'&&i.encontrado),
  afuera:items.filter(i=>i.situacion==='afuera'),sobran:items.filter(i=>i.situacion==='sobrante')}),[items]);
 const abierta=toma?.estado==='abierta';
 const lista=(t:string,l:Item[],c:string)=>l.length>0&&<div className="bg-white rounded-2xl border p-4"><p className={`text-xs font-black uppercase tracking-widest mb-2 ${c}`}>{t} · {l.length}</p>
  <div className="flex flex-wrap gap-2">{l.map(i=><span key={i.vestido_id} className="px-2 py-1 rounded-lg border text-xs font-bold">{i.codigo}{i.talla?` · ${i.talla}`:''}{i.situacion==='afuera'?` · ${i.estado}`:''}{i.situacion==='sobrante'&&i.sede_actual?` · de ${i.sede_actual}`:''}</span>)}</div></div>;
 return <div className="space-y-4">
  <div className="bg-white rounded-2xl border p-4 space-y-3">
   <p className="text-sm text-gray-600">Cuenta los vestidos que hay físicamente en la sede: escribe o escanea el código de cada uno. Al cerrar, los que el ERP espera en la sede y no aparecieron quedan como <b>faltantes</b> y salen en Novedades contables. Los que están en contrato, traslado o mantenimiento se listan aparte.</p>
   <div className="flex flex-wrap gap-3 items-end">
    <label className="text-xs font-bold text-gray-600">Sede<select className="block border rounded-xl px-3 py-2 text-sm bg-white" value={sede} onChange={e=>{setSede(e.target.value);setNotice('');}}>{sedes.map(s=><option key={s.id} value={s.id}>{s.nombre}</option>)}</select></label>
    {!abierta&&<button type="button" disabled={busy||!sede} onClick={()=>void run(()=>supabase.rpc('toma_iniciar',{p_sede:sede}),'Toma física iniciada: empieza a marcar los vestidos.')} className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-black">Iniciar toma física</button>}
   </div>
   {toma&&<p className="text-xs text-gray-500">{abierta?`Toma abierta desde el ${fecha(toma.created_at)}.`:`Última toma cerrada el ${fecha(toma.cerrada_at)}${toma.nota?` · ${toma.nota}`:''}.`} Encontrados {g.ok.length} de {g.ok.length+g.faltan.length} esperados.</p>}
  </div>
  {error&&<p role="alert" className="text-red-600 text-sm font-bold">{error}</p>}{notice&&<p role="status" className="text-emerald-700 text-sm font-bold">{notice}</p>}
  {abierta&&<form onSubmit={e=>void marcar(e)} className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
   <label className="text-xs font-bold text-gray-600 grow">Código del vestido<input ref={input} autoFocus className="block w-full border rounded-xl px-3 py-2 text-lg font-black uppercase" value={codigo} onChange={e=>setCodigo(e.target.value)} placeholder="Ej.: 1046-S"/></label>
   <button type="submit" disabled={busy||!codigo.trim()} className="px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-black">Marcar</button>
  </form>}
  {lista(abierta?'Por encontrar':'Faltantes',g.faltan,'text-red-600')}
  {lista('Sobrantes (de otra sede)',g.sobran,'text-amber-700')}
  {lista('Afuera (contrato, traslado o mantenimiento)',g.afuera,'text-gray-500')}
  {lista('Encontrados',g.ok,'text-emerald-700')}
  {abierta&&<div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-3 items-end">
   <label className="text-xs font-bold text-gray-600 grow">Nota (opcional)<input className="block w-full border rounded-xl px-3 py-2 text-sm" value={nota} onChange={e=>setNota(e.target.value)}/></label>
   <button type="button" disabled={busy} onClick={()=>void run(()=>supabase.rpc('toma_cerrar',{p_toma:toma!.id,p_nota:nota}),`Toma cerrada: ${g.faltan.length} faltante(s).`)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-black">Cerrar toma ({g.faltan.length} faltante{g.faltan.length===1?'':'s'})</button>
  </div>}
 </div>;
}
