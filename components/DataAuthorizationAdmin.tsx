'use client';
import {useCallback,useEffect,useState} from 'react';
import {toast} from 'sonner';
import {supabase} from '@/lib/supabase';
import {AUTH_ORIGIN_LABEL,authLink} from '@/lib/data-authorization';

type Text={tipo:string;version:number;texto:string;creado_en:string};
type Row={sede:string;personas:number;autorizadas:number;comerciales:number;pendientes:number;revocadas:number};
type Person={id:string;nombre:string|null;documento:string|null;telefono:string|null;estado:string;comercial:boolean;tratamiento_at:string|null;tratamiento_version:string|null;comercial_at:string|null;origen:string;token:string;creado_en:string};
const TYPES:Record<string,string>={tratamiento:'Tratamiento de datos (obligatoria)',comercial:'Información comercial (opcional)',declaracion_aliado:'Declaración del aliado (clientas de aliado)'};
const box='bg-white rounded-2xl border border-gray-100 p-4 space-y-3';
const day=(v:string|null)=>v?new Date(v).toLocaleDateString('es-CO',{timeZone:'America/Bogota'}):'—';

/** Configuración › Autorizaciones: editable texts (each save is a new version), indicator by sede and search with revocation. */
export default function DataAuthorizationAdmin({canEditTexts}:{canEditTexts:boolean}){
 const [texts,setTexts]=useState<Record<string,Text>>({}),[draft,setDraft]=useState<Record<string,string>>({}),[rows,setRows]=useState<Row[]>([]);
 const [q,setQ]=useState(''),[people,setPeople]=useState<Person[]>([]);
 const load=useCallback(async()=>{
  const [{data:t},{data:ind}]=await Promise.all([supabase.from('autorizaciones_textos').select('tipo,version,texto,creado_en').order('version',{ascending:false}),supabase.rpc('autorizaciones_indicador')]);
  const latest:Record<string,Text>={};for(const x of (t||[]) as Text[])latest[x.tipo]??=x;
  setTexts(latest);setDraft(Object.fromEntries(Object.entries(latest).map(([k,v])=>[k,v.texto])));setRows((ind||[]) as Row[]);
 },[]);
 useEffect(()=>{void load();},[load]);
 const search=async()=>{const s=q.trim().replace(/[%,()]/g,'');if(s.length<3)return toast.error('Escribe al menos 3 caracteres.');
  const {data,error}=await supabase.from('autorizaciones_datos').select('id,nombre,documento,telefono,estado,comercial,tratamiento_at,tratamiento_version,comercial_at,origen,token,creado_en').or(`documento.ilike.%${s}%,telefono.ilike.%${s}%,nombre.ilike.%${s}%`).order('creado_en',{ascending:false}).limit(20);
  if(error)toast.error(error.message);else setPeople((data||[]) as Person[]);};
 const saveText=async(tipo:string)=>{const {data,error}=await supabase.rpc('guardar_texto_autorizacion',{p_tipo:tipo,p_texto:draft[tipo]||''});
  if(error)return toast.error(error.message);toast.success(`Texto guardado (versión ${data}). Las nuevas autorizaciones usan esta versión.`);void load();};
 const revoke=async(p:Person,tipo:'todo'|'comercial')=>{if(!window.confirm(tipo==='todo'?'¿Revocar toda la autorización de esta persona?':'¿Retirar la autorización comercial?'))return;
  const {error}=await supabase.rpc('revocar_autorizacion',{p_id:p.id,p_tipo:tipo});if(error)return toast.error(error.message);toast.success('Autorización actualizada.');void search();void load();};
 const total=rows.reduce((a,r)=>({p:a.p+Number(r.personas),c:a.c+Number(r.comerciales),a:a.a+Number(r.autorizadas)}),{p:0,c:0,a:0});
 return <div className="space-y-4">
  <div className={box}><h3 className="font-black text-gray-900">Autorizaciones comerciales por sede</h3>
   <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-gray-500"><th className="py-1">Sede</th><th>Personas</th><th>Tratamiento</th><th>Comercial</th><th>% comercial</th><th>Pendientes</th><th>Revocadas</th></tr></thead>
    <tbody>{rows.map(r=><tr key={r.sede} className="border-t border-gray-50"><td className="py-1 font-bold">{r.sede}</td><td>{r.personas}</td><td>{r.autorizadas}</td><td>{r.comerciales}</td><td>{Number(r.autorizadas)?Math.round(Number(r.comerciales)*100/Number(r.autorizadas)):0}%</td><td>{r.pendientes}</td><td>{r.revocadas}</td></tr>)}
     <tr className="border-t border-gray-200 font-black"><td className="py-1">Total</td><td>{total.p}</td><td>{total.a}</td><td>{total.c}</td><td>{total.a?Math.round(total.c*100/total.a):0}%</td><td/><td/></tr></tbody></table></div>
   <p className="text-xs text-gray-500">% comercial = personas con autorización comercial sobre personas con tratamiento autorizado.</p></div>
  <div className={box}><h3 className="font-black text-gray-900">Buscar persona</h3>
   <div className="flex gap-2"><input className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm" placeholder="Documento, teléfono o nombre" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')void search();}}/><button type="button" onClick={()=>void search()} className="px-4 py-2 rounded-xl bg-gray-900 text-white text-xs font-black uppercase">Buscar</button></div>
   {people.map(p=><div key={p.id} className="border-t border-gray-50 pt-2 text-sm flex flex-wrap gap-2 items-center justify-between">
    <div><b>{p.nombre||'Sin nombre'}</b> · {p.documento||p.telefono}<br/><span className="text-xs text-gray-500">{p.estado==='autorizada'?`Tratamiento ${day(p.tratamiento_at)} (texto v${p.tratamiento_version})`:p.estado==='pendiente'?'Pendiente de aceptar':'Revocada'} · Comercial: {p.comercial?`sí (${day(p.comercial_at)})`:'no'} · Origen: {AUTH_ORIGIN_LABEL[p.origen]||p.origen}</span></div>
    <div className="flex gap-2">{p.estado!=='autorizada'&&<button type="button" className="text-xs font-bold underline" onClick={()=>void navigator.clipboard?.writeText(authLink(window.location.origin,p.token)).then(()=>toast.success('Enlace copiado.'))}>Copiar enlace</button>}
     {p.comercial&&<button type="button" className="text-xs font-bold text-amber-700 underline" onClick={()=>void revoke(p,'comercial')}>Retirar comercial</button>}
     {p.estado==='autorizada'&&<button type="button" className="text-xs font-bold text-rose-600 underline" onClick={()=>void revoke(p,'todo')}>Revocar todo</button>}</div>
   </div>)}</div>
  {canEditTexts&&Object.keys(TYPES).map(tipo=><div key={tipo} className={box}><h3 className="font-black text-gray-900">{TYPES[tipo]} <span className="text-xs text-gray-400 font-bold">versión {texts[tipo]?.version||0} · {day(texts[tipo]?.creado_en||null)}</span></h3>
   <textarea rows={4} className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm" value={draft[tipo]||''} onChange={e=>setDraft({...draft,[tipo]:e.target.value})}/>
   <button type="button" disabled={(draft[tipo]||'').trim()===(texts[tipo]?.texto||'')} onClick={()=>void saveText(tipo)} className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-black uppercase disabled:opacity-40">Guardar nueva versión</button></div>)}
 </div>;
}
