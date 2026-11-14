'use client';
import {useCallback,useEffect,useState} from 'react';
import {Megaphone} from 'lucide-react';
import SupplierShell from '@/components/suppliers/SupplierShell';
import {supabase} from '@/lib/supabase';

type Pub={id:string;aliado_id:string;aliado:string;nombre_comercial:string|null;instagram:string|null;tiktok:string|null;facebook:string|null;celular:string;sede:string|null;tipo:string;redes:string[];cantidad:number;
 semana:string;material_hasta:string|null;vence:string;sin_autorizacion_imagen:boolean;estado:string;enlace:string|null;nota:string|null;contrato:string|null;clienta:string|null;fecha_evento:string|null};
type Ali={id:string;nombre:string;nombre_comercial:string|null;instagram:string|null;tiktok:string|null;facebook:string|null;descripcion:string|null;autoriza_directorio:boolean;sede:string|null};
const TIPO:Record<string,string>={bienvenida:'Bienvenida al programa',evento_historias:'Evento: historias',evento_reel:'Evento: reel en colaboración',constante_semanal:'Aliado constante: publicación semanal'};
const RED:Record<string,string>={instagram:'Instagram',tiktok:'TikTok',facebook:'Facebook',whatsapp:'Estados de WhatsApp'};
const fecha=(d:string|null)=>d?new Date(d+'T12:00:00').toLocaleDateString('es-CO',{day:'numeric',month:'short'}):'';
const hoy=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Bogota'}).format(new Date());

/** Red de aliados › Publicaciones: what to publish for each ally (welcome, each event with Ámbar dresses, steady allies) and its record. */
export default function AliadosPublicacionesPage(){
 return <SupplierShell activePage="aliados_publicaciones" crumb="Marketing / Redes sociales" title="Redes sociales" icon={<Megaphone/>}
  description="Visibilidad del programa de aliados: bienvenida, 3 historias y 1 reel en colaboración por cada evento con vestido Ámbar, y publicación semanal para aliados constantes. Se crean solas cada día.">
  {()=><Board/>}
 </SupplierShell>;
}

function Board(){
 const [pubs,setPubs]=useState<Pub[]|null>(null),[alis,setAlis]=useState<Ali[]>([]),[error,setError]=useState(''),[ver,setVer]=useState<'pendiente'|'todas'>('pendiente'),[edit,setEdit]=useState<Ali|null>(null);
 const load=useCallback(async()=>{
  const [{data,error:e},{data:a}]=await Promise.all([supabase.rpc('aliado_publicaciones_listar'),supabase.rpc('aliados_visibilidad_listar')]);
  if(e)setError(e.message);else{setError('');setPubs((data||[]) as Pub[]);}setAlis((a||[]) as Ali[]);
 },[]);
 useEffect(()=>{const t=setTimeout(()=>void load(),0);return()=>clearTimeout(t);},[load]);
 const marcar=async(p:Pub,estado:string)=>{
  const enlace=estado==='publicada'?window.prompt('Enlace de la publicación (opcional):',p.enlace||'')??null:null;
  if(estado==='publicada'&&enlace===null)return;
  const nota=estado==='omitida'?window.prompt('¿Por qué no se publica?','')??null:null;
  if(estado==='omitida'&&nota===null)return;
  const {error:e}=await supabase.rpc('aliado_publicacion_marcar',{p_id:p.id,p_estado:estado,p_enlace:enlace||'',p_nota:nota||''});
  if(e)setError(e.message);else void load();
 };
 const guardar=async(a:Ali)=>{
  const {error:e}=await supabase.rpc('aliado_visibilidad_guardar',{p_id:a.id,p_datos:{nombre_comercial:a.nombre_comercial,instagram:a.instagram,tiktok:a.tiktok,facebook:a.facebook,descripcion_servicios:a.descripcion,autoriza_directorio:a.autoriza_directorio}});
  if(e)setError(e.message);else{setEdit(null);void load();}
 };
 const lista=(pubs||[]).filter(p=>ver==='todas'||p.estado==='pendiente');
 const vencida=(p:Pub)=>p.estado==='pendiente'&&p.vence<hoy();
 const input='border border-gray-200 rounded-xl px-3 py-2 text-sm w-full';
 return <div className="space-y-4">
  {error&&<p className="text-red-600 font-bold text-sm">{error}</p>}
  <div className="flex gap-2 flex-wrap">
   <button type="button" onClick={()=>setVer('pendiente')} className={`px-3 py-2 rounded-xl text-xs font-black ${ver==='pendiente'?'bg-rose-600 text-white':'bg-white border'}`}>Pendientes · {(pubs||[]).filter(p=>p.estado==='pendiente').length}</button>
   <button type="button" onClick={()=>setVer('todas')} className={`px-3 py-2 rounded-xl text-xs font-black ${ver==='todas'?'bg-rose-600 text-white':'bg-white border'}`}>Todas (5 semanas)</button>
   <a href="/aliados-ambar" target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-xl text-xs font-black bg-white border">Ver directorio público ↗</a>
  </div>
  {!pubs?<p className="text-gray-400 font-bold">Cargando…</p>:!lista.length?<p className="text-sm text-gray-500">No hay publicaciones {ver==='pendiente'?'pendientes':''}. Se crean solas cuando un aliado autoriza la visibilidad, cuando tiene un evento con vestido Ámbar y cada semana para los aliados constantes.</p>:
  <div className="grid gap-3 md:grid-cols-2">{lista.map(p=><article key={p.id} className={`rounded-2xl bg-white border p-4 shadow-sm space-y-1 ${vencida(p)?'border-red-300':'border-gray-100'}`}>
   <div className="flex justify-between gap-2"><p className="font-black text-gray-900">{p.nombre_comercial||p.aliado}</p><span className="text-[11px] font-bold text-gray-400">{p.sede}</span></div>
   <p className="text-sm font-bold text-rose-700">{TIPO[p.tipo]||p.tipo}{p.cantidad>1?` · ${p.cantidad} por red`:''}</p>
   <p className="text-xs text-gray-600">Redes: {p.redes.map(r=>RED[r]||r).join(', ')}</p>
   <p className="text-xs text-gray-600">Etiquetar: {[p.instagram&&`IG @${p.instagram}`,p.tiktok&&`TikTok @${p.tiktok}`,p.facebook&&`FB ${p.facebook}`].filter(Boolean).join(' · ')||<b className="text-red-600">sin redes registradas</b>}</p>
   {p.contrato&&<p className="text-xs text-gray-600">Evento {fecha(p.fecha_evento)} · contrato {p.contrato} · {p.clienta}{p.material_hasta?` · material del aliado hasta el ${fecha(p.material_hasta)}`:''}</p>}
   {p.sin_autorizacion_imagen&&<p className="text-xs font-black text-red-700 bg-red-50 rounded-lg px-2 py-1">Sin autorización de uso de imagen de la clienta: no publicar su rostro.</p>}
   <p className={`text-xs font-bold ${vencida(p)?'text-red-600':'text-gray-400'}`}>Publicar a más tardar el {fecha(p.vence)}{vencida(p)?' · vencida':''}</p>
   {p.estado!=='pendiente'?<p className="text-xs font-black text-emerald-700">{p.estado==='publicada'?'✓ Publicada':'Omitida'}{p.enlace&&<> · <a href={p.enlace} target="_blank" rel="noopener noreferrer" className="underline">ver</a></>}{p.nota?` · ${p.nota}`:''} <button type="button" onClick={()=>void marcar(p,'pendiente')} className="ml-2 text-gray-400 underline">deshacer</button></p>:
   <div className="flex gap-2 pt-1"><button type="button" onClick={()=>void marcar(p,'publicada')} className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-black">Marcar publicada</button>
    <button type="button" onClick={()=>void marcar(p,'omitida')} className="px-3 py-1.5 rounded-lg border text-xs font-black text-gray-600">No se publica</button>
    <a href={`https://wa.me/${p.celular.replace(/\D/g,'').length===10?'57':''}${p.celular.replace(/\D/g,'')}`} target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-black">Pedir material</a></div>}
  </article>)}</div>}
  <details className="bg-white rounded-2xl border border-gray-100 p-4">
   <summary className="cursor-pointer font-black text-gray-900">Redes y directorio de cada aliado ({alis.length})</summary>
   <div className="mt-3 space-y-2">{alis.map(a=>edit?.id===a.id?<div key={a.id} className="grid gap-2 sm:grid-cols-2 border rounded-xl p-3">
     <input className={input} placeholder="Nombre comercial" value={edit.nombre_comercial||''} onChange={e=>setEdit({...edit,nombre_comercial:e.target.value})}/>
     <input className={input} placeholder="Instagram (usuario)" value={edit.instagram||''} onChange={e=>setEdit({...edit,instagram:e.target.value})}/>
     <input className={input} placeholder="TikTok (usuario)" value={edit.tiktok||''} onChange={e=>setEdit({...edit,tiktok:e.target.value})}/>
     <input className={input} placeholder="Facebook (enlace)" value={edit.facebook||''} onChange={e=>setEdit({...edit,facebook:e.target.value})}/>
     <input className={`${input} sm:col-span-2`} placeholder="Servicios en una frase" maxLength={300} value={edit.descripcion||''} onChange={e=>setEdit({...edit,descripcion:e.target.value})}/>
     <label className="text-xs text-gray-700 sm:col-span-2 flex gap-2"><input type="checkbox" checked={edit.autoriza_directorio} onChange={e=>setEdit({...edit,autoriza_directorio:e.target.checked})}/>El aliado autorizó aparecer en el directorio y ser etiquetado (márcalo solo si lo autorizó por escrito).</label>
     <div className="flex gap-2"><button type="button" onClick={()=>void guardar(edit)} className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-black">Guardar</button><button type="button" onClick={()=>setEdit(null)} className="px-3 py-1.5 rounded-lg border text-xs font-black">Cancelar</button></div>
    </div>:<div key={a.id} className="flex justify-between gap-2 text-sm border-b border-gray-50 py-1">
     <span><b>{a.nombre_comercial||a.nombre}</b> · {a.sede||'—'} · {a.instagram?`@${a.instagram}`:<span className="text-red-600">sin Instagram</span>} · {a.autoriza_directorio?'en el directorio':<span className="text-gray-400">sin autorización</span>}</span>
     <button type="button" onClick={()=>setEdit(a)} className="text-xs font-black text-rose-700">Editar</button></div>)}</div>
  </details>
 </div>;
}
